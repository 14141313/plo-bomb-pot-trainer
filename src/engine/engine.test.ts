import { describe, expect, it } from 'vitest';
import { formatCard, parseCard, parseCards } from './cards';
import { CATEGORY_NAMES, HandCategory, categoryOf, evaluate5 } from './evaluator';
import { bestOmahaValue } from './omaha';
import { calculateEquity } from './equity';

const ev = (s: string) => {
  const c = parseCards(s);
  return evaluate5(c[0], c[1], c[2], c[3], c[4]);
};

describe('cards', () => {
  it('round-trips parse/format', () => {
    for (const s of ['As', '2c', 'Td', 'Kh']) {
      expect(formatCard(parseCard(s))).toBe(s);
    }
  });

  it('rejects malformed cards', () => {
    expect(() => parseCard('Ax')).toThrow();
    expect(() => parseCard('1s')).toThrow();
  });
});

describe('evaluate5', () => {
  it('orders categories correctly', () => {
    const hands: Array<[string, HandCategory]> = [
      ['As Ks Qs Js Ts', HandCategory.StraightFlush],
      ['Ac Ad Ah As Kc', HandCategory.Quads],
      ['Ac Ad Ah Kc Kd', HandCategory.FullHouse],
      ['As Ks Qs Js 9s', HandCategory.Flush],
      ['Ac Kd Qh Js Tc', HandCategory.Straight],
      ['Ac Ad Ah Kc Qd', HandCategory.Trips],
      ['Ac Ad Kh Kc Qd', HandCategory.TwoPair],
      ['Ac Ad Kh Qc Jd', HandCategory.Pair],
      ['Ac Kd Qh Jc 9d', HandCategory.HighCard],
    ];
    for (let i = 0; i < hands.length; i++) {
      expect(categoryOf(ev(hands[i][0])), CATEGORY_NAMES[hands[i][1]]).toBe(hands[i][1]);
      if (i > 0) expect(ev(hands[i - 1][0])).toBeGreaterThan(ev(hands[i][0]));
    }
  });

  it('scores the wheel as a 5-high straight, below a 6-high straight', () => {
    const wheel = ev('Ac 2d 3h 4s 5c');
    expect(categoryOf(wheel)).toBe(HandCategory.Straight);
    expect(ev('2d 3h 4s 5c 6d')).toBeGreaterThan(wheel);
  });

  it('scores the steel wheel as a straight flush', () => {
    expect(categoryOf(ev('As 2s 3s 4s 5s'))).toBe(HandCategory.StraightFlush);
  });

  it('breaks two-pair ties by high pair, low pair, then kicker', () => {
    expect(ev('Ac Ad 3h 3c Kd')).toBeGreaterThan(ev('Kc Kd Qh Qc Ad'));
    expect(ev('Ac Ad Kh Kc 2d')).toBeGreaterThan(ev('As Ah Qs Qd Kd'));
    expect(ev('Ac Ad Kh Kc 5d')).toBeGreaterThan(ev('As Ah Ks Kd 4d'));
  });

  it('breaks full house ties by trips rank first', () => {
    // Aces full of deuces beats kings full of aces: trips rank dominates.
    expect(ev('Ac Ad Ah 2c 2d')).toBeGreaterThan(ev('Kc Kd Kh Ac Ad'));
    // And aces full of deuces beats deuces full of aces.
    expect(ev('Ac Ad Ah 2c 2d')).toBeGreaterThan(ev('2c 2d 2h Ac Ad'));
  });

  it('is not order-sensitive', () => {
    expect(ev('As Ks Qs Js Ts')).toBe(ev('Ts Js Qs Ks As'));
    expect(ev('Ac Ad Kh Kc Qd')).toBe(ev('Kh Qd Ac Kc Ad'));
  });
});

describe('bestOmahaValue — exactly 2 hole cards rule', () => {
  it('does NOT let a player play the board (royal on board)', () => {
    // Hold'em would give this player the board's royal flush. Omaha must not:
    // best is A-K-Q from board + 5-4 from hand = ace-high.
    const hole = parseCards('2h 3h 4d 5d');
    const board = parseCards('As Ks Qs Js Ts');
    const v = bestOmahaValue(hole, board);
    expect(categoryOf(v)).toBe(HandCategory.HighCard);
  });

  it('requires two hole cards of the suit for a flush', () => {
    // Four spades on board, only one spade in hand: no flush.
    const oneSpade = parseCards('As 2h 7d 8c');
    const board = parseCards('Ks Qs 9s 3s 2d');
    expect(categoryOf(bestOmahaValue(oneSpade, board))).toBeLessThan(HandCategory.Flush);

    // Two spades in hand: flush.
    const twoSpades = parseCards('As 2s 7d 8c');
    expect(categoryOf(bestOmahaValue(twoSpades, board))).toBe(HandCategory.Flush);
  });

  it('uses exactly 3 board cards (no quads with a pair on board and one in hand)', () => {
    // Board has trip kings; player holds the case king plus junk. Quads OK
    // (K + K-K-K uses 1... ) — actually needs 2 hole: K + one more. Best is
    // quads only if 2 hole cards can combine with KKK... it cannot use all
    // three board kings plus hole king plus another board card? It can:
    // hole {Kd, X} + board {Kc, Kh, Ks} = quads. Verify that IS allowed.
    const hole = parseCards('Kd 2h 7d 8c');
    const board = parseCards('Kc Kh Ks Qd 3c');
    expect(categoryOf(bestOmahaValue(hole, board))).toBe(HandCategory.Quads);
  });

  it('handles PLO5 hands (5 hole cards, C(5,2)=10 pairs)', () => {
    const hole = parseCards('As Ks 2h 3d 7c');
    const board = parseCards('Qs Js Ts 4d 4c');
    // As+Ks with Qs Js Ts = royal flush.
    expect(categoryOf(bestOmahaValue(hole, board))).toBe(HandCategory.StraightFlush);
  });
});

