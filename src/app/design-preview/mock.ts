/**
 * Fixed mock data for the design-capture routes.
 *
 * Hand-authored rather than generated: every board, holding and figure is a
 * plausible bomb pot so a designer sees realistic density (four-figure pots,
 * mixed suits, uneven equities) instead of placeholders. Nothing here is
 * imported by the product.
 */

import { parseCards, type Card } from '@/engine/cards';
import type { HandConfig, HandState } from '@/engine/trainerHand';
import type { CompletedHand, ReviewEntry } from '@/components/app/TrainerApp';
import type { ToolSeed } from '@/components/app/ToolApp';

const c = (s: string): Card[] => parseCards(s);

/** Pad a hand out to the Tool's fixed 5 slots. */
const slots = (s: string, size = 5): (Card | null)[] => {
  const cards: (Card | null)[] = c(s);
  while (cards.length < size) cards.push(null);
  return cards;
};

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

/** Four PLO4 hands, both boards to the turn, so equity is live and uneven. */
export const TOOL_DEALT: ToolSeed = {
  playerCount: 4,
  variant: 4,
  doubleBoard: true,
  ante: 6,
  hands: [c('Ah Kh 7c 2d'), c('Qs Qd 8s 3h'), c('Jc Td 9s 6h'), c('8h 8d 5c 4s')],
  boards: [slots('Kd 9h 4c 2s'), slots('7h 6d 3c Ts')],
  betFraction: 0.5,
};

/** Same spot with the card picker open on a board slot. */
export const TOOL_PICKER: ToolSeed = {
  ...TOOL_DEALT,
  boards: [slots('Kd 9h 4c'), slots('7h 6d 3c')],
  picker: { kind: 'board', board: 0, index: 3 },
};

// ---------------------------------------------------------------------------
// Trainer
// ---------------------------------------------------------------------------

const CONFIG: HandConfig = { playerCount: 7, variant: 4, ante: 6, doubleBoard: true };

/** Seat order matches positionLabels(7): SB BB UTG UTG+1 MP HJ CO BTN. */
const SEVEN_HANDS = [
  c('Ah Kh 7c 2d'),
  c('Qs Qd 8s 3h'),
  c('Jc Td 9s 6h'),
  c('8h 8d 5c 4s'),
  c('Ac Kc 9d 5h'),
  c('7s 6s 4d 3d'),
  c('Ts 9c 8c 2h'),
];

/**
 * Flop, hero (MP, seat 4) facing a 21bb bet from UTG with two callers behind,
 * so the action bar shows fold / call / raises and chips sit in front of three
 * seats. toAct is the hero, which keeps the opponent-advance effect idle.
 */
export const TRAINER_FACING_BET: HandState = {
  config: CONFIG,
  heroSeat: 4,
  hands: SEVEN_HANDS,
  boards: [c('Kd 9h 4c'), c('7h 6d 3c')],
  street: 'flop',
  pot: 105,
  stacks: [94, 94, 73, 73, 94, 94, 94],
  committed: [0, 0, 21, 21, 0, 0, 0],
  acted: [true, true, true, true, false, false, false],
  folded: [true, true, false, false, false, false, false],
  toAct: 4,
  actions: [
    { seat: 0, street: 'flop', kind: 'fold', amount: 0 },
    { seat: 1, street: 'flop', kind: 'fold', amount: 0 },
    { seat: 2, street: 'flop', kind: 'bet', amount: 21, fraction: 0.5 },
    { seat: 3, street: 'flop', kind: 'call', amount: 21 },
  ],
  complete: false,
  showdownSeats: [],
  seed: 20260729,
};

/** Both boards complete, three seats at showdown, the rest mucked. */
export const TRAINER_SHOWDOWN: HandState = {
  config: CONFIG,
  heroSeat: 4,
  hands: SEVEN_HANDS,
  boards: [c('Kd 9h 4c 2s Qh'), c('7h 6d 3c Ts Jd')],
  street: 'river',
  pot: 231,
  stacks: [94, 94, 52, 52, 52, 94, 94],
  committed: [0, 0, 0, 0, 0, 0, 0],
  acted: [true, true, true, true, true, true, true],
  folded: [true, true, false, false, false, true, true],
  toAct: null,
  actions: [],
  complete: true,
  showdownSeats: [2, 3, 4],
  seed: 20260730,
};

const entry = (
  street: ReviewEntry['street'],
  pot: number,
  equity: number,
  perBoard: [number, number],
  chosen: ReviewEntry['chosen'],
  best: ReviewEntry['best'],
  evLoss: number,
  grade: ReviewEntry['grade'],
): ReviewEntry => ({ street, pot, equity, perBoard, chosen, best, evLoss, grade });

/** A hand's worth of scored decisions, deliberately mixed grades. */
export const TRAINER_ENTRIES: ReviewEntry[] = [
  entry(
    'flop',
    105,
    0.312,
    [0.284, 0.341],
    { kind: 'call', amount: 21, ev: 18.4 },
    { kind: 'call', amount: 21, ev: 18.4 },
    0,
    'A',
  ),
  entry(
    'turn',
    147,
    0.268,
    [0.191, 0.345],
    { kind: 'call', amount: 36, ev: -2.9 },
    { kind: 'fold', amount: 0, ev: 0 },
    2.9,
    'B',
  ),
  entry(
    'river',
    231,
    0.5,
    [1, 0],
    { kind: 'check', amount: 0, ev: 115.5 },
    { kind: 'bet', amount: 57.75, ev: 143.2 },
    27.7,
    'D',
  ),
];

/**
 * A session with enough hands to show real list density, and a spread of
 * grades rather than a single value repeated.
 */
export const TRAINER_SESSION: CompletedHand[] = [
  { id: 9001, entries: TRAINER_ENTRIES, grade: 'B', evLoss: 30.6 },
  { id: 9002, entries: TRAINER_ENTRIES.slice(0, 2), grade: 'A', evLoss: 0.4 },
  { id: 9003, entries: TRAINER_ENTRIES.slice(1), grade: 'C', evLoss: 14.2 },
  { id: 9004, entries: TRAINER_ENTRIES.slice(0, 1), grade: 'A', evLoss: 0 },
  { id: 9005, entries: TRAINER_ENTRIES, grade: 'F', evLoss: 61.8 },
  { id: 9006, entries: TRAINER_ENTRIES.slice(0, 2), grade: 'B', evLoss: 5.1 },
  { id: 9007, entries: TRAINER_ENTRIES.slice(1), grade: 'D', evLoss: 22.9 },
  { id: 9008, entries: TRAINER_ENTRIES.slice(0, 1), grade: 'A', evLoss: 0.2 },
];
