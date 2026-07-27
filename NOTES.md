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
  single/double board, ante 1-10bb with 3/6/10 presets), card picker bottom
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

## Queued for Phase 2 (after sign-off)

1. **Train**: opponent dealing (hidden hands), heuristic equity-tier
   decision logic with per-tier sizing from the same preset list,
   randomization within tiers, per-board equity blending for
   ahead-on-one/behind-on-other spots, action flow street by street,
   fold-review feedback (equity at fold vs price faced, per board).
2. **Review**: manual hand entry reusing the Phase 1 components, street-by-
   street replay against the equity engine.
3. Polish: equity bar charts, position-aware action order enforcement,
   multiway pot odds refinement, PLO5 picker ergonomics.

## Running it

```bash
npm run dev    # local
npm test       # engine + betting tests
npm run build  # production build (passes as of this commit)
```

Deployment: Vercel auto-deploys `main` once the repo is imported at
vercel.com/new (user-side step; no `vercel` CLI on this machine).
