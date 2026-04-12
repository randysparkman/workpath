import { NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";
import { parseAIJson } from "@/lib/parse-ai-json";

export async function POST(request: Request) {
  try {
    const {
      t1Scores, t2Scores, t1Questions, t2Questions,
      t1Responses, t2Responses, orgFluencyContent,
      summaryPromptTemplate, questionPromptTemplate,
    } = await request.json();

    if (!t1Scores || !t2Scores) {
      return NextResponse.json({ error: "Missing tier scores" }, { status: 400 });
    }

    // Step 1: Generate performance summary
    const allScored = [
      ...t1Scores.map((s: any, i: number) => ({
        ...s,
        tier: 1,
        question_angle: t1Questions[i]?.angle || "unknown",
        dol_content_area: s.dol_content_area || t1Questions[i]?.dol_content_area || "",
        human_function_activated: s.human_function_activated || t1Questions[i]?.human_function_activated || "",
        scenario: t1Questions[i]?.scenario?.substring(0, 100) || "",
        user_response: t1Responses[t1Questions[i]?.id] || "",
      })),
      ...t2Scores.map((s: any, i: number) => ({
        ...s,
        tier: 2,
        question_angle: t2Questions[i]?.angle || "unknown",
        dol_content_area: s.dol_content_area || t2Questions[i]?.dol_content_area || "",
        human_function_activated: s.human_function_activated || t2Questions[i]?.human_function_activated || "",
        scenario: t2Questions[i]?.scenario?.substring(0, 100) || "",
        user_response: t2Responses[t2Questions[i]?.id] || "",
      })),
    ];

    const summaryPrompt = summaryPromptTemplate + "\n\nSCORED RESPONSES:\n" + JSON.stringify(allScored, null, 2);

    const summaryMessage = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: "You are an assessment analysis engine. Produce structured JSON output only.",
      messages: [{ role: "user", content: summaryPrompt }],
    });

    const summaryText = summaryMessage.content.find((c) => c.type === "text");
    if (!summaryText || summaryText.type !== "text") {
      throw new Error("No text content in summary response");
    }

    const performanceSummary = parseAIJson(summaryText.text);

    // Step 2: Generate tier 3 questions
    let questionPrompt = questionPromptTemplate +
      "\n\nPERFORMANCE SUMMARY:\n" + JSON.stringify(performanceSummary, null, 2);

    if (orgFluencyContent) {
      questionPrompt += "\n\nORG-FLUENCY CONTENT:\n" + orgFluencyContent;
    } else {
      questionPrompt += "\n\nORG-FLUENCY CONTENT:\nNo org-fluency context provided — generate context-independent scenarios";
    }

    const questionMessage = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 6000,
      system: "You are an adaptive assessment question generator. Produce structured JSON output only.",
      messages: [{ role: "user", content: questionPrompt }],
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
      return NextResponse.json({ error: "Rate limit exceeded. Please try again in a moment." }, { status: 429 });
    }
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
