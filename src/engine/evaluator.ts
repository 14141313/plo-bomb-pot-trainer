/**
 * 5-card poker hand evaluator.
 *
 * evaluate5 returns a number where higher = better hand. The value packs
 * (category << 20) | up to five rank nibbles in significance order, so two
 * values compare correctly with plain `>`.
 *
 * Hot path for equity simulation (tens of millions of calls per run), so:
 * no allocation, module-level scratch buffer, bit tricks over loops.
 */

import type { Card } from './cards';

export const enum HandCategory {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  Trips = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  Quads = 7,
  StraightFlush = 8,
}

export const categoryOf = (value: number): HandCategory =>
  (value >> 20) as HandCategory;

export const CATEGORY_NAMES: Record<HandCategory, string> = {
  [HandCategory.HighCard]: 'High Card',
  [HandCategory.Pair]: 'Pair',
  [HandCategory.TwoPair]: 'Two Pair',
  [HandCategory.Trips]: 'Three of a Kind',
  [HandCategory.Straight]: 'Straight',
  [HandCategory.Flush]: 'Flush',
  [HandCategory.FullHouse]: 'Full House',
  [HandCategory.Quads]: 'Four of a Kind',
  [HandCategory.StraightFlush]: 'Straight Flush',
};

/** Rank bit pattern for the wheel (A-2-3-4-5): A plus 2,3,4,5. */
const WHEEL = (1 << 12) | 0b1111;

const COUNTS = new Int8Array(13);

export function evaluate5(c0: Card, c1: Card, c2: Card, c3: Card, c4: Card): number {
  const r0 = c0 >> 2, r1 = c1 >> 2, r2 = c2 >> 2, r3 = c3 >> 2, r4 = c4 >> 2;

  // Full reset: the group-emit loop below reads all 13 entries, so stale
  // counts from a previous call would fabricate phantom kickers.
  COUNTS.fill(0);
  COUNTS[r0]++; COUNTS[r1]++; COUNTS[r2]++; COUNTS[r3]++; COUNTS[r4]++;

  const rankBits = (1 << r0) | (1 << r1) | (1 << r2) | (1 << r3) | (1 << r4);
  const isFlush = (((c0 ^ c1) | (c0 ^ c2) | (c0 ^ c3) | (c0 ^ c4)) & 3) === 0;

  // Straight detection only applies when all five ranks are distinct.
  let distinct = rankBits - ((rankBits >> 1) & 0x1555);
  distinct = (distinct & 0x3333) + ((distinct >> 2) & 0x3333);
  distinct = (distinct + (distinct >> 4)) & 0x0f0f;
  distinct = (distinct + (distinct >> 8)) & 0x1f;

  if (distinct === 5) {
    let straightHigh = -1;
    const lsb = rankBits & -rankBits;
    if (rankBits === lsb * 31) {
      straightHigh = 31 - Math.clz32(rankBits); // 5 consecutive ranks
    } else if (rankBits === WHEEL) {
      straightHigh = 3; // 5-high straight
    }

    if (straightHigh >= 0) {
      const cat = isFlush ? HandCategory.StraightFlush : HandCategory.Straight;
      return (cat << 20) | (straightHigh << 16);
    }
    // Flush or high card: five kicker nibbles, ranks descending.
    let value = isFlush ? HandCategory.Flush << 20 : 0;
    let bits = rankBits;
    let shift = 16;
    while (bits !== 0) {
      const hi = 31 - Math.clz32(bits);
      value |= hi << shift;
      shift -= 4;
      bits &= ~(1 << hi);
    }
    return value;
  }

  // Paired hands: emit rank groups ordered by (count desc, rank desc).
  // That ordering yields correct tiebreaks for every paired category.
  let value = 0;
  let shift = 16;
  let maxCount = 0;
  let pairs = 0;
  for (let count = 4; count >= 1; count--) {
    for (let rank = 12; rank >= 0; rank--) {
      if (COUNTS[rank] === count) {
        value |= rank << shift;
        shift -= 4;
        if (count > maxCount) maxCount = count;
        if (count === 2) pairs++;
      }
    }
  }

  let cat: HandCategory;
  if (maxCount === 4) cat = HandCategory.Quads;
  else if (maxCount === 3) cat = pairs > 0 ? HandCategory.FullHouse : HandCategory.Trips;
  else cat = pairs === 2 ? HandCategory.TwoPair : HandCategory.Pair;

  return (cat << 20) | value;
}
