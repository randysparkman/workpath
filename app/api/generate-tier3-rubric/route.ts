import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { parseAIJson } from "@/lib/parse-ai-json";
import { logApiTiming } from "@/lib/api-timing";

export const maxDuration = 120;

const anthropic = new Anthropic({ maxRetries: 1 });

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const { stem, rubricPromptTemplate } = await request.json();

    if (!stem || !rubricPromptTemplate) {
      return NextResponse.json(
        { error: "Missing stem or rubricPromptTemplate" },
        { status: 400 },
      );
    }

    const dynamicSuffix =
      "QUESTION STEM:\n" + JSON.stringify(stem, null, 2);

    const abort = new AbortController();
    const timeoutId = setTimeout(() => abort.abort(), 90_000);

    const tModel = Date.now();
    let message: Awaited<ReturnType<typeof anthropic.messages.create>>;
    try {
      message = await anthropic.messages.create(
        {
          model: "claude-sonnet-4-6",
          max_tokens: 1500,
          system: [
            {
              type: "text",
              text:
                "You are a scoring rubric generator for an AI-readiness assessment. Produce structured JSON output only.\n\n" +
                rubricPromptTemplate,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [{ role: "user", content: dynamicSuffix }],
        },
        { signal: abort.signal },
      );
    } finally {
      clearTimeout(timeoutId);
    }
    const modelElapsedMs = Date.now() - tModel;

    const text = message.content.find((c) => c.type === "text");
    if (!text || text.type !== "text") {
      throw new Error("No text content in rubric generation response");
    }

    const parsed = parseAIJson(text.text);
    const rubric = parsed.rubric;
    if (!rubric || !rubric.orientation || !rubric.integration || !rubric.judgment) {
      throw new Error("Rubric response missing required construct keys");
    }

    logApiTiming({
      route: "generate-tier3-rubric",
      startedAt,
      modelElapsedMs,
      usage: message.usage,
      extra: { question_id: stem.id },
    });
    return NextResponse.json({ rubric });
  } catch (e: any) {
    console.error("generate-tier3-rubric error:", e);
    const isAbort =
      e?.name === "AbortError" ||
      e?.code === "ERR_CANCELED" ||
      e?.message?.includes("aborted") ||
      e?.message?.includes("timed out");
    if (isAbort) {
      return NextResponse.json(
        { error: "Rubric generation timed out. Please try again." },
        { status: 504 },
      );
    }
    if (e?.status === 429) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again in a moment." },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { error: e?.message || "Unknown error" },
      { status: 500 },
    );
  }
}
