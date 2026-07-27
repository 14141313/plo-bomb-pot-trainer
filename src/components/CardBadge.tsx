'use client';

import type { Card } from '@/engine/cards';
import { RANKS, rankOf, suitOf } from '@/engine/cards';

/** Four-color deck for fast reading: spades black, hearts red, diamonds blue, clubs green. */
const SUIT_META = [
  { symbol: '♣', text: 'text-emerald-600', selectedBg: 'bg-emerald-50 dark:bg-emerald-950' },
  { symbol: '♦', text: 'text-blue-600', selectedBg: 'bg-blue-50 dark:bg-blue-950' },
  { symbol: '♥', text: 'text-red-600', selectedBg: 'bg-red-50 dark:bg-red-950' },
  { symbol: '♠', text: 'text-zinc-900 dark:text-zinc-100', selectedBg: 'bg-zinc-100 dark:bg-zinc-800' },
] as const;

export function suitSymbol(suit: number): string {
  return SUIT_META[suit].symbol;
}

export function suitTextClass(suit: number): string {
  return SUIT_META[suit].text;
}

interface CardBadgeProps {
  card: Card | null;
  onClick?: () => void;
  /** Highlight ring when this slot is the picker target. */
  active?: boolean;
  size?: 'sm' | 'md';
}

export function CardBadge({ card, onClick, active, size = 'md' }: CardBadgeProps) {
  const sizeClasses =
    size === 'md'
      ? 'w-10 h-14 text-base sm:w-11 sm:h-15'
      : 'w-8 h-11 text-sm';

  if (card === null) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label="Empty card slot"
        className={`${sizeClasses} rounded-md border-2 border-dashed flex items-center justify-center
          text-zinc-400 transition-colors
          ${active ? 'border-amber-400 bg-amber-50 dark:bg-amber-950' : 'border-zinc-300 dark:border-zinc-700 hover:border-zinc-400'}`}
      >
        +
      </button>
    );
  }

  const suit = suitOf(card);
  const meta = SUIT_META[suit];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${RANKS[rankOf(card)]}${meta.symbol}`}
      className={`${sizeClasses} rounded-md border font-semibold flex flex-col items-center justify-center leading-none gap-0.5
        bg-white dark:bg-zinc-900 shadow-sm transition-shadow
        ${active ? 'ring-2 ring-amber-400' : ''}
        border-zinc-300 dark:border-zinc-600 ${meta.text} ${onClick ? 'hover:shadow' : 'cursor-default'}`}
    >
      <span>{RANKS[rankOf(card)]}</span>
      <span className="text-xs">{meta.symbol}</span>
    </button>
  );
}
