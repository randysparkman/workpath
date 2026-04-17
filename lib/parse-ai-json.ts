import { jsonrepair } from "jsonrepair";

/**
 * Extract JSON from Claude's response text, tolerating common failure modes:
 * unescaped quotes or newlines inside string values, trailing commas, etc.
 *
 * Strategy: strip optional markdown fences, try strict JSON.parse first; on
 * failure, run the slice through jsonrepair before retrying.
 */
export function parseAIJson(textContent: string): any {
  const fenced = textContent.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1]! : textContent).trim();

  try {
    return JSON.parse(raw);
  } catch (strictErr) {
    try {
      const repaired = jsonrepair(raw);
      return JSON.parse(repaired);
    } catch (repairErr) {
      console.error("[parseAIJson] strict parse failed:", (strictErr as Error).message);
      console.error("[parseAIJson] repair also failed:", (repairErr as Error).message);
      console.error("[parseAIJson] first 500 chars of input:", raw.slice(0, 500));
      throw strictErr;
    }
  }
}
