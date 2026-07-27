/**
 * Card primitives.
 *
 * A card is an integer 0..51: rank = card >> 2 (0 = deuce .. 12 = ace),
 * suit = card & 3 (0 = clubs, 1 = diamonds, 2 = hearts, 3 = spades).
 * Integers keep the evaluator hot path allocation-free.
 */

export type Card = number;

export const RANKS = '23456789TJQKA';
export const SUITS = 'cdhs';

export const rankOf = (c: Card): number => c >> 2;
export const suitOf = (c: Card): number => c & 3;

export function makeCard(rank: number, suit: number): Card {
  return (rank << 2) | suit;
}

/** Parse 'As', 'Td', '9c' etc. Throws on malformed input. */
export function parseCard(s: string): Card {
  const rank = RANKS.indexOf(s[0]?.toUpperCase() ?? '');
  const suit = SUITS.indexOf(s[1]?.toLowerCase() ?? '');
  if (rank < 0 || suit < 0 || s.length !== 2) {
    throw new Error(`Invalid card: "${s}"`);
  }
  return makeCard(rank, suit);
}

/** Parse 'As Td 9c' or 'AsTd9c' into cards. */
export function parseCards(s: string): Card[] {
  const compact = s.replace(/[\s,]+/g, '');
  if (compact.length % 2 !== 0) throw new Error(`Invalid card string: "${s}"`);
  const cards: Card[] = [];
  for (let i = 0; i < compact.length; i += 2) {
    cards.push(parseCard(compact.slice(i, i + 2)));
  }
  return cards;
}

export function formatCard(c: Card): string {
  return RANKS[rankOf(c)] + SUITS[suitOf(c)];
}

export function formatCards(cards: readonly Card[]): string {
  return cards.map(formatCard).join(' ');
}

export function makeDeck(): Card[] {
  const deck: Card[] = new Array(52);
  for (let i = 0; i < 52; i++) deck[i] = i;
  return deck;
}

/** Deterministic RNG (mulberry32) so simulations are reproducible in tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
