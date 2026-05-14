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

The admin user sees:
- A **"Force settle / void"** button on any locked or settled bet. Reverses any prior settlement (refunds prior payouts via inverted ledger entries) then re-runs. Logged as `admin_adjust`. The ledger is append-only — past entries are never rewritten.
- A **"BOOST / pin"** toggle on any bet. Pinned bets surface to the top of the board and render a "BOOST" badge (see Section 13.5). Adds a `is_boosted` boolean column to `bets`. Purely cosmetic — does not change pool math.

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
| `is_boosted` | INTEGER | 0/1; admin-pinned for "BOOST" badge + top-of-board placement |
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

## 13. Style Guide — "RidgeKings"

A parody of DraftKings' visual language. Neon-on-black sportsbook chrome, loud marketing voice, faux-compliance disclaimers everywhere. **Dark mode only** — there is no light theme.

### 13.1 Brand

- **Product name:** RidgeKings
- **Tagline:** *"The Office Sportsbook™ — Where Productivity Goes To Die"*
- **Mascot/motif:** A stylized crown (King motif). Used in the logo, as a "🤴" stand-in on the leaderboard top three, and as a watermark behind hero sections.
- **Logo lockup:** Crown glyph + `RIDGEKINGS` wordmark in an ultra-condensed black sans, neon-green crown, white wordmark.

### 13.2 Color Palette

| Token | Hex | Role |
|---|---|---|
| `--bg-base` | `#0A0F0A` | App background (near-black with a faint green tint) |
| `--bg-surface` | `#121712` | Cards, panels |
| `--bg-elevated` | `#1A211A` | Modals, dropdowns, hovered cards |
| `--border` | `#1F2A1F` | Hairlines, card borders |
| `--border-strong` | `#2A3A2A` | Input borders, dividers |
| `--text` | `#FFFFFF` | Primary text |
| `--text-muted` | `#A8B3A8` | Secondary text, captions |
| `--text-dim` | `#6B776B` | Tertiary, disclaimers, legal copy |
| `--primary` | `#53FC1A` | Primary CTA, "WIN", live odds positive |
| `--primary-hover` | `#3FCC14` | CTA hover |
| `--primary-press` | `#2FA80F` | CTA pressed |
| `--danger` | `#FF3B30` | "LOSS", negative deltas, void markers |
| `--gold` | `#FFD700` | Crowns, jackpots, leaderboard top 3 |
| `--live` | `#FF5C29` | "LIVE" pulse badge |
| `--info` | `#00C2FF` | "BOOST" badges (electric cyan for the highlight contrast) |

All colors declared as CSS custom properties on `:root` for easy adjustment.

### 13.3 Typography

- **Display face** (headlines, big numbers, odds): **Geist Display** (or **Inter Display** as fallback), weight `900` (Black), `letter-spacing: -0.02em`. ALL-CAPS for everything that isn't a body paragraph.
- **Body face:** **Inter**, weights `400` / `500` / `600`.
- **Monospace** (ledger, transaction IDs, technical chrome): **JetBrains Mono**, weight `500`.
- **Numerics:** Every numeric (odds, payouts, balances, pool sizes) uses `font-variant-numeric: tabular-nums` so digits don't jitter when they tick.

Type scale (Tailwind-style):

| Class | Size / Line-height | Use |
|---|---|---|
| `display-2xl` | 64 / 64 | Hero "JACKPOT" moments |
| `display-xl` | 48 / 52 | Page titles |
| `display-lg` | 32 / 36 | Card headlines, bet titles |
| `display-md` | 24 / 28 | Section headers |
| `body-lg` | 18 / 28 | Lead paragraphs |
| `body-md` | 14 / 20 | Default body |
| `body-sm` | 12 / 16 | Captions, metadata |
| `mono-sm` | 12 / 16 | Ledger entries, IDs |

### 13.4 Iconography

- **Lucide React** for general icons (chevrons, close, plus, etc.).
- Custom SVG only for: crown logo glyph, "LIVE" dot, "BOOST" lightning bolt, void/cancel "VOID" stamp.
- Icons inherit currentColor.

### 13.5 Sportsbook Chrome (the spoof core)

These elements appear throughout the UI and are the heart of the parody:

- **American odds rendering.** For non-GIF bets while open, each outcome shows a derived American-odds display next to the implied payout. Formula: derive implied probability `p = stake_on_outcome / total_pool`. If `p >= 0.5`, render `-X` where `X = round(p / (1 - p) * 100)`. If `p < 0.5`, render `+X` where `X = round((1 - p) / p * 100)`. New / no-stake outcomes show `+∞` and "BE THE FIRST" copy. Display in `display-lg` weight, primary green for `+` (underdog), white for `-` (favorite). Pure visual flavor — actual payouts use the parimutuel formula in Section 4.
- **"LIVE" badge.** Pulsing dot (`--live` orange) + uppercase "LIVE" on any bet currently `open`. CSS keyframe: 1s ease-in-out, 0.6→1.0 opacity loop.
- **"BOOST" badge.** Cyan lightning-bolt chip with the label "BOOST" on any bet the admin pins (Section 6 admin powers extends to a "feature this bet" toggle). Position: top-right corner of the card.
- **"PARLAY" copy** lives on the user dropdown menu as a fake disabled item: *"Build a Parlay (Premium)"*. Click does nothing but show a toast: "Premium feature coming Q5 2027."
- **Cash counter** in the top bar. The balance number animates with a slot-machine-style roll on stipend day and after every win/loss. Implement via `react-countup` or a small custom hook with `requestAnimationFrame`.
- **Confetti** on the bet detail page when a settlement credits you `winnings > 0`. Use `canvas-confetti` with neon-green + gold + white. One burst, no looping.
- **"VOID" stamp.** When a bet voids, a diagonal red "VOID" stamp (CSS `transform: rotate(-12deg)`) overlays the bet card.

