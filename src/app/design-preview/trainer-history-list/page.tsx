import { TrainerApp } from '@/components/app/TrainerApp';
import { TRAINER_SESSION } from '../mock';

/** State 6 — session list at real density (eight hands, mixed grades). */
export default function Page() {
  return <TrainerApp seed={{ session: TRAINER_SESSION }} />;
}
