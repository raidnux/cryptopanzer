// liveTrade.js — Phase 10 Phase 1: Testnet dry-run engine (Option B, separate DB)
// Same interface as paperTrade.js but executes REAL orders on Binance SPOT TESTNET
// (testnet.binance.vision, fake money) and mirrors the results into the mode DB.
// Long-only preserved. Exits are software-side (default; OCO decision still open).
// Protected files untouched: db.js / paperTrade.js / exchange.js / initDB.js.
const ccxt = require('ccxt');
const { modeDB } = require('../db/modeDB');

let testnet = null;

// Lazy authenticated ccxt testnet instance (separate keys from the real account)
function getTestnet() {
    if (testnet) return testnet;
    const key = process.env.BINANCE_TEST_KEY;
    const secret = process.env.BINANCE_TEST_SECRET;
    if (!key || !secret) {
        // Fail-closed: never trade without explicit testnet keys (AGENTS.md #13)
        throw new Error('[LIVE] BINANCE_TEST_KEY / BINANCE_TEST_SECRET belum diset di .env');
    }
    testnet = new ccxt.binance({ apiKey: key, secret, enableRateLimit: true });
    testnet.setSandboxMode(true); // → testnet.binance.vision
    return testnet;
}

function getBalance(asset) {
    const row = modeDB.prepare('SELECT balance FROM wallet WHERE asset = ?').get(asset);
    return row ? row.balance : 0;
}

// Upsert-friendly balance mirror (mode DB wallet starts empty — no seeder)
function addBalance(asset, delta) {
    modeDB.prepare(`
        INSERT INTO wallet (asset, balance) VALUES (?, ?)
        ON CONFLICT(asset) DO UPDATE SET balance = balance + ?
    `).run(asset, delta, delta);
}


// Startup reconciliation: compare DB belief vs exchange reality; warn loudly on mismatch
async function reconcileOnStartup(pair) {
    try {
        const ex = getTestnet();
        const open = modeDB.prepare("SELECT * FROM active_positions WHERE status = 'OPEN'").all();
        const balance = await ex.fetchBalance();
        for (const p of open) {
            if (p.pair !== pair) continue;
            const coin = p.pair.split('/')[0];
            const real = (balance.total && balance.total[coin]) || 0;
            if (real < p.amount_coin) {
                console.warn(
                    `[RECONCILE WARN] Posisi #${p.id} ${p.pair} butuh ${p.amount_coin} ${coin} ` +
                    `tapi saldo testnet hanya ${real}. Cek manual — jangan auto-fix.`
                );
            } else {
                console.log(`[RECONCILE OK] Posisi #${p.id} ${p.pair} ter-cover saldo testnet (${real} ${coin}).`);
            }
        }
        if (open.length === 0) console.log('[RECONCILE] Tidak ada posisi OPEN di mode DB.');
    } catch (err) {
        // Warn-only: reconciliation must never crash the bot loop
        console.warn(`[RECONCILE WARN] Gagal memeriksa saldo testnet: ${err.message}`);
    }
}

