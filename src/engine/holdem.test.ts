/**
 * Hold'em evaluation path validation.
 *
 * Mirrors the three checks the Omaha engine went through, run against the
 * 7-choose-5 rule specifically: the hierarchy still resolves through the
 * shared 5-card evaluator, Monte Carlo converges on exact enumeration, and
 * double-board scoring sums correctly for a hand type it had never seen.
 */

import { describe, expect, it } from 'vitest';
import { mulberry32, parseCards, type Card } from './cards';
import { HandCategory, categoryOf, evaluate5 } from './evaluator';
import { bestHoldemValue } from './holdem';
import { bestHandValue } from './bestHand';
import { bestOmahaValue } from './omaha';
import { DEFAULT_ITERATIONS, calculateEquity } from './equity';

const hand = (s: string): Card[] => parseCards(s);

// ---------------------------------------------------------------------------
// 1. Hierarchy still resolves correctly through the Hold'em selector
// ---------------------------------------------------------------------------

describe("Hold'em selection reaches the right category", () => {
  // Name is spelled out rather than reverse-mapped: HandCategory is a const
  // enum, so it has no runtime reverse lookup.
  const CASES: Array<[string, string, string, HandCategory]> = [
    ['straight flush', 'Ah Kh', 'Qh Jh Th 2c 3d', HandCategory.StraightFlush],
    ['quads', 'As Ad', 'Ac Ah 9s 4d 2c', HandCategory.Quads],
    ['full house', 'As Ad', 'Ac 9s 9d 4c 2h', HandCategory.FullHouse],
    ['flush', 'Ah 2h', '9h 5h Kh 7s 3d', HandCategory.Flush],
    ['straight', '9c 8d', '7h 6s 5c 2d Ah', HandCategory.Straight],
    ['trips', 'As Ad', 'Ac 7h 4s 2d 9c', HandCategory.Trips],
    ['two pair', 'As Kd', 'Ah Kc 4s 2d 9h', HandCategory.TwoPair],
    ['pair', 'As Kd', 'Ah 7c 4s 2d 9h', HandCategory.Pair],
    ['high card', 'As Qd', 'Jh 7c 4s 2d 9h', HandCategory.HighCard],
  ];

  for (const [name, hole, board, category] of CASES) {
    it(`${hole} on ${board} is a ${name}`, () => {
      expect(categoryOf(bestHoldemValue(hand(hole), hand(board)))).toBe(category);
    });
  }

  it('ranks the wheel using one hole card', () => {
    // A-2-3-4-5 with only the ace playing from hand.
    const v = bestHoldemValue(hand('Ah Kd'), hand('2c 3s 4d 5h 9c'));
    expect(categoryOf(v)).toBe(HandCategory.Straight);
  });

  it('agrees with a direct 5-card evaluation when only 5 cards exist', () => {
    // Flop: 2 hole + 3 board is exactly one combination.
    const hole = hand('As Ks');
    const board = hand('Qs Js Ts');
    const direct = evaluate5(hole[0], hole[1], board[0], board[1], board[2]);
    expect(bestHoldemValue(hole, board)).toBe(direct);
  });
});

// ---------------------------------------------------------------------------
// 2. The Hold'em rule really is looser than Omaha's
// ---------------------------------------------------------------------------

