// Inserts the ten sample stacks and prints their URLs.
import { createMatcher } from "../lib/parse";
import { SAMPLES } from "../lib/samples";
import { createSubmission } from "../lib/store";
import { TOOLS } from "../lib/tools";

async function main() {
  const matcher = createMatcher(TOOLS);
  for (const s of SAMPLES) {
    const parsed = matcher.parse(s.text);
    const { id, result } = await createSubmission({
      toolIds: parsed.matched.map((m) => m.toolId),
      unknown: parsed.unknown,
      teamSize: s.teamSize,
    });
    console.log(`${result.grade} ${String(result.score).padStart(3)}  /s/${id}  ${s.label}`);
  }
  process.exit(0);
}
main();
