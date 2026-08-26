// Backfill open_time / entry_time ke database dari log PM2 bot.
//
// Cara pakai:
//   node src/scripts/backfillTimes.js <path-log>          -> DRY RUN (preview saja)
//   node src/scripts/backfillTimes.js <path-log> --apply  -> tulis hasil ke DB
//
// Logika:
// - Baris [BUY SUCCESS]/[SELL SUCCESS] tidak punya timestamp, tapi terkurung
//   di antara baris siklus ber-stempel tanggal ([YYYY-MM-DD HH:mm:ss]).
//   Waktu event = stempel baris siklus TERAKHIR sebelum event (akurasi ~1 menit).
// - Matching konservatif: harga buy di log harus cocok dengan buy_price di DB.

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(`
CryptoPanzer Backfill Times
Backfill open_time (trade_history) & entry_time (active_positions) dari log PM2.

Usage:
  node src/scripts/backfillTimes.js <log-file>           Dry-run preview (default)
  node src/scripts/backfillTimes.js <log-file> --apply   Tulis ke database

Contoh:
  node src/scripts/backfillTimes.js ~/dev_files/logs/cryptopanzer-out.log
  node src/scripts/backfillTimes.js cryptopanzer-out.log --apply
`);
    process.exit(0);
}

const apply = args.includes('--apply');
const logPath = args.find(a => !a.startsWith('--'));
// DB_PATH env override untuk testing terhadap salinan DB (JANGAN dipakai di produksi)
const dbPath = process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.resolve(__dirname, '../../db/dummy_data.db');

if (!fs.existsSync(logPath)) {
    console.error(`❌ Log tidak ditemukan: ${logPath}`);
    process.exit(1);
}
if (!fs.existsSync(dbPath)) {
    console.error(`❌ Database tidak ditemukan: ${dbPath}`);
    process.exit(1);
}

// ---- 1. Parse log ----
const dateRe = /^\D*?\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/;
const buyRe = /^\[BUY SUCCESS\] (\S+) \| Price: ([\d.]+)/;
const sellRe = /^\[SELL SUCCESS\] (\S+) \| Reason: \w+ \| Sell: ([\d.]+)/;

const events = [];
let lastStamp = null;

for (const line of fs.readFileSync(logPath, 'utf8').split('\n')) {
    const dm = line.match(dateRe);
    if (dm) {
        lastStamp = dm[1];
        continue;
    }
    let em = line.match(buyRe);
    if (em) {
        events.push({ type: 'BUY', pair: em[1], price: parseFloat(em[2]), time: lastStamp });
        continue;
    }
    em = line.match(sellRe);
    if (em && lastStamp) {
        events.push({ type: 'SELL', pair: em[1], price: parseFloat(em[2]), time: lastStamp });
    }
}

console.log(`Log  : ${logPath}`);
console.log(`Event: ${events.filter(e => e.type === 'BUY').length} BUY, ${events.filter(e => e.type === 'SELL').length} SELL\n`);

// ---- 2. Load DB (READONLY saat dry-run) ----
const db = new Database(dbPath, { readonly: !apply });

const priceEq = (a, b) => Math.abs(a - b) < 0.01;

const updates = [];

// 2a. trade_history dengan open_time kosong -> cari BUY event yang cocok
const history = db.prepare("SELECT * FROM trade_history WHERE open_time IS NULL ORDER BY id").all();
for (const t of history) {
    const candidates = events.filter(e =>
        e.type === 'BUY' && e.pair === t.pair &&
        priceEq(e.price, t.buy_price) && e.time <= t.timestamp
    );
    if (candidates.length === 1) {
        updates.push({ table: 'trade_history', id: t.id, desc: `#${t.id} ${t.pair} open_time`, time: candidates[0].time });
    } else {
        console.log(`⚠️  Trade #${t.id} (${t.pair}, buy ${t.buy_price}): ${candidates.length} kandidat BUY di log — dilewati.`);
    }
}

// 2b. active_positions OPEN dengan entry_time kosong -> BUY event terakhir tanpa sell setelahnya
const openPositions = db.prepare("SELECT * FROM active_positions WHERE status = 'OPEN' AND entry_time IS NULL").all();
for (const p of openPositions) {
    const candidates = events.filter(e => e.type === 'BUY' && e.pair === p.pair && priceEq(e.price, p.buy_price));
    // BUY valid = tidak ada SELL dengan waktu lebih besar (posisi masih open)
    const valid = candidates.filter(b => !events.some(s => s.type === 'SELL' && s.time > b.time));
    if (valid.length === 1) {
        updates.push({ table: 'active_positions', id: p.id, desc: `#${p.id} ${p.pair} entry_time`, time: valid[0].time });
    } else {
        console.log(`⚠️  Posisi OPEN #${p.id}: ${valid.length} kandidat BUY valid — dilewati.`);
    }
}

// ---- 3. Preview / Apply ----
if (updates.length === 0) {
    console.log('Tidak ada baris yang bisa di-backfill.');
} else {
    console.log('\nRencana update:');
    for (const u of updates) console.log(`  ${u.desc} = ${u.time}`);

    if (!apply) {
        console.log('\n🔍 DRY RUN — tidak ada perubahan. Tambahkan --apply untuk menulis.');
    } else {
        const stmts = {
            trade_history: db.prepare('UPDATE trade_history SET open_time = ? WHERE id = ?'),
            active_positions: db.prepare('UPDATE active_positions SET entry_time = ? WHERE id = ?'),
        };
        const tx = db.transaction(() => {
            for (const u of updates) stmts[u.table].run(u.time, u.id);
        });
        tx();
        console.log(`\n✅ ${updates.length} baris berhasil di-update.`);
    }
}
db.close();
