import toolsJson from "@/data/tools.json";
import type { Tool } from "./types";

export const TOOLS: Tool[] = toolsJson as Tool[];

const byId = new Map(TOOLS.map((t) => [t.id, t]));

export function getTool(id: string): Tool | undefined {
  return byId.get(id);
}

export function toolName(id: string): string {
  return byId.get(id)?.name ?? id;
}
