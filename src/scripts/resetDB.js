const Database = require('better-sqlite3');
const path = require('path');
const readline = require('readline');

if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
=========================================
🔄 CryptoPanzer - Reset DB Help
=========================================
Usage:
  node src/scripts/resetDB.js               Factory-reset the dummy wallet + DB
  node src/scripts/resetDB.js --help (-h)   Show this help

WARNING: Running with no flag DESTROYS all trade_history, active_positions,
and wallet data, then re-seeds 10,000 USDT & 0 BTC.
Stop the bot first (pm2 stop CryptoPanzer) before resetting.
=========================================
`);
    process.exit(0);
}

async function askConfirmation() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const answer = await new Promise((resolve) => {
        rl.question(
            '⚠️  Ini akan MENGHAPUS seluruh trade history, posisi aktif, dan saldo wallet, ' +
            'lalu mengembalikan modal ke 10,000 USDT & 0 BTC.\n' +
            'Ketik "yes" untuk konfirmasi, atau "no" untuk batal: ',
            resolve
        );
    });
    rl.close();
    return answer.trim().toLowerCase();
}

const dbPath = path.resolve(__dirname, '../../db/dummy_data.db');

(async () => {
    const confirm = await askConfirmation();
    if (confirm !== 'yes') {
        console.log('❌ Dibatalkan. Database tidak diubah.');
        process.exit(0);
    }

    console.log('🔄 Memulai proses factory reset database CryptoPanzer...');
    const db = new Database(dbPath);

    try {
        const reset = db.transaction(() => {
            db.prepare('DELETE FROM trade_history;').run();
            db.prepare('DELETE FROM active_positions;').run();
            db.prepare('DELETE FROM wallet;').run();

            db.prepare('INSERT INTO wallet (asset, balance) VALUES (?, ?)').run('USDT', 10000.0);
            db.prepare('INSERT INTO wallet (asset, balance) VALUES (?, ?)').run('BTC', 0.0);
        });

        reset();

        console.log('✅ Trade history dan active positions sudah dibersihkan.');
        console.log('✅ Saldo wallet sukses dikembalikan ke: 10,000 USDT & 0 BTC.');

        const wallet = db.prepare('SELECT * FROM wallet').all();
        console.table(wallet);
    } catch (error) {
        console.error('❌ Gagal melakukan reset database:', error.message);
        process.exitCode = 1;
    } finally {
        db.close();
        if (process.exitCode === 0) {
            console.log('🚀 Reset total selesai! Silakan start ulang bot-nya.');
        }
    }
})();