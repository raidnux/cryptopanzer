// tradingMode config — Phase 10 Phase 1 (Option B: separate DB per mode)
// TRADING_MODE=paper (default) | testnet | live  — fail-closed on invalid values
// BINANCE_TESTNET=true also implies testnet mode for convenience.
require('dotenv').config();
const path = require('path');

let TRADING_MODE = (process.env.TRADING_MODE || '').toLowerCase();
if (!TRADING_MODE) {
    TRADING_MODE = process.env.BINANCE_TESTNET === 'true' ? 'testnet' : 'paper';
}

const FILES = { paper: 'dummy_data.db', testnet: 'testnet.db', live: 'live.db' };
if (!FILES[TRADING_MODE]) {
    // Fail-closed: never guess a mode (AGENTS.md #13)
    console.error(`[FATAL] TRADING_MODE tidak valid: "${TRADING_MODE}" (harus paper | testnet | live)`);
    process.exit(1);
}

const MODE_DB_FILE = FILES[TRADING_MODE];

module.exports = { TRADING_MODE, MODE_DB_FILE };
