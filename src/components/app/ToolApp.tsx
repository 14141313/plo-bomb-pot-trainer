'use client';

/**
 * Phase 1 sandbox: table setup, card entry, live double-board equity, and
 * the facing-a-bet pot odds panel. Train and Review build on these pieces.
 */

import { useMemo, useState } from 'react';
import type { Card } from '@/engine/cards';
import { makeDeck } from '@/engine/cards';
import {
  ANTE_PRESETS,
  BET_FRACTIONS,
  antePot,
  betSize,
  effectiveStack,
  requiredEquityToCall,
} from '@/engine/betting';
import { useEquity } from '@/hooks/useEquity';
import { TrainerCard } from "@/components/TrainerCard";
import { CardPickerSheet } from '@/components/CardPickerSheet';
import { GAME_LABELS, HOLE_SIZES, type HoleSize } from '@/engine/bestHand';

export type Slot =
  | { kind: 'hand'; player: number; index: number }
  | { kind: 'board'; board: number; index: number };

export type Variant = HoleSize;

const emptyHands = (players: number, variant: Variant): (Card | null)[][] =>
  Array.from({ length: players }, () => Array<Card | null>(variant).fill(null));

const emptyBoards = (): (Card | null)[][] => [
  Array<Card | null>(5).fill(null),
  Array<Card | null>(5).fill(null),
];