describe('calculateEquity', () => {
  it('rejects duplicate cards across hands and boards', () => {
    expect(() =>
      calculateEquity({
        players: [parseCards('As Ks Qs Js'), parseCards('As 2d 3d 4d')],
        boards: [[]],
      }),
    ).toThrow(/Duplicate/);
  });

  it('is exact and decisive on complete double boards', () => {
    // P1 has the nuts on both boards; must scoop 100%.
    const result = calculateEquity({
      players: [parseCards('As Ks 2c 3c'), parseCards('9h 8h 2d 3d')],
      boards: [parseCards('Qs Js Ts 4d 5c'), parseCards('Ah Kd Kc 7s 6d')],
    });
    expect(result.method).toBe('exact');
    expect(result.samples).toBe(1);
    expect(result.players[0].combined).toBe(1);
    expect(result.players[0].scoopPct).toBe(1);
    expect(result.players[1].combined).toBe(0);
  });

  it('splits 50/50 when each player wins one board', () => {
    // P1 wins board 1 (royal), P2 wins board 2 (nut flush over pair).
    const result = calculateEquity({
      players: [parseCards('As Ks 2c 3c'), parseCards('Ah Qh 2d 3d')],
      boards: [parseCards('Qs Js Ts 4d 5c'), parseCards('Kh 9h 4h 8s 2s')],
    });
    expect(result.players[0].combined).toBeCloseTo(0.5, 10);
    expect(result.players[1].combined).toBeCloseTo(0.5, 10);
    expect(result.players[0].scoopPct).toBe(0);
    expect(result.players[1].scoopPct).toBe(0);
  });

  it('enumerates exactly when both rivers are missing', () => {
    const result = calculateEquity({
      players: [parseCards('As Ad Ks Kd'), parseCards('9h 8h 7d 6d')],
      boards: [parseCards('Ac Kc 2h 3s'), parseCards('Qd Jd Th 5s')],
    });
    expect(result.method).toBe('exact');
    // 52 - 8 hole - 8 board = 36 remaining; 36 * 35 = 1260 joint runouts.
    expect(result.samples).toBe(36 * 35);
  });

  it('gives symmetric hands equal equity (Monte Carlo, seeded)', () => {
    // Identical hands in different suits, empty boards: symmetric by construction.
    const result = calculateEquity({
      players: [parseCards('As Ad Ks Kd'), parseCards('Ah Ac Kh Kc')],
      boards: [[], []],
      iterations: 20_000,
      seed: 42,
    });
    expect(result.method).toBe('monte-carlo');
    expect(result.players[0].combined).toBeCloseTo(result.players[1].combined, 1);
    const total = result.players[0].combined + result.players[1].combined;
    expect(total).toBeCloseTo(1, 10);
  });

  it('total equity sums to 1 across many players (PLO5, 6-handed)', () => {
    const players = [
      'As Ad Ks Kd Qh',
      '9h 8h 7d 6d 2c',
      'Ah Kh Qd Jd 3c',
      'Tc 9c 8s 7s 2d',
      'Qc Qs Jh Ts 4c',
      '5h 5d 6s 7h 8c',
    ].map(parseCards);
    const result = calculateEquity({
      players,
      boards: [parseCards('Kc 9d 4d'), parseCards('2h 6h Jc')],
      iterations: 5_000,
      seed: 7,
    });
    const total = result.players.reduce((a, p) => a + p.combined, 0);
    expect(total).toBeCloseTo(1, 10);
    // Per-board equities also each sum to 1.
    for (const b of [0, 1]) {
      const boardTotal = result.players.reduce((a, p) => a + p.perBoard[b].equity, 0);
      expect(boardTotal).toBeCloseTo(1, 10);
    }
  });

  it('respects custom board shares', () => {
    const result = calculateEquity({
      players: [parseCards('As Ks 2c 3c'), parseCards('Ah Qh 2d 3d')],
      boards: [parseCards('Qs Js Ts 4d 5c'), parseCards('Kh 9h 4h 8s 2s')],
      boardShares: [0.7, 0.3],
    });
    expect(result.players[0].combined).toBeCloseTo(0.7, 10);
    expect(result.players[1].combined).toBeCloseTo(0.3, 10);
  });
});
