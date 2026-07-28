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

## Equity engine validation

`src/engine/validation.test.ts` exists because the poker maths can't be
eyeballed — a subtly wrong evaluator still returns plausible percentages. It
leans on internal consistency rather than published equity tables, which
disagree with each other by ~9 points for the same matchup:

- **Independent reference evaluator.** A deliberately naive best-2-from-hole /
  best-3-from-board loop, written separately from the optimised path, must
  agree over 4,000 random PLO4 and PLO5 hands. It also asserts the
  combination count (60 for PLO4, 100 for PLO5), which catches the classic
  bug of letting 1 or 3 hole cards slip through.
- **Convergence.** Monte Carlo at the shipped iteration count must land within
  1pp of exact enumeration on a spot that is an exact 50/50 — sampling error
  peaks at p = 0.5, so a lopsided spot would pass trivially and prove nothing.
- **Double-board maths.** Equities sum to 100% overall and per board, and
  combined equals the mean of the two per-board figures under the 50/50 split.
- **Regression fixtures** with fully determined outcomes, plus rainbow-board,
  flush-over-flush and chopped-pot edge cases.

### Findings

- **Trainer iteration count raised 10k → 20k.** On the 50/50 fixture, 10k
  produced errors up to 1.24pp across seeds — outside the 1pp bar, and the
  trainer's grades read off these numbers. 20k measures 0.63pp worst case.
  Both surfaces now use `DEFAULT_ITERATIONS`.
- **AAKK double-suited vs random**, 8 opponents × 15k iterations, averages
  **70.8%** (range 64.7–78.0 by opponent). Published sources span ~64–73%, so
  this is asserted as a range, never a single number.
- `forceMonteCarlo` was added to `EquityOptions` purely so tests can run both
  methods over the same scenario. Production never sets it.
- Note: the external reference used two *independently dealt* boards. This
  engine deals both from one shared deck, so runouts are correlated and a card
  on board 1 cannot repeat on board 2 — the correct behaviour for a real bomb
  pot, and a deliberate difference from that reference.

## Colour system (OKLCH)

All colour lives in `src/app/globals.css` as OKLCH tokens with hex fallbacks
behind `@supports`, exposed to Tailwind v4 via `@theme inline` so utilities
inherit the fallback chain. Converted with the `oklch-skill` agent skill
(`.agents/skills/oklch-skill`, markdown-only — no scripts or network calls).

Two rules hold the palette together:

- **Uniform lightness** for anything meant to read as a set. The suits
  previously spanned L 0.405–0.616, which is why they felt like four unrelated
  colours; they now all sit at L 0.52.
- **Equal chroma *percentage*, not equal chroma.** Max chroma varies hugely by
  hue (at L 0.52: blue peaks ~0.268, green only ~0.124). One absolute C would
  leave green washed out and blue shouting. Each hue sits at 90% of its own
  sRGB maximum.

### Suit regeneration (production colour audit)

The first pass forced all four suits to one lightness (L 0.52), which crushed
the reds' available chroma — hearts natively sits at L 0.616 where far more
chroma exists. Result read muted. Regenerated: lightness now sits in a BAND
(0.52–0.58) with FULL chroma per hue. Clubs at max chroma is exactly the
original `#008851`; hearts comes back as vivid `#e50026`, close to the
original but passing the AA floor the original failed.

### Measured results (rendered pixels, not predictions)

| | value | white text | vs felt |
|---|---|---|---|
| spades | `oklch(0.52 0 89.9)` `#696969` | 5.49:1 | 3.71:1 |
| clubs | `oklch(0.55 0.132 156.7)` `#008851` | 4.53:1 | 3.06:1 |
| hearts | `oklch(0.58 0.235 25)` `#e50026` | 4.82:1 | 3.26:1 |
| diamonds | `oklch(0.555 0.245 266.1)` `#305dff` | 5.08:1 | 3.44:1 |

### State tokens placed in the palette

`--to-act` was Tailwind's amber-400 converted numerically but never retuned —
the source of the stray yellow. State tokens now hold deliberate places:
to-act shares the accent hue (70.1), hero shares the clubs hue (156.7),
leader shares the grade-D hue (55).

