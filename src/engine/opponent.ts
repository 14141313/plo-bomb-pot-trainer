/**
 * Equity-tiered opponent model for the Train area.
 *
 * Opponents are HONEST: their action reflects their real equity at the current
 * street. There is no bluff modeling, by design — the training signal is meant
 * to be about equity and EV, not about exploitability or bluff-catching.
 *
 * They are mostly deterministic with light randomization: the tier decides the
 * general action, while sizing choice and the tier boundaries themselves are
 * jittered so hands sitting on an edge don't always resolve the same way.
 */

import { BET_FRACTIONS } from './betting';

/** A decision the model can return. Sizing is a pot fraction, or 'allin'. */
export type OpponentAction =
  | { kind: 'check' }
  | { kind: 'fold' }
  | { kind: 'call' }
  | { kind: 'bet'; fraction: number }
  | { kind: 'raise'; fraction: number };

export interface OpponentView {
  /** Combined equity across both boards, 0..1. */
  combined: number;
  /** Per-board equity, 0..1 each. */
  perBoard: readonly number[];
  /** Players still in the hand (including this opponent). */
  livePlayers: number;
  /** Outstanding bet this opponent is facing, in bb (0 = first to act / checked to). */
  toCall: number;
  /** Total pot before this action, in bb. */
  pot: number;
}

/**
 * Equity tiers are expressed as a RATIO to an equal share of the pot
 * (1 / livePlayers), not as raw equity. 25% equity is strong 8-handed and
 * weak 3-handed; the ratio makes one set of thresholds work at every table
 * size.
 */
export const TIER_THRESHOLDS = {
  strong: 1.55,
  good: 1.15,
  marginal: 0.85,
} as const;

/** Jitter applied to tier boundaries so edge hands vary between hands. */
const BOUNDARY_JITTER = 0.08;

/**
 * A board this opponent has effectively locked up. Holding the nuts on one
 * board of a double board guarantees roughly half the pot, which is worth
 * more than the combined number alone implies — it can't be lost, so it
 * supports more aggression. Treated as a tier bump rather than folded into
 * the combined figure.
 */
const BOARD_LOCK_EQUITY = 0.85;

export type Tier = 'strong' | 'good' | 'marginal' | 'weak';

export function classifyTier(view: OpponentView, rng: () => number): Tier {
  const fairShare = 1 / view.livePlayers;
  let ratio = view.combined / fairShare;

  // Locking up one board is worth more than combined equity suggests.
  if (view.perBoard.some((e) => e >= BOARD_LOCK_EQUITY)) ratio *= 1.2;

  const jitter = () => (rng() - 0.5) * 2 * BOUNDARY_JITTER;
  if (ratio >= TIER_THRESHOLDS.strong + jitter()) return 'strong';
  if (ratio >= TIER_THRESHOLDS.good + jitter()) return 'good';
  if (ratio >= TIER_THRESHOLDS.marginal + jitter()) return 'marginal';
  return 'weak';
}

/**
 * Probability this opponent continues (calls or raises) against a bet.
 *
 * Used by the scorer to estimate the EV of hero's bets and raises. It mirrors
 * the tier logic in `decideAction` but returns a smooth probability instead of
 * sampling one action, so EV estimates don't jitter between renders.
 */
export function continueProbability(view: OpponentView): number {
  if (view.toCall <= 0) return 1;
  const price = view.toCall / (view.pot + view.toCall);
  const fairShare = 1 / view.livePlayers;
  let ratio = view.combined / fairShare;
  if (view.perBoard.some((e) => e >= BOARD_LOCK_EQUITY)) ratio *= 1.2;

  if (ratio >= TIER_THRESHOLDS.strong) return 1;
  if (view.combined < price) return ratio >= TIER_THRESHOLDS.good ? 0.15 : 0.02;
  // Priced in: how comfortably decides how often they continue.
  const margin = (view.combined - price) / Math.max(price, 1e-6);
  return Math.min(0.95, 0.5 + margin);
}

/** Pick one of the allowed pot fractions, weighted toward `centre`. */
function pickFraction(centre: number, rng: () => number): number {
  const idx = BET_FRACTIONS.indexOf(centre as (typeof BET_FRACTIONS)[number]);
  const base = idx >= 0 ? idx : BET_FRACTIONS.length - 1;
  // 60% the intended size, 40% one step either way — light unpredictability.
  const roll = rng();
  let choice = base;
  if (roll > 0.8) choice = Math.min(base + 1, BET_FRACTIONS.length - 1);
  else if (roll > 0.6) choice = Math.max(base - 1, 0);
  return BET_FRACTIONS[choice];
}

/**
 * Decide an opponent's action. `rng` is injected so hands are reproducible
 * in tests and replays.
 */
export function decideAction(view: OpponentView, rng: () => number): OpponentAction {
  const tier = classifyTier(view, rng);
  const facingBet = view.toCall > 0;

  if (!facingBet) {
    switch (tier) {
      case 'strong':
        // Mostly bets big; occasionally checks to disguise strength. This is
        // a slowplay, not a bluff — the hand is genuinely strong either way.
        return rng() < 0.15 ? { kind: 'check' } : { kind: 'bet', fraction: pickFraction(1, rng) };
      case 'good':
        return rng() < 0.35
          ? { kind: 'check' }
          : { kind: 'bet', fraction: pickFraction(0.5, rng) };
      case 'marginal':
        return rng() < 0.75 ? { kind: 'check' } : { kind: 'bet', fraction: pickFraction(0.25, rng) };
      case 'weak':
        return { kind: 'check' };
    }
  }

  // Facing a bet: compare equity against the pot odds being offered.
  const priceRequired = view.toCall / (view.pot + view.toCall);
  const hasOdds = view.combined >= priceRequired;

  switch (tier) {
    case 'strong':
      return rng() < 0.7 ? { kind: 'raise', fraction: pickFraction(0.75, rng) } : { kind: 'call' };
    case 'good':
      return hasOdds
        ? rng() < 0.15
          ? { kind: 'raise', fraction: pickFraction(0.5, rng) }
          : { kind: 'call' }
        : { kind: 'fold' };
    case 'marginal':
      return hasOdds ? { kind: 'call' } : { kind: 'fold' };
    case 'weak':
      // Only continues when the price is unmistakably right.
      return view.combined >= priceRequired * 1.25 ? { kind: 'call' } : { kind: 'fold' };
  }
}
