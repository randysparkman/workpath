import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { parseAIJson } from "@/lib/parse-ai-json";
import { logApiTiming } from "@/lib/api-timing";

export const maxDuration = 300;

// Fewer retries so backoff doesn't compound the timeout.
const anthropic = new Anthropic({ maxRetries: 1 });

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const {
      performanceSummary,
      orgFluencyContent,
      questionPromptTemplate,
    } = await request.json();

    if (!performanceSummary || !questionPromptTemplate) {
      return NextResponse.json(
        { error: "Missing performanceSummary or questionPromptTemplate" },
        { status: 400 },
      );
    }

    const orgFluencyBlock = orgFluencyContent
      ? "ORG-FLUENCY CONTENT:\n" + orgFluencyContent
      : "ORG-FLUENCY CONTENT:\nNo org-fluency context provided — generate context-independent scenarios";

    const dynamicSuffix =
      "PERFORMANCE SUMMARY:\n" +
      JSON.stringify(performanceSummary, null, 2) +
      "\n\n" +
      orgFluencyBlock;

    const abort = new AbortController();
    const timeoutId = setTimeout(() => abort.abort(), 280_000);

    const tModel = Date.now();
    let questionMessage: Awaited<ReturnType<typeof anthropic.messages.create>>;
    try {
      questionMessage = await anthropic.messages.create(
        {
          model: "claude-sonnet-4-6",
          max_tokens: 4000,
          system: [
            {
              type: "text",
              text:
                "You are an adaptive assessment question generator. Produce structured JSON output only.\n\n" +
                questionPromptTemplate,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [
            { role: "user", content: dynamicSuffix },
          ],
        },
        { signal: abort.signal },
      );
    } finally {
      clearTimeout(timeoutId);
    }
    const modelElapsedMs = Date.now() - tModel;

    const questionText = questionMessage.content.find((c) => c.type === "text");
    if (!questionText || questionText.type !== "text") {
      throw new Error("No text content in question generation response");
    }

    const tier3Data = parseAIJson(questionText.text);

    logApiTiming({ route: "generate-tier3", startedAt, modelElapsedMs, usage: questionMessage.usage });
    return NextResponse.json({
      performanceSummary,
      tier3Questions: tier3Data.questions,
    });
  } catch (e: any) {
    console.error("generate-tier3 error:", e);
    const isAbort =
      e?.name === "AbortError" ||
      e?.code === "ERR_CANCELED" ||
      e?.message?.includes("aborted") ||
      e?.message?.includes("timed out");
    if (isAbort) {
      return NextResponse.json(
        { error: "Question generation timed out. Please try again." },
        { status: 504 },
      );
    }
    if (e?.status === 429) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again in a moment." },
        { status: 429 },
      );
    }
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
