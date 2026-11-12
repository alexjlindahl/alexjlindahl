import { StackForm } from "@/components/StackForm";
import { SAMPLES } from "@/lib/samples";
import { TOOLS } from "@/lib/tools";

export default function Home() {
  // Only what the browser needs for live matching: no prices, no notes.
  const index = TOOLS.map((t) => ({ id: t.id, name: t.name, aliases: t.aliases, category: t.category }));
  return (
    <div>
      <section className="pt-10 pb-8 sm:pt-16">
        <h1 className="text-6xl font-black leading-[0.95] tracking-tighter sm:text-8xl">
          Grade your
          <br />
          GTM stack.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-black/70">
          Paste the tools your team pays for. Get a grade, the tools doing the same job, an estimate of the spend you
          could cut, and a card to share.
        </p>
      </section>
      <StackForm index={index} samples={SAMPLES} toolCount={TOOLS.length} />
    </div>
  );
}
