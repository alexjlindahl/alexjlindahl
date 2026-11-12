import { computeLearnedRules } from "./learn";
import { recentCuts, recentSubmissions, saveLearnedRules } from "./store";
import { TOOLS } from "./tools";

/** Recompute learned rules from stored data and save them. Run by the cron route and `npm run refresh`. */
export async function refreshLearnedRules() {
  const [subs, cuts] = await Promise.all([recentSubmissions(), recentCuts()]);
  const rules = computeLearnedRules(subs, cuts, TOOLS);
  await saveLearnedRules(rules);
  return rules;
}
