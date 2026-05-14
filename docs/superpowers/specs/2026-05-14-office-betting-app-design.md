# Office Betting App — Design Spec

**Date:** 2026-05-14
**Status:** Approved for implementation planning
**Author:** Jacques Potgieter (with Claude)

## 1. Purpose & Scope

A lightweight internal betting app for office jokes — primarily bets about coworker behavior (e.g., "Will Jessica show up Monday?"). All wagering is in fake points; no real money, no compliance, no regulatory concerns. Quick, dirty, persistent.

**In scope:** Five bet types, parimutuel pool wagering, two settlement modes, weekly point stipend, leaderboard, history.

**Out of scope (v1):** Real-time updates (WebSocket/SSE), file uploads, notifications (email/Slack), multi-tenant support, password authentication, mobile-native app.

## 2. Hosting & Trust Model

- Deployed on an internal server. Accessible via office network or VPN.
- Trust-based authentication: select-or-create from a user dropdown. No passwords.
- One designated admin (configured via `ADMIN_USERNAME` env var) can force-settle or void any bet.
- Threat model: well-behaved coworkers on a private network. We are not defending against an internal adversary.

## 3. Bet Types

The app supports five bet types:

| Type | Description |
|---|---|
| `yes_no` | Binary question. Two implicit outcomes: "Yes" / "No". |
| `multi_choice` | 2–8 outcomes defined by the creator. |
| `over_under` | Numeric line (e.g. 2.5). Two implicit outcomes: "Over" / "Under". |
| `prop` | Free-form. Bettors write in their own answer. Creator (or vote) picks the winning answer at settlement. |
| `gif_challenge` | Two-phase contest: submit a GIF for a prompt, then everyone votes for the best. Winning submitter takes the pool. |

Every bet has:
- `title`, optional `description`
- `creator_id` (the user who created it)
- `deadline` (for GIF challenges, this is the **submission deadline**; all other types use it as the wagering deadline)
- `voting_deadline` (GIF challenges only)
- `settlement_mode`: `creator` or `vote` (not used for `gif_challenge`, which always settles by vote)
- `status`: one of `open`, `locked`, `voting`, `settled`, `voided`

## 4. Wagering & Pool Math (non-GIF bets)

Standard parimutuel.

- Each user has a point `balance`. Default starting balance: **1000 points**. Weekly stipend: **200 points** (configurable in env).
- Placing a wager **immediately debits** the stake from the user's balance (`wager_lock` transaction).
- One wager per user per bet (`UNIQUE(bet_id, user_id)`). No edits, no cancellations.
- For prop bets, the wager carries a free-text `prop_answer` instead of an `outcome_id`.

**Payout formula** at settlement:

```
payout_i = floor(stake_i × total_pool / winning_pool)
```

- `total_pool` = sum of all stakes
- `winning_pool` = sum of stakes on the winning outcome (or matching prop answers, case-insensitive + whitespace-trimmed)
- Losers receive nothing (the `wager_lock` debit is the loss).
- Rounding remainder (always less than the count of winners) is credited to the **bet creator** as a "house tip." Ensures the ledger always balances.

**Live implied payout** is shown on the bet detail page while open, computed from the current pool snapshot.

### Void cases (all stakes refunded via `wager_refund`)