/** Contiguous filled prefix of a board; null if there are gaps or 1-2 cards. */
function boardPrefix(board: (Card | null)[]): Card[] | null {
  const cards: Card[] = [];
  let ended = false;
  for (const c of board) {
    if (c === null) {
      ended = true;
    } else if (ended) {
      return null; // gap
    } else {
      cards.push(c);
    }
  }
  return cards.length === 1 || cards.length === 2 ? null : cards;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export interface ToolSeed {
  playerCount?: number;
  variant?: Variant;
  doubleBoard?: boolean;
  ante?: number;
  hands?: (Card | null)[][];
  boards?: (Card | null)[][];
  picker?: Slot | null;
  betFraction?: number | 'allin' | null;
}

/**
 * The Tool tab. `seed` pre-populates state so a design-capture route can
 * render a specific view; production passes nothing.
 */
export function ToolApp({ seed }: { seed?: ToolSeed } = {}) {
  const [playerCount, setPlayerCount] = useState(seed?.playerCount ?? 2);
  const [variant, setVariant] = useState<Variant>(seed?.variant ?? 4);
  const [doubleBoard, setDoubleBoard] = useState(seed?.doubleBoard ?? true);
  const [ante, setAnte] = useState(seed?.ante ?? 6);
  const [hands, setHands] = useState<(Card | null)[][]>(() => seed?.hands ?? emptyHands(2, 4));
  const [boards, setBoards] = useState<(Card | null)[][]>(() => seed?.boards ?? emptyBoards());
  const [picker, setPicker] = useState<Slot | null>(seed?.picker ?? null);
  const [betFraction, setBetFraction] = useState<number | 'allin' | null>(seed?.betFraction ?? null);
  const [potOverride, setPotOverride] = useState<number | null>(null);

  // The Tool is a scratchpad, not a table: seats are just P1..P8.
  const positions = Array.from({ length: playerCount }, (_, i) => `P${i + 1}`);
  const nBoards = doubleBoard ? 2 : 1;
  const stack = effectiveStack(ante);
  const defaultPot = antePot(ante, playerCount);
  const pot = potOverride ?? defaultPot;

  const usedCards = useMemo(() => {
    const s = new Set<Card>();
    for (const h of hands) for (const c of h) if (c !== null) s.add(c);
    for (const b of boards) for (const c of b) if (c !== null) s.add(c);
    return s;
  }, [hands, boards]);

  // Players with complete hands participate in the equity calc.
  const completePlayers = useMemo(
    () =>
      hands
        .map((h, i) => ({ index: i, cards: h.filter((c): c is Card => c !== null) }))
        .filter((p) => p.cards.length === variant),
    [hands, variant],
  );

  const activeBoards = useMemo(() => {
    const prefixes = boards.slice(0, nBoards).map(boardPrefix);
    return prefixes.every((p) => p !== null) ? (prefixes as Card[][]) : null;
  }, [boards, nBoards]);

  const equityEnabled = completePlayers.length >= 2 && activeBoards !== null;

  const { result, running, progress } = useEquity({
    players: completePlayers.map((p) => p.cards),
    boards: activeBoards ?? [],
    enabled: equityEnabled,
  });

  // Guard against a stale result while inputs are changing.
  const liveResult =
    result && result.players.length === completePlayers.length ? result : null;

  const allBoardsComplete =
    activeBoards !== null && activeBoards.every((b) => b.length === 5);

  const leaders = useMemo(() => {
    if (!liveResult) return [];
    return Array.from({ length: nBoards }, (_, b) => {
      let best = -1;
      let bestIdx = -1;
      for (let p = 0; p < liveResult.players.length; p++) {
        const eq = liveResult.players[p].perBoard[b]?.equity ?? 0;
        if (eq > best) {
          best = eq;
          bestIdx = p;
        }
      }
      return bestIdx;
    });
  }, [liveResult, nBoards]);

  function setSlot(slot: Slot, card: Card | null) {
    if (slot.kind === 'hand') {
      setHands((prev) =>
        prev.map((h, i) =>
          i === slot.player ? h.map((c, j) => (j === slot.index ? card : c)) : h,
        ),
      );
    } else {
      setBoards((prev) =>
        prev.map((b, i) =>
          i === slot.board ? b.map((c, j) => (j === slot.index ? card : c)) : b,
        ),
      );
    }
  }

  function advancePicker(slot: Slot) {
    const size = slot.kind === 'hand' ? variant : 5;
    const next = slot.index + 1;
    if (next < size) {
      setPicker({ ...slot, index: next });
    } else {
      setPicker(null);
    }
  }

  function handlePick(card: Card) {
    if (!picker) return;
    setSlot(picker, card);
    advancePicker(picker);
  }

  function drawFrom(pool: Card[]): Card {
    const i = Math.floor(Math.random() * pool.length);
    return pool.splice(i, 1)[0];
  }

  function dealHands() {
    // Draw outside the state updater: updaters must be pure (StrictMode
    // runs them twice, which double-drained the pool and dealt phantom 2♣s).
    const pool = makeDeck().filter((c) => !usedCards.has(c));
    const next = hands.map((h) => h.map((c) => (c !== null ? c : drawFrom(pool))));
    setHands(next);
  }

  // Both boards advance together, so street state is the shared minimum.
  const minFilled = Math.min(
    ...boards.slice(0, nBoards).map((b) => b.filter((c) => c !== null).length),
  );

  /** Cards on each board once the street is complete, and what precedes it. */
  const STREETS = [
    { street: 'flop' as const, size: 3, keep: 0 },
    { street: 'turn' as const, size: 4, keep: 3 },
    { street: 'river' as const, size: 5, keep: 4 },
  ];

  /**
   * Deal or re-deal a street. Re-dealing clears that street AND everything
   * after it — a new flop can't leave the old turn and river standing — then
   * redraws from a pool rebuilt off the cleared boards, so the cards being
   * replaced are available again.
   */
  function runStreet(size: number, keep: number) {
    const cleared = boards.map((b, i) =>
      i < nBoards ? b.map((c, j) => (j >= keep ? null : c)) : b,
    );
    const used = new Set<Card>();
    for (const h of hands) for (const c of h) if (c !== null) used.add(c);
    for (const b of cleared) for (const c of b) if (c !== null) used.add(c);
    // Same purity rule as dealHands: draw before setState, not inside it.
    const pool = makeDeck().filter((c) => !used.has(c));
    const next = cleared.map((b, i) =>
      i < nBoards ? b.map((c, j) => (c === null && j < size ? drawFrom(pool) : c)) : b,
    );
    setBoards(next);
  }

  function addPlayer() {
    if (playerCount >= 8) return;
    setPlayerCount(playerCount + 1);
    setHands([...hands, Array<Card | null>(variant).fill(null)]);
  }

  /** Remove one specific seat. Later seats renumber, so drop the picker. */
  function removePlayer(index: number) {
    if (playerCount <= 2) return;
    setPlayerCount(playerCount - 1);
    setHands(hands.filter((_, i) => i !== index));
    setPicker(null);
  }

  function endHand() {
    setHands(emptyHands(playerCount, variant));
    setBoards(emptyBoards());
    setPicker(null);
    setBetFraction(null);
    setPotOverride(null);
  }

  function changeVariant(v: Variant) {
    setVariant(v);
    setHands((prev) =>
      prev.map((h) => {
        const next = Array<Card | null>(v).fill(null);
        for (let i = 0; i < Math.min(h.length, v); i++) next[i] = h[i];
        return next;
      }),
    );
    setPicker(null);
  }

  const pickerLabel =
    picker === null
      ? ''
      : picker.kind === 'hand'
        ? `${positions[picker.player]} card ${picker.index + 1}`
        : `Board ${picker.board + 1}, card ${picker.index + 1}`;

  const heroBet =
    betFraction === null
      ? null
      : betFraction === 'allin'
        ? Math.min(stack, pot) // pot-limit: even all-in can't exceed pot for an opening bet
        : betSize(betFraction, pot, stack);
  const requiredEq =
    heroBet === null ? null : requiredEquityToCall(heroBet, pot + heroBet);

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <main className="max-w-3xl mx-auto px-3 py-4 flex flex-col gap-4">
        {/* Table setup */}
        <section className="rounded-xl bg-surface p-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
            <div className="flex rounded-lg overflow-hidden control-stroke border-line-2">
              {HOLE_SIZES.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => changeVariant(v)}
                  className={`px-2.5 py-1 text-sm font-medium ${
                    variant === v
                      ? 'bg-accent text-accent-fg'
                      : 'bg-transparent hover:bg-surface-2'
                  }`}
                >
                  {GAME_LABELS[v]}
                </button>
              ))}
            </div>

            <div className="flex rounded-lg overflow-hidden control-stroke border-line-2">
              {[
                { label: 'Double', value: true },
                { label: 'Single', value: false },
              ].map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setDoubleBoard(opt.value)}
                  className={`px-2.5 py-1 text-sm font-medium ${
                    doubleBoard === opt.value
                      ? 'bg-accent text-accent-fg'
                      : 'bg-transparent hover:bg-surface-2'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Ante</span>
            {ANTE_PRESETS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAnte(a)}
                className={`px-2.5 py-1 rounded-lg text-sm font-medium border ${
                  ante === a
                    ? 'bg-accent border-accent text-accent-fg'
                    : 'border-line-2 hover:bg-surface-2'
                }`}
              >
                {a}bb
              </button>
            ))}
            <span className="text-ink-3 ml-auto">
              Pot {defaultPot}bb · Stacks {stack}bb behind
            </span>
          </div>
        </section>

        {/* Boards */}
        <section className="rounded-[18px] bg-felt text-seat p-3 flex flex-col gap-3 shadow-[0_2px_4px_rgba(0,0,0,0.10),0_10px_30px_rgba(0,0,0,0.18)]">
          {Array.from({ length: nBoards }, (_, b) => (
            <div key={b} className="flex items-center gap-2">
              <span className="w-14 text-xs font-medium text-rail shrink-0">
                Board {b + 1}
              </span>
              <div className="flex gap-1.5 flex-1">
                {boards[b].map((card, i) => (
                  <TrainerCard
                    key={i}
                    card={card}
                    size="fluid"
                    active={picker?.kind === 'board' && picker.board === b && picker.index === i}
                    onClick={() => setPicker({ kind: 'board', board: b, index: i })}
                  />
                ))}
              </div>
            </div>
          ))}
          {/* One row, one button per street. Each stays live after dealing so
              a street can be re-run to see how the same hands play out. */}
          <div className="flex gap-2">
            {STREETS.map(({ street, size, keep }) => {
              const dealt = minFilled >= size;
              const available = minFilled >= keep;
              return (
                <button
                  key={street}
                  type="button"
                  disabled={!available}
                  onClick={() => runStreet(size, keep)}
                  className={`flex-1 text-sm px-2 py-2 rounded-lg font-semibold transition-colors ${
                    available
                      ? dealt
                        ? 'control-stroke border-accent text-accent-text hover:bg-accent/10'
                        : 'bg-accent hover:bg-accent/85 text-accent-fg'
                      : // Disabled: the stroke mutes too, not just the label.
                        // Fixed --edge rather than a mode-flipping line token,
                        // because the felt underneath is light in BOTH themes,
                        // so a flipping border would read dark and prominent in
                        // dark mode - the opposite of disabled.
                        'control-stroke border-edge text-edge cursor-not-allowed'
                  }`}
                >
                  {dealt ? 'Redeal' : 'Deal'} {street}
                </button>
              );
            })}
          </div>
          {!equityEnabled && (
            <p className="text-xs text-rail">
              {completePlayers.length < 2
                ? 'Enter at least two complete hands to see equity.'
                : 'Boards need 0, 3, 4, or 5 cards (no gaps) for equity.'}
            </p>
          )}
        </section>

        {/* Players */}
        <section className="nums flex flex-col gap-2">
          {hands.map((hand, p) => {
            const resultIdx = completePlayers.findIndex((cp) => cp.index === p);
            const pe = resultIdx >= 0 && liveResult ? liveResult.players[resultIdx] : null;
            return (
              <div
                key={p}
                className="rounded-[14px] bg-surface p-2.5 flex flex-wrap items-center gap-2"
              >
                <div className="w-9 shrink-0">
                  <div className="text-sm font-semibold">{positions[p]}</div>
                  <div className="text-[10px] text-ink-3">{stack}bb</div>
                </div>
                <div className="flex gap-1">
                  {hand.map((card, i) => (
                    <TrainerCard
                      key={i}
                      card={card}
                      size="sm"
                      active={picker?.kind === 'hand' && picker.player === p && picker.index === i}
                      onClick={() => setPicker({ kind: 'hand', player: p, index: i })}
                    />
                  ))}
                </div>
                {pe && (
                  <div className="ml-auto flex items-center gap-3 text-right text-xs tabular-nums">
                    {doubleBoard ? (
                      <>
                        <div>
                          <div className={leaders[0] === resultIdx ? 'font-bold text-leader' : ''}>
                            B1 {pct(pe.perBoard[0].equity)}
                          </div>
                          <div className={leaders[1] === resultIdx ? 'font-bold text-leader' : ''}>
                            B2 {pct(pe.perBoard[1]?.equity ?? 0)}
                          </div>
                        </div>
                        <div>
                          <div className="text-base font-bold">{pct(pe.combined)}</div>
                          <div className="text-[10px] text-ink-3">
                            scoop {pct(pe.scoopPct)}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div
                        className={`text-base font-bold ${leaders[0] === resultIdx ? 'text-leader' : ''}`}
                      >
                        {pct(pe.combined)}
                      </div>
                    )}
                  </div>
                )}

                {/* Remove is per-row: the seat you want gone is rarely the
                    last one in the list. */}
                <button
                  type="button"
                  onClick={() => removePlayer(p)}
                  disabled={playerCount <= 2}
                  aria-label={`Remove ${positions[p]}`}
                  title={`Remove ${positions[p]}`}
                  /* Square, matching the card height (h-8), and always flush
                     right. The equity block carries ml-auto when it exists, so
                     this only needs it when there is no equity yet. */
                  /* Same stroke and glyph colour as the empty card slots it
                     sits beside — line-2/ink-3 were too faint against the
                     row. */
                  className={`${pe ? 'ml-1' : 'ml-auto'} w-8 h-8 shrink-0 rounded-lg control-stroke border-edge text-edge hover:border-foreground hover:text-foreground hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed`}
                >
                  ×
                </button>
              </div>
            );
          })}

          {/* Seats are added here rather than picked up front, so the list
              grows where it is actually read. */}
          <button
            type="button"
            onClick={addPlayer}
            disabled={playerCount >= 8}
            className="py-2 rounded-xl control-stroke border-line-2 text-sm font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            + Add player
          </button>
        </section>

        {/* Equity status */}
        {equityEnabled && (
          <div className="text-xs text-ink-3 flex items-center gap-2">
            {running ? (
              <>
                <span className="inline-block w-24 h-1.5 rounded bg-surface-2 overflow-hidden">
                  <span
                    className="block h-full bg-accent transition-[width]"
                    style={{ width: `${progress * 100}%` }}
                  />
                </span>
                simulating…
              </>
            ) : liveResult ? (
              <span>
                {liveResult.method === 'exact'
                  ? `exact · ${liveResult.samples.toLocaleString()} runouts`
                  : `Monte Carlo · ${liveResult.samples.toLocaleString()} samples`}
              </span>
            ) : null}
          </div>
        )}

        {/* Facing a bet */}
        <section className="rounded-xl bg-surface p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              Facing a bet {allBoardsComplete ? '· pot odds check' : '· EV projection (cards to come)'}
            </h2>
            <label className="text-xs flex items-center gap-1 text-ink-3">
              Pot
              <input
                type="number"
                min={0}
                value={pot}
                onChange={(e) => setPotOverride(Number(e.target.value))}
                /* text-base on mobile: iOS Safari zooms the whole page when an
                   input's text is under 16px. */
                className="nums w-16 rounded control-stroke border-line-2 bg-transparent px-1 py-0.5 text-right text-base sm:text-xs"
              />
              bb
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            {BET_FRACTIONS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setBetFraction(f)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                  betFraction === f
                    ? 'bg-accent border-accent text-accent-fg'
                    : 'border-line-2 hover:bg-surface-2'
                }`}
              >
                {f * 100}%
              </button>
            ))}
            <button
              type="button"
              onClick={() => setBetFraction('allin')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                betFraction === 'allin'
                  ? 'bg-suit-hearts border-suit-hearts text-white'
                  : 'border-line-2 hover:bg-surface-2'
              }`}
            >
              All-in
            </button>
          </div>
          {heroBet !== null && requiredEq !== null && (
            <div className="text-sm flex flex-col gap-1.5">
              <p className="text-ink-2">
                Bet <strong>{heroBet.toFixed(1)}bb</strong> into {pot}bb → caller needs{' '}
                <strong>{pct(requiredEq)}</strong> equity
              </p>
              {liveResult && (
                <div className="flex flex-col gap-1">
                  {completePlayers.map((cp, i) => {
                    const pe = liveResult.players[i];
                    if (!pe) return null;
                    const call = pe.combined >= requiredEq;
                    return (
                      <div key={cp.index} className="flex items-center gap-2 text-xs">
                        <span className="w-14 font-medium">{positions[cp.index]}</span>
                        <span className="tabular-nums">{pct(pe.combined)} combined</span>
                        <span
                          className={`px-1.5 py-0.5 rounded font-semibold ${
                            call
                              ? 'bg-good-bg text-good-fg'
                              : 'bg-bad-bg text-bad-fg'
                          }`}
                        >
                          {call ? 'CALL ✓' : 'FOLD'}
                        </span>
                        {doubleBoard && pe.perBoard[1] && (
                          <span className="text-ink-3 tabular-nums">
                            (B1 {pct(pe.perBoard[0].equity)} / B2 {pct(pe.perBoard[1].equity)})
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Actions */}
        <div className="fixed bottom-0 inset-x-0 bg-surface/90 backdrop-blur">
          <div className="max-w-3xl mx-auto px-3 py-2.5 flex gap-2">
            <button
              type="button"
              onClick={dealHands}
              className="flex-1 py-2 rounded-lg bg-accent hover:bg-accent/85 active:scale-[0.96] transition-[colors,scale] text-accent-fg font-semibold text-sm"
            >
              Deal hands
            </button>
            <button
              type="button"
              onClick={endHand}
              className="flex-1 py-2 rounded-lg control-stroke border-line-2 hover:bg-surface-2 font-semibold text-sm"
            >
              End hand
            </button>
          </div>
        </div>
      </main>

      {picker && (
        <CardPickerSheet
          usedCards={usedCards}
          targetLabel={pickerLabel}
          onPick={handlePick}
          onClear={() => {
            setSlot(picker, null);
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
