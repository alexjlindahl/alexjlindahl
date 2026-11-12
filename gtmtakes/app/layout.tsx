import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "@fontsource/archivo-black";
import "@fontsource-variable/space-grotesk";
import "./globals.css";
import { hasSeedVotes } from "@/lib/takes";
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME}: ${SITE_TAGLINE}`, template: `%s | ${SITE_NAME}` },
  description: "A daily hot-or-not vote on go-to-market opinions from X. Vote on ten takes, see how everyone else split.",
};

export const viewport: Viewport = { themeColor: "#fff4df", width: "device-width", initialScale: 1 };

const NAV = [
  ["/", "Today"],
  ["/results", "Results"],
  ["/archive", "Archive"],
  ["/leaderboard", "Leaderboard"],
] as const;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const sample = await hasSeedVotes();
  return (
    <html lang="en">
      <body className="flex flex-col antialiased">
        <header className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pt-4">
          <Link href="/" className="font-display text-xl leading-none tracking-tight sm:text-2xl">
            gtmtakes<span className="text-hot">.</span>here
          </Link>
          <nav className="flex gap-1 text-sm font-bold">
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className="rounded-full px-2.5 py-1.5 hover:bg-ink hover:text-paper">
                {label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
        <footer className="mx-auto w-full max-w-3xl px-4 pb-8 text-sm text-muted">
          {sample && (
            <p className="mb-3 rounded-lg border-2 border-dashed border-ink/40 px-3 py-2 text-ink">
              <strong>Sample votes.</strong> Vote counts on this site currently include generated sample data from the seed script.
            </p>
          )}
          <p>
            Takes are opinions posted publicly on X, restated in neutral words. Every take links to the original post and its author. No login; one vote per take.
          </p>
        </footer>
      </body>
    </html>
  );
}
