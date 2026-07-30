'use client';

/**
 * Train area: play a bomb pot hand against equity-driven opponents and get
 * scored on every decision.
 *
 * Opponent hole cards are never rendered until the hand is over — the state
 * holds them (the engine needs them), but the review section is the only
 * place they reach the screen.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActionBar } from '@/components/ActionBar';
import { PokerTable, type SeatView } from '@/components/PokerTable';
import { useEquity } from '@/hooks/useEquity';
import { ANTE_PRESETS } from '@/engine/betting';
import { DEFAULT_ITERATIONS } from '@/engine/equity';
import { continueProbability } from '@/engine/opponent';
import { positionLabels } from '@/lib/positions';
import {
  averageGrade,
  scoreActions,
  scoreDecision,
  type DecisionScore,
  type Grade,
} from '@/engine/scoring';
import {
  advanceToHero,
  applyAction,
  dealHand,
  legalSizings,
  liveSeats,
  toCallFor,
  type HandConfig,
  type HandState,
  type Street,
} from '@/engine/trainerHand';

interface ReviewEntry extends DecisionScore {
  street: Street;
  pot: number;
  equity: number;
  perBoard: readonly number[];
}

interface CompletedHand {
  id: number;
  entries: ReviewEntry[];
  grade: Grade | null;
  evLoss: number;
}

/**
 * The trainer table is laid out for a fixed ring for now — a precise oval
 * beats a layout that has to stretch from 2 to 8 seats. The Tool tab keeps
 * variable player counts.
 */
export const TRAINER_PLAYER_COUNT = 7;

/**
 * One lightness and one chroma percentage across all five, with only the hue
 * sweeping green -> red. That makes A-F read as a single graduated scale
 * rather than five unrelated colours, and keeps white text legible at every
 * step (measured 5.2:1 to 6.1:1).
 */
const GRADE_STYLE: Record<Grade, string> = {
  A: 'bg-grade-a text-white',
  B: 'bg-grade-b text-white',
  C: 'bg-grade-c text-white',
  D: 'bg-grade-d text-white',
  F: 'bg-grade-f text-white',
};

