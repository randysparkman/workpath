import { NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";
import { parseAIJson } from "@/lib/parse-ai-json";

export const maxDuration = 60;

export async function POST(request: Request) {
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

    const questionMessage = await anthropic.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 6000,
      system:
        "You are an adaptive assessment question generator. Produce structured JSON output only.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: questionPromptTemplate,
              cache_control: { type: "ephemeral" },
            },
            { type: "text", text: dynamicSuffix },
          ],
        },
      ],
    });

    const questionText = questionMessage.content.find((c) => c.type === "text");
    if (!questionText || questionText.type !== "text") {
      throw new Error("No text content in question generation response");
    }

    const tier3Data = parseAIJson(questionText.text);

    return NextResponse.json({
      performanceSummary,
      tier3Questions: tier3Data.questions,
      tier3Meta: tier3Data.tier3_meta,
    });
  } catch (e: any) {
    console.error("generate-tier3 error:", e);
    if (e?.status === 429) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again in a moment." },
        { status: 429 },
      );
    }
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
