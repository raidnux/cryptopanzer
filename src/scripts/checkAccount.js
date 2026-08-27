// checkAccount.js — Phase 0-lite: Binance Read-Only Account Viewer
// Usage: node src/scripts/checkAccount.js (on-demand CLI, no loop, no orders)
// Requires .env: BINANCE_READ_KEY / BINANCE_READ_SECRET ("Enable Reading" ONLY key)
require('dotenv').config();
const ccxt = require('ccxt');

async function main() {
  const apiKey = process.env.BINANCE_READ_KEY;
  const apiSecret = process.env.BINANCE_READ_SECRET;

  // Fail-safe: never proceed with missing keys; never print their values
  if (!apiKey || !apiSecret) {
    console.error('[AUTH ERROR] BINANCE_READ_KEY / BINANCE_READ_SECRET not set in .env');
    process.exit(1);
  }

  const exchange = new ccxt.binance({
    apiKey,
    secret: apiSecret,
    enableRateLimit: true,
  });

  try {
    const balance = await exchange.fetchBalance();

    // Show only non-zero spot balances
    const rows = Object.entries(balance.total).filter(([, v]) => v > 0);
    if (rows.length === 0) {
      console.log('No non-zero balances found.');
      return;
    }
    console.log('Binance spot balances (non-zero):');
    for (const [asset, total] of rows) {
      console.log(`${asset.padEnd(10)} ${total}`);
    }
  } catch (err) {
    // Friendly message + exit code 1 (decision: option a — strict fail)
    if (err instanceof ccxt.AuthenticationError) {
      console.error('[AUTH ERROR] Invalid API key/secret or key has no reading permission.');
    } else {
      console.error(`[FETCH ERROR] Failed to fetch account balance: ${err.message}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[ERROR] Unexpected failure: ${err.message}`);
  process.exit(1);
});
