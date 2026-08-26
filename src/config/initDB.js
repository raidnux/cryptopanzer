const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// 1. Setup path & pastikan folder db/ tersedia
const dbDir = path.resolve(__dirname, '../../db');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// 2. Koneksi ke file database lokal
const dbPath = path.join(dbDir, 'dummy_data.db');
const db = new Database(dbPath);

console.log('Mulai inisialisasi database...');

// 3. Eksekusi pembuatan tabel (berdasarkan skema di architecture.md)
db.exec(`
    CREATE TABLE IF NOT EXISTS wallet (
        asset TEXT PRIMARY KEY,
        balance REAL
    );

    CREATE TABLE IF NOT EXISTS active_positions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pair TEXT,
        buy_price REAL,
        amount_coin REAL,
        target_tp REAL,
        target_sl REAL,
        status TEXT,
        entry_time DATETIME
    );

    CREATE TABLE IF NOT EXISTS trade_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pair TEXT,
        buy_price REAL,
        sell_price REAL,
        profit_loss REAL,
        close_reason TEXT,
        timestamp DATETIME,
        open_time DATETIME
    );
`);
console.log('Tabel berhasil dibuat.');

// 3b. Migrasi aman: tambah kolom waktu untuk database lama (kalau kolom belum ada)
function addColumnIfMissing(table, column, definition) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    if (!cols.includes(column)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        console.log(`Migrasi: kolom '${column}' ditambahkan ke tabel '${table}'.`);
    }
}
addColumnIfMissing('active_positions', 'entry_time', 'DATETIME');
addColumnIfMissing('trade_history', 'open_time', 'DATETIME');

// 4. Database Seeder: Cek apakah wallet sudah ada isinya
const checkWallet = db.prepare('SELECT COUNT(*) as count FROM wallet').get();

if (checkWallet.count === 0) {
    console.log('Menyuntikkan saldo awal (Seeder)...');
    const insertBalance = db.prepare('INSERT INTO wallet (asset, balance) VALUES (?, ?)');
    
    // Injeksi 10,000 USDT dan 0 BTC untuk modal paper trading
    insertBalance.run('USDT', 10000);
    insertBalance.run('BTC', 0);
    
    console.log('Saldo awal 10,000 USDT berhasil ditambahkan.');
} else {
    console.log('Wallet sudah berisi data, melewati proses seeding.');
}

console.log('Inisialisasi database selesai!');
db.close();
