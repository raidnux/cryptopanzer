# AGENTS.md — CryptoPanzer Coder Agent Rules

> Mandatory rules for any AI coder agent working on this repository.
> Violating these rules is a bug. When in doubt, STOP and ask the owner.

## Core Rules

1. **DO NOT EDIT any file without owner permission.**
   - Read/search freely, but no writes until the owner approves.
   - This includes "harmless" fixes (typos, formatting, refactors).

2. **Think simple first. DO NOT over-engineer.**
   - Prefer the smallest change that solves the problem.
   - No speculative abstractions, no premature architecture, no extra dependencies without approval.
   - Match existing code style (e.g., Indonesian comments in user-built files are kept as-is).

3. **ALWAYS question the owner IF not CLEAR.**
   - Ambiguous, incomplete, or contradictory request → ask before building.
   - Never assume intent; wrong guesses cost more than one clarifying question.

4. **ALWAYS log the plan first in `docs/todo.md` BEFORE building.**
   - Add a planned item describing what will change and how it will be verified.
   - Wait for the owner's build command unless they said otherwise in the same message.

5. **After building, ALWAYS update docs and commit locally. DO NOT PUSH.**
   - Update `docs/todo.md` (mark `[x]`) and `docs/changelog.md` (dated entry) for every completed change.
   - Commit locally with a concise message; **never** `git push` without explicit owner permission.

## Project-Specific Rules

6. **Never modify user-built core files** (`src/db/db.js`, `src/engine/paperTrade.js`, `src/config/exchange.js`, `src/config/initDB.js`) unless the owner explicitly asks. These contain intentional logic (0.1% simulated fee, PnL math, seeding).

7. **Long-only bot.** Do not introduce shorting, leverage, or sell-before-buy logic anywhere.

8. **Strategy params load at require-time from `.env`** — not hot-swappable. Any strategy/config change requires a bot restart; document this when relevant.

9. **Secrets stay out of git.** `.env` (Telegram token/chat ID), `*.db`, and `docs/` are gitignored. Never commit, echo, or hardcode secrets.

10. **Verify before claiming done.**
    - Run `node --check <file>` on every edited JS file.
    - Test destructive scripts (`src/scripts/resetDB.js`) against a DB copy, never live data.
    - Show real command output as evidence.

11. **Keep CLI behavior backward compatible.** Running `node src/index.js` with no flags must always start live mode. New flags must be documented in `docs/commands.md` and handled before `startBot()` runs.

12. **One logical change per commit.** Don't bundle unrelated features; the owner reviews and pushes manually.