- Creator picks "void" at settlement.
- Vote-settled bet ends with no majority (tie).
- Only one bettor (the pool can't be split meaningfully — single-bettor void).
- Admin force-voids.

## 5. GIF Challenge Mechanics

GIF challenges are a distinct workflow:

1. **Submission phase** (`status = open`): users submit a GIF URL + optional caption. Each submission costs `entry_fee` points (set by creator), debited immediately (`gif_entry` transaction). One submission per user. Submissions are **visible to everyone** as they come in (social, party-game feel).
2. **Voting phase** (`status = voting`): begins automatically when `deadline` passes. Anyone with an account can vote (you cannot vote for your own GIF). One vote per voter, no changes.
3. **Settled** (`status = settled`): begins when `voting_deadline` passes. The submission with the most votes wins; submitter takes the entire pool (`winnings` credit = `entry_fee × num_submissions`).

**GIF source:** URL paste only (Giphy/Tenor/direct `.gif` URLs). No upload, no storage. Embedded via `<img>`. Lightweight validation: URL must end `.gif` or match a known host allowlist (Giphy/Tenor).

**Edge cases (void + refund all entries):**
- Zero submissions.
- Zero votes.
- Tie for first place.

## 6. Settlement Flow

**Trigger:** `deadline` passing transitions `open` → `locked` (or `open` → `voting` for GIF challenges). Handled by a periodic sweep job + lazy reconciliation on page load.

### Creator-settled mode (non-GIF)

The bet creator picks the winning outcome (or "void"). For prop bets, they see unique submitted answers grouped by bettor and pick the winning answer. Status → `settled`.

### Vote-settled mode (non-GIF)

Every user who placed a wager on this bet gets one vote (creator included only if they wagered). One vote per bettor, no changes.

**Settles as soon as one option is mathematically guaranteed to win** — i.e., its current vote count is greater than the maximum count any other option could still reach if every remaining bettor voted for that other option. This locks in early decisive results without requiring every bettor to vote.

If all bettors have voted and there's a tie, the bet voids.

Vote-settled bets do **not** have a separate voting deadline. If a vote stalls (some bettors never vote and the tally is indecisive), the admin force-settle / void button is the escape hatch.

Live vote tally is public throughout.

### GIF challenges

Always settle by vote (see Section 5).

### Admin override

The admin user sees a "Force settle / void" button on any locked or settled bet. Reverses any prior settlement (refunds prior payouts via inverted ledger entries) then re-runs. Logged as `admin_adjust`. The ledger is append-only — past entries are never rewritten.

### No deadline extensions

Deadlines are final. To extend, void the bet and create a new one.

## 7. Data Model

SQLite. Drizzle ORM for schema + queries. All timestamps stored as ISO-8601 strings in UTC.

### `users`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `name` | TEXT UNIQUE | |
| `balance` | INTEGER | Denormalized; ledger is source of truth |
| `created_at` | TEXT | |

### `bets`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `creator_id` | INTEGER FK → users.id | |
| `title` | TEXT | |
| `description` | TEXT | Nullable |
| `bet_type` | TEXT | `yes_no` \| `multi_choice` \| `over_under` \| `prop` \| `gif_challenge` |
| `deadline` | TEXT | Wagering / submission deadline |
| `voting_deadline` | TEXT | Nullable; GIF challenges only |
| `settlement_mode` | TEXT | `creator` \| `vote`; null for `gif_challenge` |
| `entry_fee` | INTEGER | Nullable; GIF challenges only |
| `status` | TEXT | `open` \| `locked` \| `voting` \| `settled` \| `voided` |
| `winning_outcome_id` | INTEGER FK → outcomes.id | Nullable |
| `winning_prop_answer` | TEXT | Nullable; for prop bets |
| `winning_submission_id` | INTEGER FK → submissions.id | Nullable; GIF challenges |
| `created_at` | TEXT | |
| `settled_at` | TEXT | Nullable |

### `outcomes`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `bet_id` | INTEGER FK | |
| `label` | TEXT | |
| `sort_order` | INTEGER | |

Rows auto-created for `yes_no` ("Yes"/"No") and `over_under` ("Over X.5"/"Under X.5"). Created from form input for `multi_choice`. Not used for `prop` or `gif_challenge`.

### `wagers`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `bet_id` | INTEGER FK | |
| `user_id` | INTEGER FK | |
| `outcome_id` | INTEGER FK | Nullable (prop bets) |
| `prop_answer` | TEXT | Nullable (only prop bets) |
| `stake` | INTEGER | |
| `created_at` | TEXT | |

Unique constraint: `(bet_id, user_id)`. Unused for `gif_challenge`.

### `submissions` (GIF challenges only)
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `bet_id` | INTEGER FK | |
| `user_id` | INTEGER FK | |
| `gif_url` | TEXT | |
| `caption` | TEXT | Nullable |
| `created_at` | TEXT | |

Unique constraint: `(bet_id, user_id)`.

### `settlement_votes` (vote-settled non-GIF bets)
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `bet_id` | INTEGER FK | |
| `voter_user_id` | INTEGER FK | |
| `outcome_id` | INTEGER FK | Nullable (prop bets / void) |
| `prop_answer` | TEXT | Nullable (prop bets) |
| `is_void_vote` | INTEGER | 0/1 |
| `created_at` | TEXT | |

Unique constraint: `(bet_id, voter_user_id)`.

### `gif_votes` (GIF challenges only)
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `bet_id` | INTEGER FK | |
| `voter_user_id` | INTEGER FK | |
| `submission_id` | INTEGER FK | |
| `created_at` | TEXT | |

Unique constraint: `(bet_id, voter_user_id)`.

### `transactions` (append-only ledger)
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `user_id` | INTEGER FK | |
| `bet_id` | INTEGER FK | Nullable |
| `amount` | INTEGER | Signed |
| `kind` | TEXT | `seed` \| `stipend` \| `wager_lock` \| `wager_refund` \| `winnings` \| `gif_entry` \| `gif_refund` \| `admin_adjust` |
| `note` | TEXT | Optional human note (mainly for admin adjusts) |
| `created_at` | TEXT | |

### `stipend_log` (idempotency for weekly stipend)
| Column | Type | Notes |
|---|---|---|
| `user_id` | INTEGER FK | |
| `iso_week` | TEXT | e.g. `2026-W19` |
| `created_at` | TEXT | |

Primary key: `(user_id, iso_week)`.

## 8. Screens

| Path | Purpose |
|---|---|
| `/` | Bet board with tabs: Open / Awaiting settlement / Settled. Cards show title, type, deadline countdown, current pool, your stake. |
| `/bets/new` | Create-a-bet form. Dynamic fields per bet type. |
| `/bets/[id]` | Bet detail. Renders one of: place-bet form, settlement UI, voting UI, GIF submission UI, GIF voting UI, settled view. |
| `/leaderboard` | Sortable table: name, balance, total winnings, total wagered, win rate, biggest single win. |
| `/me` | Your transaction ledger with links back to bets. |

Top bar shows "Hi, [Name] ▾". Click for user-switcher dropdown (existing users + "Create new user" inline input).

## 9. Architecture

- **Stack:** Next.js 15 (App Router) + React 19 + TypeScript + Tailwind + shadcn/ui.
- **Database:** SQLite via `better-sqlite3` (synchronous, fast for single-process).
- **ORM:** Drizzle (lightweight, type-safe).
- **Validation:** Zod on all Server Action inputs.
- **Mutations:** Server Actions. API routes only for GETs that aren't naturally tied to a page.
- **Auth:** Signed cookie carries `user_id`. `lib/auth.ts` exposes `getCurrentUser()`. Admin = user whose `name` matches `ADMIN_USERNAME` env var.
- **Background work:** Single `setInterval` boot loop in `instrumentation.ts`:
  - Every 1 min: deadline sweep (transitions bet statuses).
  - Every 1 hour: stipend sweep (idempotent on `(user_id, iso_week)`).
- **Lazy reconciliation:** Page-load handlers also run the deadline sweep for the bets they touch, so state is always correct even if a tick misses.
- **Real-time:** Polling only. Bet detail page re-fetches every 5 seconds while in `open`, `locked`, or `voting` status. No WebSocket/SSE in v1.

### Project layout

```
app/
  (auth)/             # user-picker modal layout
  bets/
    page.tsx          # board with tabs
    new/page.tsx
    [id]/page.tsx
  leaderboard/page.tsx
  me/page.tsx
  api/                # GET endpoints not tied to a page
db/
  schema.ts           # Drizzle schema
  migrations/
  index.ts            # better-sqlite3 + Drizzle client
lib/
  auth.ts
  pool.ts             # parimutuel math (unit-tested)
  settlement.ts       # state transitions (unit-tested)
  stipend.ts
  format.ts
components/
  ui/                 # shadcn
  bet-card.tsx
  ...
instrumentation.ts    # boots the scheduler
```

### Configuration (env vars)

| Var | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `file:./data/app.db` | SQLite path |
| `ADMIN_USERNAME` | (none) | Username granted admin override |
| `STARTING_BALANCE` | `1000` | Points granted to new users |
| `WEEKLY_STIPEND` | `200` | Weekly point top-up |
| `COOKIE_SECRET` | (required) | Signs the user cookie |

## 10. Testing

- **Unit (Vitest):** `lib/pool.ts` (parimutuel math, all edge cases including single-bettor void, all-same-outcome, rounding) and `lib/settlement.ts` (state transitions, vote tallying, tie handling). These are where correctness matters.
- **Smoke e2e (Playwright):** One happy-path walk: create bet → place bet → trigger deadline → settle → check ledger. Optional for v1, recommended before pushing to internal users.
- **No tests on UI components.** This is a joke app; verifying the math is enough.

## 11. Deployment

- `pnpm build && pnpm start` behind the existing reverse proxy on the internal server.
- SQLite file under `./data/app.db`, mounted on persistent storage.
- Nightly `cp app.db app.db.bak.$(date +%F)` cron is the entire backup strategy.

## 12. Explicit Non-Goals (v1)

- WebSocket/SSE real-time updates (polling is enough).
- File uploads (URL embed only for GIFs).
- Email or Slack notifications.
- Multi-tenant / multi-organization support.
- CSRF tokens beyond what Next.js Server Actions provide by default (the threat model doesn't require it).
- Mid-bet schema migrations (pre-launch we wipe the DB).
- Editing/canceling wagers after placement.
- Deadline extensions.
