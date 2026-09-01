# CryptoPanzer — Changelog

All notable changes to the CryptoPanzer project.
---

## [2026-09-01]

### Feature — Theme selector in sidebar bottom + updated header label
- `src/dashboard/public/index.html`: Moved theme selector from header to sidebar bottom (`nav-footer` section at end of `<nav id="sideNav">`).
  - Theme selector shows **only 🎨 icon** when sidebar collapsed (width 60px), full **"Dark/Light/Terminal/Dracula/Gruvbox" label** when expanded (width 250px).
  - Reuses existing `setTheme(name)` function — same logic as before, no changes to theme switching or CSS variables.
  - Persisted in `localStorage` key `theme`.
  - All 5 themes (dark/light/terminal/dracula/gruvbox) work identically to before.
- `src/dashboard/public/index.html`: Updated dashboard header from `🖥️ CryptoPanzer — Trade Report Dashboard · Read-only view of the paper trading database...` to **`🖥️ Crypto trading dashboard·`** (simpler, no subtext needed).
- Verified: Sidebar theme selector works in all 5 themes; collapsed/expanded states persist; header label updated correctly.

## [2026-08-31]

### Feature — Testnet sidebar nested menus + trade history chart (coded by OPENCODE, reviewed by CLINE-AGENT)
- `src/dashboard/public/index.html`: "🅱️ Binance Testnet" sidebar item becomes expandable parent with 2 children: Overview (existing testnet content) and Trade Chart (new `tabChart` section).
- Parent toggles children on click, is not a page itself; active highlight on child + parent while any child active. Expand/collapse state persisted in `localStorage` key `parentTestnet`.
- New `tabChart` section: hand-coded inline SVG chart of bot closed trades from existing `loadTestnet()` payload (`d.bot.trades`). Green BUY dots, red SELL dots, grey buy→sell connectors, yellow dashed live-price line + label, gridlines + axis labels, hover tooltip (date/side/price/PnL%), empty state, fail-safe try/catch.
- SVG chart reuses existing `fmt()` for price labels, CSS vars for all theme colors, no new deps/server.js changes.
- Verified: JS extraction passes `node --check`; CSS braces balanced (50/50); divs balanced (48/48); no unclosed comments; no removed IDs referenced; all 5 sidebar paths work.

## [2026-08-30]

### Feature — Dashboard side nav bar with hamburger toggle (coded by OPENCODE, reviewed & committed by CLINE-AGENT)
- `src/dashboard/public/index.html`: replaced top tab-button bar with a fixed left side nav (3 items: 📈 Paper Trading, 🅑 Binance Testnet, 🅑 Binance Account) wired to existing `showTab()`. Nav items use IDs `navBtnReport`/`navBtnTestnet`/`navBtnBinance` with `.active` highlight via `--green` CSS var.
- Hamburger toggle: `toggleNav()` clicks toggle `.collapsed` on `#sideNav` (250px → 60px icon-only rail) and `.shifted` on `#mainContent` (margin-left 250px → 60px). Smooth 0.3s CSS transition on width+margin. Collapsed state shows only icons with `title` tooltips; labels hidden via `opacity:0`.
- All page content wrapped in `<div id="mainContent">` for the shift to work.
- Collapsed state persisted in `localStorage` key `navCollapsed` (default expanded), same pattern as theme/timezone toggles.
- Media query `<=768px`: auto-collapses to icon rail on small screens.
- Uses existing CSS vars (`--bg-card`, `--border`, `--green`, `--on-accent`, `--text`, `--text-dim`, `--bg-sub`) — all 5 themes (dark/light/terminal/dracula/gruvbox) work unchanged.
- Removed old `button.tab`/`button.tab.active` CSS (unused after nav replacement). No `server.js` changes, no new npm deps.
- Verified: all 3 nav items switch sections; hamburger toggle works; no console errors; `node --check` not applicable (HTML-only).

## [2026-08-30]

### Bugfix — Dashboard Testnet Exchange Trades: Time column showed "—" (coded by CLINE-AGENT)
- `src/dashboard/public/index.html` (~line 389, `#tnExTrades` renderer): time now falls back to ccxt's numeric `t.timestamp` (always populated) when `t.datetime` is null/invalid, as returned by Binance **testnet** `fetchMyTrades`. One-line change; `server.js` untouched.
