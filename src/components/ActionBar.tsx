/**
 * Bottom action bar. Only legal actions appear.
 *
 * Every action is styled identically — neutral stroke, no fill — deliberately.
 * Colour-coding an action (red for a big bet, green for a call) reads as the
 * tool having an opinion, and this trainer must not hint at the answer it is
 * about to grade. Same reason equity stays hidden until you act.
 *
 * Neutral means FOREGROUND, not white. These buttons sit on the page
 * background, so hard-coded white made them invisible in light mode — unlike
 * the suit cards and seat pills, whose white text sits on fixed dark fills.
 *
 * All actions share ONE row so nothing sits above anything else in the
 * hierarchy: check and the sizings are peers, not a primary and a secondary.
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

const BUTTON =
  // /55, not /45: at 45% the stroke measures 2.96:1 on the page background,
  // just under the 3:1 floor for a UI component boundary.
  'flex-1 min-w-0 px-1 py-2 rounded-lg control-stroke border-foreground/55 bg-transparent ' +
  'text-foreground font-semibold hover:bg-foreground/10 active:bg-foreground/20 active:scale-[0.96] transition-[colors,scale]';

/** Label + optional bb amount underneath, on a fixed two-line frame. */
function ActionButton({
  label,
  amount,
  onClick,
}: {
  label: string;
  amount?: number;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={BUTTON}>
      <span className="block text-sm leading-tight">{label}</span>
      <span className="block text-[11px] font-normal leading-tight opacity-75">
        {amount === undefined ? ' ' : amount.toFixed(1)}
      </span>
    </button>
  );
}

export function ActionBar({ toCall, sizings, onFold, onCheck, onCall, onSize }: ActionBarProps) {
  const facing = toCall > 0;
  return (
    <div className="nums flex gap-1.5">
      {facing ? (
        <>
          <ActionButton label="Fold" onClick={onFold} />
          <ActionButton label="Call" amount={toCall} onClick={onCall} />
        </>
      ) : (
        <ActionButton label="Check" onClick={onCheck} />
      )}
      {sizings.map((s) => (
        <ActionButton
          key={`${s.kind}-${s.fraction}-${s.amount}`}
          // B for a bet, R for a raise — the distinction matters in poker and
          // colour is no longer available to carry it.
          label={s.allIn ? 'All in' : `${s.kind === 'bet' ? 'B' : 'R'}${s.fraction * 100}`}
          amount={s.amount}
          onClick={() => onSize(s)}
        />
      ))}
    </div>
  );
}
