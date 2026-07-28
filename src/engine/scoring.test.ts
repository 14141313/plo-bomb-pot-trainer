import { describe, expect, it } from 'vitest';
import { mulberry32 } from './cards';
import { requiredEquityToCall } from './betting';
import {
  EV_FOLD,
  GRADE_BANDS,
  averageGrade,
  evAggressive,
  evCall,
  evCheck,
  gradeFor,
  scoreActions,
  scoreDecision,
} from './scoring';
import { classifyTier, decideAction, type OpponentView } from './opponent';

describe('EV primitives', () => {
  it('folding is worth zero future profit', () => {
    expect(EV_FOLD).toBe(0);
  });

  it('call EV is zero exactly at the pot-odds break-even point', () => {
    const pot = 100;
    const toCall = 50;
    const breakEven = requiredEquityToCall(toCall, pot);
    expect(breakEven).toBeCloseTo(1 / 3, 10);
    expect(evCall(breakEven, pot, toCall)).toBeCloseTo(0, 10);
  });

  it('call EV is positive above the break-even and negative below', () => {
    const pot = 100;
    const toCall = 50;
    expect(evCall(0.5, pot, toCall)).toBeGreaterThan(0);
    expect(evCall(0.2, pot, toCall)).toBeLessThan(0);
  });

  it('call EV matches the hand-computed value', () => {
    // 50% of a 120bb final pot, minus the 20bb paid to get there.
    expect(evCall(0.5, 100, 20)).toBeCloseTo(40, 10);
  });

  it('checking simply realises equity in the current pot', () => {
    expect(evCheck(0.25, 80)).toBeCloseTo(20, 10);
  });

  it('betting into opponents who always fold wins exactly the pot', () => {
    expect(evAggressive(0.3, 60, 30, [0, 0, 0])).toBeCloseTo(60, 10);
  });

  it('betting into a certain caller settles at equity in the bigger pot', () => {
    // One caller: final pot 60 + 30 + 30 = 120, hero paid 30.
    expect(evAggressive(0.5, 60, 30, [1])).toBeCloseTo(0.5 * 120 - 30, 10);
  });

  it('fold equity makes a bet more valuable than the same-equity check', () => {
    const equity = 0.3;
    const pot = 60;
    const bet = evAggressive(equity, pot, 30, [0.5, 0.5]);
    expect(bet).toBeGreaterThan(evCheck(equity, pot));
  });
});

