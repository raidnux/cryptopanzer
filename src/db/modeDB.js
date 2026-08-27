// modeDB — mode-aware DB connection (Phase 10 Option B)
// paper  → db/dummy_data.db (opened by the existing src/db/db.js — untouched)
// testnet→ db/testnet.db    (created + schema-ensured here, wipeable)
// live   → db/live.db       (created here; backed up separately; audit record)
// Schema mirrors initDB.js + reconciliation columns (buy_order_id / sell_order_id).
const Database = require('better-sqlite3');
const path = require('path');
const { TRADING_MODE, MODE_DB_FILE } = require('../config/tradingMode');

let modeDB = null;

function addColumnIfMissing(db, table, column, definition) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    if (!cols.includes(column)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        console.log(`[MODE DB] Migrasi: kolom '${column}' ditambahkan ke '${table}'.`);
    }
}

if (TRADING_MODE !== 'paper') {
    const dbPath = process.env.DB_PATH
        ? path.resolve(process.env.DB_PATH)
        : path.resolve(__dirname, '../../db', MODE_DB_FILE);

    modeDB = new Database(dbPath);
    modeDB.pragma('journal_mode = WAL');

    modeDB.exec(`
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
            entry_time DATETIME,
            buy_order_id TEXT
        );
        CREATE TABLE IF NOT EXISTS trade_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pair TEXT,
            buy_price REAL,
            sell_price REAL,
            profit_loss REAL,
            close_reason TEXT,
            timestamp DATETIME,
            open_time DATETIME,
            buy_order_id TEXT,
            sell_order_id TEXT
        );
    `);
    // guarded migrations for older mode-DB copies
    addColumnIfMissing(modeDB, 'active_positions', 'entry_time', 'DATETIME');
    addColumnIfMissing(modeDB, 'active_positions', 'buy_order_id', 'TEXT');
    addColumnIfMissing(modeDB, 'trade_history', 'open_time', 'DATETIME');
    addColumnIfMissing(modeDB, 'trade_history', 'buy_order_id', 'TEXT');
    addColumnIfMissing(modeDB, 'trade_history', 'sell_order_id', 'TEXT');

    console.log(`[MODE DB] TRADING_MODE=${TRADING_MODE} → ${dbPath}`);
}

module.exports = { modeDB, TRADING_MODE, MODE_DB_FILE };
