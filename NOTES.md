# Build Notes — Phase 1 (sandbox checkpoint)

Status: **Phase 1 complete, stopped for sign-off** per the brief. No Train
opponent logic, no Review mode yet.

## What was built

- **Equity engine** (`src/engine/`): 5-card evaluator, Omaha
  exactly-2-hole-cards rule (PLO4 + PLO5), double-board equity with joint
  shared-deck sampling. Exact enumeration when the remaining runout space is
  ≤ 2,500 outcomes (covers turn/river spots); seeded Monte Carlo otherwise.
  30 unit tests (`npm test`), including the play-the-board and
  one-card-flush traps.
- **Web Worker** (`equity.worker.ts` + `useEquity` hook): chunked simulation
  (2,500 iters/chunk) with progressive results; a new calculation supersedes
  an in-flight one.
- **Betting math** (`betting.ts`): ante/stack, required equity to call,
  pot-limit bet cap, pot-limit raise cap computed from the pot *after* the
  call, all-in clamped to effective stack. Unit tested.
- **Sandbox UI** (`src/app/page.tsx`): table setup (2-8 players, PLO4/5,
  single/double board, ante preset buttons 2/4/6/8/10bb), card picker bottom
  sheet with cross-table duplicate prevention, two boards with per-street
  deal buttons, per-board + combined + scoop equity with leader highlight,
  facing-a-bet panel, End Hand reset. Mobile-checked at 375px.

## Decisions made on the brief's open questions

| Question | Decision | Where |
|---|---|---|
| Board share split | 50/50 default, isolated in one constant; `boardShares` param for anything else | `BOARD_SHARE_SPLIT` in `src/engine/equity.ts` |
| Ties/chops display | Fractional equity (ties split a board's share evenly); per-board win%/tie% are computed and available in `BoardEquity`, UI shows equity + scoop% only for now | `equity.ts`, `page.tsx` |
| Monte Carlo iterations | 20,000 default. Bench: 8p PLO5 double-board preflop ≈ 64ms/1k iters; converges within ~0.2pp by 20k | `DEFAULT_ITERATIONS`, `src/engine/bench.ts` |
| Combined vs per-board equity for call math | **Both**: verdict uses combined equity (correct for the call price in a 50/50 split), per-board equities shown alongside so ahead-on-one/behind-on-other is visible | pot odds panel in `page.tsx` |
| Exact raise formula | max raise increment = pot after calling (pot + outstanding bet + call); presets scale the increment; everything clamps to effective stack | `raiseTo()` in `betting.ts`, tested |
| Opponent tiers / board-weight blending | Deferred to Phase 2 (Train), per the brief | — |

## Other assumptions worth knowing

- **Incomplete hands are excluded** from the equity calc rather than
  randomized. Only players with all 4/5 cards entered participate; a hint
  shows until ≥2 hands are complete.
- **Boards must be 0/3/4/5 cards with no gaps** to calculate; 1-2 cards
  shows a hint instead of guessing intent.
- **Position labels** run in postflop action order (SB first) since bomb
  pots skip preflop: SB, BB, UTG, (UTG+1), MP, HJ, CO, BTN by table size.
- **Multiway pot odds** are the standard heads-up formula
  bet/(pot+2·bet). With callers behind, the true price is better; the panel
  doesn't model that yet — candidate refinement for Phase 2.
- **All-in in the facing-a-bet panel** is capped at pot (pot-limit opening
  bet max) — with 94bb+ behind and bomb-pot-sized pots, stack rarely binds
  preflop but the clamp is there.
- The scaffold `.gitignore` was merged into the GitHub Node template;
  `.claude/` is ignored.
- npm audit flags Next's bundled `sharp`/`postcss` (image pipeline we don't
  use); the suggested "fix" downgrades Next to 9.x, so it's ignored until a
  Next patch absorbs it.

## Phase 2 — Trainer (built)

Site is now two tabs: **Tool** (`/tool`, open access, unchanged from Phase 1)
and **Trainer** (`/trainer`). `/` redirects to `/tool`.

### Decisions locked in

- **Combined equity drives all scoring**, not per-board. There is one pot, so
  the EV of a call depends on your total expected share of it. Being 90% on
  one board and 10% on the other is exactly a 50% call. Per-board figures are
  still displayed, because they explain *why* a decision is right.
- **Grades normalize EV loss to pot size** (`GRADE_BANDS` in `scoring.ts`):
  A ≤2% of pot, B ≤5%, C ≤10%, D ≤20%, F above. Raw bb would grade a 3bb
  error in a 24bb pot the same as in a 200bb pot.
- **"Optimal" means best response to this tool's opponent model, not GTO.**
  Solved multi-way double-board PLO doesn't meaningfully exist; the UI and
  `scoring.ts` say so rather than implying a solver.
- **Scoring uses single-decision lookahead.** Fold and call EVs are exact;
  bet and raise EVs depend on modelled opponent fold/call responses. Future
  streets of betting are not modelled.
- **Opponent tiers are ratios to an equal pot share**, not raw equity, so one
  set of thresholds works from 4- to 8-handed. A board locked up (≥85% on one
  board) bumps the tier: half a pot that can't be lost supports more
  aggression than combined equity alone implies.
- **Auth: magic link** (chosen by user). Scoped to `/trainer` only.

### Bugs found by playing hands, now regression-tested

- Pot-limit raise cap double-counted the outstanding bet: `HandState.pot` is a
  running total including the current street, `PotState.pot` means completed
  streets only.
- Equity was computed across *all* seats including folded players, diluting
  every share and understating the live opponents — which in turn made the
  scorer think bets always got through.
- All-in was offered when illegal (pot-limit has no overbet) and when it
  merely covered the call.

## Queued next

1. **Supabase** (blocked on project creation + keys): magic-link auth gating
   `/trainer`, `profiles` / `hands` / `hand_actions` tables with RLS, persisted
   hand history and session stats. Session stats currently live in memory and
   reset on reload.
2. **Review**: manual hand entry reusing the Phase 1 components, street-by-
   street replay against the equity engine.
3. Polish: equity bar charts, hand-history filtering, PLO5 picker ergonomics.

## Running it

```bash
npm run dev    # local
npm test       # engine + betting tests
npm run build  # production build (passes as of this commit)
```

Deployment: Vercel auto-deploys `main` once the repo is imported at
vercel.com/new (user-side step; no `vercel` CLI on this machine).
