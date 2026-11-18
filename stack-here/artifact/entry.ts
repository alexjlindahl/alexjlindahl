/** Browser bundle for the single-page (artifact) build. Exposed as the global `SH`. */
import toolsJson from "../data/tools.json";

export { createMatcher } from "../lib/parse";
export { analyze, percentile, DEFAULT_SEATS } from "../lib/grade";
export { CATEGORIES, categoryOf, JOBS, jobLabel } from "../lib/taxonomy";
export {
  computeLearnedRules,
  computeInsights,
  MIN_CUTS_FOR_JOB_WEIGHTS,
  MIN_CUTS_PER_TOOL,
  MIN_APPEARANCES_PER_TOOL,
} from "../lib/learn";
export { SAMPLES } from "../lib/samples";
export const TOOLS = toolsJson;
