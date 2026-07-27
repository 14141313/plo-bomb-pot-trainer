/**
 * Double-board equity engine.
 *
 * Both boards are dealt from ONE shared deck, so runouts are correlated:
 * a card that lands on board 1 can never appear on board 2. Every sample
 * (Monte Carlo or enumerated) therefore completes both boards jointly from
 * the same remaining-card pool — never per-board independently.
 *
 * Scoring: each board awards its share of the pot (default 50/50 — see
 * BOARD_SHARE_SPLIT) to the best hand(s) on that board, ties splitting that
 * board's share evenly.
 */

import type { Card } from './cards';
import { mulberry32 } from './cards';
import { bestOmahaValue } from './omaha';

/**
 * Default pot share per board in double-board mode. Bomb pot convention is
 * an even 50/50 split between boards; change here (or pass boardShares) if
 * a game uses something else.
 */
export const BOARD_SHARE_SPLIT: readonly number[] = [0.5, 0.5];

/** Enumerate exhaustively when the joint runout count is at or below this. */
const MAX_ENUMERATION_OUTCOMES = 2500;

export const DEFAULT_ITERATIONS = 20_000;

export interface EquityOptions {
  /** Complete hole cards per player: 4 (PLO4) or 5 (PLO5) cards each. */
  players: ReadonlyArray<readonly Card[]>;
  /** 1 board (single) or 2 boards (double). Each 0, 3, 4, or 5 cards. */
  boards: ReadonlyArray<readonly Card[]>;
  /** Monte Carlo iterations when enumeration is infeasible. */
  iterations?: number;
  /** Pot share per board; must sum to 1. Defaults to an even split. */
  boardShares?: readonly number[];
  /** RNG seed for reproducible simulations. */
  seed?: number;
}

export interface BoardEquity {
  /** Share of this board's pot portion won on average (0..1, within board). */
  equity: number;
  /** Fraction of runouts where this player is the sole winner of the board. */
  winPct: number;
  /** Fraction of runouts where this player ties for best on the board. */
  tiePct: number;
}

export interface PlayerEquity {
  perBoard: BoardEquity[];
  /** Overall share of the total pot (board equities weighted by board share). */
  combined: number;
  /** Fraction of runouts where this player is the sole winner on EVERY board. */
  scoopPct: number;
}

export interface EquityResult {
  players: PlayerEquity[];
  method: 'exact' | 'monte-carlo';
  /** Number of runouts evaluated. */
  samples: number;
}

function validate(opts: EquityOptions): void {
  const { players, boards } = opts;
  if (players.length < 2) throw new Error('Need at least 2 players');
  if (boards.length < 1 || boards.length > 2) throw new Error('Need 1 or 2 boards');

  const holeSize = players[0].length;
  if (holeSize !== 4 && holeSize !== 5) {
    throw new Error(`Hole cards must be 4 or 5, got ${holeSize}`);
  }
  for (const p of players) {
    if (p.length !== holeSize) throw new Error('All players must have the same hand size');
  }
  for (const b of boards) {
    if (![0, 3, 4, 5].includes(b.length)) {
      throw new Error(`Board must have 0, 3, 4, or 5 cards, got ${b.length}`);
    }
  }

  const seen = new Set<Card>();
  for (const cards of [...players, ...boards]) {
    for (const c of cards) {
      if (c < 0 || c > 51) throw new Error(`Invalid card ${c}`);
      if (seen.has(c)) throw new Error(`Duplicate card ${c}`);
      seen.add(c);
    }
  }

  const shares = opts.boardShares;
  if (shares) {
    if (shares.length !== boards.length) throw new Error('boardShares length mismatch');
    const sum = shares.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 1e-9) throw new Error('boardShares must sum to 1');
  }
}

function countOutcomes(remaining: number, missing: readonly number[]): number {
  let outcomes = 1;
  let pool = remaining;
  for (const m of missing) {
    // multiply by C(pool, m)
    for (let i = 0; i < m; i++) outcomes = (outcomes * (pool - i)) / (i + 1);
    pool -= m;
  }
  return outcomes;
}

