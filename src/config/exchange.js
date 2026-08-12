require('dotenv').config();
const ccxt = require('ccxt');

// Initialize exchange (e.g., using Binance for public market data)
// As per documentation, no API Keys are required since we only fetch public prices
const exchange = new ccxt.binance({
  enableRateLimit: true, // Required to prevent rate-limit bans from the exchange
});

// Default trading configuration fallback
const TRADING_CONFIG = {
  symbol: process.env.DEFAULT_SYMBOL || 'BTC/USDT',
  timeframe: process.env.DEFAULT_TIMEFRAME || '15m',
};

module.exports = {
  exchange,
  TRADING_CONFIG
};