### Dark mode block: intentional

The `@media (prefers-color-scheme: dark)` background/foreground switch is
deliberate: the site follows the OS theme and there is no in-app toggle. If a
toggle ever lands, that block becomes the default the toggle overrides.

Grades A–F sweep hue 155° → 25° at constant L and chroma %, measuring
5.20–6.08:1 on white text — one graduated ramp rather than five unrelated
colours.

### One card component, one system, across both tabs

`CardBadge` (white card, coloured text, suit glyph) was deleted. `TrainerCard`
is now the single playing card for the whole app and handles the empty and
interactive states, so the Tool's card entry and the Trainer's dealt cards are
literally the same component rather than two lookalikes. The Tool's board also
moved from green felt to the shared `--felt` / `--rail` tokens, and the card
picker's cells are filled suit colours — the grid keeps one row per suit with a
symbol header, so dropping the per-cell glyph stays unambiguous.

### Accent retune, and a contrast bug it exposed

`--accent` was Tailwind's `amber-500` behind a new name, which is why the first
OKLCH pass looked like nothing had changed — it was a token migration, not a
restyle. Retuning it surfaced a real bug: every accent button was
`bg-accent text-white`, and **white on that yellow measures 2.06:1**, far under
the 4.5:1 floor. It had been that way since the first build.

A bright accent needs a dark on-colour, so the token set is now:

| Token | Use | Contrast |
| --- | --- | --- |
| `--accent` `oklch(0.78 0.152 70.1)` | bright fill | 8.71:1 with `--accent-fg` |
| `--accent-fg` `oklch(0.205 0 0)` | text/icons on `--accent` | — |
| `--accent-text` `oklch(0.52 0.101 70.1)` | accent text and borders | 5.6:1 on white, 4.4:1 on the dark chrome |

`--accent-text` exists because the nav's active state is accent-coloured text
sitting on the page background, which is white in light mode and near-black in
dark mode. The bright fill fails on white (1.9:1); the mid-lightness variant
clears both.

### Decisions on the brief's open questions

- **Uniform suit lightness: yes.** It also fixed a real bug — the old hearts
  `#ED3038` measured **4.13:1** on white text, below the WCAG AA 4.5:1 floor.
  Every suit now passes.
- **Scope: whole app.** Suit hues are shared with the Tool tab's card text so a
  heart is the same hue in both tabs; Tool chrome otherwise untouched.
- **Display P3: not used.** Suit identity is load-bearing in a trainer, and P3
  would make the same suit look different on different displays. Everything is
  held inside sRGB deliberately.
- **Action buttons: NOT colour-coded** — see below.

## Typography pass

Ran against `better-typography` from the `jakubkrehel/skills` suite
(`.agents/skills/`, markdown + agent configs — no scripts or network calls).
The standalone `oklch-skill` was removed, since the suite's `better-colors`
supersedes it.

Two genuine bugs, both live in production before this:

- **Geist was downloaded and then thrown away.** `globals.css` hard-coded
  `font-family: Arial, Helvetica, sans-serif` on `body`, overriding the Geist
  variable font loaded in `layout.tsx`. Verified on the deployed site — it was
  rendering Arial while paying for Geist.
- **The pot input on the Tool tab was 12px**, so iOS Safari zooms the whole
  page when it's focused. Now `text-base sm:text-xs`. Matters for a tool meant
  to be used one-handed at a table.

Plus tabular figures (`.nums` in globals.css) on every changing value —
stacks, pot, chips, bet sizes, equity, EV. Proportional digits have different
widths, so a stack ticking 94 → 83.5 shifted its neighbours on every update.
Measured after: all ten digits are exactly 9.6px.

Hit areas were audited and already pass — no target under 24×24.

### Action bar conflict, unresolved

The brief asks for a coordinated fold/check/call/bet/raise colour set. That
directly contradicts the later instruction to make the action bar neutral
(white stroke, white text) so the tool doesn't nudge a decision it is about to
grade. The neutral bar was kept and the colour-coding was **not** reintroduced.
Flag if the brief should win.

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
