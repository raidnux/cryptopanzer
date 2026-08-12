const { RSI, EMA } = require('technicalindicators');

// Configurable strategy parameters
const STRATEGY_CONFIG = {
    rsiPeriod: 14,
    emaPeriod: 20,
    rsiOversold: 30,   // Entry signal: RSI below this -> oversold buy
    rsiOverbought: 70, // (Reserved for potential sell signal)
    riskPercent: 0.01, // Stop Loss = 1% below entry
    rrRatio: 2,        // Take Profit = 2x the risk (1:2 R:R)
};

// Extract closing prices from OHLCV candle objects
function getClosingPrices(candles) {
    return candles.map((candle) => candle.close);
}

// Calculate RSI and EMA, returning the latest computed values
function calculateIndicators(candles) {
    if (!Array.isArray(candles) || candles.length < STRATEGY_CONFIG.emaPeriod) {
        throw new Error('Data candlestick tidak cukup untuk menghitung indikator.');
    }

    const closes = getClosingPrices(candles);

    const rsiValues = RSI.calculate({
        values: closes,
        period: STRATEGY_CONFIG.rsiPeriod,
    });

    const emaValues = EMA.calculate({
        values: closes,
        period: STRATEGY_CONFIG.emaPeriod,
    });

    // rsiValues & emaValues are shorter arrays aligned to the END of input data
    return {
        rsi: rsiValues[rsiValues.length - 1],
        ema: emaValues[emaValues.length - 1],
    };
}

// Build a new indicator set enriched with entry/exit targets
// Returns null when no valid buy signal, otherwise an object with signal + targets
function checkEntrySignal(candles) {
    try {
        const indicators = calculateIndicators(candles);
        const entryPrice = candles[candles.length - 1].close;

        // Buy condition: RSI is oversold AND price is below/at EMA (dip pullback)
        const isOversold = indicators.rsi < STRATEGY_CONFIG.rsiOversold;
        const isBelowEma = entryPrice <= indicators.ema;

        if (!isOversold || !isBelowEma) {
            return null; // No entry signal
        }

        // Compute risk-based targets (1:2 R:R)
        const stopLoss = entryPrice * (1 - STRATEGY_CONFIG.riskPercent);
        const riskPerUnit = entryPrice - stopLoss;
        const takeProfit = entryPrice + riskPerUnit * STRATEGY_CONFIG.rrRatio;

        return {
            signal: true,
            entryPrice,
            targetTp: takeProfit,
            targetSl: stopLoss,
            rsi: indicators.rsi,
            ema: indicators.ema,
        };
    } catch (error) {
        console.error(`[INDICATOR] Gagal menghitung sinyal: ${error.message}`);
        return null;
    }
}

module.exports = {
    calculateIndicators,
    checkEntrySignal,
    STRATEGY_CONFIG,
};
