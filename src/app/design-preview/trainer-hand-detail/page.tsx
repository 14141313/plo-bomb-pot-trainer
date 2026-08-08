import { TrainerApp } from '@/components/app/TrainerApp';
import { TRAINER_ENTRIES, TRAINER_SESSION, TRAINER_SHOWDOWN } from '../mock';

/**
 * State 7 — one hand expanded: street-by-street actual vs optimal, EV loss
 * and grade, with the session list beneath for context.
 */
export default function Page() {
  return (
    <TrainerApp
      seed={{ hand: TRAINER_SHOWDOWN, entries: TRAINER_ENTRIES, session: TRAINER_SESSION }}
    />
  );
}
