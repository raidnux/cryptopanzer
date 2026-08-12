require('dotenv').config();
const db = require('./db/db');
const { TRADING_CONFIG } = require('./config/exchange');
const { fetchMarketData, getCurrentPrice } = require('./data/fetcher');
const { checkEntrySignal, getEntryPlan, STRATEGY_CONFIG } = require('./strategy/indicator');
const { executeDummyBuy, executeDummySell } = require('./engine/paperTrade');
const { sendTelegramMessage } = require('./utils/telegram');

const SCAN_INTERVAL_MS = 60 * 1000; // 1 menit

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
        const time = new Date().toLocaleTimeString();

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

        const plan = getEntryPlan(candles);
        const entryText = plan ? `Entry plan: ${plan.entryPrice.toFixed(2)}` : 'Entry plan: n/a';

        console.log(`🔄 [${time}] Checking ${TRADING_CONFIG.symbol} | Price: ${currentPrice} | ${entryText} | ${strategyTag}`);

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

async function startBot() {
    try {
        const wallet = db.prepare('SELECT * FROM wallet').all();
        console.log('📊 Current Dummy Wallet:');
        console.table(wallet);

        console.log('\n⏳ Menjalankan scan pertama...');
        await mainLoop();

        interval = setInterval(mainLoop, SCAN_INTERVAL_MS);
        console.log(`✅ Loop aktif. Scan berikutnya tiap ${SCAN_INTERVAL_MS / 1000}s.`);
    } catch (error) {
        console.error('❌ Bot gagal inisialisasi:', error.message);
    }
}

startBot();
