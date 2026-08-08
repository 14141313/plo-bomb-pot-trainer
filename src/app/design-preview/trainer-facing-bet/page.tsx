import { TrainerApp } from '@/components/app/TrainerApp';
import { TRAINER_FACING_BET } from '../mock';

/** State 4 — mid-hand on the flop, hero facing a bet, action bar live. */
export default function Page() {
  return <TrainerApp seed={{ hand: TRAINER_FACING_BET }} />;
}
