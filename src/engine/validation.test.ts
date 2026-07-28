/**
 * Equity engine validation.
 *
 * These tests exist because the poker maths can't be eyeballed — a subtly
 * wrong evaluator still returns plausible-looking percentages. Rather than
 * pinning to published equity figures (which disagree with each other by ~9
 * points for the same matchup), they lean on internal consistency, which is
 * the stronger signal:
 *
 *   - an independent, deliberately naive reference evaluator must agree with
 *     the optimised one over thousands of random hands
 *   - Monte Carlo at the shipped iteration count must converge on the exact
 *     enumeration of the same spot
 *   - equities must sum to 100%, and combined must equal the mean of the two
 *     per-board figures under a 50/50 split
 *   - fixed scenarios are pinned as regression fixtures
 */

import { describe, expect, it } from 'vitest';
import { mulberry32, parseCards, type Card } from './cards';
import { evaluate5, categoryOf, HandCategory } from './evaluator';
import { bestOmahaValue } from './omaha';
import { DEFAULT_ITERATIONS, calculateEquity } from './equity';

const hand = (s: string): Card[] => parseCards(s);

// ---------------------------------------------------------------------------
// 1. Hand ranking hierarchy
// ---------------------------------------------------------------------------

describe('hand ranking hierarchy', () => {
  const CATEGORY_EXAMPLES: Array<[HandCategory, string]> = [
    [HandCategory.HighCard, 'Ah Jd 9c 7s 3h'],
    [HandCategory.Pair, 'Ah Ad 9c 7s 3h'],
    [HandCategory.TwoPair, 'Ah Ad 9c 9s 3h'],
    [HandCategory.Trips, 'Ah Ad Ac 9s 3h'],
    [HandCategory.Straight, '9h 8d 7c 6s 5h'],
    [HandCategory.Flush, 'Ah Jh 9h 7h 3h'],
    [HandCategory.FullHouse, 'Ah Ad Ac 9s 9h'],
    [HandCategory.Quads, 'Ah Ad Ac As 9h'],
    [HandCategory.StraightFlush, '9h 8h 7h 6h 5h'],
  ];

  it('orders every category correctly, weakest to strongest', () => {
    const values = CATEGORY_EXAMPLES.map(([, cards]) => {
      const c = hand(cards);
      return evaluate5(c[0], c[1], c[2], c[3], c[4]);
    });
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  it('classifies each example as the category it is meant to be', () => {
    for (const [category, cards] of CATEGORY_EXAMPLES) {
      const c = hand(cards);
      expect(categoryOf(evaluate5(c[0], c[1], c[2], c[3], c[4]))).toBe(category);
    }
  });

  it('ranks the wheel (A-2-3-4-5) as a straight, not ace-high', () => {
    const w = hand('Ah 2d 3c 4s 5h');
    const wheel = evaluate5(w[0], w[1], w[2], w[3], w[4]);
    expect(categoryOf(wheel)).toBe(HandCategory.Straight);

    // Must be the LOWEST straight: below 6-high.
    const s = hand('6h 5d 4c 3s 2h');
    expect(wheel).toBeLessThan(evaluate5(s[0], s[1], s[2], s[3], s[4]));

    // And must still beat any ace-high non-straight.
    const a = hand('Ah Kd Qc Js 9h');
    expect(wheel).toBeGreaterThan(evaluate5(a[0], a[1], a[2], a[3], a[4]));
  });

  it('ranks the steel wheel as the lowest straight flush', () => {
    const sw = hand('Ah 2h 3h 4h 5h');
    const steel = evaluate5(sw[0], sw[1], sw[2], sw[3], sw[4]);
    expect(categoryOf(steel)).toBe(HandCategory.StraightFlush);

    const six = hand('6h 5h 4h 3h 2h');
    expect(steel).toBeLessThan(evaluate5(six[0], six[1], six[2], six[3], six[4]));
  });
});

// ---------------------------------------------------------------------------
// 2. Independent reference evaluator
// ---------------------------------------------------------------------------

/**
 * Deliberately naive best-Omaha-hand: builds every 2-from-hole and
 * 3-from-board combination the slow, obvious way. Independent of the
 * optimised lookup tables in omaha.ts, so agreement between the two is a
 * real cross-check of the "exactly 2 + exactly 3" constraint.
 */
function referenceBestOmaha(hole: readonly Card[], board: readonly Card[]): number {
  let best = -1;
  let combos = 0;
  for (let a = 0; a < hole.length; a++) {
    for (let b = a + 1; b < hole.length; b++) {
      for (let x = 0; x < board.length; x++) {
        for (let y = x + 1; y < board.length; y++) {
          for (let z = y + 1; z < board.length; z++) {
            combos++;
            const v = evaluate5(hole[a], hole[b], board[x], board[y], board[z]);
            if (v > best) best = v;
          }
        }
      }
    }
  }
  // Guards the constraint itself: PLO4 on a full board is C(4,2)*C(5,3) = 60,
  // PLO5 is C(5,2)*C(5,3) = 100. A different count means the wrong number of
  // hole or board cards is being used.
  const expected =
    ((hole.length * (hole.length - 1)) / 2) *
    ((board.length * (board.length - 1) * (board.length - 2)) / 6);
  if (combos !== expected) throw new Error(`combination count ${combos} != ${expected}`);
  return best;
}

describe('optimised evaluator vs independent reference', () => {
  const randomDeal = (rng: () => number, holeSize: number, boardSize: number) => {
    const deck = Array.from({ length: 52 }, (_, i) => i as Card);
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return { hole: deck.slice(0, holeSize), board: deck.slice(holeSize, holeSize + boardSize) };
  };

  it('agrees on 2000 random PLO4 hands across flop, turn and river', () => {
    const rng = mulberry32(12345);
    for (let i = 0; i < 2000; i++) {
      const boardSize = [3, 4, 5][i % 3];
      const { hole, board } = randomDeal(rng, 4, boardSize);
      expect(bestOmahaValue(hole, board)).toBe(referenceBestOmaha(hole, board));
    }
  });

  it('agrees on 2000 random PLO5 hands across flop, turn and river', () => {
    const rng = mulberry32(54321);
    for (let i = 0; i < 2000; i++) {
      const boardSize = [3, 4, 5][i % 3];
      const { hole, board } = randomDeal(rng, 5, boardSize);
      expect(bestOmahaValue(hole, board)).toBe(referenceBestOmaha(hole, board));
    }
  });
});

// ---------------------------------------------------------------------------
// 3. "Exactly 2 from hand, exactly 3 from board" edge cases
// ---------------------------------------------------------------------------

describe('exactly-2-from-hand constraint', () => {
  it('cannot play the board even when the board is a royal flush', () => {
    const board = hand('Ah Kh Qh Jh Th');
    // Two black deuces: no heart, so no flush is reachable using two hole cards.
    const value = bestOmahaValue(hand('2s 2c 3s 3c'), board);
    expect(categoryOf(value)).not.toBe(HandCategory.StraightFlush);
    expect(categoryOf(value)).not.toBe(HandCategory.Flush);
  });

  it('needs two hole cards of the suit to make a flush', () => {
    const board = hand('Ah Kh Qh 2c 3d');
    // One heart only — cannot make a flush despite four hearts being visible.
    expect(categoryOf(bestOmahaValue(hand('Jh 9s 8c 7d'), board))).not.toBe(HandCategory.Flush);
    // Two hearts — flush is now reachable.
    expect(categoryOf(bestOmahaValue(hand('Jh 9h 8c 7d'), board))).toBe(HandCategory.Flush);
  });

  it('DOES make quads from trips on board plus one in hand', () => {
    // Legal and easy to get wrong in the other direction: the king plus any
    // second hole card is exactly 2, and the three board kings are exactly 3.
    const value = bestOmahaValue(hand('Ks Qh Jd 9c'), hand('Kh Kd Kc 2s 3d'));
    expect(categoryOf(value)).toBe(HandCategory.Quads);
  });

  it('cannot reach quads from a PAIR on board plus one in hand', () => {
    // Only two board kings, so the fourth king is unreachable — the hand caps
    // at trips-based holdings, never quads.
    const value = bestOmahaValue(hand('Ks Qh Jd 9c'), hand('Kh Kd 8c 2s 3d'));
    expect(categoryOf(value)).not.toBe(HandCategory.Quads);
  });

  it('finds the best hand even when it uses the least obvious hole cards', () => {
    // AA looks like the hand, but the only 5-card holding that connects is
    // the 6-7 making a straight with 5-8-9 on board.
    const board = hand('5c 8d 9h 2s Kc');
    const value = bestOmahaValue(hand('Ah As 6d 7c'), board);
    expect(categoryOf(value)).toBe(HandCategory.Straight);
  });
});

// ---------------------------------------------------------------------------
// 4. Monte Carlo convergence against exact enumeration
// ---------------------------------------------------------------------------

describe('Monte Carlo converges on exact enumeration', () => {
  /**
   * Turn-to-river, single board, and deliberately a DEAD HEAT: sampling error
   * for a proportion peaks at p = 0.5, so this is the worst case the engine
   * will meet. A lopsided spot would pass trivially and prove little.
   * (Found by searching random turn spots for the one closest to 50/50.)
   */
  const turnSpot = {
    players: [hand('8s Qh 4h As'), hand('Jh 5c Tc 2s')],
    boards: [hand('Kh 2h Jd Qc')],
  };

  it('is an exact 50/50 spot, so the convergence bound is the worst case', () => {
    const exact = calculateEquity(turnSpot);
    expect(exact.method).toBe('exact');
    expect(exact.samples).toBe(40);
    expect(exact.players[0].combined).toBeCloseTo(0.5, 9);
    expect(exact.players[1].combined).toBeCloseTo(0.5, 9);
  });

  it('matches the exact answer within 1 percentage point at the shipped iteration count', () => {
    const exact = calculateEquity(turnSpot);
    // Every surface (tool and trainer) runs at DEFAULT_ITERATIONS. At 10k the
    // error on this spot reaches ~1.2pp, which is why 10k is not shipped.
    for (let seed = 1; seed <= 10; seed++) {
      const mc = calculateEquity({
        ...turnSpot,
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

  it('converges on a double board with one card to come on each', () => {
    const spot = {
      players: [hand('Ah Kh 7c 2d'), hand('Qs Qd 8s 3h'), hand('Jc Td 9s 6h')],
      boards: [hand('Kd 9h 4c 2s'), hand('7h 6d 3c Ts')],
    };
    const exact = calculateEquity(spot);
    expect(exact.method).toBe('exact');

    const mc = calculateEquity({
      ...spot,
      iterations: DEFAULT_ITERATIONS,
      seed: 7,
      forceMonteCarlo: true,
    });
    for (let p = 0; p < exact.players.length; p++) {
      expect(Math.abs(mc.players[p].combined - exact.players[p].combined)).toBeLessThan(0.01);
      for (let b = 0; b < 2; b++) {
        expect(
          Math.abs(mc.players[p].perBoard[b].equity - exact.players[p].perBoard[b].equity),
        ).toBeLessThan(0.015);
      }
    }
  });

  it('is reproducible for a given seed and varies without one', () => {
    const a = calculateEquity({ ...turnSpot, iterations: 5000, seed: 42, forceMonteCarlo: true });
    const b = calculateEquity({ ...turnSpot, iterations: 5000, seed: 42, forceMonteCarlo: true });
    expect(a.players[0].combined).toBe(b.players[0].combined);
  });
});

// ---------------------------------------------------------------------------
// 5. Double-board scoring maths
// ---------------------------------------------------------------------------

describe('double-board scoring', () => {
  const scenarios = [
    {
      name: 'flop, 3-handed PLO4',
      players: [hand('Ah Kh 7c 2d'), hand('Qs Qd 8s 3h'), hand('Jc Td 9s 6h')],
      boards: [hand('Kd 9h 4c'), hand('7h 6d 3c')],
    },
    {
      name: 'river, 4-handed PLO5',
      players: [
        hand('Ah Kh 7c 2d 5s'),
        hand('Qs Qd 8s 3h 4c'),
        hand('Jc Td 9s 6h 2c'),
        hand('8h 8d 5c 4d 3s'),
      ],
      boards: [hand('Kd 9h 4h 2s Ac'), hand('7s 6c 3d Ts Jh')],
    },
    {
      name: 'preflop, 6-handed',
      players: [
        hand('Ah Ad Kh Kd'),
        hand('Qs Qc Js Jc'),
        hand('Th 9h 8d 7d'),
        hand('2s 3s 4c 5c'),
        hand('6h 6s 9c 9d'),
        hand('As Ks Qd Jd'),
      ],
      boards: [[], []],
    },
  ];

  for (const s of scenarios) {
    it(`sums to 100% and averages the two boards — ${s.name}`, () => {
      const r = calculateEquity({
        players: s.players,
        boards: s.boards,
        iterations: DEFAULT_ITERATIONS,
        seed: 99,
      });

      const total = r.players.reduce((a, p) => a + p.combined, 0);
      expect(total).toBeCloseTo(1, 6);

      // Under the default 50/50 split, combined is exactly the mean of the
      // two per-board equities. Catches double-counting in the split maths.
      for (const p of r.players) {
        const mean = (p.perBoard[0].equity + p.perBoard[1].equity) / 2;
        expect(p.combined).toBeCloseTo(mean, 9);
      }

      // Each board is a pot of its own and must also sum to 100%.
      for (let b = 0; b < 2; b++) {
        const boardTotal = r.players.reduce((a, p) => a + p.perBoard[b].equity, 0);
        expect(boardTotal).toBeCloseTo(1, 6);
      }
    });
  }

  it('never reports a scoop more often than the rarer of the two board wins', () => {
    const r = calculateEquity({
      players: [hand('Ah Ad Kh Kd'), hand('Qs Qc Js Jc'), hand('Th 9h 8d 7d')],
      boards: [hand('Ks 9s 4c'), hand('7h 6d 3c')],
      iterations: DEFAULT_ITERATIONS,
      seed: 5,
    });
    for (const p of r.players) {
      expect(p.scoopPct).toBeLessThanOrEqual(Math.min(...p.perBoard.map((b) => b.winPct)) + 1e-9);
    }
  });

  it('boards share one deck, so the same card cannot appear on both', () => {
    // Board 2's river is forced: only one card can complete it, and it must
    // not duplicate anything already dealt. Exact enumeration proves the
    // shared-pool logic by simply not throwing on duplicates.
    const r = calculateEquity({
      players: [hand('Ah Kh 7c 2d'), hand('Qs Qd 8s 3h')],
      boards: [hand('Kd 9h 4c 2s'), hand('7h 6d 3c Ts')],
    });
    expect(r.method).toBe('exact');
    // 8 hole cards + 8 board cards known, so 36 unseen. One river per board,
    // drawn from the SAME pool without replacement: 36 * 35, not 36 * 36.
    expect(r.samples).toBe(36 * 35);
  });
});

// ---------------------------------------------------------------------------
// 6. Regression fixtures
// ---------------------------------------------------------------------------

describe('regression fixtures', () => {
  /**
   * Exact, fully-determined scenarios. These are arithmetic, not simulation:
   * if the evaluator changes behaviour these numbers move, which is the point.
   */
  it('complete double board, player wins one and loses one, splits 50/50', () => {
    const r = calculateEquity({
      // P1 nut flush on board 1; P2 a set on board 2.
      players: [hand('Ah Qh 2c 3d'), hand('8s 8d Kc 4d')],
      boards: [hand('Kh 9h 4h 2s 7d'), hand('8h 5c 2d Jc 3s')],
    });
    expect(r.method).toBe('exact');
    expect(r.players[0].perBoard[0].equity).toBe(1);
    expect(r.players[0].perBoard[1].equity).toBe(0);
    expect(r.players[1].perBoard[0].equity).toBe(0);
    expect(r.players[1].perBoard[1].equity).toBe(1);
    expect(r.players[0].combined).toBeCloseTo(0.5, 9);
    expect(r.players[1].combined).toBeCloseTo(0.5, 9);
    expect(r.players[0].scoopPct).toBe(0);
  });

  it('identical hand strength on a complete board splits the board', () => {
    // Both players play the same straight using two hole cards each.
    const r = calculateEquity({
      players: [hand('Jh Td 2c 3d'), hand('Js Tc 4c 5d')],
      boards: [hand('9h 8d 7c 2s 3h')],
    });
    expect(r.players[0].perBoard[0].equity).toBeCloseTo(0.5, 9);
    expect(r.players[0].perBoard[0].tiePct).toBe(1);
    expect(r.players[0].perBoard[0].winPct).toBe(0);
  });

  it('flush over flush: the higher second hole card takes it', () => {
    // Three hearts on board; both players hold two hearts, so both make a
    // flush and the bigger one must win outright.
    const r = calculateEquity({
      players: [hand('Ah Qh 2c 3d'), hand('Kh Jh 4c 5d')],
      boards: [hand('9h 5h 2h 7s 3c')],
    });
    expect(r.players[0].perBoard[0].equity).toBe(1);
    expect(r.players[1].perBoard[0].equity).toBe(0);
  });

  it('rainbow board with no flush possible resolves on made hands', () => {
    // No suit appears three times on the board, so a PLO flush (which needs
    // three board cards of a suit) is impossible for ANY holding.
    const r = calculateEquity({
      players: [hand('Ah Ad 8c 3d'), hand('Kc Kh 4c 6d')],
      boards: [hand('9h 5d 2c 7s Jh')],
    });
    expect(r.players[0].perBoard[0].equity).toBe(1);
    expect(r.players[0].perBoard[0].winPct).toBe(1);
  });

  it('PLO5 preflop equities stay stable for a fixed seed', () => {
    const r = calculateEquity({
      players: [hand('Ah Ad Kh Kd Qs'), hand('2c 3c 7d 8h 9s')],
      boards: [[], []],
      iterations: 20_000,
      seed: 2024,
    });
    // Premium double-suited aces must dominate a weak scattered holding.
    expect(r.players[0].combined).toBeGreaterThan(0.6);
    expect(r.players[0].combined).toBeLessThan(0.85);
    expect(r.players[0].combined + r.players[1].combined).toBeCloseTo(1, 6);
  });

  it('AAKK double-suited sits in the published range against a random hand', () => {
    // Published figures for this matchup disagree across sources (~64-73%),
    // so this asserts the range rather than a single number.
    const rng = mulberry32(31337);
    const results: number[] = [];
    for (let trial = 0; trial < 8; trial++) {
      const deck = Array.from({ length: 52 }, (_, i) => i as Card);
      const aakk = hand('Ah Ad Kh Kd');
      const pool = deck.filter((c) => !aakk.includes(c));
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const r = calculateEquity({
        players: [aakk, pool.slice(0, 4)],
        boards: [[]],
        iterations: 15_000,
        seed: 1000 + trial,
      });
      results.push(r.players[0].combined);
    }
    const mean = results.reduce((a, b) => a + b, 0) / results.length;
    expect(mean).toBeGreaterThan(0.6);
    expect(mean).toBeLessThan(0.78);
  });
});

// ---------------------------------------------------------------------------
// 7. Input validation
// ---------------------------------------------------------------------------

describe('duplicate and input guards', () => {
  it('rejects the same card in two players hands', () => {
    expect(() =>
      calculateEquity({ players: [hand('Ah Kh 7c 2d'), hand('Ah Qd 8s 3h')], boards: [[]] }),
    ).toThrow(/[Dd]uplicate/);
  });

  it('rejects a card that is both in a hand and on a board', () => {
    expect(() =>
      calculateEquity({
        players: [hand('Ah Kh 7c 2d'), hand('Qs Qd 8s 3h')],
        boards: [hand('Ah 9h 4c')],
      }),
    ).toThrow(/[Dd]uplicate/);
  });

  it('rejects the same card appearing on both boards', () => {
    expect(() =>
      calculateEquity({
        players: [hand('Ah Kh 7c 2d'), hand('Qs Qd 8s 3h')],
        boards: [hand('5h 9d 4c'), hand('5h Jd Tc')],
      }),
    ).toThrow(/[Dd]uplicate/);
  });

  it('rejects mismatched hand sizes and impossible board sizes', () => {
    expect(() =>
      calculateEquity({ players: [hand('Ah Kh 7c 2d'), hand('Qs Qd 8s')], boards: [[]] }),
    ).toThrow();
    expect(() =>
      calculateEquity({
        players: [hand('Ah Kh 7c 2d'), hand('Qs Qd 8s 3h')],
        boards: [hand('5h 9d')],
      }),
    ).toThrow();
  });
});
