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
import { CardBadge } from '@/components/CardBadge';
import { useEquity } from '@/hooks/useEquity';
import { ANTE_PRESETS } from '@/engine/betting';
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

const GRADE_STYLE: Record<Grade, string> = {
  A: 'bg-emerald-600 text-white',
  B: 'bg-lime-600 text-white',
  C: 'bg-amber-500 text-white',
  D: 'bg-orange-600 text-white',
  F: 'bg-red-600 text-white',
};

function GradePill({ grade }: { grade: Grade }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-bold ${GRADE_STYLE[grade]}`}>{grade}</span>
  );
}

export default function TrainerPage() {
  const [config, setConfig] = useState<HandConfig>({
    playerCount: 4,
    variant: 4,
    ante: 6,
    doubleBoard: true,
  });
  const [hand, setHand] = useState<HandState | null>(null);
  const [entries, setEntries] = useState<ReviewEntry[]>([]);
  const [session, setSession] = useState<CompletedHand[]>([]);
  /**
   * Equity is the answer to the question being asked, so it stays hidden
   * while a hand is live. Revealing is deliberate and resets every street,
   * so peeking is always an explicit choice rather than a default.
   */
  const [peeked, setPeeked] = useState(false);

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
      iterations: 10_000,
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
    setPeeked(false);
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
    const next = applyAction(hand, kind, amount, fraction);
    setHand(next);
    setPeeked(false); // re-hide for the next decision
    if (next.complete) recordSession(next, nextEntries);
  }

  const sessionGrade = averageGrade(
    session.flatMap((h) => h.entries.map((e) => e.grade)),
  );
  const sessionLoss = session.reduce((a, h) => a + h.evLoss, 0);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-4 flex flex-col gap-4 text-sm pb-28">
      <h1 className="text-lg font-bold">Trainer</h1>

      {!hand && (
        <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span>Players</span>
            {[4, 5, 6, 7, 8].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setConfig((c) => ({ ...c, playerCount: n }))}
                className={`px-2.5 py-1 rounded-lg font-medium border ${
                  config.playerCount === n
                    ? 'bg-amber-500 border-amber-500 text-white'
                    : 'border-zinc-300 dark:border-zinc-700'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg overflow-hidden border border-zinc-300 dark:border-zinc-700">
              {([4, 5] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setConfig((c) => ({ ...c, variant: v }))}
                  className={`px-3 py-1 font-medium ${
                    config.variant === v ? 'bg-amber-500 text-white' : 'bg-transparent'
                  }`}
                >
                  PLO{v}
                </button>
              ))}
            </div>
            <div className="flex rounded-lg overflow-hidden border border-zinc-300 dark:border-zinc-700">
              {[
                { label: 'Double board', value: true },
                { label: 'Single', value: false },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  onClick={() => setConfig((c) => ({ ...c, doubleBoard: o.value }))}
                  className={`px-3 py-1 font-medium ${
                    config.doubleBoard === o.value ? 'bg-amber-500 text-white' : 'bg-transparent'
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
                    ? 'bg-amber-500 border-amber-500 text-white'
                    : 'border-zinc-300 dark:border-zinc-700'
                }`}
              >
                {a}bb
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={startHand}
            className="mt-1 w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-white font-semibold"
          >
            Deal hand
          </button>
        </section>
      )}

      {hand && (
        <>
          <section className="rounded-xl bg-emerald-950 border border-emerald-900 p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-emerald-200">
              <span>
                {hand.street.toUpperCase()} · pot {hand.pot.toFixed(1)}bb
              </span>
              <span>
                You are {labels[hand.heroSeat]} · {hand.stacks[hand.heroSeat].toFixed(1)}bb behind
              </span>
            </div>
            {hand.boards.map((board, b) => (
              <div key={b} className="flex items-center gap-2">
                <span className="w-14 text-xs text-emerald-200 shrink-0">Board {b + 1}</span>
                <div className="flex gap-1.5 flex-1">
                  {board.map((c, i) => (
                    <CardBadge key={i} card={c} fluid />
                  ))}
                </div>
              </div>
            ))}
          </section>

          <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
            <div className="text-xs text-zinc-500 mb-2">Your hand</div>
            <div className="flex gap-1.5">
              {hand.hands[hand.heroSeat].map((c, i) => (
                <CardBadge key={i} card={c} />
              ))}
            </div>
            {heroEquity &&
              (hand.complete || peeked ? (
                <div className="mt-2 text-xs text-zinc-500">
                  Equity {(heroEquity.combined * 100).toFixed(1)}% combined
                  {hand.boards.length > 1 && (
                    <>
                      {' '}
                      ({heroEquity.perBoard.map((e) => `${(e * 100).toFixed(1)}%`).join(' / ')} per
                      board)
                    </>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setPeeked(true)}
                  className="mt-2 text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-300"
                >
                  Show equity
                </button>
              ))}
          </section>

          {!hand.complete && (
            <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
              {!heroTurn && (
                <div className="text-zinc-500 text-xs">
                  {running || !equities ? 'Calculating equity…' : 'Opponents acting…'}
                </div>
              )}
              {heroTurn && scored && (
                <>
                  <div className="text-xs text-zinc-500 mb-2">
                    {scored.toCall > 0
                      ? `Facing ${scored.toCall.toFixed(1)}bb into ${hand.pot.toFixed(1)}bb`
                      : 'Checked to you'}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {scored.toCall > 0 ? (
                      <>
                        <button
                          type="button"
                          onClick={() => act('fold', 0)}
                          className="px-3 py-2 rounded-lg bg-zinc-700 text-white font-medium"
                        >
                          Fold
                        </button>
                        <button
                          type="button"
                          onClick={() => act('call', scored.toCall)}
                          className="px-3 py-2 rounded-lg bg-emerald-700 text-white font-medium"
                        >
                          Call {scored.toCall.toFixed(1)}bb
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => act('check', 0)}
                        className="px-3 py-2 rounded-lg bg-zinc-700 text-white font-medium"
                      >
                        Check
                      </button>
                    )}
                    {scored.sizings.map((s) => (
                      <button
                        key={`${s.kind}-${s.fraction}-${s.amount}`}
                        type="button"
                        onClick={() => act(s.kind, s.amount, s.fraction)}
                        className="px-3 py-2 rounded-lg bg-amber-500 text-white font-medium"
                      >
                        {s.allIn ? (
                          <>All-in {s.amount.toFixed(1)}bb</>
                        ) : (
                          <>
                            {s.kind === 'bet' ? 'Bet' : 'Raise to'} {s.amount.toFixed(1)}bb
                            <span className="opacity-70 text-xs"> ({s.fraction * 100}%)</span>
                          </>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </section>
          )}

          {hand.complete && (
            <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 flex flex-col gap-3">
              <div className="font-semibold">Hand review</div>

              <div>
                <div className="text-xs text-zinc-500 mb-1">
                  Opponent hands (revealed now the hand is over)
                </div>
                <div className="flex flex-col gap-1.5">
                  {hand.hands.map((cards, seat) =>
                    seat === hand.heroSeat ? null : (
                      <div key={seat} className="flex items-center gap-2">
                        <span className="w-14 text-xs shrink-0">{labels[seat]}</span>
                        <div className="flex gap-1">
                          {cards.map((c, i) => (
                            <CardBadge key={i} card={c} size="sm" />
                          ))}
                        </div>
                        {hand.folded[seat] && (
                          <span className="text-xs text-zinc-500">folded</span>
                        )}
                      </div>
                    ),
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                {entries.map((e, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-2 text-xs flex flex-col gap-1"
                  >
                    <div className="flex items-center gap-2">
                      <GradePill grade={e.grade} />
                      <span className="uppercase text-zinc-500">{e.street}</span>
                      <span className="ml-auto text-zinc-500">
                        {(e.equity * 100).toFixed(1)}% equity · pot {e.pot.toFixed(1)}bb
                      </span>
                    </div>
                    <div>
                      You {e.chosen.kind}
                      {e.chosen.amount > 0 ? ` ${e.chosen.amount.toFixed(1)}bb` : ''} (EV{' '}
                      {e.chosen.ev.toFixed(2)}bb)
                    </div>
                    {e.evLoss > 0 ? (
                      <div className="text-amber-500">
                        Best was {e.best.kind}
                        {e.best.amount > 0 ? ` ${e.best.amount.toFixed(1)}bb` : ''} (EV{' '}
                        {e.best.ev.toFixed(2)}bb) — cost {e.evLoss.toFixed(2)}bb
                      </div>
                    ) : (
                      <div className="text-emerald-500">Optimal play</div>
                    )}
                  </div>
                ))}
                {entries.length === 0 && (
                  <div className="text-xs text-zinc-500">
                    No decisions to score — the hand ended before it reached you.
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={startHand}
                className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-white font-semibold"
              >
                Next hand
              </button>
              <button
                type="button"
                onClick={() => setHand(null)}
                className="w-full py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 font-medium"
              >
                Change setup
              </button>
            </section>
          )}
        </>
      )}

      {session.length > 0 && (
        <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-semibold">Session</span>
            {sessionGrade && <GradePill grade={sessionGrade} />}
            <span className="ml-auto text-xs text-zinc-500">
              {session.length} hand{session.length === 1 ? '' : 's'} · {sessionLoss.toFixed(2)}bb
              given up
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {session.map((h) => (
              <div key={h.id} className="flex items-center gap-2 text-xs">
                {h.grade && <GradePill grade={h.grade} />}
                <span className="text-zinc-500">
                  {h.entries.length} decision{h.entries.length === 1 ? '' : 's'}
                </span>
                <span className="ml-auto text-zinc-500">−{h.evLoss.toFixed(2)}bb</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">
            Session only — hands are not saved yet. Sign-in and history land with Supabase.
          </p>
        </section>
      )}
    </main>
  );
}
