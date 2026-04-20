import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { parseAIJson } from "@/lib/parse-ai-json";
import { logApiTiming } from "@/lib/api-timing";

export const maxDuration = 120;

const anthropic = new Anthropic({ maxRetries: 1 });

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const { performanceSummary, orgFluencyContent, stemsPromptTemplate } =
      await request.json();

    if (!performanceSummary || !stemsPromptTemplate) {
      return NextResponse.json(
        { error: "Missing performanceSummary or stemsPromptTemplate" },
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
    const timeoutId = setTimeout(() => abort.abort(), 110_000);

    const tModel = Date.now();
    let message: Awaited<ReturnType<typeof anthropic.messages.create>>;
    try {
      message = await anthropic.messages.create(
        {
          model: "claude-sonnet-4-6",
          max_tokens: 2000,
          system: [
            {
              type: "text",
              text:
                "You are an adaptive assessment question generator. Produce structured JSON output only.\n\n" +
                stemsPromptTemplate,
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
      throw new Error("No text content in stems generation response");
    }

    const parsed = parseAIJson(text.text);
    const stems = parsed.questions;
    if (!Array.isArray(stems) || stems.length === 0) {
      throw new Error("Stems response missing questions array");
    }

    logApiTiming({
      route: "generate-tier3-stems",
      startedAt,
      modelElapsedMs,
      usage: message.usage,
    });
    return NextResponse.json({ stems });
  } catch (e: any) {
    console.error("generate-tier3-stems error:", e);
    const isAbort =
      e?.name === "AbortError" ||
      e?.code === "ERR_CANCELED" ||
      e?.message?.includes("aborted") ||
      e?.message?.includes("timed out");
    if (isAbort) {
      return NextResponse.json(
        { error: "Stem generation timed out. Please try again." },
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
