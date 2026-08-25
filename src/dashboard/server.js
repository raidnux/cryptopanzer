// CryptoPanzer — read-only trade report dashboard (report-only, NO execution controls)
// Security (AGENTS.md #13): binds 127.0.0.1 ONLY; DB opened READONLY; access via SSH tunnel.
// Run: node src/dashboard/server.js  (or: pm2 start src/dashboard/server.js --name cryptodash)
const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const PORT = Number(process.env.DASHBOARD_PORT) || 3000;
const HOST = '127.0.0.1'; // never 0.0.0.0

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

app.listen(PORT, HOST, () => {
    console.log(`🖥️  CryptoPanzer dashboard: http://${HOST}:${PORT} (localhost-only, READONLY)`);
});