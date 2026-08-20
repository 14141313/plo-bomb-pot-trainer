'use client';

/**
 * Bottom-sheet card picker: 13 ranks x 4 suits grid. Cards already used
 * anywhere on the table (any hand, either board) are disabled — duplicate
 * prevention lives here, at the point of entry.
 */

import { useEffect, useRef } from 'react';
import type { Card } from '@/engine/cards';
import { RANKS, makeCard } from '@/engine/cards';
import { suitBgClass, suitSymbol, suitTextClass } from './TrainerCard';

/**
 * Standard modal keyboard contract: focus moves in on open, Tab cycles inside
 * the sheet, Escape closes, and focus returns to whatever opened it.
 *
 * Without the trap, focus stayed on the trigger behind the scrim and reaching
 * the grid took 29 tab stops through content the user cannot see. The trap is
 * what makes `aria-modal` honest — it is why the background does not also need
 * `inert`, which would be awkward here since the sheet renders inside `main`.
 */
function useModalKeyboard(ref: React.RefObject<HTMLDivElement | null>, onClose: () => void) {
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );

    focusables()[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      // Wrap at both ends, and pull focus back in if it escaped entirely.
      if (e.shiftKey && (active === first || !ref.current?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !ref.current?.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, [ref, onClose]);
}

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
  const sheetRef = useRef<HTMLDivElement>(null);
  useModalKeyboard(sheetRef, onClose);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Pick a card for ${targetLabel}`}
      className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center"
    >
      {/* Scrim is not a tab stop: Escape and the Done button close the sheet,
          and a focusable scrim would sit between the trigger and the grid. */}
      <div aria-hidden="true" className="absolute inset-0 bg-black/40" onClick={onClose} />
      {/* Four columns need far less width than thirteen, so the sheet goes
          back to a comfortable reading width and is capped on desktop rather
          than stretched. */}
      {/* Flex column capped to the viewport: the grid below takes whatever
          height is left, so the deck shows in full when it fits and only
          scrolls on genuinely short screens. dvh, not vh, so mobile Safari's
          collapsing address bar doesn't cause a phantom overflow. */}
      <div ref={sheetRef} className="relative w-full sm:w-auto sm:min-w-[360px] sm:max-w-[420px] max-h-[96dvh] flex flex-col bg-surface rounded-t-2xl sm:rounded-2xl p-3 sm:p-4 shadow-xl">
        <div className="flex items-center justify-between mb-3 shrink-0">
          <span className="text-sm font-medium text-ink-2">
            Pick: {targetLabel}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClear}
              className="text-xs px-2 py-1 rounded control-stroke border-line-2 text-ink-2 hover:bg-surface-2"
            >
              Clear slot
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-xs px-2 py-1 rounded control-stroke border-line-2 text-ink-2 hover:bg-surface-2"
            >
              Done
            </button>
          </div>
        </div>
        {/*
          Suits across, ranks down. Transposed from the original rank-across
          matrix because 13 columns cannot give a 40px-wide target on a phone
          (13x40 needs ~566px against a 375px viewport). Four columns leave
          roughly 85px per cell, so every target clears 40x40 in both
          dimensions; the cost is 13 rows, hence the scroll.
        */}
        <div className="grid grid-cols-4 gap-1 flex-1 min-h-0 auto-rows-min overflow-y-auto overscroll-contain">
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
                       column header carries the suit, and the rank is on the
                       cell, so no per-cell glyph is needed. */
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
