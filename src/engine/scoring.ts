/**
 * EV scoring for trainer decisions.
 *
 * WHAT "OPTIMAL" MEANS HERE: the highest-EV action against THIS TOOL'S
 * opponent model — not a GTO solution. Solved multi-way double-board PLO
 * doesn't meaningfully exist, and claiming otherwise would be dishonest. The
 * grade answers "did you exploit these honest, equity-driven opponents
 * correctly", which is the right question for a tool teaching equity and EV.
 *
 * SCOPE: single-decision lookahead. Opponents respond once and the hand is
 * settled at the hero's current equity; future streets of betting are not
 * modelled. Fold and call EVs are therefore exact; bet and raise EVs are
 * estimates that depend on the opponent model's fold/call responses.
 *
 * All amounts are in big blinds. EV is expected profit from this decision
 * forward — chips already committed are sunk and excluded.
 */

export type ActionKind = 'fold' | 'check' | 'call' | 'bet' | 'raise';

export interface ScoredAction {
  kind: ActionKind;
  /** Total amount added to the pot by this action, in bb. */
  amount: number;
  /** Expected profit from this decision forward, in bb. */
  ev: number;
  /** Present for bet/raise: the pot fraction used. */
  fraction?: number;
}

export interface DecisionContext {
  /** Hero's combined equity across both boards, 0..1. */
  equity: number;
  /** Chips in the middle right now, including any outstanding bet, in bb. */
  pot: number;
  /** Amount hero must add to call (0 when hero is first to act), in bb. */
  toCall: number;
  /**
   * For each live opponent, the probability they continue (call) if hero
   * commits `amount` more. Supplied by the caller from the opponent model.
   */
  continueProbs: (amount: number) => readonly number[];
}

/** Folding forfeits only what is already sunk, so future profit is zero. */
export const EV_FOLD = 0;

/** Exact: hero calls, hand is decided, hero realises `equity` of the final pot. */
export function evCall(equity: number, pot: number, toCall: number): number {
  return equity * (pot + toCall) - toCall;
}

/** Checking keeps the pot as-is and realises equity in it. */
export function evCheck(equity: number, pot: number): number {
  return equity * pot;
}

/**
 * Betting (or raising) `amount` more. Opponents fold or call per the model;
 * if everyone folds hero takes the pot outright, otherwise the hand is settled
 * at hero's equity in the enlarged pot.
 */
export function evAggressive(
  equity: number,
  pot: number,
  amount: number,
  continueProbs: readonly number[],
): number {
  const pFoldAll = continueProbs.reduce((acc, p) => acc * (1 - p), 1);
  const expectedCallers = continueProbs.reduce((acc, p) => acc + p, 0);
  const potIfCalled = pot + amount + expectedCallers * amount;
  const evIfCalled = equity * potIfCalled - amount;
  return pFoldAll * pot + (1 - pFoldAll) * evIfCalled;
}

/**
 * Score every legal action at a decision point.
 *
 * Action legality follows the trainer rules: first to act may only check or
 * bet; call/raise/fold exist only in response to a bet.
 */
export function scoreActions(
  ctx: DecisionContext,
  sizings: ReadonlyArray<{ kind: 'bet' | 'raise'; amount: number; fraction: number }>,
): ScoredAction[] {
  const { equity, pot, toCall, continueProbs } = ctx;
  const actions: ScoredAction[] = [];

  if (toCall > 0) {
    actions.push({ kind: 'fold', amount: 0, ev: EV_FOLD });
    actions.push({ kind: 'call', amount: toCall, ev: evCall(equity, pot, toCall) });
  } else {
    actions.push({ kind: 'check', amount: 0, ev: evCheck(equity, pot) });
  }

  for (const s of sizings) {
    actions.push({
      kind: s.kind,
      amount: s.amount,
      fraction: s.fraction,
      ev: evAggressive(equity, pot, s.amount, continueProbs(s.amount)),
    });
  }

  return actions;
}

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

/**
 * Grade bands as a fraction of the pot, so an error is judged relative to
 * what was at stake: 3bb spilled in a 24bb pot is a real mistake, the same
 * 3bb in a 200bb pot is a rounding error. Tune here.
 */
export const GRADE_BANDS: ReadonlyArray<{ grade: Grade; maxLossPctOfPot: number }> = [
  { grade: 'A', maxLossPctOfPot: 0.02 },
  { grade: 'B', maxLossPctOfPot: 0.05 },
  { grade: 'C', maxLossPctOfPot: 0.1 },
  { grade: 'D', maxLossPctOfPot: 0.2 },
  { grade: 'F', maxLossPctOfPot: Infinity },
];

export function gradeFor(evLoss: number, pot: number): Grade {
  if (pot <= 0) return 'A';
  const pct = Math.max(0, evLoss) / pot;
  for (const band of GRADE_BANDS) {
    if (pct <= band.maxLossPctOfPot) return band.grade;
  }
  return 'F';
}

export interface DecisionScore {
  chosen: ScoredAction;
  best: ScoredAction;
  /** bb of EV given up versus the best action. Zero means optimal. */
  evLoss: number;
  grade: Grade;
}

export function scoreDecision(
  actions: readonly ScoredAction[],
  chosenIdx: number,
  pot: number,
): DecisionScore {
  const best = actions.reduce((a, b) => (b.ev > a.ev ? b : a));
  const chosen = actions[chosenIdx];
  const evLoss = Math.max(0, best.ev - chosen.ev);
  return { chosen, best, evLoss, grade: gradeFor(evLoss, pot) };
}

const GRADE_POINTS: Record<Grade, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 };
const POINT_GRADES: Grade[] = ['F', 'D', 'C', 'B', 'A'];

/** Average a set of grades into a single summary grade (GPA-style). */
export function averageGrade(grades: readonly Grade[]): Grade | null {
  if (grades.length === 0) return null;
  const avg = grades.reduce((a, g) => a + GRADE_POINTS[g], 0) / grades.length;
  return POINT_GRADES[Math.round(avg)];
}