### 13.6 Components

- **Buttons.** Three variants:
  - **Primary CTA:** `bg-primary text-black font-black uppercase tracking-wide`, big rounded-md corners, subtle drop-shadow with primary glow. Labels are loud verbs: `PLACE BET`, `LOCK IT IN`, `CASH OUT` (only for void refunds, ha), `BOOST`, `SUBMIT GIF`.
  - **Secondary:** `bg-bg-elevated text-white border border-border-strong`. Labels: `Cancel`, `Back`.
  - **Ghost:** Text-only with primary underline on hover.
- **Cards.** `bg-bg-surface` + 1px `--border`. Hover: lifts to `--bg-elevated`. 12px corner radius. Header row: title (display-lg) on left, badges (LIVE / BOOST / VOID) on right.
- **Inputs.** Dark fill (`--bg-surface`), 1px `--border-strong`, focus ring in `--primary` at 40% opacity. Labels above input, ALL-CAPS body-sm, muted color.
- **Tabs** (bet board): underline-style. Active tab uses `--primary` underline + white text; inactive uses muted text + transparent underline.
- **Toasts.** Bottom-right. Dark surface, neon-green left border on success, red on error, gold on stipend/jackpot. Auto-dismiss 4s.
- **Tables** (leaderboard, ledger): zebra striping with `--bg-base` / `--bg-surface`. Top 3 leaderboard rows get a gold crown glyph in the rank column.

### 13.7 Voice & Copy

Loud. Capitalized. Mock-corporate. Take every excuse to talk like a TV sportsbook ad.

Examples:

- **Empty bet board:** *"NO ACTION RIGHT NOW. BE THE FIRST TO POST A LINE."*
- **Place-bet CTA:** `LOCK IT IN`
- **Settled-bet banner (you won):** *"WINNER WINNER. You took home **+X** points."*
- **Settled-bet banner (you lost):** *"TOUGH BREAK. The book takes another one."*
- **Void banner:** *"BET VOIDED. Stakes refunded. Move along."*
- **Stipend toast (Mondays):** *"WEEKLY DEPOSIT MATCH! +200 RKD credited to your account."*
- **Footer disclaimer (every page):**
  > *Gamble responsibly. Must be 18+ and employed at this office. If you or someone you know has an office gambling problem, please contact HR. Bets are settled at the sole discretion of the bet creator, the bettors, the admin, or whichever of them yells loudest. RidgeKings is not a real sportsbook and "RKD" is not a real currency. Probably. Terms apply, but we didn't write any.*
- **Fake "responsible gaming" link in footer:** routes to `/responsible-gaming` which is a single page that just says *"Lol. Get back to work."*

### 13.8 Motion & Interaction

- All transitions: 150ms ease-out by default. 250ms for modals/sheets.
- Balance counter: ~600ms roll animation on change.
- "LIVE" pulse: 1s loop, infinite, ease-in-out.
- Confetti burst on win: 0.8s duration, 80 particles, neon-green/gold/white.
- Hover lift on cards: 100ms, 2px Y-translate + soft primary glow.
- No parallax, no scroll-jacking. We're a sportsbook, not a Webflow agency.

### 13.9 Implementation Notes

- **Tailwind config:** All colors above declared as theme tokens. Custom font stack defined for `font-display` (Geist Display / Inter Display) and `font-mono` (JetBrains Mono).
- **Fonts:** Loaded via `next/font/google` (Inter, JetBrains Mono) + `next/font/local` for Geist Display.
- **shadcn/ui:** Use as the base for primitives (Dialog, DropdownMenu, Toast, Tabs), then re-skin via Tailwind to the palette above. Override the default radius and colors in `globals.css` / `tailwind.config.ts`.
- **Confetti library:** `canvas-confetti` (~2KB gzipped). Lazy-loaded only on the bet detail page.
- **`react-countup`** or a hand-rolled `useCountUp` hook for the balance roll.
- **Accessibility caveat:** This is an internal joke app. We meet basic standards (keyboard nav, focus rings, contrast on text), but the parody chrome (pulsing badges, confetti) is not behind reduced-motion guards in v1 unless it's trivial to add. Add `prefers-reduced-motion` opt-out for the LIVE pulse + balance counter if cheap; skip confetti gating.

### 13.10 Out of Scope (style v1)

- Mobile-specific layout polish (responsive is fine, but no PWA install / native gestures).
- Light theme.
- Custom illustration / mascot artwork beyond the crown glyph.
- Sound effects (cash-register sounds on win would be funny but are out of scope).
- A real DK-style "MISSION" or "STREAKS" gamification layer.
