/**
 * Trainer card: rank character only, suit carried entirely by colour.
 *
 * Because the suit glyph is gone, colour is the ONLY suit signal, so this
 * uses a genuine four-colour deck. A traditional two-colour deck would make
 * spades/clubs and hearts/diamonds indistinguishable here, which would wreck
 * flush reading — the opposite of what the rank-only design is for.
 */

import { RANKS, rankOf, suitOf, type Card } from '@/engine/cards';

/**
 * Suit background classes, indexed to match SUITS = 'cdhs' in engine/cards.
 * The values live in globals.css as OKLCH tokens — all four share one
 * lightness so no suit reads as brighter than another.
 */
const SUIT_BG = [
  'bg-suit-clubs',
  'bg-suit-diamonds',
  'bg-suit-hearts',
  'bg-suit-spades',
] as const;

export const suitClass = (card: Card): string => SUIT_BG[suitOf(card)];

const SIZES = {
  xs: 'w-4 h-6 text-[10px] rounded-sm',
  sm: 'w-6 h-8 text-sm rounded',
  md: 'w-9 h-12 text-xl rounded-md',
  lg: 'w-12 h-16 text-3xl rounded-lg',
  /**
   * Community and hero cards share this size. Sized so a FULL double board
   * (five per row) fits the felt, not just a three-card flop — otherwise the
   * cards would have to shrink when the turn and river land.
   */
  table: 'w-9 h-12 text-xl rounded-md sm:w-11 sm:h-[3.85rem] sm:text-2xl',
} as const;

interface TrainerCardProps {
  card: Card;
  size?: keyof typeof SIZES;
}

export function TrainerCard({ card, size = 'md' }: TrainerCardProps) {
  return (
    <div
      aria-label={`${RANKS[rankOf(card)]}${'cdhs'[suitOf(card)]}`}
      className={`${SIZES[size]} ${suitClass(card)} flex items-center justify-center font-bold text-white shadow-sm select-none`}
    >
      {RANKS[rankOf(card)]}
    </div>
  );
}
