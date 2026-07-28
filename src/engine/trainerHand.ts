/**
 * Trainer hand lifecycle.
 *
 * A bomb pot starts ON THE FLOP: everyone antes, both boards are dealt three
 * cards, and betting begins. There is no preflop street.
 *
 * This module is pure — equities are passed in rather than computed here, so
 * the heavy simulation can live in a Web Worker and the state machine stays
 * synchronous and testable.
 */

import type { Card } from './cards';
import { makeDeck, mulberry32 } from './cards';
import { BET_FRACTIONS, allInTo, antePot, effectiveStack, raiseTo, betSize } from './betting';
import { decideAction, type OpponentView } from './opponent';
import type { ActionKind } from './scoring';

export type Street = 'flop' | 'turn' | 'river';
export const STREETS: readonly Street[] = ['flop', 'turn', 'river'];

/** Board cards present at each street. */
const CARDS_BY_STREET: Record<Street, number> = { flop: 3, turn: 4, river: 5 };

export interface HandAction {
  seat: number;
  street: Street;
  kind: ActionKind;
  /** Chips added to the pot by this action, in bb. */
  amount: number;
  fraction?: number;
}

export interface HandConfig {
  playerCount: number;
  /** 4 = PLO4, 5 = PLO5. */
  variant: 4 | 5;
  ante: number;
  doubleBoard: boolean;
}

export interface HandState {
  config: HandConfig;
  heroSeat: number;
  hands: Card[][];
  boards: Card[][];
  street: Street;
  pot: number;
  stacks: number[];
  committed: number[];
  acted: boolean[];
  folded: boolean[];
  /** Seat to act next, or null when the hand is over. */
  toAct: number | null;
  actions: HandAction[];
  complete: boolean;
  /** Set once the hand ends: seats that reached showdown. */
  showdownSeats: number[];
  /**
   * Seed for cards dealt after the flop. Kept on the state so later streets
   * are reproducible and a stored hand can be replayed exactly.
   */
  seed: number;
}

function draw(pool: Card[], rng: () => number): Card {
  const i = Math.floor(rng() * pool.length);
  return pool.splice(i, 1)[0];
}

/** Deal a fresh hand: random hero seat, hole cards, and both flops. */
export function dealHand(config: HandConfig, rng: () => number): HandState {
  const { playerCount, variant, ante, doubleBoard } = config;
  const pool = makeDeck();
  const hands: Card[][] = [];
  for (let s = 0; s < playerCount; s++) {
    hands.push(Array.from({ length: variant }, () => draw(pool, rng)));
  }
  const nBoards = doubleBoard ? 2 : 1;
  const boards: Card[][] = [];
  for (let b = 0; b < nBoards; b++) {
    boards.push(Array.from({ length: 3 }, () => draw(pool, rng)));
  }

  const stack = effectiveStack(ante);
  return {
    config,
    heroSeat: Math.floor(rng() * playerCount),
    hands,
    boards,
    street: 'flop',
    pot: antePot(ante, playerCount),
    stacks: Array(playerCount).fill(stack),
    committed: Array(playerCount).fill(0),
    acted: Array(playerCount).fill(false),
    folded: Array(playerCount).fill(false),
    toAct: 0, // postflop action starts with SB (seat 0)
    actions: [],
    complete: false,
    showdownSeats: [],
    seed: (rng() * 2 ** 32) >>> 0,
  };
}

export const liveSeats = (s: HandState): number[] =>
  s.folded.map((f, i) => (f ? -1 : i)).filter((i) => i >= 0);

export const outstandingBet = (s: HandState): number => Math.max(...s.committed);

export const toCallFor = (s: HandState, seat: number): number =>
  Math.min(outstandingBet(s) - s.committed[seat], s.stacks[seat]);

/** True once every live player has acted and matched the bet (or is all-in). */
function bettingRoundClosed(s: HandState): boolean {
  const live = liveSeats(s);
  if (live.length <= 1) return true;
  return live.every(
    (i) => s.acted[i] && (s.committed[i] === outstandingBet(s) || s.stacks[i] === 0),
  );
}

function nextToAct(s: HandState, from: number): number | null {
  const n = s.config.playerCount;
  for (let step = 1; step <= n; step++) {
    const seat = (from + step) % n;
    if (s.folded[seat] || s.stacks[seat] === 0) continue;
    if (!s.acted[seat] || s.committed[seat] < outstandingBet(s)) return seat;
  }
  return null;
}

/** Legal sizings for the seat to act, as concrete bb amounts. */
export interface Sizing {
  kind: 'bet' | 'raise';
  /** Chips added to the pot by this action, in bb. */
  amount: number;
  fraction: number;
  /** True when this size puts the player all-in. */
  allIn: boolean;
}

