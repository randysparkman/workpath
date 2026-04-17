import { NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";
import { parseAIJson } from "@/lib/parse-ai-json";

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are an AI-readiness assessment engine. You will perform TWO tasks in a single response.

TASK A — SCORE 5 TIER 2 RESPONSES
For each of the 5 scenarios, assign:
- orientation_level (emerging / developing / demonstrating)
- integration_level (emerging / developing / demonstrating)
- judgment_level (emerging / developing / demonstrating)
- evidence_notes (2–3 sentences explaining the scoring decisions across all three constructs)

Be calibrated. Most people fall in the "developing" range. "Demonstrating" requires specific, nuanced reasoning — not just mentioning the right concepts. "Emerging" means genuine lack of awareness, not just brevity.

TASK B — PERFORMANCE SUMMARY ACROSS ALL 10 RESPONSES
Using the Tier 1 scores provided (already computed) combined with the Tier 2 scores you just produced in Task A, generate a structured performance summary following the schema in the SUMMARY INSTRUCTIONS block.

OUTPUT FORMAT
Return a single JSON object with this exact top-level shape:
{
  "scores": [ 5 Tier 2 score objects, each with: question_id, orientation_level, integration_level, judgment_level, evidence_notes ],
  "performanceSummary": { ...object matching the schema given in SUMMARY INSTRUCTIONS... }
}`;

function buildQuestionsBlock(questions: any[], responses: Record<string, string>): string {
  return questions.map((q: any, i: number) => {
    const userResponse = responses[q.id] || "(no response)";
    return `
--- Question ${i + 1} (${q.id}) ---
Scenario: ${q.scenario}
Prompt: ${q.prompt}
User's response: "${userResponse}"

Rubric:
Orientation:
  - Emerging: ${q.rubric.orientation.emerging}
  - Developing: ${q.rubric.orientation.developing}
  - Demonstrating: ${q.rubric.orientation.demonstrating}
Integration:
  - Emerging: ${q.rubric.integration.emerging}
  - Developing: ${q.rubric.integration.developing}
  - Demonstrating: ${q.rubric.integration.demonstrating}
Judgment:
  - Emerging: ${q.rubric.judgment.emerging}
  - Developing: ${q.rubric.judgment.developing}
  - Demonstrating: ${q.rubric.judgment.demonstrating}
`;
  }).join("\n");
}

export async function POST(request: Request) {
  try {
    const {
      responses,
      questions,
      t1Scores,
      t1Questions,
      t1Responses,
      summaryPromptTemplate,
    } = await request.json();

    if (!responses || !questions || questions.length === 0) {
      return NextResponse.json({ error: "Missing responses or questions" }, { status: 400 });
    }

    const canSummarize =
      Array.isArray(t1Scores) &&
      Array.isArray(t1Questions) &&
      t1Responses &&
      typeof summaryPromptTemplate === "string" &&
      summaryPromptTemplate.length > 0;

    const questionsBlock = buildQuestionsBlock(questions, responses);

    // If we lack the inputs to summarize, fall back to scoring only.
    if (!canSummarize) {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: `You are scoring 5 responses to an AI-readiness assessment. For each question assign orientation_level, integration_level, and judgment_level (each one of emerging/developing/demonstrating) and 2-3 sentences of evidence_notes. Be calibrated. Return JSON: {"scores": [5 objects with question_id, orientation_level, integration_level, judgment_level, evidence_notes]}.`,
        messages: [{ role: "user", content: questionsBlock }],
      });
      const textContent = message.content.find((c) => c.type === "text");
      if (!textContent || textContent.type !== "text") {
        throw new Error("No text content in Claude response");
      }
      const parsed = parseAIJson(textContent.text);
      const scores = parsed.scores || parsed;
      return NextResponse.json({ scores });
    }

    // Build T1 context (already scored) with the same enrichment the summary expects.
    const t1Context = t1Scores.map((s: any, i: number) => ({
      ...s,
      tier: 1,
      question_angle: t1Questions[i]?.angle || "unknown",
      dol_content_area: s.dol_content_area || t1Questions[i]?.dol_content_area || "",
      human_function_activated: s.human_function_activated || t1Questions[i]?.human_function_activated || "",
      scenario: t1Questions[i]?.scenario?.substring(0, 100) || "",
      user_response: t1Responses[t1Questions[i]?.id] || "",
    }));

    // Build T2 metadata context the summary will merge with the model's own scores.
    const t2Context = questions.map((q: any) => ({
      question_id: q.id,
      tier: 2,
      question_angle: q.angle || "unknown",
      dol_content_area: q.dol_content_area || "",
      human_function_activated: q.human_function_activated || "",
      scenario: q.scenario?.substring(0, 100) || "",
      user_response: responses[q.id] || "",
    }));

    const userPrompt =
      `=== TIER 2 SCORING INPUT (score these 5) ===\n${questionsBlock}\n\n` +
      `=== TIER 1 SCORED RESPONSES (already computed, use for the summary) ===\n${JSON.stringify(t1Context, null, 2)}\n\n` +
      `=== TIER 2 METADATA (merge with your Task A scores for the summary) ===\n${JSON.stringify(t2Context, null, 2)}\n\n` +
      `=== SUMMARY INSTRUCTIONS ===\n${summaryPromptTemplate}\n\n` +
      `Remember: return ONE JSON object with {"scores": [...Tier 2 scores...], "performanceSummary": {...per schema above...}}.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textContent = message.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text content in Claude response");
    }

    const parsed = parseAIJson(textContent.text);
    const scores = parsed.scores;
    const performanceSummary = parsed.performanceSummary;

    if (!scores || !performanceSummary) {
      throw new Error("Combined scoring response missing scores or performanceSummary");
    }

    return NextResponse.json({ scores, performanceSummary });
  } catch (e: any) {
    console.error("score-tier2 error:", e);
    if (e?.status === 429) {
      return NextResponse.json({ error: "Rate limit exceeded. Please try again in a moment." }, { status: 429 });
    }
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
