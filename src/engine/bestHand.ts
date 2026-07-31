/**
 * Picks the right "best hand" rule for a holding.
 *
 * The rule is derived from the hole-card count rather than passed in as a
 * separate setting: 2 cards is only ever Hold'em and 4 or 5 only ever Omaha,
 * so there is no combination where the two could disagree. That removes a
 * whole class of bug where the UI's game type drifts from the cards actually
 * dealt.
 *
 * Everything downstream — Monte Carlo, exact enumeration, double-board
 * scoring, EV and pot odds — is unchanged; it just calls through here.
 */

import type { Card } from './cards';
import { bestHoldemValue } from './holdem';
import { bestOmahaValue } from './omaha';

/** Hole cards per player by game type. */
export const HOLE_SIZES = [2, 4, 5] as const;
export type HoleSize = (typeof HOLE_SIZES)[number];

export const GAME_LABELS: Record<HoleSize, string> = {
  2: "Hold'em",
  4: 'PLO4',
  5: 'PLO5',
};

export function bestHandValue(hole: readonly Card[], board: readonly Card[]): number {
  return hole.length === 2 ? bestHoldemValue(hole, board) : bestOmahaValue(hole, board);
}
