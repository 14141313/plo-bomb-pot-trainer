'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/tool', label: 'Tool' },
  { href: '/trainer', label: 'Trainer' },
] as const;

/**
 * Top-level nav. Tool is open access; Trainer sits behind login because it
 * persists hand history and scores against a profile.
 */
export function TabNav() {
  const pathname = usePathname();
  return (
    <nav className="border-b border-line">
      <div className="mx-auto max-w-3xl flex items-center gap-1 px-4">
        {TABS.map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? 'border-accent text-accent-text'
                  : 'border-transparent text-ink-3 hover:text-foreground'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
