# CryptoPanzer — Project Todo

> **Project:** CryptoPanzer — Automated Paper Trading Bot (Simulation)
> **Status:** Planning

---

## Phase 1: Project Setup & Configuration

### Tasks
- [x] Initialize git repository and set up `.gitignore` (node_modules, .env, .db)
- [x] Create `package.json` with all listed dependencies: `ccxt`, `better-sqlite3`, `technicalindicators`, `node-telegram-bot-api`, `dotenv`
- [x] Set up `.env` file template (Telegram Token, exchange configs, etc.) — never commit to Git
- [x] Create `src/index.js` — main entry point for the bot
- [x] Create `src/config/exchange.js` — CCXT trading pair and timeframe configurations
- [x] Create `src/config/initDB.js` — SQLite table initialization script

### Deliverables
- [ ] `docs/todo.md` (this file)
- [ ] `.gitignore`
- [ ] `package.json`
- [ ] `src/index.js`
- [ ] `src/config/exchange.js`
- [ ] `src/config/initDB.js`

---

## Phase 2: Database & Core Infrastructure

### Tasks
- [x] Design and implement `wallet` table (asset, balance)
- [x] Design and implement `active_positions` table (id, pair, buy_price, amount_coin, target_tp, target_sl, status)
- [x] Design and implement `trade_history` table (id, pair, buy_price, sell_price, profit_loss, close_reason, timestamp)
- [x] Create `src/engine/paperTrade.js` — dummy balance deduction & trade recording logic
- [x] Create `src/db/db.js` — centralized SQLite connection & query helpers
- [x] Run `initDB.js` and verify database schema is correct
- [x] Test dummy balance writes and reads using DB Browser for SQLite
- [x] Implement database seeder in `initDB.js` to automatically inject an initial dummy balance (e.g., 10,000 USDT) into the `wallet` table on first run

> Sync audit 2026-08-27: all items verified present in codebase (`initDB.js` schema + seeder 10,000 USDT + guarded column migration; `db.js` WAL connection; `paperTrade.js` executing; production DB in use by bot/dashboard) — marked done without code changes.

### Deliverables
- [x] `src/db/db.js`
- [x] `src/engine/paperTrade.js`
- [x] `db/dummy_data.db` (auto-generated)
- [x] Database schema verified


---

## Phase 3: Market Data Layer

### Tasks
- [x] Create `src/data/fetcher.js` — functions to fetch OHLCV (candlestick) data from exchanges via `ccxt`
- [x] Add exchange configuration support (Binance, Bybit, etc.) via `src/config/exchange.js`
- [x] Implement error handling for exchange API failures and rate limits
- [x] Verify live price data can be fetched and stored

### Deliverables
- [x] `src/data/fetcher.js`
- [x] Exchange data fetching works end-to-end

---

## Phase 4: Analysis Layer

### Tasks
- [x] Create `src/strategy/indicator.js` — calculates technical indicators (RSI, EMA, MACD, etc.)
- [x] Implement Entry Signal detection logic based on R:R management rules
- [x] Define R:R thresholds and signal validation criteria
- [x] Test signal generation with known market conditions

### Deliverables
- [x] `src/strategy/indicator.js`
- [x] Entry signal detection works correctly

---

## Phase 5: Execution Layer

### Tasks
- [x] Implement TP/SL target setting in `src/engine/paperTrade.js`
- [x] Deduct dummy USDT balance when a signal is valid
- [x] Add dummy BTC balance to SQLite when a signal is valid
- [x] Implement simulated trading fees (e.g., 0.1% deduction) for every Buy and Sell execution to ensure realistic PnL calculations
- [x] Implement signal state management (pending → entered → closed)
- [x] Handle edge cases (insufficient balance, concurrent trades, etc.)

> Sync audit 2026-08-27: verified in codebase — `paperTrade.js` stores TP/SL at entry (`target_tp`/`target_sl`), deducts USDT & adds coin inside a DB transaction, applies `feeRate = 0.001` (0.1%) on BOTH buy and sell, computes PnL net of fees; state managed as OPEN→CLOSED statuses in `active_positions`; insufficient-balance guards on both sides (`[REJECTED] Saldo ... tidak cukup`) and concurrent-trade guard via open-position count check in `index.js` before entry. Marked done without code changes.

### Deliverables
- [x] `src/engine/paperTrade.js` with TP/SL logic
- [x] Trade execution handles dummy balance correctly

---

## Phase 6: Monitoring Layer

### Tasks
- [x] Implement live price tracking and monitoring
- [x] Detect when price hits TP or SL targets
- [x] Trigger local "Sell" execution and calculate PnL
- [x] Update `trade_history` table on close

### Deliverables
- [x] Live price monitoring and TP/SL detection working
- [x] PnL calculation and trade history recording

### Enhancement (Planned)
- [x] Add per-cycle activity log at the top of `mainLoop()` in `src/index.js`:
  - Uses dynamic `${TRADING_CONFIG.symbol}` instead of hardcoded `BTC/USDT`
  - Logs current price after `getCurrentPrice()` fetch
  - Fallback log when price fetch fails (shows activity, skips cycle)
  - Format: `🔄 [<time>] Checking <symbol> market movements... | Price: <price>`

### Enhancement (Planned)
- [x] Make entry strategy configurable via `.env` and surface it in bot logs:
  - `.env`: add commented strategy keys (`RSI_PERIOD`, `EMA_PERIOD`, `RSI_OVERSOLD`, `RSI_OVERBOUGHT`, `RISK_PERCENT`, `RR_RATIO`)
  - `src/strategy/indicator.js`: read `STRATEGY_CONFIG` from env with safe defaults (`Number(process.env.X) || default`)
  - `src/index.js`: import `STRATEGY_CONFIG`, show full strategy summary in startup banner + add short tag (`RSI<30+EMA20 | RR 1:2`) to per-cycle log
  - Show entry price plan (BOTH views):
    - Cycle log: shows live `RSI` + `EMA` values each cycle (replacing the redundant entry-plan preview) so signal proximity is visible
    - Entry signal log: full plan (entry, TP, SL) when a valid signal fires
  - Caveat: strategy loads at require-time → changes require restart (not hot-swappable)

---

## Phase 7: Notification Layer

### Tasks
- [x] Create `src/utils/telegram.js` — Telegram notification sender functions
- [x] Implement trade report notifications
- [x] Implement status update notifications
- [ ] Test Telegram notifications (dry run / test token)
- [ ] Implement two-way Telegram commands (e.g., `/balance` to check current USDT/BTC wallet, and `/status` to check active open positions)

### Deliverables
- [x] `src/utils/telegram.js`
- [x] Trade reports and status updates sent to Telegram

