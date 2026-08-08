import Link from 'next/link';

/**
 * Index of the capture routes. Handy for a human driving the capture tool;
 * deliberately not linked from the product nav.
 */
const STATES = [
  ['tool-empty', 'Tool — empty'],
  ['tool-dealt', 'Tool — hand dealt, equity showing'],
  ['tool-card-picker', 'Tool — card picker open (modal)'],
  ['trainer-setup', 'Trainer — pre-deal setup'],
  ['trainer-facing-bet', 'Trainer — mid-hand, facing a bet'],
  ['trainer-showdown', 'Trainer — showdown / reveal'],
  ['trainer-history-list', 'Hand history — list view'],
  ['trainer-hand-detail', 'Hand history — expanded detail'],
] as const;

export default function DesignPreviewIndex() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 flex flex-col gap-3 text-sm">
      <h2 className="text-base font-semibold">Design capture states</h2>
      <p className="text-ink-3">
        Each route renders one app state with fixed mock data, for static design
        capture. Not part of product navigation.
      </p>
      <ul className="flex flex-col gap-2">
        {STATES.map(([slug, label]) => (
          <li key={slug}>
            <Link
              href={`/design-preview/${slug}`}
              className="text-accent-text underline underline-offset-2"
            >
              {label}
            </Link>
            <span className="text-ink-3"> — /design-preview/{slug}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
