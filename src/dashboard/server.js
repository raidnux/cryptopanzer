// CryptoPanzer — read-only trade report dashboard (report-only, NO execution controls)
// Security (AGENTS.md #13): binds 127.0.0.1 ONLY; DB opened READONLY; access via SSH tunnel.
// Run: node src/dashboard/server.js  (or: pm2 start src/dashboard/server.js --name cryptodash)
const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const ccxt = require('ccxt');
const { exchange } = require('../config/exchange');

require('dotenv').config(); // untuk BINANCE_READ_KEY / SECRET (read-only tab data)

const PORT = Number(process.env.DASHBOARD_PORT) || 3000;
const HOST = '127.0.0.1'; // never 0.0.0.0
const BN_PAIR = process.env.DEFAULT_SYMBOL || 'BTC/USDT';

const dbPath = path.resolve(__dirname, '../../db/dummy_data.db');
let db;
try {
    db = new Database(dbPath, { readonly: true });
} catch (err) {
    console.error(`❌ [DASHBOARD] Gagal membuka database READONLY: ${err.message}`);
    process.exit(1);
}

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

// Metadata: timezone offset server (menit) + strategi aktif dari env bot (require-time)
app.get('/api/meta', (req, res) => {
    try {
        const now = new Date();
        const offsetMin = -now.getTimezoneOffset(); // misal WIB = 420
        let strategy = null;
        try {
            // Baca langsung dari env yang dipakai proses dashboard; kalau tidak ada,
            // fallback baca .env file tanpa mengekspos nilainya.
            require('dotenv').config();
            strategy = {
                symbol: process.env.DEFAULT_SYMBOL || 'BTC/USDT',
                timeframe: process.env.DEFAULT_TIMEFRAME || '15m',
                rsiPeriod: Number(process.env.RSI_PERIOD) || 14,
                emaPeriod: Number(process.env.EMA_PERIOD) || 20,
                rsiOversold: Number(process.env.RSI_OVERSOLD) || 30,
                riskPercent: Number(process.env.RISK_PERCENT) || 0.01,
                rrRatio: Number(process.env.RR_RATIO) || 2,
            };
        } catch (_) { strategy = null; }
        res.json({ serverTzOffsetMinutes: offsetMin, strategy });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/wallet', (req, res) => {
    try {
        res.json(db.prepare('SELECT * FROM wallet').all());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/positions', (req, res) => {
    try {
        res.json(db.prepare("SELECT * FROM active_positions WHERE status='OPEN'").all());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Harga live (public, tanpa API key) — fail-safe: return null bila fetch gagal
app.get('/api/ticker', async (req, res) => {
    try {
        const symbol = process.env.DEFAULT_SYMBOL || 'BTC/USDT';
        const t = await exchange.fetchTicker(symbol);
        res.json({ symbol, price: t.last });
    } catch (err) {
        res.json({ symbol: process.env.DEFAULT_SYMBOL || 'BTC/USDT', price: null, error: err.message });
    }
});

app.get('/api/history', (req, res) => {
    try {
        const history = db.prepare('SELECT * FROM trade_history ORDER BY id').all();
        const total = history.reduce((s, t) => s + t.profit_loss, 0);
        const wins = history.filter((t) => t.profit_loss >= 0).length;
        res.json({
            trades: history,
            summary: {
                totalTrades: history.length,
                wins,
                losses: history.length - wins,
                winRate: history.length ? +((wins / history.length) * 100).toFixed(1) : 0,
                netPnl: +total.toFixed(4),
            },
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---- Binance read-only account view (Phase 0-lite dashboard) ----
// Same data as src/scripts/checkAccount.js: balances, trade fills, order history.
// Read-only key only; cached 60s so the 30s page refresh never spams Binance.
let binanceRO = null; // lazy authenticated ccxt instance
let binanceCache = { at: 0, payload: null };

function getBinanceRO() {
    if (binanceRO) return binanceRO;
    const key = process.env.BINANCE_READ_KEY;
    const secret = process.env.BINANCE_READ_SECRET;
    if (!key || !secret) return null;
    binanceRO = new ccxt.binance({ apiKey: key, secret, enableRateLimit: true });
    return binanceRO;
}

function fmtBnTs(ts) {
    const d = new Date(ts);
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

app.get('/api/binance', async (req, res) => {
    const now = Date.now();
    if (binanceCache.payload && now - binanceCache.at < 60000) {
        return res.json(binanceCache.payload);
    }
    const ex = getBinanceRO();
    if (!ex) {
        return res.json({ ok: false, reason: 'no_keys', pair: BN_PAIR });
    }
    try {
        const [balance, trades, orders] = await Promise.all([
            ex.fetchBalance(),
            ex.fetchMyTrades(BN_PAIR),
            ex.fetchOrders(BN_PAIR),
        ]);
        const balances = Object.entries(balance.total)
            .filter(([, v]) => v > 0)
            .map(([asset, total]) => ({ asset, total }));
        // most recent first, cap 50 rows per table
        const tradesOut = trades.slice().reverse().slice(0, 50).map(t => ({
            time: fmtBnTs(t.timestamp),
            side: t.side,
            price: t.price,
            amount: t.amount,
            feeCost: t.fee && t.fee.cost ? t.fee.cost : null,
            feeCurrency: t.fee && t.fee.currency ? t.fee.currency : null,
        }));
        const ordersOut = orders.slice().reverse().slice(0, 50).map(o => ({
            time: fmtBnTs(o.timestamp),
            type: o.type || '?',
            side: o.side,
            status: o.status || '?',
            average: (o.average ?? o.price) ?? null,
            amount: o.amount,
        }));
        // live price (public, no keys) — same pattern as /api/ticker
        let price = null;
        try { price = (await exchange.fetchTicker(BN_PAIR)).last; } catch (_) { price = null; }
        binanceCache = { at: now, payload: { ok: true, pair: BN_PAIR, price, balances, trades: tradesOut, orders: ordersOut } };
        res.json(binanceCache.payload);
    } catch (err) {
        const reason = err instanceof ccxt.AuthenticationError ? 'auth' : 'fetch';
        console.error(`⚠️ [DASHBOARD] /api/binance error: ${err.message}`);
        res.json({ ok: false, reason, error: err.message, pair: BN_PAIR });
    }
});

// ---- Testnet dashboard data (Phase 10 Phase 1) — BTC/USDT only ----
// Bot data: db/testnet.db opened READONLY (optional — may not exist yet).
// Exchange check: testnet fetchBalance filtered to BTC & USDT (keys: BINANCE_TEST_*).
// Cached 60s so the 30s page refresh never spams the testnet API.
let testnetDB = null;
try {
    testnetDB = new Database(path.resolve(__dirname, '../../db/testnet.db'), { readonly: true });
    console.log('[DASHBOARD] testnet.db attached (READONLY)');
} catch (_) {
    testnetDB = null; // no testnet run yet — endpoint still works, sections show n/a
    console.log('[DASHBOARD] testnet.db not found — testnet bot data sections will show n/a');
}

let testnetEx = null;
let testnetCache = { at: 0, payload: null };

function getTestnetEx() {
    if (testnetEx) return testnetEx;
    const key = process.env.BINANCE_TEST_KEY;
    const secret = process.env.BINANCE_TEST_SECRET;
    if (!key || !secret) return null;
    testnetEx = new ccxt.binance({ apiKey: key, secret, enableRateLimit: true });
    testnetEx.setSandboxMode(true); // → testnet.binance.vision
    return testnetEx;
}

app.get('/api/testnet', async (req, res) => {
    const now = Date.now();
    if (testnetCache.payload && now - testnetCache.at < 60000) {
        return res.json(testnetCache.payload);
    }

    // 1) Bot data from testnet.db (READONLY, optional)
    const bot = { available: !!testnetDB, wallet: [], positions: [], trades: [], summary: null };
    if (testnetDB) {
        try {
            bot.wallet = testnetDB.prepare('SELECT * FROM wallet').all();
            bot.positions = testnetDB.prepare("SELECT * FROM active_positions WHERE status = 'OPEN'").all();
            const history = testnetDB.prepare('SELECT * FROM trade_history ORDER BY id').all();
            bot.trades = history;
            const total = history.reduce((s, t) => s + t.profit_loss, 0);
            const wins = history.filter((t) => t.profit_loss >= 0).length;
            bot.summary = {
                totalTrades: history.length,
                wins,
                losses: history.length - wins,
                winRate: history.length ? +((wins / history.length) * 100).toFixed(1) : 0,
                netPnl: +total.toFixed(4),
            };
        } catch (err) {
            console.error(`⚠️ [DASHBOARD] /api/testnet bot-data error: ${err.message}`);
            bot.available = false;
        }
    }

    // 2) Exchange check: testnet BTC & USDT balances only
    let exchangeBalances = null;
    let exError = null;
    const ex = getTestnetEx();
    if (!ex) {
        exError = 'no_keys';
    } else {
        try {
            const b = await ex.fetchBalance();
            exchangeBalances = [
                { asset: 'BTC', total: (b.total && b.total.BTC) || 0 },
                { asset: 'USDT', total: (b.total && b.total.USDT) || 0 },
            ];
        } catch (err) {
            exError = err instanceof ccxt.AuthenticationError ? 'auth' : 'fetch';
        }
    }

    // 3) Live price (public, no keys — same pattern as /api/ticker)
    let price = null;
    try { price = (await exchange.fetchTicker(BN_PAIR)).last; } catch (_) { price = null; }

    testnetCache = { at: now, payload: { ok: true, pair: BN_PAIR, price, exchangeBalances, exError, bot } };
    res.json(testnetCache.payload);
});

    // 4) Live trade history from testnet API (for verification;filtered to open/closed)
    app.get("/api/testnet/trades", async (req, res) => {
        try {
            const ex = getTestnetEx();
            if (!ex) return res.json({ ok: false, error: "no_keys" });
            const trades = (await ex.fetchMyTrades(BN_PAIR)).slice(-20).reverse();
            res.json({ ok: true, pair: BN_PAIR, trades });
        } catch (err) {
            res.json({ ok: false, error: err.message });
        }
    });
app.listen(PORT, HOST, () => {
    console.log(`🖥️  CryptoPanzer dashboard: http://${HOST}:${PORT} (localhost-only, READONLY)`);
});