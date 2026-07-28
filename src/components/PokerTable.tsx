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

/**
 * Seat coordinates as percentages of the table box. Index 0 is bottom centre
 * (the hero); the rest walk evenly around the ellipse.
 */
function seatPositions(count: number): Array<{ x: number; y: number }> {
  // Kept inside the box so the widest seats (left and right) don't clip on a
  // narrow phone, and matched to the felt inset so seats sit on its edge.
  const RX = 37;
  const RY = 45;
  return Array.from({ length: count }, (_, i) => {
    const theta = (Math.PI / 2) + (i * 2 * Math.PI) / count;
    return { x: 50 + RX * Math.cos(theta), y: 50 + RY * Math.sin(theta) };
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
    <div className="relative h-[min(58vh,520px)] aspect-[3/5] mx-auto">
      {/* Felt */}
      <div className="absolute inset-x-[13%] inset-y-[5%] rounded-[50%] bg-emerald-800 border-[6px] border-zinc-800 shadow-inner" />

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
        // Chip indicator sits between the seat and the middle of the table.
        const chip = {
          x: 50 + (pos.x - 50) * 0.58,
          y: 50 + (pos.y - 50) * 0.58,
        };
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
                style={{
                  left: `${50 + (pos.x - 50) * 0.74}%`,
                  top: `${50 + (pos.y - 50) * 0.62}%`,
                }}
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
