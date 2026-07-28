'use client';

/**
 * Bottom-sheet card picker: 13 ranks x 4 suits grid. Cards already used
 * anywhere on the table (any hand, either board) are disabled — duplicate
 * prevention lives here, at the point of entry.
 */

import type { Card } from '@/engine/cards';
import { RANKS, makeCard } from '@/engine/cards';
import { suitBgClass, suitSymbol, suitTextClass } from './TrainerCard';

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
      <div className="relative w-full sm:w-auto sm:min-w-[420px] bg-white dark:bg-zinc-900 rounded-t-2xl sm:rounded-2xl p-2 sm:p-4 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
            Pick: {targetLabel}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClear}
              className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Clear slot
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Done
            </button>
          </div>
        </div>
        <div className="grid grid-cols-[auto_repeat(13,minmax(0,1fr))] gap-0.5 sm:gap-1 overflow-x-auto">
          {([3, 2, 1, 0] as const).map((suit) => (
            <div key={suit} className="contents">
              <span
                className={`flex items-center justify-center w-5 sm:w-6 text-base sm:text-lg ${suitTextClass(suit)}`}
              >
                {suitSymbol(suit)}
              </span>
              {Array.from({ length: 13 }, (_, i) => 12 - i).map((rank) => {
                const card = makeCard(rank, suit);
                const used = usedCards.has(card);
                return (
                  <button
                    key={rank}
                    type="button"
                    disabled={used}
                    onClick={() => onPick(card)}
                    /* Filled suit colour, matching the cards themselves. The
                       row's suit symbol keeps the grid unambiguous even
                       though the cells carry no glyph. */
                    className={`h-10 sm:h-9 min-w-0 rounded text-xs sm:text-sm font-bold transition-opacity
                      ${
                        used
                          ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed'
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
