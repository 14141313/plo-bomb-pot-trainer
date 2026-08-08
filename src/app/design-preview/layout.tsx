import type { Metadata } from 'next';

/**
 * Design-capture routes: each child renders one app state fully populated,
 * so a static capture tool (html.to.design and similar) can reach states that
 * normally only exist after interaction.
 *
 * Not linked from the product and not indexable. These are a dev utility, not
 * a product surface — but worth keeping rather than deleting, since they make
 * any future re-capture a URL visit instead of a manual replay.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DesignPreviewLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