export function legalSizings(s: HandState, seat: number): Sizing[] {
  const facing = toCallFor(s, seat) > 0;
  // HandState.pot is a running total that already includes this street's
  // bets, but PotState.pot means completed streets only. Subtract the current
  // street's chips or the pot-limit cap double-counts the outstanding bet.
  const streetCommitted = s.committed.reduce((a, c) => a + c, 0);
  const potState = {
    pot: s.pot - streetCommitted,
    outstandingBet: outstandingBet(s),
    heroCommittedThisStreet: s.committed[seat],
    heroStack: s.stacks[seat],
  };
  const out: Sizing[] = [];
  const stack = s.stacks[seat];
  for (const f of BET_FRACTIONS) {
    if (facing) {
      const to = raiseTo(f, potState);
      const amount = to - s.committed[seat];
      if (amount > toCallFor(s, seat)) {
        out.push({ kind: 'raise', amount, fraction: f, allIn: amount >= stack - 1e-9 });
      }
    } else {
      const amount = betSize(f, s.pot, stack);
      if (amount > 0) out.push({ kind: 'bet', amount, fraction: f, allIn: amount >= stack - 1e-9 });
    }
  }
  // All-in is only a LEGAL size in pot-limit when the stack is at or under
  // the pot cap — there is no overbet in PLO. Deep-stacked, the 100% preset
  // already is the maximum, so no all-in button is offered.
  const allIn = allInTo(potState) - s.committed[seat];
  const cap = facing ? raiseTo(1, potState) - s.committed[seat] : betSize(1, s.pot, stack);
  // Only a genuine raise: shoving a short stack that merely covers the call
  // is a call, and is already offered as one.
  const raisesTheBet = allIn > toCallFor(s, seat) + 1e-9;
  if (
    allIn > 0 &&
    raisesTheBet &&
    allIn <= cap + 1e-9 &&
    !out.some((o) => Math.abs(o.amount - allIn) < 1e-9)
  ) {
    out.push({ kind: facing ? 'raise' : 'bet', amount: allIn, fraction: 1, allIn: true });
  }

  // Several fractions collapse onto the same number once the stack clamps
  // them. Keep the first (smallest fraction) of each distinct amount so the
  // UI never shows two buttons with identical sizing.
  const seen = new Set<string>();
  return out.filter((o) => {
    const key = o.amount.toFixed(6);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Apply one action for the seat to act. Mutates a copy and returns it. */
export function applyAction(
  state: HandState,
  kind: ActionKind,
  amount: number,
  fraction?: number,
): HandState {
  const s: HandState = {
    ...state,
    hands: state.hands.map((h) => h.slice()),
    boards: state.boards.map((b) => b.slice()),
    stacks: state.stacks.slice(),
    committed: state.committed.slice(),
    acted: state.acted.slice(),
    folded: state.folded.slice(),
    actions: state.actions.slice(),
  };
  const seat = s.toAct;
  if (seat === null) return s;

  s.acted[seat] = true;
  switch (kind) {
    case 'fold':
      s.folded[seat] = true;
      break;
    case 'check':
      break;
    case 'call':
    case 'bet':
    case 'raise': {
      const put = Math.min(amount, s.stacks[seat]);
      s.stacks[seat] -= put;
      s.committed[seat] += put;
      s.pot += put;
      // A bet or raise reopens the action for everyone still live.
      if (kind !== 'call') {
        for (let i = 0; i < s.acted.length; i++) if (i !== seat && !s.folded[i]) s.acted[i] = false;
      }
      break;
    }
  }
  s.actions.push({ seat, street: s.street, kind, amount, fraction });

  if (liveSeats(s).length <= 1) {
    s.complete = true;
    s.toAct = null;
    return s;
  }
  if (bettingRoundClosed(s)) return closeStreet(s);
  s.toAct = nextToAct(s, seat);
  if (s.toAct === null) return closeStreet(s);
  return s;
}

/** End the street: deal the next card to every board, or finish the hand. */
function closeStreet(s: HandState): HandState {
  const idx = STREETS.indexOf(s.street);
  if (idx === STREETS.length - 1) {
    s.complete = true;
    s.toAct = null;
    s.showdownSeats = liveSeats(s);
    return s;
  }
  const next = STREETS[idx + 1];
  const target = CARDS_BY_STREET[next];
  const used = new Set<Card>([...s.hands.flat(), ...s.boards.flat()]);
  const pool = makeDeck().filter((c) => !used.has(c));
  const rng = mulberry32(s.seed);
  // Both boards advance together from one shared pool.
  s.boards = s.boards.map((b) => {
    const copy = b.slice();
    while (copy.length < target) copy.push(draw(pool, rng));
    return copy;
  });
  s.seed = (rng() * 2 ** 32) >>> 0;
  s.street = next;
  s.committed = Array(s.config.playerCount).fill(0);
  s.acted = Array(s.config.playerCount).fill(false);
  s.toAct = nextToAct({ ...s, acted: s.acted, committed: s.committed }, -1);
  // Nobody can act — everyone still in is all-in. Run the remaining streets
  // out to showdown rather than stalling with no one to act.
  if (s.toAct === null) return closeStreet(s);
  return s;
}

/**
 * Run opponent actions until it is the hero's turn or the hand ends.
 * `equities` is the combined-and-per-board equity for every seat on the
 * current street, computed once per street by the caller.
 */
export function advanceToHero(
  state: HandState,
  equities: ReadonlyArray<{ combined: number; perBoard: readonly number[] }>,
  rng: () => number,
): HandState {
  let s = state;
  let guard = 0;
  while (!s.complete && s.toAct !== null && s.toAct !== s.heroSeat && guard++ < 200) {
    const seat = s.toAct;
    const view: OpponentView = {
      combined: equities[seat]?.combined ?? 0,
      perBoard: equities[seat]?.perBoard ?? [0],
      livePlayers: liveSeats(s).length,
      toCall: toCallFor(s, seat),
      pot: s.pot,
    };
    const action = decideAction(view, rng);
    switch (action.kind) {
      case 'check':
        s = applyAction(s, 'check', 0);
        break;
      case 'fold':
        s = applyAction(s, 'fold', 0);
        break;
      case 'call':
        s = applyAction(s, 'call', toCallFor(s, seat));
        break;
      case 'bet':
      case 'raise': {
        const options = legalSizings(s, seat);
        const pick =
          options.find((o) => Math.abs(o.fraction - action.fraction) < 1e-9) ??
          options[options.length - 1];
        if (!pick) {
          s = applyAction(s, toCallFor(s, seat) > 0 ? 'call' : 'check', toCallFor(s, seat));
        } else {
          s = applyAction(s, pick.kind, pick.amount, pick.fraction);
        }
        break;
      }
    }
  }
  return s;
}