export function calculateEquity(opts: EquityOptions): EquityResult {
  validate(opts);
  const { players, boards } = opts;
  const nPlayers = players.length;
  const nBoards = boards.length;
  const shares =
    opts.boardShares ?? (nBoards === 2 ? BOARD_SHARE_SPLIT : [1]);

  // Remaining deck = 52 minus every known card.
  const used = new Set<Card>();
  for (const cards of [...players, ...boards]) for (const c of cards) used.add(c);
  const remaining: Card[] = [];
  for (let c = 0; c < 52; c++) if (!used.has(c)) remaining.push(c);

  const missing = boards.map((b) => 5 - b.length);
  const totalMissing = missing.reduce((a, b) => a + b, 0);

  // Accumulators.
  const boardShareSum = boards.map(() => new Float64Array(nPlayers));
  const winCount = boards.map(() => new Float64Array(nPlayers));
  const tieCount = boards.map(() => new Float64Array(nPlayers));
  const scoopCount = new Float64Array(nPlayers);

  // Scratch: full 5-card board buffers, filled per sample.
  const fullBoards = boards.map((b) => {
    const buf = new Array<Card>(5);
    for (let i = 0; i < b.length; i++) buf[i] = b[i];
    return buf;
  });
  const values = new Float64Array(nPlayers);
  const wonBoard = boards.map(() => new Uint8Array(nPlayers));

  /** Score one completed joint runout (both boards filled in fullBoards). */
  function scoreSample(): void {
    for (let b = 0; b < nBoards; b++) {
      const board = fullBoards[b];
      let best = -1;
      for (let p = 0; p < nPlayers; p++) {
        const v = bestOmahaValue(players[p], board);
        values[p] = v;
        if (v > best) best = v;
      }
      let winners = 0;
      for (let p = 0; p < nPlayers; p++) {
        if (values[p] === best) winners++;
      }
      const flags = wonBoard[b];
      for (let p = 0; p < nPlayers; p++) {
        if (values[p] === best) {
          boardShareSum[b][p] += 1 / winners;
          if (winners === 1) {
            winCount[b][p]++;
            flags[p] = 1;
          } else {
            tieCount[b][p]++;
            flags[p] = 0;
          }
        } else {
          flags[p] = 0;
        }
      }
    }
    for (let p = 0; p < nPlayers; p++) {
      let scooped = 1;
      for (let b = 0; b < nBoards; b++) if (!wonBoard[b][p]) scooped = 0;
      scoopCount[p] += scooped;
    }
  }

  let samples = 0;
  let method: 'exact' | 'monte-carlo';

  if (countOutcomes(remaining.length, missing) <= MAX_ENUMERATION_OUTCOMES) {
    method = 'exact';
    // Enumerate joint runouts: choose missing cards for board 0, then board 1
    // from what's left. Recursion depth is tiny (≤ 2 boards).
    const pool = remaining.slice();

    const fillBoard = (b: number, startIdx: number, slot: number): void => {
      if (b === nBoards) {
        scoreSample();
        samples++;
        return;
      }
      if (slot === 5) {
        fillBoard(b + 1, 0, boards[b + 1] ? boards[b + 1].length : 0);
        return;
      }
      for (let i = startIdx; i < pool.length; i++) {
        const c = pool[i];
        if (c < 0) continue; // taken by the other board
        fullBoards[b][slot] = c;
        pool[i] = -1;
        fillBoard(b, i + 1, slot + 1);
        pool[i] = c;
      }
    };

    if (totalMissing === 0) {
      scoreSample();
      samples = 1;
    } else {
      fillBoard(0, 0, boards[0].length);
    }
  } else {
    method = 'monte-carlo';
    const iterations = opts.iterations ?? DEFAULT_ITERATIONS;
    const rng = mulberry32(opts.seed ?? (Math.random() * 2 ** 32) >>> 0);
    const deck = remaining.slice();

    for (let it = 0; it < iterations; it++) {
      // Partial Fisher-Yates: draw totalMissing cards from the shared pool.
      for (let i = 0; i < totalMissing; i++) {
        const j = i + Math.floor(rng() * (deck.length - i));
        const tmp = deck[i];
        deck[i] = deck[j];
        deck[j] = tmp;
      }
      let next = 0;
      for (let b = 0; b < nBoards; b++) {
        for (let slot = boards[b].length; slot < 5; slot++) {
          fullBoards[b][slot] = deck[next++];
        }
      }
      scoreSample();
      samples++;
    }
  }

  const result: PlayerEquity[] = [];
  for (let p = 0; p < nPlayers; p++) {
    const perBoard: BoardEquity[] = [];
    let combined = 0;
    for (let b = 0; b < nBoards; b++) {
      const equity = boardShareSum[b][p] / samples;
      perBoard.push({
        equity,
        winPct: winCount[b][p] / samples,
        tiePct: tieCount[b][p] / samples,
      });
      combined += equity * shares[b];
    }
    result.push({ perBoard, combined, scoopPct: scoopCount[p] / samples });
  }

  return { players: result, method, samples };
}
