const { exchange, TRADING_CONFIG } = require('../config/exchange');

// Fetch OHLCV (candlestick) data from Binance public API
// Returns an array of { timestamp, open, high, low, close, volume } objects
async function fetchMarketData(limit = 100) {
    try {
        const rawCandles = await exchange.fetchOHLCV(
            TRADING_CONFIG.symbol,
            TRADING_CONFIG.timeframe,
            undefined,
            limit
        );

        // CCXT returns candles as arrays: [timestamp, open, high, low, close, volume]
        return rawCandles.map((candle) => ({
            timestamp: candle[0],
            open: candle[1],
            high: candle[2],
            low: candle[3],
            close: candle[4],
            volume: candle[5],
        }));
    } catch (error) {
        console.error(`[FETCHER] Gagal mengambil data OHLCV: ${error.message}`);
        return [];
    }
}

// Get the current live price (latest close / ticker last price)
async function getCurrentPrice() {
    try {
        const ticker = await exchange.fetchTicker(TRADING_CONFIG.symbol);
        return ticker.last;
    } catch (error) {
        console.error(`[FETCHER] Gagal mengambil harga terkini: ${error.message}`);
        return null;
    }
}

module.exports = {
    fetchMarketData,
    getCurrentPrice,
};