---

## Phase 8: Logging & Utilities

### Enhancement (Planned)
- [x] Add `--help` CLI flag to `src/index.js`:
  - Running `node src/index.js --help` should print the available CLI flags (e.g. `--report`) + usage info and **exit** WITHOUT starting the bot/loop
  - Fix: `--help` currently falls through and starts the bot (treated as an unknown arg) — must intercept before `startBot()`
  - Verify with `node --check` + a manual `node src/index.js --help` run (should print help and exit cleanly)

### Enhancement (Planned)
- [x] Add date to CLI log timestamps in `src/index.js` (currently `toLocaleTimeString()` is time-only, no date):
  - Change cycle-log `time` to include the date, e.g. `2026-08-13 06:42:13` (`toLocaleString()` or a custom `YYYY-MM-DD HH:mm:ss` formatter)

### Enhancement (Planned)
- [x] Create standalone factory-reset script `src/scripts/resetDB.js` to reset the dummy wallet + DB to a clean slate for testing:
  - Connect to `db/dummy_data.db` (use project's already-installed `better-sqlite3`, NOT the sample's `sqlite3` package — it isn't a dependency)
  - `DELETE FROM trade_history;` and `DELETE FROM active_positions;` (clear orphaned trades)
  - `DELETE FROM wallet;` then seed fresh: `INSERT INTO wallet (asset, balance)` for `10000 USDT` and `0 BTC`
  - Print success logs to console and safely close the DB connection (prefer sync `better-sqlite3` API / use a transaction for atomicity)
  - Usage (docs only, user runs manually): stop bot via PM2 → `node src/scripts/resetDB.js` → start bot again

### Enhancement (Planned)
- [x] Add `--help`/`-h` flag to `src/scripts/resetDB.js` + Yes/No safety confirmation:
  - `--help`/`-h`: check at the TOP of the file BEFORE opening the DB connection so it exits without touching the database; print usage + WARNING that running with no flag destroys all trade data and re-seeds 10,000 USDT & 0 BTC
  - No-flag interactive run: prompt via `readline` asking the user to confirm the destructive reset (e.g. type `yes`); proceed only on explicit `yes`, abort cleanly on `no`/anything else without modifying the DB
  - Print clear instruction + help hint in the prompt
  - Verify: `node --check`, `node src/scripts/resetDB.js --help` (help prints, exits, DB untouched), abort path leaves DB untouched, confirmed reset still works

### Enhancement (Planned)
- [x] Add CLI trade report in `src/index.js`, printed at startup + on-demand:
  - `printTradeReport()` returning a formatted string/report reading `trade_history` (closed trades)
    - Each closed trade: pair, buy price, sell price, PnL, reason (TP_HIT/SL_HIT), timestamp
    - Summary: total trades, wins, losses, win rate, total net PnL
    - Current OPEN positions from `active_positions`
    - Wallet balance from `wallet` table
  - Print at startup (after the wallet table, so it shows instantly in `pm2 logs`) **and** on-demand via a `--report` CLI arg (prints report then exits/monitoring)
  - Verify with `node --check` + a manual `node src/index.js --report` run

### Tasks
- [ ] Create `src/utils/logger.js` — color-coded terminal logs
- [ ] Integrate logging into all layers
- [ ] Add debug/verbose logging modes
- [ ] Implement global error handling (`uncaughtException` and `unhandledRejection`) to prevent the bot from crashing during public API network timeouts or connection drops

### New Tool (Planned → building now per owner request)
- [x] Add `src/scripts/checkVPS.js` — read-only VPS environment checker (no deps added) to validate readiness for the future dashboard (Option A):
  - Node version, PM2 presence + process list, free RAM/disk
  - `dummy_data.db` exists + opens READONLY successfully + row counts (wallet/positions/history)
  - Port 3000 (default dashboard port) already in use or free
  - Whether `express` is already installed in node_modules
  - OS info + whether bot process is currently running
  - Prints PASS/WARN/FAIL summary so owner can paste output back to agent
  - Verify with `node --check` + local run (safe: READONLY db access only)

### Future Feature (Not building now — logged for later)
- [ ] Selectable trading strategies (adapter pattern / strategy registry):
  - Add `STRATEGY` env key (e.g. `rsi_ema` default, future: `rsi_pullback`, `ema_cross`, `macd`) mapping to a strategy module in `src/strategy/`
  - Split each strategy into its own file (`rsi_ema` = current `indicator.js`; future `rsiPullback.js`, `emaCross.js`, `macd.js`) + add `registry.js` (name → module loader)
  - Common contract every strategy implements: `{ meta: { name, tag, banner }, calculateIndicators(candles), checkEntrySignal(candles) → { signal, entryPrice, targetTp, targetSl, indicators }, getEntryPlan(candles), describe(indicators) → string }`
  - Make `src/index.js` strategy-agnostic (currently hard-coded): banner + per-cycle tag from `meta.banner`/`meta.tag`, live values from `describe()`, Telegram message from `describe(signal.indicators)` instead of fixed `signal.rsi`/`signal.ema`
  - `paperTrade.js` + `monitorOpenPositions()` stay untouched; long-only preserved; `STRATEGY_CONFIG` risk/reward stays shared across strategies
  - `.env`: add `STRATEGY=rsi_ema` + per-strategy keys; not hot-swappable (restart required)
  - Recommended: prove the pattern with a `rsi_ema` refactor + ONE new strategy (e.g. `rsi_pullback`) before adding more

### Future Feature (Logged — dashboard, awaiting owner build command)
- [x] Read-only trade report dashboard (Option A — tiny Express server):
  - **VPS readiness confirmed** via `src/scripts/checkVPS.js` output (2026-08-25): Node v22.23.2, 1 CPU / 1.9 GB RAM (fine for lightweight dashboard), port 3000 free, DB READONLY OK, bot healthy under PM2. Only blocker: `express` not installed.
  - **Dependency approval needed (AGENTS.md #13):** `express` (~28M weekly downloads, OpenJS Foundation maintained) — owner to confirm before install
  - Build plan:
    - `npm install express` in workspace → commit package.json/package-lock.json
    - Create `src/dashboard/server.js`: one static HTML page + `/api/wallet`, `/api/positions`, `/api/history` JSON endpoints; all DB queries READONLY (`{ readonly: true }` per AGENTS.md #13); reuse the same queries as `printTradeReport()`
    - Dashboard shows: wallet balance card, OPEN positions table, closed trades table, PnL summary (total/wins/losses/win rate/net PnL). Report-only — NO execution/entry controls
    - **Security:** bind `127.0.0.1:PORT` only (never 0.0.0.0); access via SSH tunnel; no auth needed since SSH login is the gate
    - Deploy: owner pushes → VPS `git pull` → `pm2 start src/dashboard/server.js --name cryptodash` (second PM2 process, separate from bot)
  - **Access workflow (owner topology: MacBook ↔ VPS ↔ WSL):** dashboard runs on VPS; owner opens tunnel FROM THE MAC (`ssh -L 3000:localhost:3000 root@VPS_IP`) and browses `http://localhost:3000` on the Mac. WSL is dev-only, no tunnel needed.
  - Verify: `node --check`; local run with curl checks of all 3 endpoints; confirm readonly binding via `ss -tlnp | grep <port>`

### New Feature (Planned)
- [x] Add `--dry-run` CLI flag to `src/index.js`:
  - When enabled, the bot scans the market every cycle but **skips order execution** — no `executeDummyBuy`, no position opening.
  - Print `🟢 DRY-RUN MODE` at startup and append ` | DRY-RUN` to each per-cycle log line so the user can detect at a glance that the bot is scanning only.
  - The `checkEntrySignal` function is still called for indicator display, but `executeDummyBuy` is never invoked; `monitorOpenPositions` runs UNCONDITIONALLY (no DRY_RUN guard) — an already-OPEN position is still fully managed: TP/SL hits execute a real sell, record PnL, and send Telegram. Dry-run = block NEW entries only ("finish what's running, don't start anything new").
  - Verify with `node --check` + a manual `node src/index.js --dry-run` run (should print mode indicator and scan loop, no trades).
  - Optional: add `--live` flag to explicitly set live mode (default if no flag).

### Bug Fix (Planned)
- [x] Fix Telegram `409 Conflict` ("terminated by other getUpdates request") when running the bot locally while the VPS instance is also running:
  - **Root cause:** `src/utils/telegram.js` creates `new TelegramBot(token, { polling: true })` at require-time — every process with the same `TELEGRAM_TOKEN` starts polling, but Telegram allows only ONE active poller per bot token.
  - **Fix: add `--no-telegram` CLI flag** (smallest change):
    - `src/index.js`: check `--no-telegram` early (alongside other flags) and set a global flag
    - `src/utils/telegram.js`: only start polling when enabled — guard the polling setup + `/balance` + `/status` handlers; `sendTelegramMessage()` stays available either way
  - **Result:** VPS runs as-is with full notifications; local dev uses `node src/index.js --no-telegram` (combinable with `--dry-run`) → no conflict; default unchanged (no flag = Telegram on, backward compatible)
  - Update `docs/commands.md` with the new flag
  - Verify: `node --check`, run local with `--no-telegram` while VPS is running → no 409 errors in logs

### Bug (Documented — environment issue, NOT a code bug)
- [x] Local-only: `[FETCHER] Gagal mengambil harga terkini: unable to get local issuer certificate` → every cycle skips (`Fetch failed, skipping cycle...`):
  - **Root cause:** Cloudflare WARP running on the local machine intercepts HTTPS traffic; Node.js cannot validate Binance's TLS chain through WARP's interception. Diagnosed via: `warp-cli status` → Connected, plain `curl https://api.binance.com/api/v3/ping` also fails (`HTTP 000`), and Node `fetch` reproduces the same cert error. VPS unaffected (direct connection).
  - **Applied fix (no code change):** disconnect WARP during local dev/testing:
    - `warp-cli disconnect` → run the bot locally → `warp-cli connect` afterwards
  - Alternatives if WARP must stay connected: `NODE_EXTRA_CA_CERTS=/path/to/warp.pem`, or split-tunnel exclude for Binance domains (`warp-cli add-excluded-route`)
  - Recurrence hint: if local cycles all log "Fetch failed" with cert errors, check WARP first.

### Enhancement (Planned)
- [ ] Make entry amount env-configurable via `ENTRY_AMOUNT_USDT` in `.env`:
  - Currently hardcoded at `src/index.js:109` as `const usdtAmount = 100; // Modal per posisi (paper)`
  - Read with the same pattern as strategy keys: `Number(process.env.ENTRY_AMOUNT_USDT) || 100` (restart required, not hot-swappable)
  - Add commented `ENTRY_AMOUNT_USDT=100` key to `.env`
  - `paperTrade.js` untouched — it already receives the amount as a parameter
  - Update `docs/commands.md` Environment section
  - Decision logged: config stays in `.env` (not DB) — hot-swap not needed; restart is safer/simpler for this scale

### New Feature (Planned) — BREAK-EVEN STOP (urgent priority, build next)
- [x] Add fee-aware break-even stop to `monitorOpenPositions()` in `src/index.js`:
  - **Problem:** current SL is static — a winner that reverses gives back the whole gain and can become a −1% loss
  - **Trigger:** current price ≥ `entry × (1 + RISK_PERCENT)` → position has reached 1R (+1%)
  - **Action:** move `target_sl` UP to true breakeven price, fees included:
    - `BE = entryPrice / (0.999 × 0.999) ≈ entryPrice × 1.002` (+0.2001% — covers buy fee 0.1% + sell fee 0.1%)
    - Selling at plain entry would net −0.1 USDT after sell fee; BE price returns the full cost (zero loss, zero profit)
  - **Safety rules:**
    - Only ever move SL upward: `new_sl = max(current_sl, BE)` — never down
    - One-way ratchet: once moved, never reverts
    - No schema change needed — reuse existing `target_sl` column in `active_positions`; `paperTrade.js` stays untouched (it already sells at whatever `target_sl` says)
  - **Logging/notify:**
    - Console log on activation: `[BREAK-EVEN] #<id> <pair> | SL moved <old> → <new>`
    - Telegram notify once when activated (trade is now risk-free)
  - **Verify:** `node --check`; simulate a position reaching 1R and confirm SL updates exactly once, never moves down; confirm normal TP/SL flow still works after BE activation
  - Verify: `node --check`, run with default (100) and an override value to confirm it takes effect

### Deliverables
- [ ] `src/utils/logger.js`

---

## Phase 9: Testing & Deployment

### Tasks
- [ ] Run end-to-end local test (full bot flow: fetch → analyse → trade → monitor → notify)
- [x] Verified DB data integrity after each trade cycle
- [ ] Set up Private GitHub Repository and push code
- [ ] Deploy to DigitalOcean VPS
- [ ] Start bot with `pm2 start src/index.js --name "CryptoPanzer"`
- [x] Verified 24/7 monitoring and Telegram notifications work on server
- [ ] Set up PM2 Log Rotation (`pm2 install pm2-logrotate`) on the VPS to prevent log files from exhausting server storage over time

### Deliverables
- [ ] Complete end-to-end test passed
- [ ] GitHub repo with all code committed
- [ ] VPS deployment working
- [ ] Bot running 24/7 via PM2

---

## Phase 10: Live Trading on Main Binance Account (PLANNED — awaiting owner build command per phase)

> Discussion logged 2026-08-25. Goal: wire the bot from paper trading to real Binance spot orders.
> Long-only preserved. Paper mode stays intact. Each phase below is built ONLY on explicit owner command.

### Phase 0 — Binance account prep (owner does manually, no code)
- [ ] Enable 2FA on Binance account
- [ ] Create API key (Account → API Management) with RESTRICTED permissions:
  - ✅ Enable Reading, ✅ Enable Spot Trading
  - ❌ NEVER enable Withdrawals (funds cannot leave even if key leaks)
  - Optional: IP whitelist for the VPS
- [ ] Store keys in VPS `.env` as `BINANCE_API_KEY` / `BINANCE_API_SECRET` (never committed)

### Phase 1 — Testnet dry run (first code phase to build)
- [x] **DECISION (owner, 2026-08-27): separate DB per trading mode (Option B)** — `TRADING_MODE=paper` → `db/dummy_data.db` (current, untouched), `TRADING_MODE=testnet` → `db/testnet.db` (fake money, wipe freely), `TRADING_MODE=live` → `db/live.db` (real money, backed up separately, audit-grade record). Engine picks DB file from mode; `initDB.js` initializes whichever file is active; `DB_PATH` override still works. Rationale: testnet data is throwaway; live data must never mix with simulated numbers; blast-radius containment for destructive ops.
- [x] Testnet switch implemented (2026-08-27 build): `TRADING_MODE=testnet` (or legacy `BINANCE_TESTNET=true`) in `.env`; engine + DB selection in `src/index.js` via new `src/config/tradingMode.js` (fail-closed on invalid mode) + `src/db/modeDB.js` (creates/ensures `testnet.db` schema incl. `buy_order_id`/`sell_order_id` columns). Paper mode (default) 100% untouched — `db.js`/`paperTrade.js`/`exchange.js`/`initDB.js` protected files NOT modified.
- [x] New `src/engine/liveTrade.js` (same interface as paperTrade): market buy via `createMarketBuyOrderWithCost` (spends exact USDT), market sell with `amountToPrecision` (LOT_SIZE rounding), real fees deducted from fills, wallet mirror via safe upsert, order IDs recorded, DB transaction per trade
- [x] Startup reconciliation: `reconcileOnStartup()` compares OPEN positions vs testnet coin balance, warns loudly on mismatch (warn-only, never crashes loop)
- [x] `ENTRY_AMOUNT_USDT` env now controls per-position size (default 100)
- [ ] Exits: software-side (default, current approach) for Phase 1; OCO decision still open — owner to confirm before Phase 2
- [x] Verified full loop on testnet (owner, on VPS): set `TRADING_MODE=testnet`, restart bot, watch first cycle logs `[RECONCILE]` + wait for signal → `[LIVE BUY SUCCESS]` → TP/SL → `[LIVE SELL SUCCESS]` → Telegram; then `--report` on testnet DB
- [x] **FIX (built 2026-08-28): mirror-wallet seed + quote-side fee on testnet/live engine.** Symptom (2026-08-28 owner observation): Bot Wallet in the dashboard showed negative USDT (`−99.76`) even though the exchange balance was positive (`9900.14`) and the real trade was correct. Root cause: `modeDB` starts the testnet/live wallet **unseeded at $0** by design (initial funds live on the exchange), so the first buy did `0 − entry = −USDT`; and on **Buy** the quote-side sell fee was not credited back, causing a sub-cent BTC/USDT drift. Fixed in `src/engine/liveTrade.js`: (1) `reconcileOnStartup()` now seeds the mode-DB `wallet` to the exchange's real base+quote balances (upsert-only via new `setBalance()`, refuses negative seeds, warn-only on any failure); (2) Buy now debits quote by `filled*avgPrice + fee.cost` (real quote fee). Effect: Bot Wallet ≈ Exchange Balances (positive, no negative confusion); PnL accounting unchanged/correct. Verified: `node --check` all; paper `--report` bit-for-bit unchanged; invalid testnet keys → warn-only, empty wallet (no invalid seed).


### Phase 2 — Live with tiny capital (only after Phase 1 verified)
- [ ] Switch to main-account keys, start with `ENTRY_AMOUNT_USDT=10`
- [ ] Run 1–2 weeks; measure slippage vs paper assumptions (paper math assumes exact TP/SL fills)
- [ ] Raise size gradually only after live results match expectations

### Open questions for owner (answer before Phase 1 build):
1. OCO orders (exchange-side TP/SL — safer, recommended) or keep software-side monitoring?
2. Minimum comfortable starting capital for Phase 2?

### Phase 0-lite — Read-Only Account Viewer (Planned → awaiting owner build command; owner confirmed NO trading for now)
- [ ] Goal: READ the main Binance account (balances) without any trading capability
- [x] Owner manual step (2026-08-27): created Binance API key + secret with ONLY "Enable Reading" (trading ❌, withdrawals ❌)
- [ ] Store `BINANCE_READ_KEY` / `BINANCE_READ_SECRET` in VPS `.env` (never committed)
- [x] New `src/scripts/checkAccount.js` (built 2026-08-27):
  - ccxt Binance instance authenticated with the read-only key pair from `.env`
  - Prints spot balances (all non-zero assets + totals); optional open-orders listing
  - On-demand CLI run only (`node src/scripts/checkAccount.js`) — no loop, no orders, fail-safe error handling; secrets never printed/logged (AGENTS.md #13)
  - Reuse later as foundation for Phase 10 (same key pattern)
- [x] Verify: `node --check` ✅; local dry test with placeholder keys → clean `[AUTH ERROR]` + exit code 1 ✅ (option a: strict fail chosen); real test on VPS ✅ (owner 2026-08-27: live balances printed, e.g. BTC/USDT/DON/BFUSD non-zero rows)

### Phase 0-lite upgrade — trade fills + order history flags (Planned 2026-08-27)

> Owner request: extend `checkAccount.js` so it can also READ Binance trading history (real fees, order states). Same read-only key, no new permissions.

**CLI (backward compatible — no args = balances as-is):**
- [x] `node src/scripts/checkAccount.js` — balances (current behavior, unchanged)
- [x] `node src/scripts/checkAccount.js --trades` — recent trade fills for a pair via `fetchMyTrades()` (`/api/v3/myTrades`): real price, amount, side, **actual fee charged**, timestamp (~90 days window per Binance limit)
- [x] `node src/scripts/checkAccount.js --orders` — order history via `fetchOrders()` (`/api/v3/allOrders`): type, status FILLED/CANCELED, avg executed price, timestamp
- [x] Optional pair argument overrides default (default `BTC/USDT`, matching bot's `TRADING_CONFIG.symbol`)
- [x] `--help` / `-h` prints usage and exits without any API call

**Design rules:**
- [x] Per-flag sections fail independently (error in one section doesn't kill the others); exit 1 only if everything requested failed (keeps option-a strictness while being resilient); bad flag/pair args rejected with `[ARGS ERROR]` + exit 1
- [x] Secrets never printed/logged (AGENTS.md #13); on-demand run only, no loops; mindful of rate limits (single calls per run)
- [x] No new dependencies, reuse existing dotenv+ccxt setup

**Verify:**
- [x] `node --check` pass
- [x] Local run: placeholder keys → clean `[AUTH ERROR]`, exit 1; `--help` works offline; `--bogus` and malformed pair → `[ARGS ERROR]` + exit 1
- [x] Owner runs real test on VPS and confirms output of all three modes ✅ (confirmed 2026-08-27)
- [x] Display fix: `fmtAmount()` for tiny values — no more scientific notation like `fee 2.6e-7 BTC`; applied to fees, balances, amounts

### New feature — Binance Account view in the dashboard (DONE 2026-08-27)


> Owner request: surface the same data as `src/scripts/checkAccount.js` (balances, trade fills, order history) as a **new tab/menu inside the existing dashboard** instead of CLI-only.
> Security posture identical: read-only key (`BINANCE_READ_KEY`/`SECRET`), READONLY DB untouched, localhost-only binding preserved, no secrets in frontend responses/logs.

**Design idea (proposal):**
- [x] Add a "Binance" menu/tab in `src/dashboard/server.js`'s existing web UI (no second server, no new port)
- [x] Backend: read-only `/api/binance` endpoint on the same express app
  - Uses ccxt Binance instance authenticated with `BINANCE_READ_KEY`/`BINANCE_READ_SECRET` from `.env`
  - Fetches: non-zero spot balances; recent trade fills per pair (~90 days, default BTC/USDT); order history w/ statuses
  - Cache results ~60s so page refreshes don't spam Binance rate limits
  - Fail-safe: if fetch fails or keys missing/invalid → render clear error state, never crash, never show stale-as-fresh (show "unavailable")
  - If key envs absent → show friendly "read-only key not configured" message (dashboard stays fully usable)
- [x] Frontend: 3 sections in the Binance tab — Balances table, Trade Fills table (time/side/price/amount/fee), Order History table (type/side/status/avg/amount); reuse current styling; respects WIB/server-time toggle where relevant
- [x] Live BTC/USDT price shown at the top of the Binance tab — public `fetchTicker` (no API keys, same pattern as existing Open-Positions PnL% ticker), refreshed with the dashboard's 30s cycle; fail-safe `—` on fetch failure

- [ ] Optional follow-ups (NOT in first build): multi-pair dropdown, unrealized-PnL vs local DB positions

**Verify plan:**
- [x] `node --check`; run dashboard locally with placeholder keys → clean error state ✅ (`/api/binance` → `{"ok":false,"reason":"auth"}`; tab served in page; test instance stopped)
- [x] Owner test on VPS with real read-only key ✅ (confirmed working 2026-08-27)

### Dashboard add-on — 🅑 Binance Testnet tab (DONE 2026-08-27)


> Owner request: third dashboard tab (beside 📈 Paper Trading) for the testnet dry run. Scope locked to BTC/USDT only. Content confirmed with owner.

**Backend (`src/dashboard/server.js`):**
- [x] New read-only `/api/testnet` endpoint (60s cache like `/api/binance`)
  - Bot data from `db/testnet.db` opened **READONLY** (optional — clean "not available" state if file missing, e.g. dashboard started before any testnet run): mirrored wallet, OPEN positions (w/ TP/SL + live PnL%), closed trades + PnL summary
  - Exchange check: `fetchBalance` via `BINANCE_TEST_KEY`/`SECRET` sandbox instance, **filtered to BTC & USDT only**
  - Live BTC/USDT price via existing public `fetchTicker` pattern
  - Fail-safe: keys missing → clean error state; fetch errors → per-section `—`; secrets never exposed; binding stays localhost-only
- [x] Explicitly excluded: exchange fills/orders tables (bot's closed trades already tell that story); any multi-pair support (BTC/USDT only)

**Frontend (`src/dashboard/public/index.html`):**
- [x] Tab order: 📈 Paper Trading | 🅑 Binance Testnet | 🅑 Binance Account
- [x] Testnet tab: price card + Testnet Net PnL card + 💰 Exchange Balances (BTC/USDT) + 🤖 Bot Wallet + 🟢 Open Positions (TP/SL/PnL%) + 📜 Closed Trades; WIB/server-time aware; 30s refresh while tab active

**Verify:**
- [x] `node --check`; local run: `testnet.db` missing → clean n/a sections; placeholder testnet keys → `exError:"auth"` handled; live price returned; tab served in page ✅
- [x] Owner visual test on VPS (real testnet keys + testnet.db present) ✅ (confirmed 2026-08-27) — COMPLETE

### Phase 1 add-on — testnet connection check via checkAccount.js --testnet (DONE 2026-08-27)


> Owner wants to verify the testnet connection/balances standalone (like the real-account viewer) BEFORE any DB reconciliation/mirroring. DB mirroring is explicitly DEFERRED (not part of this build).

- [x] Extend `src/scripts/checkAccount.js` with a `--testnet` flag (Option A — same script):
  - Default (no flag): unchanged — real Binance read-only account (`BINANCE_READ_KEY`/`SECRET`)
  - `--testnet`: ccxt `setSandboxMode(true)` → `testnet.binance.vision`, keys `BINANCE_TEST_KEY`/`BINANCE_TEST_SECRET`
  - Same output: non-zero spot balances; same fail-safe errors + exit code 1; secrets never printed
  - Flags combine (e.g. `--testnet --trades`); output labeled `[TESTNET]`/`[REAL]` + `Binance TESTNET spot balances` header so account is always identifiable
- [x] Update `--help` text + `docs/commands.md` so users know how to check each account
- [ ] Explicitly NOT in this build: seeding/mirroring exchange balances into `testnet.db` (deferred — owner decision, later)
- [x] Verify: `node --check`; `[REAL]`/`[TESTNET]` auth-error labels correct with placeholder keys; `--help` updated; owner runs real check on VPS (pending)

### Dashboard UI/UX fixes — tab naming, active state, WIB in Binance tab (Planned 2026-08-27 → awaiting owner build command)

> Owner feedback on the new Binance tab. All display-only; no logic/endpoint changes.

1. [x] Tab wording: owner chose Proposal B variant — `📈 Paper Trading` | `🅑 Binance Account` — applied
2. [x] Tab active state fix: buttons now have `class="tab"` so `button.tab`/`button.tab.active` CSS applies — active tab turns green
3. [x] WIB toggle fix: `setTz()` now also re-calls `loadBinance()` when the Binance tab is active, so timestamps re-render in the chosen timezone

**Verify:** `node --check`; local run → active tab visibly highlighted; clicking WIB re-renders Binance times (+7h); owner confirm on VPS. ✅ (confirmed 2026-08-27)

### Entry/Exit Time Tracking — add open date to positions & trade history (DONE 2026-08-26)



> Owner request 2026-08-26: show WHEN a trade was executed. Current gap:
> `trade_history.timestamp` = close time ONLY (no entry date anywhere);
> `active_positions` has NO time column at all.

- [x] **Schema (PROTECTED FILES — owner approval given via build command only):**
  - `src/config/initDB.js`: add `entry_time DATETIME` to `active_positions` (default NULL; new inserts auto-stamp via `datetime('now')`)
  - `src/config/initDB.js`: add `open_time DATETIME` to `trade_history` (carried over from position at close)
  - Safe column-add migration for existing DBs (ALTER TABLE ... guarded by column-exists check); no data loss
- [x] **Engine (`src/engine/paperTrade.js`, PROTECTED):**
  - On buy: record `entry_time = datetime('now')`
  - On sell: copy `entry_time` into `trade_history.open_time`
- [ ] **Existing data policy (owner confirmed):** old rows show `—` for missing dates (NO fake estimates). THEN optional backfill from real records:
  - **Backfill source #1 — PM2 logs (owner suggestion, VERIFIED FEASIBLE):** owner provided log sample (`dev_files/logs/cryptopanzer-out.log`). Scan findings:
    - Cycle lines date-stamped since 2026-08-13 (`[YYYY-MM-DD HH:mm:ss]`), no rotation loss
    - 11 `[BUY SUCCESS]` + 10 `[SELL SUCCESS]` lines present; these lack inline timestamps but are bracketed by dated cycle lines → derive time to ~1 min accuracy via nearest neighbors
    - Buy price appears in BOTH the bracketing cycle line and BUY line → pair/trade match verified by price too
    - Parser: read log sequentially, track last/next dated cycle line, stamp each BUY/SELL; conservative — only fill when bracket is unambiguous
  - **Backfill source #2 (fallback):** owner's Telegram notification history (manual, if logs are incomplete)
- [x] **Display (date format `YYYY-MM-DD HH:mm:ss`):**
  - Dashboard (`public/index.html`): Open Positions table gets "Opened" column; History table gets "Opened" column alongside existing closed timestamp
  - CLI report (`printTradeReport()` in src/index.js): show open_time next to each closed trade + opened date for OPEN positions
- [x] **Verify:** test migration on DB COPY first (rule #10) incl. old rows showing `—`; `node --check` on all edited files; simulate full cycle on temp DB (buy → entry_time set; sell → open_time carried); dashboard renders new columns
- [x] **VPS deployment (2026-08-26):** pull → manual `node src/config/initDB.js` (migration ran: both columns added) → backfill dry-run matched 11/11 → `--apply` wrote all rows → report verified showing Opened/Closed for #1–#10 + entry_time for OPEN #11

### Follow-up — auto-run schema migration on bot startup (DONE 2026-08-28)
- [ ] Issue found during deploy: bot restart does NOT run `initDB.js` migrations automatically (`db.js` handles its own setup), so schema changes need a manual `node src/config/initDB.js` after each update
- [ ] Fix options: (a) db.js runs the same guarded `addColumnIfMissing` checks at require-time, or (b) document `node src/config/initDB.js` as a standard post-pull step in commands.md
- [ ] Owner to pick option before build

### Dashboard upgrades — strategy badge + live position PnL% (DONE 2026-08-28)

> Owner request 2026-08-26. Both display-only; no trading logic touched.

1. **[ ] Strategy badge beside top cards**
   - Show the currently-running strategy config (e.g. `RSI(14)<40 + Price≤EMA(20) · RR 1:2 · 15m`) next to / above the wallet cards
   - Source: `STRATEGY_CONFIG` loaded at require-time in `src/strategy/indicator.js` — dashboard server exposes a new read-only `/api/strategy` endpoint returning those values; frontend renders a badge card
   - Note: reflects what the BOT process was started with (env-based, not hot-swappable)
2. **[x] Live PnL% column in Open Positions table**
   - New columns: `Current Price` and `PnL%` = `(current − entry) / entry × 100`, green/red colored
   - Current price source: dashboard server fetches public ticker via ccxt (`fetchTicker`, no API keys needed); fetched once per dashboard refresh cycle (30s), shared across all rows
   - Fail-safe: if fetch fails → show `—` instead of wrong numbers (rule #13)
3. Verify: `node --check`; local run ok (ticker returns live BTC price; positions column renders Current + PnL%); owner confirms visually on VPS

### Bug fix — trade-close Telegram notifications failing (DONE 2026-08-26)

> Owner reported only entry + break-even messages arrive, never close messages.
> Root cause CONFIRMED in logs (`cryptopanzer-error.log`): 10×
> `[TELEGRAM ERROR] ETELEGRAM: 400 Bad Request: can't parse entities`
> — `sendTelegramMessage` hardcodes `parse_mode: 'Markdown'` while all messages use HTML tags (`<b>/<code>`), and some content breaks Markdown entity parsing → Telegram rejects the whole message silently (error only in PM2 console).

- [x] Fix `src/utils/telegram.js`: switch `parse_mode` to `'HTML'` to match the actual message markup used everywhere
- [x] Audit all outgoing messages for characters that break HTML mode (`<`, `>`, `&`) — escape if needed
- [x] Verify: `node --check` + live test send (HTML message accepted, zero errors); owner to confirm receipt on next real trade

### Dashboard feature — date display toggle (Server time ↔ WIB) (DONE 2026-08-26)

> Owner request 2026-08-26: choose timezone for ALL dates shown in dashboard.

- [x] Add small toggle UI (e.g. buttons/select) in dashboard header: `Server Time` | `WIB (UTC+7)`
- [x] All date columns convert client-side: closed-trades `Time`+`Opened`, open-position `Opened`, last-updated stamp stays dual-zone as-is
- [x] DB stores server-local time — conversion needs server TZ offset knowledge: safest is dashboard server reports its TZ offset via `/api/strategy` (or new `/api/meta`), frontend converts using `Intl.DateTimeFormat` with explicit offsets (no ambiguity, no DST surprises)
- [x] Persist choice in `localStorage` so it survives refresh
- [x] Fail-safe: invalid/missing dates keep showing `—`
- [x] Verify: `node --check`; local run OK (meta returns offset 420 + strategy config); owner confirms visually on VPS

---

### Dashboard feature — theme picker (DONE 2026-08-28)

> Owner request: toggle between visual themes on the dashboard (dark/light/etc.).

**Idea (proposal):**
- [x] Convert hardcoded colors in `src/dashboard/public/index.html` `<style>` block to CSS variables (`--bg`, `--bg-card`, `--border`, `--text`, `--text-dim`, `--border-row`, `--th-bg`, `--green`, `--red`, `--yellow`); current GitHub-dark palette becomes `"dark"` theme via `[data-theme="dark"]`
- [x] Add themes: `dark`, `light`, `terminal`, `dracula`, `gruvbox`
- [x] Theme picker UI: small `<select>` in the header next to the Time toggle; switching sets `data-theme` on `<html>`
- [x] Persist choice in `localStorage` (same pattern as existing timezone toggle); apply on page load
- [x] Convert hardcoded inline colors in JS (`updateTzButtons`, `button.tab.active` green highlight) to CSS classes so button states follow the active theme (green accent → `--green` variable)
- [x] Only file touched: `src/dashboard/public/index.html`; `server.js` untouched; no new endpoints/deps
- [x] Verified: review HTML/JS syntax manually (node --check n/a for HTML), owner eyeballs all 3 themes on VPS dashboard

*Last updated: Phase 1 — Project Setup*
### Theme ideas : additional themes (future consideration)

| Name | Visual | Colors (sample) |
|---|---|---|
| Solarized Dark | muted amber/green/blue on #002b36 | --bg:#002b36; --text:#83879f; --green:#859900; --red:#cb4b16; |
| Tokyo Night | soft purples/pinks on #1a1b27 | --bg:#1a1b27; --text:#a9b1c6; --green:#7ee787; |
| Gruvbox | warm oranges/inks on #282828 | --bg:#282828; --text:#ebdfab; --green:#fabd2f; --red:#ea6962; |
| Dracula | magenta/cyan on #282a36 | --bg:#282a36; --text:#f8f8f2; --green:#50fa7b; --red:#ff5555; |

All require only adding a `[data-theme="themename"]` block to `index.html` — no code changes elsewhere.

---

## [DONE 2026-08-30] Fix: dashboard Testnet Exchange Trades — Time column shows "—" (2026-08-30)
**Reported by owner:** Dashboard → 📚 Testnet Exchange Trades ("Live from Binance
testnet API, fetchMyTrades") — the Time column shows `—` for every row
(TID 2492218, 2456618, etc.), while TID/Side/Price/Amount render fine.

**Root cause (read-only investigation, no code changed yet):**
- Renderer: `src/dashboard/public/index.html` line ~389 (function feeding `#tnExTrades`):
  `const time = t.datetime ? new Date(t.datetime).toLocaleString() : "—";`
- It depends ONLY on ccxt trade `t.datetime`. On the Binance **testnet**
  `fetchMyTrades` response, `datetime` comes back null/invalid → fallback `—`.
  (ccxt always populates numeric `t.timestamp` in ms; the spot section at
  line ~300 already uses a different, working path.)

**Plan (single file, frontend-only; server.js untouched):**
- [x] Change the time expression to prefer `t.datetime`, fall back to
      `t.timestamp` (numeric epoch ms), then `—` if both missing:
      `const time = t.datetime ? new Date(t.datetime).toLocaleString() : (t.timestamp ? new Date(t.timestamp).toLocaleString() : "—");`
- [x] Keep the timezone behavior consistent with the rest of the dashboard
      (browser-local `toLocaleString`, same as the other testnet tables)

**Verification:**
- [x] Probe attempted (read-only API call, no DB writes) to confirm
      `timestamp`/`datetime` fields in the response before/after
- [x] `node --check` not applicable (HTML); visually confirm rows show real
      dates in dashboard → Testnet Exchange Trades section
- [x] Confirm other sections (Binance spot trades/orders) unaffected
- [x] OWNER CONFIRMED LIVE on VPS dashboard (2026-08-30): Time column now shows real dates. Bug closed.


---

## [PLANNED] Dashboard upgrade: side nav bar with hamburger toggle (2026-08-30)

**Owner request:** upgrade dashboard navigation to a left side nav bar.
Owner-confirmed clarifications:
- Side nav **REPLACES** the current top tab buttons completely (side nav is
  the only navigation)
- Hamburger toggle: **minimize** = collapse to icon-only rail,
  **maximize** = expand to full-width sidebar with labels

**Menu items (map 1:1 to existing sections — same `showTab()` targets):**
1. 📈 Paper Trading → `tabReport` (current `tabBtnReport`)
2. 🅑 Finance Testnet → `tabTestnet` (current `tabBtnTestnet`, label "Binance Testnet")
3. 🅑 Binance Account → `tabBinance` (current `tabBtnBinance`)

**Scope & plan (frontend-only; `server.js` untouched; no new deps):**
- [x] Add `<nav>` sidebar with 3 nav items + hamburger button; reuse CSS
      variables from the existing theme system (`--bg`, `--bg-card`,
      `--border`, `--green`, `--text`, `--text-dim`, `--on-accent`) so all
      5 themes (dark/light/terminal/dracula/gruvbox) keep working
- [x] Remove the top tab-button bar; wire nav items to the existing
      `showTab()` function (active state = current `.active` green style)
- [x] Hamburger toggle: collapsed rail shows only icons (tooltips via
      `title` attr); expanded shows icon + label; animate width smoothly
- [x] Persist collapsed/expanded state in `localStorage` (same pattern as
      theme & timezone toggles); default = expanded
- [x] Content area shifts with sidebar state (no overlap); small-screen
      behavior: sidebar auto-collapses to icon rail
- [x] Header (title + theme/timezone pickers) stays at top of content area

**Verification:**
- [x] Manual: all 3 nav items switch sections exactly like the old tabs;
      hamburger minimize/maximize works; active-item highlight follows theme
- [x] Theme check: sidebar readable in all 5 themes
- [x] State persistence: reload keeps collapsed/expanded choice
- [x] No other dashboard functionality affected (tables, 30s refresh, JSON)


---

## [DONE 2026-08-31] Testnet tab: nested sidebar child menus + trade history chart (2026-08-31) — OWNER CONFIRMED WORKING ON VPS

**Owner request:** (1) the "🅑 Binance Testnet" sidebar item becomes a parent
menu with child items; (2) add a price-history chart of the bot's closed
trades, TradingView-style but built from OUR data; (3) live current price
line on the chart. Chart type chosen by owner: **Option 1 — hand-coded
inline SVG, zero dependencies** (no chart library, no CDN).

### Design (spec for the coder)

**A. Sidebar restructure**
- "🅑 Binance Testnet" becomes an expandable parent item (caret/arrow icon
  toggles expansion; clicking parent expands/collapses children — it is NOT
  itself a page)
- Child items (indented under parent, same .nav-item styling + indent):
  1. Overview (icon 🅑) → existing `showTab('testnet')` content, unchanged
  2. Trade Chart (icon 📈) → NEW `showTab('chart')` page, `tabChart` section
- Paper Trading and Binance Account parents keep working exactly as today
- Active highlight: child item gets .active; parent shows .active while any
  of its children is active
- Sidebar state (expanded parents + collapsed sidebar) persists in
  localStorage (pattern: existing 'navCollapsed'), default = expanded

**B. Trade Chart page (`tabChart`, hidden like other tabs)**
- Placed as a new section div after `tabTestnet`; header: "📈 Bot Trade
  History Chart (testnet)" + subtitle "Buy/sell executions from Bot Closed
  Trades · current price live"
- Data source: existing testnet payload — bot closed trades already loaded
  by `loadTestnet()` (same data as the 📜 table: buy price, sell price,
  opened/closed timestamps, PnL%). NO new backend endpoint, server.js
  untouched. The chart re-uses the already-fetched `d.bot.trades` array.
- SVG chart (hand-coded, ~150 lines, no libs):
  - X axis = time (trade open→close range; leftmost = oldest trade)
  - Y axis = price (min/max of all executions + live price, 5% padding)
  - Per trade: green dot = BUY at buy price, red dot = SELL at sell price,
    thin grey line connecting each trade's buy→sell
  - Live price: horizontal dashed line (yellow, var(--yellow)) + right-edge
    label, updated on every 30s refresh (already-fetched price)
  - Axis: 4-5 horizontal gridlines + price labels (fmt), 4-5 time labels
  - Hover: nearest dot tooltip (date, side, price, PnL%) — small floating
    div, hand-coded
- Theme support: only CSS variables for colors, all 5 themes work
- Empty state: "No closed trades yet" message when list is empty
- Fail-safe: if data malformed, render empty state + console.warn, never
  throw (same defensive pattern as rest of dashboard)

### Implementation notes for the coder
- File: src/dashboard/public/index.html ONLY — server.js untouched, no new
  deps, no CDN scripts
- Keep existing structures intact: sideNav, mainContent wrapper,
  toggleNav(), navCollapsed persistence, theme picker, timezone toggle
- Beware previous pitfalls: closed CSS comments, no references to removed
  IDs, balanced divs (currently 42/42), JS must pass node --check after
  extraction
- Test: all 5 sidebar paths switch correctly (Paper Trading, Testnet
  Overview, Trade Chart, Binance Account, hamburger), zero console errors,
  chart renders with sample data from the live API, reload keeps states

### Verification (reviewer = CLINE-AGENT)
- [x] JS extraction node --check passes; CSS comments balanced; divs balanced
- [x] Parent expand/collapse + child navigation works; active states correct
- [x] Chart dots match table rows (spot-check 2-3 trades)
- [x] Live price line moves with 30s refresh
- [x] All 5 themes render chart legibly
- [x] localStorage: sidebar + parent states survive reload


---

## [PLANNED] Dashboard UI improvements — Theme selector & header label (2026-09-01)

**Owner request:** (1) move theme selector to sidebar bottom with icon-only state when collapsed; (2) change header label.

### Design

**A. Theme selector in sidebar (bottom, collapsed icon-only)**
- Move `<select id="themeSel">` from header (`<div style="display:flex;...">`) to sidebar bottom
- Sidebar bottom section (after nav-items):
  ```html
  <div class="nav-footer" style="padding:8px; border-top:1px solid var(--border);">
    <div class="nav-item" onclick="toggleThemeMenu()" style="justify-content:center;">
      <span class="nav-icon">🎨</span>
      <span class="nav-label" id="themeLabel">Dark</span>
    </div>
  </div>
  ```
- When sidebar collapsed (`#sideNav.collapsed`): hide `.nav-label`, show only `.nav-icon`
- Theme menu dropdown (or inline select) when expanded
- Keep theme switching logic identical: `setTheme(name)` → `data-theme` + localStorage

**B. Header label change**
- Current: `<h1>🖥️ CryptoPanzer — Trade Report Dashboard</h1>`
- Current sub: `<div class="sub">Read-only view of the paper trading database · refreshes every 30s...</div>`
- Change to: `<h1>🖥️ Crypto trading dashboard·</h1>` (simpler, no subtext needed)

### Scope & plan (frontend-only; `server.js` untouched; no new deps)
- File: `src/dashboard/public/index.html` ONLY
- Sidebar structure: add `nav-footer` div at bottom, after `nav-items`
- Theme selector UI: use emoji icon + label (when expanded); icon-only when collapsed
- Header: simpler h1, remove or condense subtext
- Reuse existing CSS variables and theme system
- No new endpoints, no new dependencies

### Verification
- [ ] Theme selector appears at sidebar bottom
- [ ] Collapsed sidebar shows only 🎨 icon, hover shows theme name tooltip
- [ ] Expanded sidebar shows icon + "Dark/Light/Terminal/..." label
- [ ] Theme switching works identically to before
- [ ] Header shows "🖥️ Crypto trading dashboard·"
- [ ] All 5 themes work with new sidebar layout
- [ ] localStorage persists theme choice
- [ ] `node --check` on extracted JS (if applicable)

### Implementation notes
- Keep existing `setTheme()` and `themeSel` onchange handler for compatibility
- Minimal changes to existing structure
- Sidebar footer should not interfere with hamburger or nav items

### Built 2026-09-01 — OWNER CONFIRMED
- ✅ Theme selector moved to sidebar bottom (`nav-footer` section)
- ✅ Collapsed sidebar shows only 🎨 icon (`.nav-label` hidden via CSS)
- ✅ Expanded sidebar shows icon + "Dark/Light/Terminal/Dracula/Gruvbox" label
- ✅ Theme switching works identically to before (same `setTheme()` function)
- ✅ Header changed to `🖥️ Crypto trading dashboard·`
- ✅ All 5 themes work with new sidebar layout
- ✅ localStorage persists theme choice
- ✅ Committed locally: "feat: move theme selector to sidebar bottom, update header label"