function GradePill({ grade }: { grade: Grade }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-bold ${GRADE_STYLE[grade]}`}>{grade}</span>
  );
}

export default function TrainerPage() {
  const [config, setConfig] = useState<HandConfig>({
    playerCount: TRAINER_PLAYER_COUNT,
    variant: 4,
    ante: 6,
    doubleBoard: true,
  });
  const [hand, setHand] = useState<HandState | null>(null);
  const [entries, setEntries] = useState<ReviewEntry[]>([]);
  const [session, setSession] = useState<CompletedHand[]>([]);
  /**
   * The street on which the hero last acted. Equity is revealed only for that
   * street, and only while the hero has no pending decision — so it appears
   * right after an action but never before one, on any street.
   */
  const [actedOn, setActedOn] = useState<Street | null>(null);

  const labels = positionLabels(config.playerCount);

  // Equity is computed among LIVE players only. Including folded hands would
  // dilute everyone's share and make the remaining opponents look weaker than
  // they are, which corrupts both the displayed equity and the scoring.
  const live = useMemo(() => (hand ? liveSeats(hand) : []), [hand]);

  const equityInput = useMemo(
    () => ({
      players: hand ? live.map((i) => hand.hands[i]) : [],
      boards: hand ? hand.boards : [],
      enabled: hand !== null && !hand.complete && live.length >= 2,
      // 20k, not 10k: at a genuinely 50/50 spot the sampling error at 10k
      // reaches ~1.2pp, which misses the 1pp accuracy bar the equity engine
      // is validated against. Scoring reads off these numbers.
      iterations: DEFAULT_ITERATIONS,
    }),
    [hand, live],
  );
  const { result, running } = useEquity(equityInput);

  /** Seat-indexed equities; folded seats read zero. */
  const equities = useMemo(() => {
    if (!hand || !result || result.players.length !== live.length) return null;
    const bySeat = hand.hands.map(() => ({
      combined: 0,
      perBoard: hand.boards.map(() => 0) as number[],
    }));
    live.forEach((seat, k) => {
      const p = result.players[k];
      bySeat[seat] = { combined: p.combined, perBoard: p.perBoard.map((b) => b.equity) };
    });
    return bySeat;
  }, [hand, result, live]);

  /** Add a finished hand to the session log. Idempotent on hand id. */
  const recordSession = useCallback((finished: HandState, scoredEntries: ReviewEntry[]) => {
    if (scoredEntries.length === 0) return;
    setSession((prev) =>
      prev.some((h) => h.id === finished.seed)
        ? prev
        : [
            {
              id: finished.seed,
              entries: scoredEntries,
              grade: averageGrade(scoredEntries.map((e) => e.grade)),
              evLoss: scoredEntries.reduce((a, e) => a + e.evLoss, 0),
            },
            ...prev,
          ],
    );
  }, []);

  // Let opponents act once equity for this street is known. Runs on a timer
  // rather than synchronously so the table reads as opponents thinking, and
  // so this effect doesn't cascade renders.
  useEffect(() => {
    if (!hand || hand.complete || equities === null) return;
    if (hand.toAct === null || hand.toAct === hand.heroSeat) return;
    const timer = setTimeout(() => {
      const next = advanceToHero(hand, equities, () => Math.random());
      setHand(next);
      if (next.complete) recordSession(next, entries);
    }, 450);
    return () => clearTimeout(timer);
  }, [hand, equities, entries, recordSession]);

  const startHand = useCallback(() => {
    setHand(dealHand(config, () => Math.random()));
    setEntries([]);
    setActedOn(null);
  }, [config]);

  const heroEquity = hand && equities ? equities[hand.heroSeat] : null;
  const heroTurn =
    hand !== null && !hand.complete && hand.toAct === hand.heroSeat && heroEquity !== null;

  // Score every action available to the hero right now.
  const scored = useMemo(() => {
    if (!hand || !heroTurn || !heroEquity || !equities) return null;
    const seat = hand.heroSeat;
    const toCall = toCallFor(hand, seat);
    const sizings = legalSizings(hand, seat);
    const others = liveSeats(hand).filter((i) => i !== seat);
    const actions = scoreActions(
      {
        equity: heroEquity.combined,
        pot: hand.pot,
        toCall,
        continueProbs: (amount) =>
          others.map((i) =>
            continueProbability({
              combined: equities[i].combined,
              perBoard: equities[i].perBoard,
              livePlayers: others.length + 1,
              toCall: amount,
              pot: hand.pot,
            }),
          ),
      },
      sizings,
    );
    return { actions, sizings, toCall };
  }, [hand, heroTurn, heroEquity, equities]);

  function act(kind: 'fold' | 'check' | 'call' | 'bet' | 'raise', amount: number, fraction?: number) {
    if (!hand || !scored || !heroEquity) return;
    const idx = scored.actions.findIndex(
      (a) => a.kind === kind && Math.abs(a.amount - amount) < 1e-9,
    );
    let nextEntries = entries;
    if (idx >= 0) {
      const score = scoreDecision(scored.actions, idx, hand.pot);
      nextEntries = [
        ...entries,
        {
          ...score,
          street: hand.street,
          pot: hand.pot,
          equity: heroEquity.combined,
          perBoard: heroEquity.perBoard,
        },
      ];
      setEntries(nextEntries);
    }
    setActedOn(hand.street);
    const next = applyAction(hand, kind, amount, fraction);
    setHand(next);
    if (next.complete) recordSession(next, nextEntries);
  }

  /**
   * Seats for the table graphic. Opponent cards are passed only once the hand
   * is over — revealing them at their seat, the way a real showdown works,
   * rather than in a separate list.
   */
  const seatViews: SeatView[] = useMemo(() => {
    if (!hand) return [];
    const btnSeat = labels.indexOf('BTN');
    return hand.hands.map((cards, seat) => ({
      seat,
      label: labels[seat],
      stack: hand.stacks[seat],
      committed: hand.committed[seat],
      folded: hand.folded[seat],
      isHero: seat === hand.heroSeat,
      isDealer: seat === btnSeat,
      toAct: hand.toAct === seat && !hand.complete,
      // Real showdown convention: only hands that got there are turned over.
      // Mucked hands stay down, which also keeps 7 seats of cards legible.
      cards:
        seat === hand.heroSeat || (hand.complete && !hand.folded[seat]) ? cards : null,
    }));
  }, [hand, labels]);

  const sessionGrade = averageGrade(
    session.flatMap((h) => h.entries.map((e) => e.grade)),
  );
  const sessionLoss = session.reduce((a, h) => a + h.evLoss, 0);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-4 flex flex-col gap-4 text-sm pb-28">
      <h1 className="text-lg font-bold">Trainer</h1>

      {!hand && (
        <section className="rounded-xl border border-line p-3 flex flex-col gap-3">
          <div className="text-xs text-ink-3">
            Trainer is fixed at {TRAINER_PLAYER_COUNT}-handed for now.
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg overflow-hidden border border-line-2">
              {([4, 5] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setConfig((c) => ({ ...c, variant: v }))}
                  className={`px-3 py-1 font-medium ${
                    config.variant === v ? 'bg-accent text-accent-fg' : 'bg-transparent'
                  }`}
                >
                  PLO{v}
                </button>
              ))}
            </div>
            <div className="flex rounded-lg overflow-hidden border border-line-2">
              {[
                { label: 'Double board', value: true },
                { label: 'Single', value: false },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  onClick={() => setConfig((c) => ({ ...c, doubleBoard: o.value }))}
                  className={`px-3 py-1 font-medium ${
                    config.doubleBoard === o.value ? 'bg-accent text-accent-fg' : 'bg-transparent'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span>Ante</span>
            {ANTE_PRESETS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setConfig((c) => ({ ...c, ante: a }))}
                className={`px-2.5 py-1 rounded-lg font-medium border ${
                  config.ante === a
                    ? 'bg-accent border-accent text-accent-fg'
                    : 'border-line-2'
                }`}
              >
                {a}bb
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={startHand}
            className="mt-1 w-full py-2.5 rounded-lg bg-accent hover:bg-accent/85 text-accent-fg font-semibold"
          >
            Deal hand
          </button>
        </section>
      )}

      {hand && (
        <>
          <PokerTable
            seats={seatViews}
            pot={hand.pot}
            heroSeat={hand.heroSeat}
            boards={hand.boards}
            inHand={!hand.complete}
            handSize={config.variant}
          />

          <div className="flex items-center justify-between text-xs text-ink-3">
            {/* Natural case in the data, presentation in CSS, so copy never
                has to be rewritten for a restyle. */}
            <span className="uppercase tracking-wide">{hand.street}</span>
            {/* Equity is the answer to the question being asked, so it is
                never shown while a decision is open — including the moment a
                new street is dealt and opponents act before the hero. */}
            {heroEquity && !heroTurn && (hand.complete || actedOn === hand.street) && (
              <span className="nums">
                Equity {(heroEquity.combined * 100).toFixed(1)}%
                {hand.boards.length > 1 && (
                  <> ({heroEquity.perBoard.map((e) => `${(e * 100).toFixed(1)}%`).join(' / ')})</>
                )}
              </span>
            )}
          </div>

          {!hand.complete && (
            <section>
              {!heroTurn && (
                <div className="text-ink-3 text-xs py-3 text-center">
                  {running || !equities ? 'Calculating equity…' : 'Opponents acting…'}
                </div>
              )}
              {heroTurn && scored && (
                <>
                  <div className="text-xs text-ink-3 mb-2">
                    {scored.toCall > 0
                      ? `Facing ${scored.toCall.toFixed(1)}bb into ${hand.pot.toFixed(1)}bb`
                      : 'Checked to you'}
                  </div>
                  <ActionBar
                    toCall={scored.toCall}
                    sizings={scored.sizings}
                    onFold={() => act('fold', 0)}
                    onCheck={() => act('check', 0)}
                    onCall={() => act('call', scored.toCall)}
                    onSize={(s) => act(s.kind, s.amount, s.fraction)}
                  />
                </>
              )}
            </section>
          )}

          {hand.complete && (
            <section className="rounded-xl border border-line p-3 flex flex-col gap-3">
              <div className="font-semibold">Hand review</div>

              <div className="text-xs text-ink-3">
                Hands that reached showdown are revealed at their seats above;
                folded hands are mucked.
              </div>

              <div className="flex flex-col gap-2">
                {entries.map((e, i) => (
                  <div
                    key={i}
                    className="nums rounded-lg border border-line p-2 text-xs flex flex-col gap-1"
                  >
                    <div className="flex items-center gap-2">
                      <GradePill grade={e.grade} />
                      <span className="uppercase tracking-wide text-ink-3">{e.street}</span>
                      <span className="ml-auto text-ink-3 nums">
                        {(e.equity * 100).toFixed(1)}% equity · pot {e.pot.toFixed(1)}bb
                      </span>
                    </div>
                    <div>
                      You {e.chosen.kind}
                      {e.chosen.amount > 0 ? ` ${e.chosen.amount.toFixed(1)}bb` : ''} (EV{' '}
                      {e.chosen.ev.toFixed(2)}bb)
                    </div>
                    {e.evLoss > 0 ? (
                      <div className="text-accent">
                        Best was {e.best.kind}
                        {e.best.amount > 0 ? ` ${e.best.amount.toFixed(1)}bb` : ''} (EV{' '}
                        {e.best.ev.toFixed(2)}bb) — cost {e.evLoss.toFixed(2)}bb
                      </div>
                    ) : (
                      <div className="text-good-fg">Optimal play</div>
                    )}
                  </div>
                ))}
                {entries.length === 0 && (
                  <div className="text-xs text-ink-3">
                    No decisions to score — the hand ended before it reached you.
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={startHand}
                className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent/85 text-accent-fg font-semibold"
              >
                Next hand
              </button>
              <button
                type="button"
                onClick={() => setHand(null)}
                className="w-full py-2 rounded-lg border border-line-2 font-medium"
              >
                Change setup
              </button>
            </section>
          )}
        </>
      )}

      {session.length > 0 && (
        <section className="nums rounded-xl border border-line p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-semibold">Session</span>
            {sessionGrade && <GradePill grade={sessionGrade} />}
            <span className="ml-auto text-xs text-ink-3">
              {session.length} hand{session.length === 1 ? '' : 's'} · {sessionLoss.toFixed(2)}bb
              given up
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {session.map((h) => (
              <div key={h.id} className="flex items-center gap-2 text-xs">
                {h.grade && <GradePill grade={h.grade} />}
                <span className="text-ink-3">
                  {h.entries.length} decision{h.entries.length === 1 ? '' : 's'}
                </span>
                <span className="ml-auto text-ink-3">−{h.evLoss.toFixed(2)}bb</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-ink-3">
            Session only — hands are not saved yet. Sign-in and history land with Supabase.
          </p>
        </section>
      )}
    </main>
  );
}
