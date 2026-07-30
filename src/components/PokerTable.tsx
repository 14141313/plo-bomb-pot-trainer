/**
 * Oval poker table for the Trainer.
 *
 * The hero always renders at bottom centre regardless of which seat they were
 * dealt — standard poker-client convention — with the other seats rotated
 * around them in action order.
 *
 * Felt colour: a light neutral, NOT green and NOT dark. The four suits sit at
 * one lightness (L 0.52) across grey, green, red and blue; a green felt killed
 * the clubs and a dark felt would kill the spades the same way. Only a light
 * neutral separates from all four — measured 3.5:1 to 4.1:1 against each.
 * All colour tokens live in globals.css.
 */

import type { Card } from '@/engine/cards';
import { TrainerCard } from './TrainerCard';

export interface SeatView {
  seat: number;
  label: string;
  stack: number;
  /** Chips committed on the current street, shown in front of the seat. */
  committed: number;
  folded: boolean;
  isHero: boolean;
  isDealer: boolean;
  toAct: boolean;
  /** Shown only once the hand is over (or always, for the hero). */
  cards: readonly Card[] | null;
}

interface PokerTableProps {
  seats: readonly SeatView[];
  pot: number;
  heroSeat: number;
  /** Community boards, drawn in the middle of the felt. */
  boards: ReadonlyArray<readonly Card[]>;
  /** True while the hand is live, so live seats show card backs. */
  inHand: boolean;
  /** Hole cards per player: 4 (PLO4) or 5 (PLO5). */
  handSize: number;
}

/** Width / height of the table box. Must match the aspect class below. */
const ASPECT = 0.8;
/**
 * Seat ring, as fractions of the box half-extents. The horizontal radius is
 * pushed wide on purpose: with 7 seats, two of them sit at the table's
 * mid-height — exactly where the community boards are — so the seats have to
 * clear a full five-card row. That, plus the compact stacked seat pill, is
 * what keeps a 10-card double board from colliding with them.
 */
const A_FRAC = 0.4;
const B_FRAC = 0.45;

/**
 * Seat coordinates as percentages of the table box.
 *
 * The felt is a STADIUM (straight sides, semicircular caps) in *pixel* space,
 * so the perimeter walk is done in aspect-corrected units and only converted
 * to percentages at the end. Doing the maths directly in percentages would
 * skew the shape, because a percent of width and a percent of height are
 * different distances. Index 0 is bottom centre (the hero).
 */
function seatPositions(count: number): Array<{ x: number; y: number }> {
  // Work in units where the box is ASPECT wide and 1 tall.
  const a = A_FRAC * ASPECT;
  const b = B_FRAC;
  const h = Math.max(b - a, 0);
  const cap = Math.PI * a;
  const side = 2 * h;
  const perimeter = 2 * cap + 2 * side;

  const pointAt = (s: number): { x: number; y: number } => {
    let d = s % perimeter;
    if (d < cap / 2) {
      const t = (d / (cap / 2)) * (Math.PI / 2);
      return { x: -a * Math.sin(t), y: h + a * Math.cos(t) };
    }
    d -= cap / 2;
    if (d < side) return { x: -a, y: h - d };
    d -= side;
    if (d < cap) {
      const t = (d / cap) * Math.PI;
      return { x: -a * Math.cos(t), y: -h - a * Math.sin(t) };
    }
    d -= cap;
    if (d < side) return { x: a, y: -h + d };
    d -= side;
    const t = (d / (cap / 2)) * (Math.PI / 2);
    return { x: a * Math.cos(t), y: h + a * Math.sin(t) };
  };

  return Array.from({ length: count }, (_, i) => {
    const p = pointAt((i * perimeter) / count);
    return { x: 50 + (p.x / ASPECT) * 100, y: 50 + p.y * 100 };
  });
}

/**
 * Face-down cards, so it's obvious who is still in the hand. Shows the real
 * hand size (4 for PLO4, 5 for PLO5), overlapped so a full Omaha hand still
 * fits in a seat's width.
 */
