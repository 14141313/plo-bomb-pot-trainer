// Ad-hoc benchmark: worst case = 8p PLO5, double board, preflop.
import { parseCards } from './cards';
import { calculateEquity } from './equity';

const hands = [
  'As Ad Ks Kd Qh', '9h 8h 7d 6d 2c', 'Ah Kh Qd Jd 3c', 'Tc 9c 8s 7s 2d',
  'Qc Qs Jh Ts 4c', '5h 5d 6s 7h 8c', 'Ac 2s 3s 4h Jc', 'Kc Td 9d 6c 4d',
].map(parseCards);

for (const iters of [10_000, 20_000, 50_000]) {
  const t0 = performance.now();
  const r = calculateEquity({ players: hands, boards: [[], []], iterations: iters, seed: 1 });
  const ms = performance.now() - t0;
  console.log(`${iters} iters: ${ms.toFixed(0)}ms  (p0 combined=${(r.players[0].combined * 100).toFixed(2)}%)`);
}
