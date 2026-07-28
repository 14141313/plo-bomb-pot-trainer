/**
 * The playing card for the whole app: rank character only, suit carried
 * entirely by colour.
 *
 * Because the suit glyph is gone, colour is the ONLY suit signal, so this
 * uses a genuine four-colour deck. A traditional two-colour deck would make
 * spades/clubs and hearts/diamonds indistinguishable here, which would wreck
 * flush reading — the opposite of what the rank-only design is for. Colour
 * values live in globals.css; all four sit at one lightness so no suit reads
 * as brighter than another.
 *
 * Handles the empty/interactive states too, so the Tool's card entry and the
 * Trainer's dealt cards are the same component rather than two lookalikes.
 */

import { RANKS, rankOf, suitOf, type Card } from '@/engine/cards';

/** Indexed to match SUITS = 'cdhs' in engine/cards. */
const SUIT_BG = [
  'bg-suit-clubs',
  'bg-suit-diamonds',
  'bg-suit-hearts',
  'bg-suit-spades',
] as const;

const SUIT_TEXT = [
  'text-suit-clubs',
  'text-suit-diamonds',
  'text-suit-hearts',
  'text-suit-spades',
] as const;

const SUIT_SYMBOLS = ['♣', '♦', '♥', '♠'] as const;

export const suitClass = (card: Card): string => SUIT_BG[suitOf(card)];
export const suitBgClass = (suit: number): string => SUIT_BG[suit];
export const suitTextClass = (suit: number): string => SUIT_TEXT[suit];
export const suitSymbol = (suit: number): string => SUIT_SYMBOLS[suit];

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
  /** Stretches to share a row's width, keeping card proportions. */
  fluid: 'flex-1 min-w-0 max-w-24 aspect-[5/7] text-lg sm:text-2xl rounded-md',
} as const;

interface TrainerCardProps {
  card: Card | null;
  size?: keyof typeof SIZES;
  /** Makes the card a button for card entry. */
  onClick?: () => void;
  /** Highlight ring when this slot is the picker target. */
  active?: boolean;
}

export function TrainerCard({ card, size = 'md', onClick, active }: TrainerCardProps) {
  const base = `${SIZES[size]} flex items-center justify-center font-bold select-none transition-shadow`;
  const ring = active ? 'ring-2 ring-accent' : '';

  if (card === null) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label="Empty card slot"
        className={`${base} ${ring} border-2 border-dashed border-edge/70 text-edge hover:border-edge`}
      >
        +
      </button>
    );
  }

  const content = RANKS[rankOf(card)];
  const cls = `${base} ${ring} ${suitClass(card)} text-white shadow-sm ${onClick ? 'hover:shadow-md' : ''}`;
  const label = `${content}${'cdhs'[suitOf(card)]}`;

  return onClick ? (
    <button type="button" aria-label={label} onClick={onClick} className={cls}>
      {content}
    </button>
  ) : (
    <div aria-label={label} className={cls}>
      {content}
    </div>
  );
}
