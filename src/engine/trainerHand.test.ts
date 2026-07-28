import { describe, expect, it } from 'vitest';
import { mulberry32 } from './cards';
import {
  advanceToHero,
  applyAction,
  dealHand,
  legalSizings,
  liveSeats,
  toCallFor,
  type HandConfig,
  type HandState,
} from './trainerHand';

const config: HandConfig = { playerCount: 4, variant: 4, ante: 6, doubleBoard: true };

const evenEquities = (n: number, boards = 2) =>
  Array.from({ length: n }, () => ({ combined: 1 / n, perBoard: Array(boards).fill(1 / n) }));

describe('dealHand', () => {
  it('starts on the flop with both boards dealt three cards', () => {
    const s = dealHand(config, mulberry32(1));
    expect(s.street).toBe('flop');
    expect(s.boards).toHaveLength(2);
    for (const b of s.boards) expect(b).toHaveLength(3);
  });

  it('deals every player a full hand with no duplicate cards anywhere', () => {
    for (let seed = 0; seed < 25; seed++) {
      const s = dealHand({ ...config, playerCount: 8, variant: 5 }, mulberry32(seed));
      const all = [...s.hands.flat(), ...s.boards.flat()];
      expect(all).toHaveLength(8 * 5 + 2 * 3);
      expect(new Set(all).size).toBe(all.length);
    }
  });

  it('posts antes into the pot and takes them off every stack', () => {
    const s = dealHand(config, mulberry32(2));
    expect(s.pot).toBe(6 * 4);
    for (const stack of s.stacks) expect(stack).toBe(94);
  });

  it('assigns the hero a random seat across hands', () => {
    const seats = new Set(
      Array.from({ length: 40 }, (_, i) => dealHand(config, mulberry32(i)).heroSeat),
    );
    expect(seats.size).toBeGreaterThan(1);
  });

  it('respects the single-board toggle', () => {
    const s = dealHand({ ...config, doubleBoard: false }, mulberry32(3));
    expect(s.boards).toHaveLength(1);
  });
});

describe('action rules', () => {
  it('offers only bets when first to act, and only raises when facing one', () => {
    const s = dealHand(config, mulberry32(4));
    expect(toCallFor(s, s.toAct!)).toBe(0);
    expect(legalSizings(s, s.toAct!).every((o) => o.kind === 'bet')).toBe(true);

    const bet = legalSizings(s, s.toAct!)[0];
    const after = applyAction(s, 'bet', bet.amount, bet.fraction);
    expect(toCallFor(after, after.toAct!)).toBeGreaterThan(0);
    expect(legalSizings(after, after.toAct!).every((o) => o.kind === 'raise')).toBe(true);
  });

  it('never offers a sizing larger than the acting stack', () => {
    const s = dealHand(config, mulberry32(5));
    for (const o of legalSizings(s, s.toAct!)) {
      expect(o.amount).toBeLessThanOrEqual(s.stacks[s.toAct!] + 1e-9);
    }
  });

  it('caps an opening bet at the size of the pot', () => {
    const s = dealHand(config, mulberry32(6));
    for (const o of legalSizings(s, s.toAct!)) {
      expect(o.amount).toBeLessThanOrEqual(s.pot + 1e-9);
    }
  });

  it('computes the pot-limit raise ladder without double-counting the bet', () => {
    // 4 players x 6bb ante = 24bb pot. First to act bets pot (24bb), so the
    // pot shows 48bb with 24bb outstanding. Hero calls 24 -> pot 72, and the
    // max raise increment equals that 72, i.e. raise to 24 + 72 = 96bb,
    // clamped to the 94bb stack. The 25/50/75% steps scale the increment.
    let s = dealHand(config, mulberry32(20));
    const openBet = legalSizings(s, s.toAct!).find((o) => o.fraction === 1)!;
    expect(openBet.amount).toBe(24);
    s = applyAction(s, 'bet', openBet.amount, 1);
    expect(s.pot).toBe(48);

    const seat = s.toAct!;
    expect(toCallFor(s, seat)).toBe(24);
    const byFraction = Object.fromEntries(
      legalSizings(s, seat).map((o) => [o.fraction, o.amount + s.committed[seat]]),
    );
    expect(byFraction[0.25]).toBeCloseTo(42, 6);
    expect(byFraction[0.5]).toBeCloseTo(60, 6);
    expect(byFraction[0.75]).toBeCloseTo(78, 6);
    expect(byFraction[1]).toBeCloseTo(94, 6); // 96 capped by the 94bb stack
  });

  it('never offers two sizings with the same amount', () => {
    for (let seed = 0; seed < 40; seed++) {
      let s = dealHand(config, mulberry32(seed));
      const open = legalSizings(s, s.toAct!);
      expect(new Set(open.map((o) => o.amount.toFixed(6))).size).toBe(open.length);
      s = applyAction(s, 'bet', open[open.length - 1].amount, 1);
      const facing = legalSizings(s, s.toAct!);
      expect(new Set(facing.map((o) => o.amount.toFixed(6))).size).toBe(facing.length);
    }
  });

  it('does not offer an all-in that only covers the call', () => {
    // Short stack facing a bet bigger than it: shoving IS calling.
    let s = dealHand(config, mulberry32(30));
    const open = legalSizings(s, s.toAct!).find((o) => o.fraction === 1)!;
    s = applyAction(s, 'bet', open.amount, 1);
    const seat = s.toAct!;
    s = { ...s, stacks: s.stacks.map((v, i) => (i === seat ? 10 : v)) };
    const call = toCallFor(s, seat);
    expect(call).toBe(10);
    for (const o of legalSizings(s, seat)) expect(o.amount).toBeGreaterThan(call);
  });

  it('reopens the action to players who already acted when someone raises', () => {
    let s = dealHand(config, mulberry32(7));
    s = applyAction(s, 'check', 0);
    const seatThatChecked = s.actions[0].seat;
    const bet = legalSizings(s, s.toAct!)[0];
    s = applyAction(s, 'bet', bet.amount, bet.fraction);
    expect(s.acted[seatThatChecked]).toBe(false);
  });

  it('ends the hand when everyone folds to one player', () => {
    let s = dealHand(config, mulberry32(8));
    const bet = legalSizings(s, s.toAct!)[0];
    s = applyAction(s, 'bet', bet.amount, bet.fraction);
    while (!s.complete) s = applyAction(s, 'fold', 0);
    expect(s.complete).toBe(true);
    expect(liveSeats(s)).toHaveLength(1);
  });
});

