const { RSI, EMA } = require('technicalindicators');

// Strategy parameters read from .env with safe defaults (not hot-swappable — loads at require-time)
const STRATEGY_CONFIG = {
    rsiPeriod: Number(process.env.RSI_PERIOD) || 14,
    emaPeriod: Number(process.env.EMA_PERIOD) || 20,
    rsiOversold: Number(process.env.RSI_OVERSOLD) || 30,   // Entry signal: RSI below this -> oversold buy
    rsiOverbought: Number(process.env.RSI_OVERBOUGHT) || 70, // (Reserved for potential sell signal)
    riskPercent: Number(process.env.RISK_PERCENT) || 0.01, // Stop Loss = 1% below entry
    rrRatio: Number(process.env.RR_RATIO) || 2,            // Take Profit = 2x the risk (1:2 R:R)
};

// Compute the current planned entry/exit targets from the latest close (no signal required)
// Returns { entryPrice, targetTp, targetSl } as a preview of where an entry would trigger
function getEntryPlan(candles) {
    if (!Array.isArray(candles) || candles.length === 0) return null;

    const entryPrice = candles[candles.length - 1].close;
    const stopLoss = entryPrice * (1 - STRATEGY_CONFIG.riskPercent);
    const riskPerUnit = entryPrice - stopLoss;
    const takeProfit = entryPrice + riskPerUnit * STRATEGY_CONFIG.rrRatio;

    return { entryPrice, targetTp: takeProfit, targetSl: stopLoss };
}

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
    getEntryPlan,
    STRATEGY_CONFIG,
};
