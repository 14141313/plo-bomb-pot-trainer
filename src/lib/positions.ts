/**
 * Position labels per table size, in postflop action order (SB acts first).
 * Bomb pots skip preflop action, so seats are listed in the order they act.
 */
const POSITIONS: Record<number, readonly string[]> = {
  2: ['SB', 'BB'],
  3: ['SB', 'BB', 'BTN'],
  4: ['SB', 'BB', 'UTG', 'BTN'],
  5: ['SB', 'BB', 'UTG', 'CO', 'BTN'],
  6: ['SB', 'BB', 'UTG', 'MP', 'CO', 'BTN'],
  7: ['SB', 'BB', 'UTG', 'MP', 'HJ', 'CO', 'BTN'],
  8: ['SB', 'BB', 'UTG', 'UTG+1', 'MP', 'HJ', 'CO', 'BTN'],
};

export function positionLabels(playerCount: number): readonly string[] {
  const labels = POSITIONS[playerCount];
  if (labels) return labels;
  return Array.from({ length: playerCount }, (_, i) => `Seat ${i + 1}`);
}
