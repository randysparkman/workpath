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

  const attempts: Array<{ label: string; text: string }> = [{ label: "raw", text: raw }];
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace > 0 && lastBrace > firstBrace) {
    attempts.push({ label: "sliced", text: raw.slice(firstBrace, lastBrace + 1) });
  }

  let firstErr: Error | undefined;
  for (const { text } of attempts) {
    try {
      return JSON.parse(text);
    } catch (err) {
      if (!firstErr) firstErr = err as Error;
      try {
        return JSON.parse(jsonrepair(text));
      } catch {
        // try next attempt
      }
    }
  }

  console.error("[parseAIJson] all parse attempts failed:", firstErr?.message);
  console.error("[parseAIJson] first 500 chars of input:", raw.slice(0, 500));
  throw firstErr ?? new Error("parseAIJson: unable to parse");
}
