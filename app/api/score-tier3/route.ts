import { NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";
import { parseAIJson } from "@/lib/parse-ai-json";

const SYSTEM_PROMPT = `You are scoring responses to the final tier of an AI-readiness assessment. These are adaptive questions designed to fill evidence gaps and confirm placement. For each question, you must:
(1) Assign an orientation level (emerging, developing, demonstrating) based on which rubric description best matches the response.
(2) Assign an integration level (emerging, developing, demonstrating) based on which rubric description best matches the response.
(3) Assign a judgment level (emerging, developing, demonstrating) based on which rubric description best matches the response.
(4) Write 2–3 sentences of evidence notes explaining your scoring decisions across all three constructs.

Be calibrated. These are targeted questions — score precisely against the rubric provided.

Respond with a JSON object containing a "scores" array with exactly 5 objects. Each object must have: question_id, orientation_level, integration_level, judgment_level, evidence_notes.`;

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
    const { responses, questions } = await request.json();

    if (!responses || !questions || questions.length === 0) {
      return NextResponse.json({ error: "Missing responses or questions" }, { status: 400 });
    }

    const questionsBlock = buildQuestionsBlock(questions, responses);

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: questionsBlock }],
    });

    const textContent = message.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text content in Claude response");
    }

    const parsed = parseAIJson(textContent.text);
    const scores = parsed.scores || parsed;

    return NextResponse.json({ scores });
  } catch (e: any) {
    console.error("score-tier3 error:", e);
    if (e?.status === 429) {
      return NextResponse.json({ error: "Rate limit exceeded. Please try again in a moment." }, { status: 429 });
    }
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
