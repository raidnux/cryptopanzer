require('dotenv').config();
const db = require('./db/db');
const { TRADING_CONFIG } = require('./config/exchange');
const { fetchMarketData, getCurrentPrice } = require('./data/fetcher');
const { checkEntrySignal } = require('./strategy/indicator');
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
async function checkEntry(currentPrice) {
    const candles = await fetchMarketData(100);
    if (candles.length === 0) {
        console.warn('[ENTRY] Data OHLCV kosong, lewati analisa.');
        return;
    }

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
            `RSI: <code>${signal.rsi.toFixed(2)}</code>\n` +
            `Target TP: <code>${signal.targetTp.toFixed(2)}</code>\n` +
            `Target SL: <code>${signal.targetSl.toFixed(2)}</code>`
        );
    }
}

// Main trading loop: monitor positions, then look for new entries
async function mainLoop() {
    try {
        const currentPrice = await getCurrentPrice();
        if (currentPrice === null) return;

        await monitorOpenPositions(currentPrice);
        await checkEntry(currentPrice);
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
