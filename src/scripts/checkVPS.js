// Read-only VPS environment checker — validates readiness for a future dashboard.
// Safe to run anytime: never writes, opens the DB READONLY only.
// Usage: node src/scripts/checkVPS.js
const { execSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

const results = [];
function report(status, label, detail) {
    const icon = status === 'PASS' ? '✅' : status === 'WARN' ? '⚠️ ' : '❌';
    results.push({ status, label });
    console.log(`${icon} [${status}] ${label}${detail ? ' — ' + detail : ''}`);
}

console.log('=========================================');
console.log('🖥️  CryptoPanzer - VPS Environment Check');
console.log('=========================================\n');

// 1. Node version
const nodeMajor = Number(process.versions.node.split('.')[0]);
report(nodeMajor >= 18 ? 'PASS' : 'WARN', `Node.js v${process.versions.node}`,
    nodeMajor >= 18 ? 'modern enough for any option' : 'consider upgrading (18+ recommended)');

// 2. OS info
try {
    const os = require('os');
    console.log(`ℹ️  OS: ${os.type()} ${os.release()} | CPU cores: ${os.cpus().length}`);
    const totalMemGB = os.totalmem() / 1024 ** 3;
    const freeMemGB = os.freemem() / 1024 ** 3;
    report(freeMemGB > 0.2 ? 'PASS' : 'WARN', `RAM: ${totalMemGB.toFixed(1)} GB total, ${freeMemGB.toFixed(2)} GB free`,
        freeMemGB <= 0.2 ? 'low memory — prefer lightweight dashboard' : '');
} catch (e) {
    report('FAIL', 'OS/memory check failed', e.message);
}

// 3. Disk space
try {
    const df = execSync('df -h . | tail -1').toString().trim().split(/\s+/);
    report('PASS', `Disk: ${df[2]} used / ${df[1]} total (${df[4]} used on ${df[5]})`);
} catch (e) {
    report('WARN', 'Disk check unavailable', e.message);
}

// 4. PM2 + running processes
let pm2Ok = false;
try {
    const pm2Out = execSync('pm2 jlist').toString();
    const procs = JSON.parse(pm2Out);
    pm2Ok = true;
    if (procs.length === 0) {
        report('WARN', 'PM2 installed but no processes running');
    } else {
        for (const p of procs) {
            console.log(`ℹ️  PM2 process: ${p.name} | status: ${p.pm2_env.status} | restarts: ${p.pm2_env.restart_time}`);
        }
        report('PASS', `PM2 running with ${procs.length} process(es)`);
    }
} catch (e) {
    report('FAIL', 'PM2 not found or not working', e.message);
}

// 5. DB file exists + readable READONLY + row counts
const dbPath = path.resolve(__dirname, '../../db/dummy_data.db');
if (!fs.existsSync(dbPath)) {
    report('FAIL', `DB not found at ${dbPath}`);
} else {
    const sizeMB = (fs.statSync(dbPath).size / 1024 ** 2).toFixed(2);
    try {
        const Database = require('better-sqlite3');
        const db = new Database(dbPath, { readonly: true }); // security rule #13
        const wallet = db.prepare('SELECT COUNT(*) c FROM wallet').get().c;
        const open = db.prepare("SELECT COUNT(*) c FROM active_positions WHERE status='OPEN'").get().c;
        const history = db.prepare('SELECT COUNT(*) c FROM trade_history').get().c;
        db.close();
        report('PASS', `DB readable READONLY (${sizeMB} MB)`, `${wallet} wallet rows, ${open} OPEN positions, ${history} closed trades`);
    } catch (e) {
        report('FAIL', 'DB could not be opened READONLY', e.message);
    }
}

// 6. Port 3000 availability (default dashboard port)
function checkPort(port) {
    return new Promise((resolve) => {
        const srv = net.createServer();
        srv.once('error', () => resolve(false));
        srv.once('listening', () => srv.close(() => resolve(true)));
        srv.listen(port, '127.0.0.1');
    });
}

(async () => {
    const portFree = await checkPort(3000);
    report(portFree ? 'PASS' : 'WARN', 'Port 3000 (default dashboard)',
        portFree ? 'free — dashboard can bind here' : 'in use by another service');

    // 7. express availability
    let expressOk = false;
    try {
        require.resolve('express');
        expressOk = true;
    } catch (_) { /* not installed */ }
    report(expressOk ? 'PASS' : 'WARN', 'express package',
        expressOk ? 'already installed' : 'not installed (needed for Option A; requires owner approval per AGENTS.md #13)');

    // Summary
    const pass = results.filter(r => r.status === 'PASS').length;
    const warn = results.filter(r => r.status === 'WARN').length;
    const fail = results.filter(r => r.status === 'FAIL').length;
    console.log('\n-----------------------------------------');
    console.log(`📋 Summary: ${pass} PASS | ${warn} WARN | ${fail} FAIL`);
    if (fail === 0 && pm2Ok) {
        console.log('🟢 Environment READY for dashboard Option A (Express + localhost bind + SSH tunnel).');
    } else if (fail > 0) {
        console.log('🔴 Fix FAIL items above before proceeding.');
    } else {
        console.log('🟡 Mostly ready — review WARN items with the agent.');
    }
    console.log('Paste this entire output back to your agent for analysis.');
})();
