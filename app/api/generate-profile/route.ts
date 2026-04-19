import { NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";
import { parseAIJson } from "@/lib/parse-ai-json";
import { GENERATE_PROFILE_PROMPT } from "@/lib/prompts/generate-profile-prompt";
import { logApiTiming } from "@/lib/api-timing";

export const maxDuration = 300;

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const { scored_responses, respondent_name, intake_answers, org_name, org_fluency } = await request.json();

    if (!scored_responses || !Array.isArray(scored_responses)) {
      return NextResponse.json({ error: "Missing scored_responses array" }, { status: 400 });
    }

    const userMessage = JSON.stringify({
      scored_responses,
      respondent_name: respondent_name || "Anonymous",
      intake_answers: intake_answers || null,
      org_name: org_name || null,
      org_fluency: org_fluency || null,
    });

    const tModel = Date.now();
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: [
        {
          type: "text",
          text: GENERATE_PROFILE_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userMessage }],
    });
    const modelElapsedMs = Date.now() - tModel;

    const textContent = message.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text content in Claude response");
    }

    const profile = parseAIJson(textContent.text);

    logApiTiming({ route: "generate-profile", startedAt, modelElapsedMs, usage: message.usage });
    return NextResponse.json({ profile });
  } catch (e: any) {
    console.error("generate-profile error:", e);
    if (e?.status === 429) {
      return NextResponse.json({ error: "Rate limit exceeded. Please try again in a moment." }, { status: 429 });
    }
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
