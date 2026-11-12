import type { Metadata } from "next";
import Link from "next/link";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/900.css";
import "./globals.css";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: "stack.here: grade your GTM stack",
  description: "Paste your GTM tools. Get a grade, overlap flags, a wasted-spend estimate and a card to share.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-black">
        <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
          <Link href="/" className="text-xl font-black tracking-tight">
            stack.here
          </Link>
          <nav className="flex gap-5 text-sm font-medium">
            <Link href="/tools" className="hover:underline">
              Tool database
            </Link>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-5 pb-24">{children}</main>
        <footer className="mx-auto max-w-5xl border-t border-black/10 px-5 py-8 text-sm text-black/60">
          Prices are public list prices read from vendor sites and may be out of date. Spend figures are estimates. We
          store the tools in each stack and nothing about who submitted it.
        </footer>
      </body>
    </html>
  );
}
