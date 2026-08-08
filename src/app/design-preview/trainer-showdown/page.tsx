import { TrainerApp } from '@/components/app/TrainerApp';
import { TRAINER_ENTRIES, TRAINER_SHOWDOWN } from '../mock';

/** State 5 — hand complete: showdown hands revealed, review and grades. */
export default function Page() {
  return <TrainerApp seed={{ hand: TRAINER_SHOWDOWN, entries: TRAINER_ENTRIES }} />;
}
