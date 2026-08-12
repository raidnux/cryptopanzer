const Database = require('better-sqlite3');
const path = require('path');

// Arahkan ke file .db yang baru saja lu generate tadi
const dbPath = path.resolve(__dirname, '../../db/dummy_data.db');

// Buka koneksi database
const db = new Database(dbPath, {
    // verbose: console.log // (Opsional) Uncomment baris ini kalau lu mau lihat query SQL yang tereksekusi di terminal
});

// Pastikan koneksi aman dan sinkron
db.pragma('journal_mode = WAL'); // Write-Ahead Logging untuk performa lebih cepat dan aman saat dibaca-tulis bersamaan

module.exports = db;
