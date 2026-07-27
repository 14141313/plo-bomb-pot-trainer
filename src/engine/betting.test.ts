import { describe, expect, it } from 'vitest';
import {
  allInTo,
  antePot,
  betSize,
  callAmount,
  effectiveStack,
  maxRaiseTo,
  raiseTo,
  requiredEquityToCall,
} from './betting';

describe('ante and stacks', () => {
  it('deducts ante from the 100bb starting stack', () => {
    expect(effectiveStack(5)).toBe(95);
    expect(effectiveStack(10)).toBe(90);
  });

  it('builds the ante pot from all players', () => {
    expect(antePot(3, 8)).toBe(24);
    expect(antePot(10, 2)).toBe(20);
  });
});

describe('requiredEquityToCall', () => {
  it('matches bet/(pot+2*bet) for a fresh bet', () => {
    // Pot 10, villain bets 10 (pot now 20). Call 10 to win 30 => 33.3%.
    expect(requiredEquityToCall(10, 20)).toBeCloseTo(1 / 3, 10);
    // Half-pot bet: pot 10, bet 5 (pot 15). 5/(15+5) = 25%.
    expect(requiredEquityToCall(5, 15)).toBeCloseTo(0.25, 10);
  });

  it('returns 0 when there is nothing to call', () => {
    expect(requiredEquityToCall(0, 12)).toBe(0);
  });
});

describe('bet sizing', () => {
  it('caps opening bets at 100% pot (pot-limit, no overbet)', () => {
    expect(betSize(0.5, 24, 97)).toBe(12);
    expect(betSize(1, 24, 97)).toBe(24);
  });

  it('clamps to remaining stack when shallow', () => {
    expect(betSize(1, 200, 40)).toBe(40);
  });
});

describe('pot-limit raise', () => {
  // Canonical example: pot 10, villain bets 10, hero has committed 0.
  // Call = 10; pot after call = 10 + 10 + 10 = 30.
  // Max raise increment = 30 => raise TO 40.
  const state = { pot: 10, outstandingBet: 10, heroCommittedThisStreet: 0, heroStack: 200 };

  it('computes the classic pot-raise cap (raise to 3x bet + pot)', () => {
    expect(maxRaiseTo(state)).toBe(40);
  });

  it('scales the raise increment, not the pre-raise pot', () => {
    // 50% preset: increment = 15 => raise to 25 (NOT 10 + 0.5*20 = 20).
    expect(raiseTo(0.5, state)).toBe(25);
    expect(raiseTo(0.25, state)).toBe(17.5);
  });

  it('accounts for chips hero already committed this street', () => {
    // Hero bet 10, villain raised to 40 (pot before street was 10).
    // Call = 30; pot after call = 10 + 40 + 30 wait pot excludes street bets:
    // pot=10 (prev streets), outstanding=40, hero committed 10.
    // call = 30, potAfterCall = 10 + 40 + 30 = 80, max raise-to = 40 + 80 = 120.
    const s = { pot: 10, outstandingBet: 40, heroCommittedThisStreet: 10, heroStack: 300 };
    expect(maxRaiseTo(s)).toBe(120);
  });

  it('clamps the raise to effective stack (all-in)', () => {
    const s = { pot: 10, outstandingBet: 10, heroCommittedThisStreet: 0, heroStack: 25 };
    expect(maxRaiseTo(s)).toBe(25); // all-in short of the legal cap
    expect(allInTo(s)).toBe(25);
  });

  it('call amount is capped by stack', () => {
    const s = { pot: 10, outstandingBet: 50, heroCommittedThisStreet: 0, heroStack: 30 };
    expect(callAmount(s)).toBe(30);
  });
});
