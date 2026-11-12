/**
 * Writes output/weekly.md: the week's five most divisive takes, formatted for
 * the newsletter's GTM Twitter section.
 *
 *   npm run export:weekly                            # the 7 days ending yesterday
 *   npm run export:weekly -- --week-ending 2026-11-08 --min-votes 30
 */
import "./_env";
import { mkdirSync, writeFileSync } from "node:fs";
import { buildWeekly } from "@/lib/export";
import { isDay } from "@/lib/dates";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const weekEnding = arg("week-ending");
  if (weekEnding && !isDay(weekEnding)) throw new Error("--week-ending must be YYYY-MM-DD");
  const w = await buildWeekly({ weekEnding, minVotes: arg("min-votes") ? Number(arg("min-votes")) : undefined });
  mkdirSync("output", { recursive: true });
  writeFileSync("output/weekly.md", w.markdown);
  console.log(`Wrote output/weekly.md (${w.from} to ${w.to}, ${w.takes.length} takes)\n`);
  console.log(w.markdown);
}

main().then(() => process.exit(0), (e) => (console.error(e), process.exit(1)));
