require('dotenv').config();
const db = require('./db/db');
const { TRADING_CONFIG } = require('./config/exchange');
const { fetchMarketData, getCurrentPrice } = require('./data/fetcher');
const { checkEntrySignal, calculateIndicators, STRATEGY_CONFIG } = require('./strategy/indicator');
const { executeDummyBuy, executeDummySell } = require('./engine/paperTrade');
const { sendTelegramMessage } = require('./utils/telegram');

const SCAN_INTERVAL_MS = 60 * 1000; // 1 menit

let DRY_RUN = false;

// Show CLI usage and exit before the bot starts (also skips Telegram polling)
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
=========================================
🚀 CryptoPanzer Bot - Help
=========================================
Usage:
  node src/index.js               Start the bot (default)
  node src/index.js --report      Print trade report and exit
  node src/index.js --dry-run     Scan only, no order execution
  node src/index.js --no-telegram Disable Telegram polling (avoid conflict with VPS instance)
  node src/index.js --help (-h)   Show this help
=========================================
`);
    process.exit(0);
}

// Dry-run / live mode flag
if (process.argv.includes('--dry-run')) {
    DRY_RUN = true;
    console.log('🟢 DRY-RUN MODE: scanning only, no order execution');
}
if (process.argv.includes('--live')) {
    DRY_RUN = false;
} else {
    DRY_RUN = false; // default: live mode
}

// Format: 2026-08-13 06:42:13
function formatTimestamp(date = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
        `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

console.log('=========================================');
console.log('🚀 CryptoPanzer Bot - Paper Trading Init');
console.log('=========================================');
console.log(`Symbol: ${TRADING_CONFIG.symbol}`);
console.log(`Timeframe: ${TRADING_CONFIG.timeframe}`);
console.log('Exchange: Binance (Public)');
console.log(`Scan interval: ${SCAN_INTERVAL_MS / 1000}s`);
console.log(`Strategy: RSI(${STRATEGY_CONFIG.rsiPeriod})<${STRATEGY_CONFIG.rsiOversold} + Price<=EMA(${STRATEGY_CONFIG.emaPeriod})`);
console.log(`Risk/Reward: RR 1:${STRATEGY_CONFIG.rrRatio} | SL ${STRATEGY_CONFIG.riskPercent * 100}%`);
console.log('-----------------------------------------');

// Check active OPEN positions and close any that hit TP or SL
async function monitorOpenPositions(currentPrice) {
    const openPositions = db
        .prepare('SELECT * FROM active_positions WHERE status = ?')
        .all('OPEN');

    for (const position of openPositions) {
        // Only monitor positions for the configured trading pair
        if (position.pair !== TRADING_CONFIG.symbol) continue;

        // Break-even stop: once price reaches 1R (+risk%), ratchet SL up to
        // fee-inclusive breakeven (entry / 0.999^2 ≈ +0.2%) so the trade can no longer lose.
        const oneR = position.buy_price * (1 + STRATEGY_CONFIG.riskPercent);
        if (currentPrice >= oneR) {
            const breakEven = position.buy_price / (0.999 * 0.999);
            if (breakEven > position.target_sl) {
                db.prepare('UPDATE active_positions SET target_sl = ? WHERE id = ?')
                    .run(breakEven, position.id);
                console.log(
                    `[BREAK-EVEN] #${position.id} ${position.pair} | SL moved ` +
                    `${position.target_sl} → ${breakEven.toFixed(4)}`
                );
                await sendTelegramMessage(
                    `🟡 <b>Break-Even Aktif</b>\n` +
                    `Pair: <b>${position.pair}</b>\n` +
                    `SL dinaikkan ke harga entry + fee: <code>${breakEven.toFixed(2)}</code>\n` +
                    `Posisi sekarang bebas risiko.`
                );
                position.target_sl = breakEven; // keep in-memory copy consistent for the check below
            }
        }

        let closeReason = null;

        if (currentPrice <= position.target_sl) {
            closeReason = 'SL_HIT';
        } else if (currentPrice >= position.target_tp) {
            closeReason = 'TP_HIT';
        }

        if (closeReason) {
            const success = executeDummySell(position.id, currentPrice, closeReason);
            if (success) {
                const profitLoss = position.amount_coin * currentPrice * (1 - 0.001)
                    - position.amount_coin * position.buy_price;
                await sendTelegramMessage(
                    `🔴 <b>Posisi Ditutup</b>\n` +
                    `Pair: <b>${position.pair}</b>\n` +
                    `Alasan: <b>${closeReason}</b>\n` +
                    `Harga Jual: <code>${currentPrice}</code>\n` +
                    `PnL: <code>${profitLoss.toFixed(4)} USDT</code>`
                );
            }
        }
    }
}