// Market BUY using quote cost (spend exactly usdtAmount USDT), then mirror into DB
async function executeLiveBuy(pair, currentPrice, usdtAmount, targetTp, targetSl) {
    try {
        const ex = getTestnet();
        await ex.loadMarkets();

        const order = await ex.createMarketBuyOrderWithCost(pair, usdtAmount);
        let filled = order.filled || 0;
        const avgPrice = order.average || order.price || currentPrice;
        const fee = order.fee && order.fee.cost ? order.fee : null;
        const coin = pair.split('/')[0];
        const quote = pair.split('/')[1];

        // Real fee handling: fee in base asset reduces the coin we actually hold
        if (fee && fee.currency === coin) filled = filled - fee.cost;

        if (filled <= 0) {
            console.error(`[LIVE BUY FAILED] ${pair} | fill amount 0, order: ${order.id}`);
            return false;
        }

        const tx = modeDB.transaction(() => {
            addBalance(quote, -(filled * avgPrice));
            addBalance(coin, filled);
            modeDB.prepare(`
                INSERT INTO active_positions (pair, buy_price, amount_coin, target_tp, target_sl, status, entry_time, buy_order_id)
                VALUES (?, ?, ?, ?, ?, 'OPEN', datetime('now', 'localtime'), ?)
            `).run(pair, avgPrice, filled, targetTp, targetSl, order.id);
        });
        tx();

        console.log(`[LIVE BUY SUCCESS] ${pair} | Filled: ${filled} ${coin} @ ${avgPrice} | ` +
            `Fee: ${fee ? fee.cost + ' ' + fee.currency : 'n/a'} | OrderID: ${order.id} | ` +
            `TP: ${targetTp} | SL: ${targetSl}`);
        return true;
    } catch (err) {
        // Fail-safe: skip the action, log loudly — never continue with stale data
        console.error(`[LIVE BUY FAILED] ${pair}: ${err.message}`);
        return false;
    }
}


// Market SELL of an OPEN position (software-side exit: TP/SL hit or manual close)
async function executeLiveSell(positionId, currentPrice, closeReason) {
    try {
        const ex = getTestnet();
        await ex.loadMarkets();

        const position = modeDB
            .prepare('SELECT * FROM active_positions WHERE id = ? AND status = ?')
            .get(positionId, 'OPEN');
        if (!position) {
            console.log(`[LIVE SELL REJECTED] Posisi ID ${positionId} tidak ditemukan / sudah ditutup.`);
            return false;
        }

        const pair = position.pair;
        const coin = pair.split('/')[0];
        const quote = pair.split('/')[1];

        // Binance LOT_SIZE filter: naive amounts get rejected — round to market precision
        const sellAmount = Number(ex.amountToPrecision(pair, position.amount_coin));
        if (sellAmount <= 0) {
            console.error(`[LIVE SELL FAILED] ${pair} | amount terlalu kecil setelah rounding: ${position.amount_coin}`);
            return false;
        }

        const order = await ex.createOrder(pair, 'market', 'sell', sellAmount);
        const filled = order.filled || sellAmount;
        const avgPrice = order.average || order.price || currentPrice;
        const fee = order.fee && order.fee.cost ? order.fee : null;

        // Net proceeds: gross value minus real fee (in quote currency)
        let grossUsdt = filled * avgPrice;
        let netUsdt = grossUsdt;
        if (fee && fee.currency === quote) netUsdt = grossUsdt - fee.cost;

        const initialInvestment = position.amount_coin * position.buy_price;
        const profitLoss = netUsdt - initialInvestment;

        const tx = modeDB.transaction(() => {
            addBalance(coin, -position.amount_coin);
            addBalance(quote, netUsdt);
            modeDB.prepare('UPDATE active_positions SET status = ? WHERE id = ?').run('CLOSED', positionId);
            modeDB.prepare(`
                INSERT INTO trade_history (pair, buy_price, sell_price, profit_loss, close_reason, timestamp, open_time, buy_order_id, sell_order_id)
                VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'), ?, ?, ?)
            `).run(pair, position.buy_price, avgPrice, profitLoss, closeReason, position.entry_time || null, position.buy_order_id || null, order.id);
        });
        tx();

        console.log(`[LIVE SELL SUCCESS] ${pair} | Reason: ${closeReason} | Sold: ${filled} @ ${avgPrice} | ` +
            `Fee: ${fee ? fee.cost + ' ' + fee.currency : 'n/a'} | PnL: ${profitLoss.toFixed(4)} ${quote} | OrderID: ${order.id}`);
        return true;
    } catch (err) {
        console.error(`[LIVE SELL FAILED] posisi #${positionId}: ${err.message}`);
        return false;
    }
}

module.exports = { executeLiveBuy, executeLiveSell, reconcileOnStartup };

