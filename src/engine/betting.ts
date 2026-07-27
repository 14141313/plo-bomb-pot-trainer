/**
 * Bomb pot ante/stack and pot-limit sizing math. All amounts are in big
 * blinds. Pure functions so the same logic serves Train, Review, and tests.
 */

export const STARTING_STACK = 100;
export const ANTE_PRESETS = [2, 4, 6, 8, 10] as const;

/** Fixed bet-size fractions of the pot. 100% is the pot-limit maximum. */
export const BET_FRACTIONS = [0.25, 0.5, 0.75, 1] as const;

export interface PotState {
  /** Total pot from completed streets (incl. antes). */
  pot: number;
  /** Current outstanding bet this street (0 if checked around so far). */
  outstandingBet: number;
  /** Hero's chips already committed this street toward the outstanding bet. */
  heroCommittedThisStreet: number;
  /** Hero's remaining stack (behind). */
  heroStack: number;
}

/** Effective stack after posting the bomb pot ante. */
export function effectiveStack(ante: number): number {
  return STARTING_STACK - ante;
}

/** Initial pot created by the antes. */
export function antePot(ante: number, playerCount: number): number {
  return ante * playerCount;
}

/**
 * Required equity to call: bet / (pot + 2*bet), where `pot` already includes
 * the bet. Equivalently callAmount / (potAfterCall).
 */
export function requiredEquityToCall(callAmount: number, potIncludingBet: number): number {
  if (callAmount <= 0) return 0;
  return callAmount / (potIncludingBet + callAmount);
}

/** Amount hero must add to call, capped by stack (all-in call). */
export function callAmount(s: PotState): number {
  return Math.min(s.outstandingBet - s.heroCommittedThisStreet, s.heroStack);
}

/**
 * Legal opening bet for a pot fraction. Pot-limit max is 100% pot; every
 * size is clamped to the stack behind.
 */
export function betSize(fraction: number, pot: number, stack: number): number {
  return Math.min(fraction * pot, pot, stack);
}

/**
 * Pot-limit raise sizing. The maximum raise INCREMENT above the call equals
 * the pot after calling (pot + all street bets + hero's call). Presets scale
 * that increment, not the pre-raise pot.
 *
 * Returns the total "raise to" amount for this street, clamped to stack.
 */
export function raiseTo(fraction: number, s: PotState): number {
  const call = s.outstandingBet - s.heroCommittedThisStreet;
  const potAfterCall = s.pot + s.outstandingBet + call;
  const increment = fraction * potAfterCall;
  const total = s.outstandingBet + increment;
  // Hero's total chips this street cannot exceed committed + stack.
  const maxTotal = s.heroCommittedThisStreet + s.heroStack;
  return Math.min(total, maxTotal);
}

/** Max legal pot-limit raise-to (fraction = 1). */
export function maxRaiseTo(s: PotState): number {
  return raiseTo(1, s);
}

/** All-in size: everything behind plus what's already committed this street. */
export function allInTo(s: PotState): number {
  return s.heroCommittedThisStreet + s.heroStack;
}