describe('street progression', () => {
  const checkThroughStreet = (start: HandState): HandState => {
    let s = start;
    const street = s.street;
    let guard = 0;
    while (!s.complete && s.street === street && guard++ < 20) s = applyAction(s, 'check', 0);
    return s;
  };

  it('advances both boards together when a street is checked through', () => {
    let s = dealHand(config, mulberry32(9));
    s = checkThroughStreet(s);
    expect(s.street).toBe('turn');
    for (const b of s.boards) expect(b).toHaveLength(4);

    s = checkThroughStreet(s);
    expect(s.street).toBe('river');
    for (const b of s.boards) expect(b).toHaveLength(5);
  });

  it('never deals a duplicate card across boards on later streets', () => {
    for (let seed = 0; seed < 20; seed++) {
      let s = dealHand(config, mulberry32(seed));
      s = checkThroughStreet(s);
      s = checkThroughStreet(s);
      const all = [...s.hands.flat(), ...s.boards.flat()];
      expect(new Set(all).size).toBe(all.length);
    }
  });

  it('completes the hand after the river betting closes', () => {
    let s = dealHand(config, mulberry32(10));
    s = checkThroughStreet(s);
    s = checkThroughStreet(s);
    s = checkThroughStreet(s);
    expect(s.complete).toBe(true);
    expect(s.showdownSeats.length).toBeGreaterThan(1);
  });

  it('is reproducible from the same seed', () => {
    const run = () => {
      let s = dealHand(config, mulberry32(99));
      s = checkThroughStreet(s);
      s = checkThroughStreet(s);
      return s.boards.map((b) => b.join(','));
    };
    expect(run()).toEqual(run());
  });
});

describe('advanceToHero', () => {
  it('stops on the hero and never acts for them', () => {
    for (let seed = 0; seed < 30; seed++) {
      const s0 = dealHand(config, mulberry32(seed));
      const s = advanceToHero(s0, evenEquities(4), mulberry32(seed));
      if (!s.complete && s.toAct !== null) expect(s.toAct).toBe(s.heroSeat);
      // The hero must not appear in the action log before their first turn.
      expect(s.actions.every((a) => a.seat !== s.heroSeat)).toBe(true);
    }
  });

  it('keeps the pot equal to the chips taken off the stacks', () => {
    for (let seed = 0; seed < 30; seed++) {
      const s0 = dealHand(config, mulberry32(seed));
      const s = advanceToHero(s0, evenEquities(4), mulberry32(seed));
      const contributed = s.stacks.reduce((acc, st) => acc + (94 - st), 0);
      expect(s.pot).toBeCloseTo(24 + contributed, 6);
    }
  });

  it('terminates rather than looping when opponents keep raising', () => {
    const strong = Array.from({ length: 4 }, () => ({ combined: 0.95, perBoard: [0.95, 0.95] }));
    const s0 = dealHand(config, mulberry32(11));
    const s = advanceToHero(s0, strong, mulberry32(11));
    expect(s.complete || s.toAct === s.heroSeat).toBe(true);
  });
});