function CardBacks({ count }: { count: number }) {
  return (
    <div className="flex">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="w-3 h-4 rounded-[2px] bg-card-back border border-card-back-edge -ml-1 first:ml-0"
        />
      ))}
    </div>
  );
}

export function PokerTable({ seats, pot, heroSeat, boards, inHand, handSize }: PokerTableProps) {
  const count = seats.length;
  const positions = seatPositions(count);

  const ordered = Array.from({ length: count }, (_, display) => {
    const seat = (heroSeat + display) % count;
    return seats.find((s) => s.seat === seat)!;
  });

  return (
    <div className="nums relative w-full max-w-[420px] aspect-[4/5] mx-auto">
      {/* Felt */}
      <div className="absolute inset-x-[13%] inset-y-[5%] rounded-full bg-felt shadow-[0_2px_4px_rgba(0,0,0,0.10),0_10px_30px_rgba(0,0,0,0.18)]" />

      {/* Boards and pot. Sized so a full double board (5 + 5) still fits. */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 pointer-events-none">
        {boards.map((board, b) => (
          <div key={b} className="flex gap-0.5 sm:gap-1">
            {board.map((c, i) => (
              <TrainerCard key={i} card={c} size="table" />
            ))}
          </div>
        ))}
        <div className="text-seat font-bold text-sm mt-1">Total pot: {pot.toFixed(1)} BB</div>
      </div>

      {ordered.map((s, display) => {
        const pos = positions[display];
        // Chips sit just off the seat, close enough to read the action at a
        // glance rather than floating out in the middle of the felt.
        const dx = 50 - pos.x;
        const dy = 50 - pos.y;
        const len = Math.hypot(dx, dy) || 1;
        const chip = { x: pos.x + (dx / len) * 10, y: pos.y + (dy / len) * 10 };

        return (
          <div key={s.seat}>
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              {s.cards ? (
                <div className="flex gap-0.5 mb-0.5">
                  {s.cards.map((c, i) => (
                    <TrainerCard key={i} card={c} size={s.isHero ? 'table' : 'xs'} />
                  ))}
                </div>
              ) : (
                inHand && !s.folded && <CardBacks count={handSize} />
              )}
              <div
                className={`flex flex-col items-center rounded border px-1.5 py-0.5 leading-tight ${
                  s.folded
                    ? 'border-seat-border/60 bg-seat opacity-45'
                    : 'border-seat-border bg-seat'
                } ${
                  // Mutually exclusive: two ring-* utilities would collide and
                  // whichever CSS rule happened to win would hide the other.
                  // Whose turn it is always outranks the "this is you" marker.
                  s.toAct
                    ? 'ring-1 ring-to-act shadow-lg shadow-to-act/60'
                    : s.isHero
                      ? 'ring-1 ring-hero'
                      : ''
                }`}
              >
                <span className="flex items-center gap-0.5 text-[11px] font-semibold text-white">
                  {s.isDealer && (
                    <span className="w-3 h-3 rounded-full bg-felt text-seat text-[8px] font-bold flex items-center justify-center">
                      D
                    </span>
                  )}
                  {s.label}
                </span>
                {/* The seat pill is ALWAYS dark, so its muted text uses the
                    fixed --edge token, not mode-flipping ink-3 — in light
                    mode ink-3 stays L 0.552, which is 3.67:1 on this pill.
                    edge measures 6.92:1 here in both modes. */}
                <span className="text-[11px] text-edge">
                  {s.stack.toFixed(s.stack % 1 === 0 ? 0 : 1)}
                </span>
              </div>
            </div>

            {/* Chips committed this street */}
            {s.committed > 0 && (
              <div
                className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 rounded-full bg-seat border border-seat-border px-1.5 py-0.5 text-[11px] text-white font-semibold whitespace-nowrap"
                style={{ left: `${chip.x}%`, top: `${chip.y}%` }}
              >
                <span className="w-2 h-2 rounded-full bg-to-act" />
                {s.committed % 1 === 0 ? s.committed : s.committed.toFixed(1)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
