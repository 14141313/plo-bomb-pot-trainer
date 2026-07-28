/**
 * Bottom action bar. Only legal actions appear, and colour encodes the action
 * TYPE so the choice is readable at a glance during a live decision:
 *
 *   fold  = blue      (give up)
 *   check = slate     (pass, costs nothing)
 *   call  = green     (match, costs chips)
 *   bet / raise = red (aggression, deepening with size)
 *
 * Sizing layout: the passive actions get their own row, and every legal sizing
 * preset sits in a compact wrapping grid below. With at most five sizes this
 * fits without scrolling on a phone, and no size is hidden behind a picker —
 * the tool should never make one sizing harder to choose than another.
 */

import type { Sizing } from '@/engine/trainerHand';

interface ActionBarProps {
  toCall: number;
  sizings: readonly Sizing[];
  onFold: () => void;
  onCheck: () => void;
  onCall: () => void;
  onSize: (s: Sizing) => void;
}

/** Aggression shades: bigger commitment reads hotter. */
const SIZE_SHADES = ['bg-rose-500', 'bg-rose-600', 'bg-red-600', 'bg-red-700'];

export function ActionBar({ toCall, sizings, onFold, onCheck, onCall, onSize }: ActionBarProps) {
  const facing = toCall > 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {facing ? (
          <>
            <button
              type="button"
              onClick={onFold}
              className="flex-1 py-3 rounded-lg bg-blue-500 hover:bg-blue-400 text-white font-semibold"
            >
              Fold
            </button>
            <button
              type="button"
              onClick={onCall}
              className="flex-1 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
            >
              Call {toCall.toFixed(1)}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onCheck}
            className="flex-1 py-3 rounded-lg bg-slate-600 hover:bg-slate-500 text-white font-semibold"
          >
            Check
          </button>
        )}
      </div>

      {sizings.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {sizings.map((s, i) => (
            <button
              key={`${s.kind}-${s.fraction}-${s.amount}`}
              type="button"
              onClick={() => onSize(s)}
              className={`py-2.5 rounded-lg text-white font-semibold text-sm ${
                s.allIn ? 'bg-red-800 hover:bg-red-700' : SIZE_SHADES[Math.min(i, 3)]
              }`}
            >
              {s.allIn ? (
                'All-in'
              ) : (
                <>
                  {s.fraction * 100}%
                  <span className="block text-[11px] font-normal opacity-80">
                    {s.amount.toFixed(1)}
                  </span>
                </>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