describe("Hold'em vs Omaha rules differ as expected", () => {
  it('CAN play the board, where Omaha cannot', () => {
    const board = hand('Ah Kh Qh Jh Th');
    // Two blanks: Hold'em still gets the royal off the board.
    expect(categoryOf(bestHoldemValue(hand('2s 3c'), board))).toBe(
      HandCategory.StraightFlush,
    );
    // Omaha must use exactly two hole cards, so it cannot.
    expect(categoryOf(bestOmahaValue(hand('2s 3c 4d 6h'), board))).not.toBe(
      HandCategory.StraightFlush,
    );
  });

  it('CAN make a flush with a single suited hole card', () => {
    // Four hearts on board: one in hand completes it. Omaha must use exactly
    // two hole cards, so a lone heart is useless there.
    const board = hand('9h 5h 2h 7h 3c');
    expect(categoryOf(bestHoldemValue(hand('Ah Kd'), board))).toBe(HandCategory.Flush);
    expect(categoryOf(bestOmahaValue(hand('Ah Kd Qc Js'), board))).not.toBe(
      HandCategory.Flush,
    );
  });

  it('dispatches on hole-card count with no separate game flag', () => {
    const board = hand('Ah Kh Qh Jh Th');
    // Same board, different hole sizes -> different rules, one entry point.
    expect(bestHandValue(hand('2s 3c'), board)).toBe(bestHoldemValue(hand('2s 3c'), board));
    expect(bestHandValue(hand('2s 3c 4d 6h'), board)).toBe(
      bestOmahaValue(hand('2s 3c 4d 6h'), board),
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Monte Carlo converges on exact enumeration (Hold'em spot)
// ---------------------------------------------------------------------------

describe("Monte Carlo converges on exact enumeration — Hold'em", () => {
  /** Heads-up, flop dealt, two cards to come: small enough to enumerate. */
  const spot = {
    players: [hand('Ah Kd'), hand('Qs Qc')],
    boards: [hand('Kh 7d 2c')],
  };

  it('enumerates the flop-to-river spot exactly', () => {
    const exact = calculateEquity(spot);
    expect(exact.method).toBe('exact');
    // 52 - 4 hole - 3 board = 45 unseen. Turn and river are two slots on the
    // SAME board, which the engine fills as a combination, not a permutation:
    // C(45,2) = 990.
    expect(exact.samples).toBe((45 * 44) / 2);
    const total = exact.players.reduce((a, p) => a + p.combined, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it('matches the exact answer within 1 percentage point at shipped iterations', () => {
    const exact = calculateEquity(spot);
    for (let seed = 1; seed <= 6; seed++) {
      const mc = calculateEquity({
        ...spot,
        iterations: DEFAULT_ITERATIONS,
        seed,
        forceMonteCarlo: true,
      });
      expect(mc.method).toBe('monte-carlo');
      for (let p = 0; p < exact.players.length; p++) {
        expect(Math.abs(mc.players[p].combined - exact.players[p].combined)).toBeLessThan(0.01);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Double-board scoring on Hold'em (new territory)
// ---------------------------------------------------------------------------

describe("double-board scoring — Hold'em", () => {
  const scenarios = [
    {
      name: 'heads-up, flops out',
      players: [hand('Ah Kd'), hand('Qs Qc')],
      boards: [hand('Kh 7d 2c'), hand('9s 8h 3d')],
    },
    {
      name: '6-handed preflop',
      players: [
        hand('Ah Ad'),
        hand('Ks Kc'),
        hand('Qh Qd'),
        hand('Js Jc'),
        hand('Th Td'),
        hand('9s 9c'),
      ],
      boards: [[], []],
    },
    {
      name: '4-handed, both rivers complete',
      players: [hand('Ah Kd'), hand('Qs Qc'), hand('7h 7d'), hand('Js Tc')],
      boards: [hand('Kh 7s 2c 5d 9h'), hand('9s 8h 3d Ac 4s')],
    },
  ];

  for (const s of scenarios) {
    it(`sums to 100% and averages the two boards — ${s.name}`, () => {
      const r = calculateEquity({
        players: s.players,
        boards: s.boards,
        iterations: DEFAULT_ITERATIONS,
        seed: 77,
      });

      expect(r.players.reduce((a, p) => a + p.combined, 0)).toBeCloseTo(1, 6);

      // 50/50 split means combined is exactly the mean of the two boards.
      for (const p of r.players) {
        const mean = (p.perBoard[0].equity + p.perBoard[1].equity) / 2;
        expect(p.combined).toBeCloseTo(mean, 9);
      }

      // Each board is its own pot and must also sum to 100%.
      for (let b = 0; b < 2; b++) {
        expect(r.players.reduce((a, p) => a + p.perBoard[b].equity, 0)).toBeCloseTo(1, 6);
      }
    });
  }

  it('splits 50/50 when each player owns one board outright', () => {
    const r = calculateEquity({
      // P1 has the nut flush on board 1; P2 has a set on board 2.
      players: [hand('Ah Qh'), hand('8s 8d')],
      boards: [hand('Kh 9h 4h 2s 7d'), hand('8h 5c 2d Jc 3s')],
    });
    expect(r.method).toBe('exact');
    expect(r.players[0].perBoard[0].equity).toBe(1);
    expect(r.players[1].perBoard[1].equity).toBe(1);
    expect(r.players[0].combined).toBeCloseTo(0.5, 9);
    expect(r.players[1].combined).toBeCloseTo(0.5, 9);
  });

  it('gives identical twins an exact 50/50 on a single board', () => {
    // Same ranks, different suits, on a rainbow-ish board: a pure chop.
    const r = calculateEquity({
      players: [hand('Ah Kd'), hand('As Kc')],
      boards: [hand('2h 7d 9s 4c Jd')],
    });
    expect(r.players[0].perBoard[0].equity).toBeCloseTo(0.5, 9);
    expect(r.players[0].perBoard[0].tiePct).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 5. Engine guards
// ---------------------------------------------------------------------------

describe('engine accepts 2-card hands', () => {
  it('rejects hole sizes that are not 2, 4 or 5', () => {
    expect(() =>
      calculateEquity({ players: [hand('Ah Kd Qs'), hand('2h 3d 4s')], boards: [[]] }),
    ).toThrow(/2, 4 or 5/);
  });

  it('still rejects duplicates across 2-card hands', () => {
    expect(() =>
      calculateEquity({ players: [hand('Ah Kd'), hand('Ah 3d')], boards: [[]] }),
    ).toThrow(/[Dd]uplicate/);
  });

  it('is reproducible for a given seed', () => {
    const spot = { players: [hand('Ah Kd'), hand('Qs Qc')], boards: [[], []] };
    const a = calculateEquity({ ...spot, iterations: 5000, seed: 11 });
    const b = calculateEquity({ ...spot, iterations: 5000, seed: 11 });
    expect(a.players[0].combined).toBe(b.players[0].combined);
  });

  it('AA holds the expected edge over KK heads-up preflop', () => {
    // Published range for AA vs KK is ~80-82%; assert the band, not a number.
    const r = calculateEquity({
      players: [hand('Ah Ad'), hand('Ks Kc')],
      boards: [[]],
      iterations: 30_000,
      seed: 2468,
    });
    expect(r.players[0].combined).toBeGreaterThan(0.78);
    expect(r.players[0].combined).toBeLessThan(0.85);
  });
});

// ---------------------------------------------------------------------------
// 6. Independent reference cross-check
// ---------------------------------------------------------------------------

describe("optimised Hold'em evaluator vs naive reference", () => {
  /** Deliberately naive best-5-of-7, built the obvious way. */
  function reference(hole: readonly Card[], board: readonly Card[]): number {
    const all = [...hole, ...board];
    let best = -1;
    let combos = 0;
    for (let a = 0; a < all.length; a++)
      for (let b = a + 1; b < all.length; b++)
        for (let c = b + 1; c < all.length; c++)
          for (let d = c + 1; d < all.length; d++)
            for (let e = d + 1; e < all.length; e++) {
              combos++;
              const v = evaluate5(all[a], all[b], all[c], all[d], all[e]);
              if (v > best) best = v;
            }
    const n = all.length;
    const expected = (n * (n - 1) * (n - 2) * (n - 3) * (n - 4)) / 120;
    if (combos !== expected) throw new Error(`combos ${combos} != ${expected}`);
    return best;
  }

  it('agrees on 3000 random hands across flop, turn and river', () => {
    const rng = mulberry32(9182);
    for (let i = 0; i < 3000; i++) {
      const deck = Array.from({ length: 52 }, (_, k) => k as Card);
      for (let k = deck.length - 1; k > 0; k--) {
        const j = Math.floor(rng() * (k + 1));
        [deck[k], deck[j]] = [deck[j], deck[k]];
      }
      const boardSize = [3, 4, 5][i % 3];
      const hole = deck.slice(0, 2);
      const board = deck.slice(2, 2 + boardSize);
      expect(bestHoldemValue(hole, board)).toBe(reference(hole, board));
    }
  });
});
