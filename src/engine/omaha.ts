/**
 * Omaha hand evaluation: best 5-card hand using EXACTLY 2 hole cards and
 * EXACTLY 3 board cards. Supports PLO4 (4 hole cards, C(4,2)=6 pairs) and
 * PLO5 (5 hole cards, C(5,2)=10 pairs).
 */

import type { Card } from './cards';
import { evaluate5 } from './evaluator';

function choosePairs(n: number): ReadonlyArray<readonly [number, number]> {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) out.push([i, j]);
  return out;
}

function chooseTriples(n: number): ReadonlyArray<readonly [number, number, number]> {
  const out: [number, number, number][] = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      for (let k = j + 1; k < n; k++) out.push([i, j, k]);
  return out;
}

const HOLE_PAIRS: Record<number, ReadonlyArray<readonly [number, number]>> = {
  4: choosePairs(4),
  5: choosePairs(5),
};

const BOARD_TRIPLES: Record<number, ReadonlyArray<readonly [number, number, number]>> = {
  3: chooseTriples(3),
  4: chooseTriples(4),
  5: chooseTriples(5),
};

/**
 * Best Omaha hand value for `hole` (4 or 5 cards) on `board` (3-5 cards).
 * Returned value comes from evaluate5 and compares with plain `>`.
 */
export function bestOmahaValue(hole: readonly Card[], board: readonly Card[]): number {
  const pairs = HOLE_PAIRS[hole.length];
  const triples = BOARD_TRIPLES[board.length];
  if (!pairs) throw new Error(`Omaha hand must have 4 or 5 cards, got ${hole.length}`);
  if (!triples) throw new Error(`Board must have 3-5 cards, got ${board.length}`);

  let best = -1;
  for (let p = 0; p < pairs.length; p++) {
    const h0 = hole[pairs[p][0]];
    const h1 = hole[pairs[p][1]];
    for (let t = 0; t < triples.length; t++) {
      const tr = triples[t];
      const v = evaluate5(h0, h1, board[tr[0]], board[tr[1]], board[tr[2]]);
      if (v > best) best = v;
    }
  }
  return best;
}
