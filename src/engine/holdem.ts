/**
 * Hold'em hand evaluation: the best 5-card hand from ANY combination of the
 * 2 hole cards and the board.
 *
 * This is a looser rule than Omaha's, not a different ranking system — the
 * 5-card evaluator is shared. Omaha forces exactly 2 from hand and exactly 3
 * from board; Hold'em imposes no split, so a player can play one hole card,
 * both, or in the limit the board itself. On a complete board that is
 * C(7,5) = 21 combinations.
 */

import type { Card } from './cards';
import { evaluate5 } from './evaluator';

/** All 5-card index combinations of n cards, for the n values we can see. */
function chooseFive(n: number): ReadonlyArray<readonly number[]> {
  const out: number[][] = [];
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) out.push([a, b, c, d, e]);
  return out;
}

// 5 cards -> 1 combo, 6 -> 6, 7 -> 21.
const FIVE_OF: Record<number, ReadonlyArray<readonly number[]>> = {
  5: chooseFive(5),
  6: chooseFive(6),
  7: chooseFive(7),
};

/**
 * Best Hold'em hand value for `hole` (2 cards) on `board` (3-5 cards).
 * Returned value comes from evaluate5 and compares with plain `>`.
 */
export function bestHoldemValue(hole: readonly Card[], board: readonly Card[]): number {
  const total = hole.length + board.length;
  const combos = FIVE_OF[total];
  if (!combos) {
    throw new Error(`Hold'em needs 5-7 cards to make a hand, got ${total}`);
  }

  // Scratch array avoids allocating per combination.
  const all: Card[] = new Array(total);
  for (let i = 0; i < hole.length; i++) all[i] = hole[i];
  for (let i = 0; i < board.length; i++) all[hole.length + i] = board[i];

  let best = -1;
  for (let i = 0; i < combos.length; i++) {
    const c = combos[i];
    const v = evaluate5(all[c[0]], all[c[1]], all[c[2]], all[c[3]], all[c[4]]);
    if (v > best) best = v;
  }
  return best;
}
