// checkAccount.js — Phase 0-lite: Binance Read-Only Account Viewer
// Usage:
//   node src/scripts/checkAccount.js                  # non-zero spot balances
//   node src/scripts/checkAccount.js --trades [PAIR]  # + recent trade fills (real fees), default pair BTC/USDT
//   node src/scripts/checkAccount.js --orders [PAIR]  # + order history w/ statuses, default pair BTC/USDT
//   node src/scripts/checkAccount.js --help | -h      # usage, exits without any API call
// Requires .env: BINANCE_READ_KEY / BINANCE_READ_SECRET ("Enable Reading" ONLY key)
require('dotenv').config();
const ccxt = require('ccxt');

const DEFAULT_PAIR = 'BTC/USDT'; // matches bot's TRADING_CONFIG.symbol

function printUsage() {
  console.log(`Usage: node src/scripts/checkAccount.js [--trades] [--orders] [PAIR]

Read-only Binance spot account viewer (no trading capability).
Requires BINANCE_READ_KEY / BINANCE_READ_SECRET in .env.

Options:
  (no flags)        Print non-zero spot balances
  --trades [PAIR]   Also show recent trade fills (price, amount, side, real fee)
                    Pair defaults to ${DEFAULT_PAIR}. Binance keeps ~90 days of fills.
  --orders [PAIR]   Also show order history with statuses (FILLED/CANCELED etc.)
  --help, -h        Show this help and exit`);
}

function parseArgs(argv) {
  const args = { help: false, trades: false, orders: false, pair: DEFAULT_PAIR };
  for (const a of argv) {
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--trades') args.trades = true;
    else if (a === '--orders') args.orders = true;
    else if (!a.startsWith('--')) {
      // validate shape like BTC/USDT, fail closed otherwise
      if (!/^[A-Z0-9]+\/[A-Z0-9]+$/.test(a.toUpperCase())) {
        throw new Error(`Invalid pair "${a}" — expected format BASE/QUOTE e.g. ${DEFAULT_PAIR}`);
      }
      args.pair = a.toUpperCase();
    } else throw new Error(`Unknown flag "${a}" — see --help`);
  }
  return args;
}

function fmtFee(trade) {
  if (!trade.fee || !trade.fee.cost) return '—';
  return `${trade.fee.cost} ${trade.fee.currency}`;
}

function fmtTime(ts) {
  return ts ? new Date(ts).toISOString().replace('T', ' ').slice(0, 19) : '—';
}

async function showTrades(exchange, pair) {
  try {
    const trades = await exchange.fetchMyTrades(pair);
    if (trades.length === 0) {
      console.log(`\nTrade fills (${pair}): none in the last ~90 days.`);
      return;
    }
    console.log(`\nTrade fills (${pair}, most recent first):`);
    for (const t of trades.slice().reverse()) {
      console.log(`${fmtTime(t.timestamp)} | ${t.side.toUpperCase().padEnd(4)} | price ${t.price} | amount ${t.amount} | fee ${fmtFee(t)}`);
    }
  } catch (err) {
    console.error(`[TRADES ERROR] Failed to fetch trade fills for ${pair}: ${err.message}`);
    return false;
  }
  return true;
}

async function showOrders(exchange, pair) {
  try {
    const orders = await exchange.fetchOrders(pair);
    if (orders.length === 0) {
      console.log(`\nOrder history (${pair}): none found.`);
      return;
    }
    console.log(`\nOrder history (${pair}, most recent first):`);
    for (const o of orders.slice().reverse()) {
      console.log(
        `${fmtTime(o.timestamp)} | ${String(o.type || '?').toUpperCase().padEnd(6)} | ${o.side.toUpperCase().padEnd(4)} | ` +
        `status ${(o.status || '?').toUpperCase().padEnd(10)} | filled avg ${o.average ?? o.price ?? '—'} | amount ${o.amount}`
      );
    }
  } catch (err) {
    console.error(`[ORDERS ERROR] Failed to fetch order history for ${pair}: ${err.message}`);
    return false;
  }
  return true;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`[ARGS ERROR] ${err.message}`);
    process.exit(1);
  }

  if (args.help) {
    printUsage(); // no API call
    return;
  }

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

  let failures = 0;

  // Balances always shown (current behavior preserved)
  try {
    const balance = await exchange.fetchBalance();

    // Show only non-zero spot balances
    const rows = Object.entries(balance.total).filter(([, v]) => v > 0);
    if (rows.length === 0) {
      console.log('No non-zero balances found.');
    } else {
      console.log('Binance spot balances (non-zero):');
      for (const [asset, total] of rows) {
        console.log(`${asset.padEnd(10)} ${total}`);
      }
    }
  } catch (err) {
    // Friendly message + exit code 1 (decision: option a — strict fail)
    if (err instanceof ccxt.AuthenticationError) {
      console.error('[AUTH ERROR] Invalid API key/secret or key has no reading permission.');
    } else {
      console.error(`[FETCH ERROR] Failed to fetch account balance: ${err.message}`);
    }
    process.exit(1); // balances are the core request — nothing else is useful without them
  }

  // Optional sections fail independently; exit 1 only if every requested section failed
  if (args.trades && !(await showTrades(exchange, args.pair))) failures++;
  if (args.orders && !(await showOrders(exchange, args.pair))) failures++;

  if (failures > 0 && failures >= Number(args.trades) + Number(args.orders)) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[ERROR] Unexpected failure: ${err.message}`);
  process.exit(1);
});