// Check for a fresh entry signal and open a new position
async function checkEntry(currentPrice, candles) {
    if (DRY_RUN) return;
    const signal = checkEntrySignal(candles);
    if (!signal) return;

    // Avoid stacking multiple positions for the same pair
    const existing = db
        .prepare('SELECT COUNT(*) AS count FROM active_positions WHERE pair = ? AND status = ?')
        .get(TRADING_CONFIG.symbol, 'OPEN');
    if (existing.count > 0) {
        console.log('[ENTRY] Sudah ada posisi OPEN, lewati entry baru.');
        return;
    }

    const usdtAmount = 100; // Modal per posisi (paper)
    const success = executeDummyBuy(
        TRADING_CONFIG.symbol,
        signal.entryPrice,
        usdtAmount,
        signal.targetTp,
        signal.targetSl
    );

    if (success) {
        await sendTelegramMessage(
            `🟢 <b>Entry Signal Terdeteksi</b>\n` +
            `Pair: <b>${TRADING_CONFIG.symbol}</b>\n` +
            `Harga Entry: <code>${signal.entryPrice}</code>\n` +
            `TP: <code>${signal.targetTp.toFixed(2)}</code> | SL: <code>${signal.targetSl.toFixed(2)}</code>\n` +
            `RSI: <code>${signal.rsi.toFixed(2)}</code> | EMA: <code>${signal.ema.toFixed(2)}</code>\n` +
            `Plan: Entry ${signal.entryPrice.toFixed(2)} -> TP ${signal.targetTp.toFixed(2)}`
        );
    }
}

// Main trading loop: monitor positions, then look for new entries
async function mainLoop() {
    try {
        // Log market check at the start of each cycle
        const time = formatTimestamp();

        const currentPrice = await getCurrentPrice();
        if (currentPrice === null) {
            console.log(`🔄 [${time}] ${TRADING_CONFIG.symbol} | Fetch failed, skipping cycle...`);
            return;
        }

        const candles = await fetchMarketData(100);
        const strategyTag = `RSI<${STRATEGY_CONFIG.rsiOversold}+EMA${STRATEGY_CONFIG.emaPeriod} | RR 1:${STRATEGY_CONFIG.rrRatio}`;

        if (candles.length === 0) {
            console.log(`🔄 [${time}] Checking ${TRADING_CONFIG.symbol} | Price: ${currentPrice} | ${strategyTag}`);
            return;
        }

        // Compute live RSI/EMA so we can see how close we are to a signal
        let indicatorText = 'Indicators: n/a';
        try {
            const ind = calculateIndicators(candles);
            indicatorText = `RSI: ${ind.rsi.toFixed(2)} | EMA: ${ind.ema.toFixed(2)}`;
        } catch (err) {
            // candles too short — fall back gracefully
        }

        console.log(`🔄 [${time}] Checking ${TRADING_CONFIG.symbol} | Price: ${currentPrice} | ${indicatorText} | ${strategyTag}${DRY_RUN ? ' | DRY-RUN' : ''}`);

        await monitorOpenPositions(currentPrice);
        await checkEntry(currentPrice, candles);
    } catch (error) {
        console.error('❌ Error pada main loop:', error.message);
    }
}

// Graceful shutdown
function shutdown() {
    console.log('\n👋 Bot dihentikan. Membersihkan interval...');
    clearInterval(interval);
    db.close();
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

let interval;

// CLI trade report: closed trades + PnL summary + open positions + wallet
function printTradeReport() {
    console.log('\n=========================================');
    console.log('📋 TRADE REPORT');
    console.log('=========================================');

    const history = db.prepare('SELECT * FROM trade_history ORDER BY id').all();
    if (history.length === 0) {
        console.log('📄 Belum ada trade history (belum ada posisi yang ditutup).');
    } else {
        console.log('--- Closed Trades (trade_history) ---');
        for (const t of history) {
            const result = t.profit_loss >= 0 ? '✅ WIN' : '❌ LOSS';
            console.log(
                `#${t.id} ${t.pair} | Buy: ${t.buy_price} | Sell: ${t.sell_price} | ` +
                `PnL: ${t.profit_loss.toFixed(4)} USDT | ${t.close_reason} | ${t.timestamp} | ${result}`
            );
        }

        const total = history.reduce((sum, t) => sum + t.profit_loss, 0);
        const wins = history.filter((t) => t.profit_loss >= 0).length;
        const losses = history.length - wins;
        const winRate = history.length > 0 ? ((wins / history.length) * 100).toFixed(1) : '0.0';

        console.log('\n--- PnL Summary ---');
        console.log(`Total trades: ${history.length}`);
        console.log(`Wins: ${wins} | Losses: ${losses} | Win rate: ${winRate}%`);
        console.log(`Total net PnL: ${total.toFixed(4)} USDT`);
    }

    const openPositions = db.prepare("SELECT * FROM active_positions WHERE status = 'OPEN'").all();
    console.log('\n--- Current Open Positions ---');
    if (openPositions.length === 0) {
        console.log('🟢 Tidak ada posisi open.');
    } else {
        for (const p of openPositions) {
            console.log(
                `#${p.id} ${p.pair} | Buy: ${p.buy_price} | Amount: ${p.amount_coin} | ` +
                `TP: ${p.target_tp} | SL: ${p.target_sl}`
            );
        }
    }

    console.log('\n--- Wallet Balance ---');
    console.table(db.prepare('SELECT * FROM wallet').all());
    console.log('=========================================\n');
}

async function startBot() {
    try {
        const wallet = db.prepare('SELECT * FROM wallet').all();
        console.log('📊 Current Dummy Wallet:');
        console.table(wallet);

        printTradeReport();

        console.log('\n⏳ Menjalankan scan pertama...');
        await mainLoop();

        interval = setInterval(mainLoop, SCAN_INTERVAL_MS);
        console.log(`✅ Loop aktif. Scan berikutnya tiap ${SCAN_INTERVAL_MS / 1000}s.`);
    } catch (error) {
        console.error('❌ Bot gagal inisialisasi:', error.message);
    }
}

if (process.argv.includes('--report')) {
    printTradeReport();
    process.exit(0);
}

startBot();
