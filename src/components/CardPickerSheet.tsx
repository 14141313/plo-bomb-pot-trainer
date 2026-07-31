'use client';

/**
 * Bottom-sheet card picker: 13 ranks x 4 suits grid. Cards already used
 * anywhere on the table (any hand, either board) are disabled — duplicate
 * prevention lives here, at the point of entry.
 */

import type { Card } from '@/engine/cards';
import { RANKS, makeCard } from '@/engine/cards';
import { suitBgClass, suitSymbol, suitTextClass } from './TrainerCard';

/** Column order: spades, hearts, diamonds, clubs. */
const SUIT_ORDER = [3, 2, 1, 0] as const;

interface CardPickerSheetProps {
  /** Every card currently placed anywhere on the table. */
  usedCards: ReadonlySet<Card>;
  /** Label describing the slot being filled, e.g. "BTN card 3" or "Board 1 flop". */
  targetLabel: string;
  onPick: (card: Card) => void;
  onClear: () => void;
  onClose: () => void;
}

export function CardPickerSheet({
  usedCards,
  targetLabel,
  onPick,
  onClear,
  onClose,
}: CardPickerSheetProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
      <button
        type="button"
        aria-label="Close picker"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      {/* Four columns need far less width than thirteen, so the sheet goes
          back to a comfortable reading width and is capped on desktop rather
          than stretched. */}
      <div className="relative w-full sm:w-auto sm:min-w-[360px] sm:max-w-[420px] bg-surface rounded-t-2xl sm:rounded-2xl p-3 sm:p-4 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-ink-2">
            Pick: {targetLabel}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClear}
              className="text-xs px-2 py-1 rounded border border-line-2 text-ink-2 hover:bg-surface-2"
            >
              Clear slot
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-xs px-2 py-1 rounded border border-line-2 text-ink-2 hover:bg-surface-2"
            >
              Done
            </button>
          </div>
        </div>
        {/*
          Suits across, ranks down. Transposed from the original rank-across
          matrix because 13 columns cannot give a 40px-wide target on a phone
          (13x40 plus the label needs ~566px against a 375px viewport). Four
          columns leave roughly 80px per cell, so every target clears 40x40 in
          both dimensions; the cost is 13 rows, hence the scroll.
        */}
        <div className="grid grid-cols-[auto_repeat(4,minmax(0,1fr))] gap-1 max-h-[65vh] overflow-y-auto">
          <span aria-hidden />
          {SUIT_ORDER.map((suit) => (
            <span
              key={`head-${suit}`}
              className={`flex items-center justify-center text-lg leading-none pb-1 ${suitTextClass(suit)}`}
            >
              {suitSymbol(suit)}
            </span>
          ))}

          {Array.from({ length: 13 }, (_, i) => 12 - i).map((rank) => (
            <div key={rank} className="contents">
              <span className="flex items-center justify-center w-6 text-sm font-semibold text-ink-2">
                {RANKS[rank]}
              </span>
              {SUIT_ORDER.map((suit) => {
                const card = makeCard(rank, suit);
                const used = usedCards.has(card);
                return (
                  <button
                    key={suit}
                    type="button"
                    disabled={used}
                    onClick={() => onPick(card)}
                    aria-label={`${RANKS[rank]}${'cdhs'[suit]}`}
                    /* Filled suit colour, matching the cards themselves. The
                       column header and row label keep the grid unambiguous
                       even though the cells carry no glyph. */
                    className={`h-10 min-w-0 rounded text-sm font-bold transition-opacity
                      ${
                        used
                          ? 'bg-surface-2 text-edge cursor-not-allowed'
                          : `${suitBgClass(suit)} text-white hover:opacity-80`
                      }`}
                  >
                    {RANKS[rank]}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
