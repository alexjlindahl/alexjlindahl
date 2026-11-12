import { refreshLearnedRules } from "../lib/refresh";

refreshLearnedRules().then((r) => {
  console.log(`Saved ${r.version}:`, r.sampleSize, "job weights:", r.jobWeight, "tool penalties:", r.toolCutPenalty);
  process.exit(0);
});