describe('action scoring', () => {
  const sizings = [{ kind: 'bet' as const, amount: 30, fraction: 0.5 }];

  it('offers check and bet when first to act, never call or fold', () => {
    const actions = scoreActions(
      { equity: 0.4, pot: 60, toCall: 0, continueProbs: () => [0.5] },
      sizings,
    );
    const kinds = actions.map((a) => a.kind);
    expect(kinds).toContain('check');
    expect(kinds).toContain('bet');
    expect(kinds).not.toContain('call');
    expect(kinds).not.toContain('fold');
  });

  it('offers fold and call only when facing a bet', () => {
    const actions = scoreActions(
      { equity: 0.4, pot: 60, toCall: 20, continueProbs: () => [0.5] },
      [],
    );
    const kinds = actions.map((a) => a.kind);
    expect(kinds).toContain('fold');
    expect(kinds).toContain('call');
    expect(kinds).not.toContain('check');
  });

  it('scores a correct fold as zero EV loss', () => {
    // 5% equity facing a pot-sized bet is a trivial fold.
    const actions = scoreActions(
      { equity: 0.05, pot: 100, toCall: 50, continueProbs: () => [0.9] },
      [],
    );
    const foldIdx = actions.findIndex((a) => a.kind === 'fold');
    const score = scoreDecision(actions, foldIdx, 100);
    expect(score.evLoss).toBe(0);
    expect(score.grade).toBe('A');
  });

  it('penalises folding the best hand', () => {
    // 80% equity getting a cheap price: folding gives up a lot.
    const actions = scoreActions(
      { equity: 0.8, pot: 100, toCall: 20, continueProbs: () => [0.9] },
      [],
    );
    const foldIdx = actions.findIndex((a) => a.kind === 'fold');
    const score = scoreDecision(actions, foldIdx, 100);
    expect(score.evLoss).toBeGreaterThan(0);
    expect(score.grade).toBe('F');
  });

  it('never reports a negative EV loss', () => {
    const actions = scoreActions(
      { equity: 0.6, pot: 100, toCall: 20, continueProbs: () => [0.5] },
      [],
    );
    for (let i = 0; i < actions.length; i++) {
      expect(scoreDecision(actions, i, 100).evLoss).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('grades', () => {
  it('grades by share of pot, not raw bb', () => {
    // The same 3bb error grades differently against different pot sizes.
    expect(gradeFor(3, 24)).not.toBe(gradeFor(3, 400));
    expect(gradeFor(3, 400)).toBe('A');
  });

  it('assigns A to a perfect decision', () => {
    expect(gradeFor(0, 100)).toBe('A');
  });

  it('walks the bands in order as loss grows', () => {
    const seen = GRADE_BANDS.map((b) =>
      gradeFor(b.maxLossPctOfPot === Infinity ? 100 : b.maxLossPctOfPot * 100, 100),
    );
    expect(seen).toEqual(['A', 'B', 'C', 'D', 'F']);
  });

  it('averages grades GPA-style', () => {
    expect(averageGrade(['A', 'A'])).toBe('A');
    expect(averageGrade(['A', 'C'])).toBe('B');
    expect(averageGrade(['F', 'F', 'F'])).toBe('F');
    expect(averageGrade([])).toBeNull();
  });
});

describe('opponent model', () => {
  const base: OpponentView = {
    combined: 0.25,
    perBoard: [0.25, 0.25],
    livePlayers: 4,
    toCall: 0,
    pot: 100,
  };

  it('tiers by share of the pot, so table size matters', () => {
    const rng = mulberry32(1);
    // 30% equity is strong 8-handed but only marginal 3-handed.
    const eightHanded = classifyTier(
      { ...base, combined: 0.3, perBoard: [0.3, 0.3], livePlayers: 8 },
      rng,
    );
    const threeHanded = classifyTier(
      { ...base, combined: 0.3, perBoard: [0.3, 0.3], livePlayers: 3 },
      rng,
    );
    expect(eightHanded).toBe('strong');
    expect(threeHanded).toBe('weak');
  });

  it('treats a locked-up board as extra strength', () => {
    // Same combined equity, but one hand has a board sewn up. Chosen so the
    // promotion holds for every possible boundary jitter, not just one seed.
    for (let seed = 0; seed < 50; seed++) {
      const split = classifyTier(
        { ...base, combined: 0.36, perBoard: [0.95, 0.05], livePlayers: 4 },
        mulberry32(seed),
      );
      const even = classifyTier(
        { ...base, combined: 0.36, perBoard: [0.36, 0.36], livePlayers: 4 },
        mulberry32(seed),
      );
      expect(split).toBe('strong');
      expect(even).toBe('good');
    }
  });

  it('folds weak hands facing a bet and continues with strong ones', () => {
    const rng = mulberry32(3);
    const weak = decideAction(
      { ...base, combined: 0.02, perBoard: [0.02, 0.02], toCall: 50, pot: 100 },
      rng,
    );
    expect(weak.kind).toBe('fold');

    const strong = decideAction(
      { ...base, combined: 0.85, perBoard: [0.85, 0.85], toCall: 50, pot: 100 },
      rng,
    );
    expect(['call', 'raise']).toContain(strong.kind);
  });

  it('never bluffs: weak hands first to act always check', () => {
    for (let seed = 0; seed < 50; seed++) {
      const action = decideAction(
        { ...base, combined: 0.01, perBoard: [0.01, 0.01], toCall: 0 },
        mulberry32(seed),
      );
      expect(action.kind).toBe('check');
    }
  });

  it('only ever returns legal actions for the situation', () => {
    for (let seed = 0; seed < 100; seed++) {
      const rng = mulberry32(seed);
      const equity = rng();
      const firstToAct = decideAction(
        { ...base, combined: equity, perBoard: [equity, equity], toCall: 0 },
        rng,
      );
      expect(['check', 'bet']).toContain(firstToAct.kind);

      const facingBet = decideAction(
        { ...base, combined: equity, perBoard: [equity, equity], toCall: 30 },
        rng,
      );
      expect(['fold', 'call', 'raise']).toContain(facingBet.kind);
    }
  });
});
