/**
 * Oval poker table for the Trainer.
 *
 * The hero always renders at bottom centre regardless of which seat they were
 * dealt — standard poker-client convention — with the other seats rotated
 * around them in action order. The dealer button follows whichever seat holds
 * the BTN position.
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
  /** Shown only once the hand is over. */
  cards: readonly Card[] | null;
}

interface PokerTableProps {
  seats: readonly SeatView[];
  pot: number;
  heroSeat: number;
  /** Community boards, drawn in the middle of the felt. */
  boards: ReadonlyArray<readonly Card[]>;
}

/** Half-width and half-height of the seat ring, as percentages of the box. */
const A = 37;
const B = 45;
/** Length of the straight section on each side of the stadium. */
const H = B - A;

/**
 * Seat coordinates as percentages of the table box.
 *
 * The felt is a STADIUM (straight sides, semicircular caps), not an ellipse,
 * so seats are spaced by arc length around that perimeter — an ellipse
 * parametrisation would drift off the straight sections. Index 0 is bottom
 * centre (the hero); the rest walk evenly counter-clockwise.
 */
function seatPositions(count: number): Array<{ x: number; y: number }> {
  const cap = Math.PI * A; // length of one semicircular cap
  const side = 2 * H; // length of one straight side
  const perimeter = 2 * cap + 2 * side;

  const pointAt = (s: number): { x: number; y: number } => {
    let d = s % perimeter;
    // 1. bottom-left quarter cap: (0, B) -> (-A, H)
    if (d < cap / 2) {
      const t = (d / (cap / 2)) * (Math.PI / 2);
      return { x: -A * Math.sin(t), y: H + A * Math.cos(t) };
    }
    d -= cap / 2;
    // 2. left straight: (-A, H) -> (-A, -H)
    if (d < side) return { x: -A, y: H - d };
    d -= side;
    // 3. top cap: (-A, -H) -> (A, -H)
    if (d < cap) {
      const t = (d / cap) * Math.PI;
      return { x: -A * Math.cos(t), y: -H - A * Math.sin(t) };
    }
    d -= cap;
    // 4. right straight: (A, -H) -> (A, H)
    if (d < side) return { x: A, y: -H + d };
    d -= side;
    // 5. bottom-right quarter cap: (A, H) -> (0, B)
    const t = (d / (cap / 2)) * (Math.PI / 2);
    return { x: A * Math.cos(t), y: H + A * Math.sin(t) };
  };

  return Array.from({ length: count }, (_, i) => {
    const p = pointAt((i * perimeter) / count);
    return { x: 50 + p.x, y: 50 + p.y };
  });
}

export function PokerTable({ seats, pot, heroSeat, boards }: PokerTableProps) {
  const count = seats.length;
  const positions = seatPositions(count);

  // Rotate so the hero sits at display index 0 (bottom centre).
  const ordered = Array.from({ length: count }, (_, display) => {
    const seat = (heroSeat + display) % count;
    return seats.find((s) => s.seat === seat)!;
  });

  return (
    // Height-constrained rather than width-constrained: the table, the hero's
    // cards and the action bar all have to be on screen at once, without
    // scrolling, to be usable one-handed at a live table.
    <div className="relative h-[min(50vh,460px)] aspect-[3/5] mx-auto">
      {/* Felt */}
      {/* Stadium, not an ellipse: rounded-full on a tall box gives straight
          sides with semicircular caps, which is the real table shape. */}
      <div className="absolute inset-x-[13%] inset-y-[5%] rounded-full bg-emerald-800 border-[6px] border-zinc-800 shadow-inner" />

      {/* Boards and pot */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 pointer-events-none">
        {boards.map((board, b) => (
          <div key={b} className="flex gap-1">
            {board.map((c, i) => (
              <TrainerCard key={i} card={c} size="sm" />
            ))}
          </div>
        ))}
        <div className="text-white font-semibold text-sm drop-shadow mt-1">
          Total pot: {pot.toFixed(1)} BB
        </div>
      </div>

      {ordered.map((s, display) => {
        const pos = positions[display];
        // Offset a fixed distance INWARD from the seat. Scaling the position
        // vector instead would drift badly on the stadium's straight sides,
        // leaving markers stranded mid-felt instead of beside their seat.
        const inward = (distance: number) => {
          const dx = 50 - pos.x;
          const dy = 50 - pos.y;
          const len = Math.hypot(dx, dy) || 1;
          return { x: pos.x + (dx / len) * distance, y: pos.y + (dy / len) * distance };
        };
        const chip = inward(19);
        const button = inward(9);
        return (
          <div key={s.seat}>
            {/* Seat */}
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              {s.cards && (
                <div className="flex gap-0.5 mb-0.5">
                  {s.cards.map((c, i) => (
                    <TrainerCard key={i} card={c} size={s.isHero ? 'md' : 'xs'} />
                  ))}
                </div>
              )}
              <div
                className={`flex items-stretch rounded overflow-hidden border text-[11px] leading-none ${
                  s.isHero
                    ? 'border-emerald-400 bg-zinc-900'
                    : 'border-zinc-600 bg-zinc-900/95'
                } ${s.folded ? 'opacity-40' : ''} ${
                  s.toAct ? 'ring-2 ring-amber-400' : ''
                }`}
              >
                <span className="px-1.5 py-1 font-semibold text-white">{s.label}</span>
                <span className="px-1.5 py-1 text-zinc-300 border-l border-zinc-700">
                  {s.stack.toFixed(s.stack % 1 === 0 ? 0 : 1)}
                </span>
              </div>
            </div>

            {/* Dealer button */}
            {s.isDealer && (
              <div
                className="absolute -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white text-zinc-900 text-[10px] font-bold flex items-center justify-center shadow"
                style={{ left: `${button.x}%`, top: `${button.y}%` }}
              >
                D
              </div>
            )}

            {/* Chips committed this street */}
            {s.committed > 0 && (
              <div
                className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 text-[11px] text-white font-medium drop-shadow"
                style={{ left: `${chip.x}%`, top: `${chip.y}%` }}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-zinc-200 border border-zinc-400" />
                {s.committed % 1 === 0 ? s.committed : s.committed.toFixed(1)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
