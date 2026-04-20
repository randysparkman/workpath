import { useState, useEffect, useCallback, useRef } from "react";
import { intakeQuestions, type IntakeAnswers } from "@/data/intake-questions";
import { getSupabase } from "@/lib/supabase";
import { useAssessmentScoring } from "@/hooks/use-assessment-scoring";
import {
  getTier1Questions,
  getTier1QuestionsRaw,
  getTier2Questions,
  getTier2QuestionsRaw,
  getTier2UserFacing,
  type WorkContext,
} from "@/data/work-contexts";
import type { ScenarioQuestion } from "@/data/assessment-types";
import { generateResumeCode, saveSession, type SessionState } from "@/lib/session";
import { getContextById } from "@/data/work-contexts";

export type Screen =
  | "welcome"
  | "name_input"
  | "intake"
  | "playback"
  | "transition1"
  | "tier1"
  | "analyzing_t1"
  | "transition2"
  | "tier2"
  | "analyzing_t2t3"
  | "transition3"
  | "tier3"
  | "complete"
  | "analyzing_profile"
  | "profile";

export function useAssessmentFlow(urlSlug?: string) {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [intakeIndex, setIntakeIndex] = useState(0);
  const [intakeAnswers, setIntakeAnswers] = useState<IntakeAnswers>({});
  const [t1Index, setT1Index] = useState(0);
  const [t1Responses, setT1Responses] = useState<Record<string, string>>({});
  const [t2Index, setT2Index] = useState(0);
  const [t2Responses, setT2Responses] = useState<Record<string, string>>({});
  const [t3Index, setT3Index] = useState(0);
  const [t3Responses, setT3Responses] = useState<Record<string, string>>({});
  const [userName, setUserName] = useState("");
  const [selectedContext, setSelectedContext] = useState<WorkContext | null>(null);
  const [assessmentStartedAt, setAssessmentStartedAt] = useState<string | null>(null);
  const [resumeCode, setResumeCode] = useState<string | null>(null);
  const resumeCodeRef = useRef<string | null>(null);

  const handleSetSelectedContext = useCallback((ctx: WorkContext | null) => {
    setSelectedContext(ctx);
    if (ctx) setAssessmentStartedAt(new Date().toISOString());
  }, []);

  // Derived from selected context
  const orgName = selectedContext?.orgName || "";
  const roleDescription = selectedContext?.roleDescription || "";
  const tier1Questions: ScenarioQuestion[] = selectedContext ? getTier1Questions(selectedContext) : [];
  const tier1QuestionsRaw = selectedContext ? getTier1QuestionsRaw(selectedContext) : [];
  const tier2Questions: ScenarioQuestion[] = selectedContext ? getTier2Questions(selectedContext) : [];
  const tier2QuestionsRaw = selectedContext ? getTier2QuestionsRaw(selectedContext) : [];
  const tier2UserFacing = selectedContext
    ? getTier2UserFacing(selectedContext)
    : { transition_text: "", response_placeholder: "", completion_text: "" };

  const scoring = useAssessmentScoring();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [screen]);

  // Auto-save in-progress session (debounced 500ms). Skip pre-context screens
  // and terminal states where there's nothing actionable to resume.
  useEffect(() => {
    if (!selectedContext) return;
    if (screen === "welcome" || screen === "name_input" || screen === "profile") return;

    let code = resumeCodeRef.current;
    if (!code) {
      code = generateResumeCode();
      resumeCodeRef.current = code;
      setResumeCode(code);
    }

    const timer = setTimeout(() => {
      const state: SessionState = {
        screen,
        userName,
        selectedContextId: selectedContext.id,
        assessmentStartedAt,
        intakeIndex,
        intakeAnswers,
        t1Index,
        t1Responses,
        t1Scores: scoring.t1Scores,
        t2Index,
        t2Responses,
        t2Scores: scoring.t2Scores,
        t3Index,
        t3Responses,
        t3Scores: scoring.t3Scores,
        t3Questions: scoring.t3Questions,
        t3QuestionsRaw: scoring.t3QuestionsRaw,
      };
      saveSession(code!, state, urlSlug ?? selectedContext.id).catch((e) => {
        console.warn("Session save failed:", e);
      });
    }, 500);

    return () => clearTimeout(timer);
  }, [
    screen, userName, selectedContext, assessmentStartedAt,
    intakeIndex, intakeAnswers,
    t1Index, t1Responses, scoring.t1Scores,
    t2Index, t2Responses, scoring.t2Scores,
    t3Index, t3Responses, scoring.t3Scores,
    scoring.t3Questions, scoring.t3QuestionsRaw,
    urlSlug,
  ]);

  useEffect(() => {
    if (scoring.scoringStep === "done" && scoring.profile) {
      setScreen("profile");
      // Fire-and-forget full completion record
      if (selectedContext && scoring.profile) {
        const p = scoring.profile;
        const allResponses = { ...t1Responses, ...t2Responses, ...t3Responses };

        // Build scored_responses with verbatim answers
        const buildScoredPayload = () => {
          const allScored = [...scoring.t1Scores, ...scoring.t2Scores, ...scoring.t3Scores];
          // Fallback: use profile dimensions if individual scores aren't accessible
          return Object.entries(allResponses).map(([qid, response]) => {
            const match = allScored.find((s: any) => s.question_id === qid);
            const tier = qid.startsWith("t1_") ? 1 : qid.startsWith("t2_") ? 2 : 3;
            const rawList = tier === 1 ? tier1QuestionsRaw : tier === 2 ? tier2QuestionsRaw : scoring.t3Questions;
            const q = rawList.find((q: any) => q.id === qid);
            return {
              question_id: qid,
              tier,
              scenario: q?.scenario || "",
              prompt: q?.prompt || "",
              response,
              orientation_level: match?.orientation_level || "",
              integration_level: match?.integration_level || "",
              judgment_level: match?.judgment_level || "",
              evidence_notes: match?.evidence_notes || "",
            };
          });
        };

        const assessmentData = {
          intake_answers: Object.values(intakeAnswers),
          scored_responses: buildScoredPayload(),
          profile_output: {
            band: p.band,
            summary: p.summary,
            dimensions: p.dimensions,
            doing_well: p.doing_well,
            growth_individual: p.next_capabilities,
            growth_organizational: p.organizational_opportunities,
          },
          timing: {
            started_at: assessmentStartedAt || new Date().toISOString(),
            profile_generated: new Date().toISOString(),
          },
        };

        const sb = getSupabase();
        sb?.from("assessment_completions")
          .insert({
            role_profile: selectedContext.id,
            respondent_name: userName.trim() || null,
            band: p.band,
            orientation_level: p.dimensions.orientation.level,
            integration_level: p.dimensions.integration.level,
            judgment_level: p.dimensions.judgment.level,
            assessment_data: assessmentData,
          })
          .then(({ error }) => {
            if (error) console.error("Completion insert failed:", error);
          });
      }
    }
  }, [scoring.scoringStep, scoring.profile, selectedContext]);

  const showHeader = screen !== "welcome" && !screen.startsWith("analyzing");

  const getBackLabel = useCallback(() => {
    const adjustScreens = ["playback", "transition1", "tier1", "transition2", "tier2", "transition3", "tier3", "complete"];
    return adjustScreens.includes(screen) ? "Adjust answers" : "Back";
  }, [screen]);

  const handleBack = useCallback(() => {
    switch (screen) {
      case "name_input":
        setScreen("welcome");
        break;
      case "intake":
        if (intakeIndex > 0) setIntakeIndex(intakeIndex - 1);
        else setScreen("name_input");
        break;
      case "playback":
        setIntakeIndex(intakeQuestions.length - 1);
        setScreen("intake");
        break;
      case "transition1":
        setScreen("playback");
        break;
      case "tier1":
        if (t1Index > 0) setT1Index(t1Index - 1);
        else setScreen("transition1");
        break;
      case "transition2":
        setT1Index(tier1Questions.length - 1);
        setScreen("tier1");
        break;
      case "tier2":
        if (t2Index > 0) setT2Index(t2Index - 1);
        else setScreen("transition2");
        break;
      case "transition3":
        setT2Index(tier2Questions.length - 1);
        setScreen("tier2");
        break;
      case "tier3":
        if (t3Index > 0) setT3Index(t3Index - 1);
        else setScreen("transition3");
        break;
      case "complete":
        if (scoring.t3Questions.length > 0) {
          setT3Index(scoring.t3Questions.length - 1);
          setScreen("tier3");
        }
        break;
      case "profile":
        setScreen("complete");
        break;
    }
  }, [screen, intakeIndex, t1Index, t2Index, t3Index, tier1Questions.length, tier2Questions.length, scoring.t3Questions.length]);

  const hydrateFromSession = useCallback((code: string, state: SessionState) => {
    const ctx = getContextById(state.selectedContextId ?? "");
    if (!ctx) return false;

    resumeCodeRef.current = code;
    setResumeCode(code);

    setSelectedContext(ctx);
    setUserName(state.userName);
    setAssessmentStartedAt(state.assessmentStartedAt);
    setIntakeIndex(state.intakeIndex);
    setIntakeAnswers(state.intakeAnswers);
    setT1Index(state.t1Index);
    setT1Responses(state.t1Responses);
    setT2Index(state.t2Index);
    setT2Responses(state.t2Responses);
    setT3Index(state.t3Index);
    setT3Responses(state.t3Responses);
    scoring.hydrate({
      t1Scores: state.t1Scores,
      t2Scores: state.t2Scores,
      t3Scores: state.t3Scores,
      t3Questions: state.t3Questions,
      t3QuestionsRaw: state.t3QuestionsRaw,
    });
    setScreen(state.screen);
    return true;
  }, [scoring]);

  const handleReset = useCallback(() => {
    setUserName("");
    setIntakeAnswers({});
    setIntakeIndex(0);
    setT1Responses({});
    setT1Index(0);
    setT2Responses({});
    setT2Index(0);
    setT3Responses({});
    setT3Index(0);
    setSelectedContext(null);
    setAssessmentStartedAt(null);
    setResumeCode(null);
    resumeCodeRef.current = null;
    setScreen("welcome");
  }, []);

  const handleTier1Complete = useCallback(async () => {
    setScreen("analyzing_t1");
    try {
      await scoring.scoreTier1(t1Responses, tier1QuestionsRaw);
      setScreen("transition2");
    } catch {
      // error state handled by hook
    }
  }, [t1Responses, tier1QuestionsRaw, scoring.scoreTier1]);

  const handleTier2Complete = useCallback(async () => {
    if (!selectedContext) return;
    setScreen("analyzing_t2t3");
    try {
      const t2Result = await scoring.scoreTier2(
        t2Responses, tier2QuestionsRaw, t1Responses, tier1QuestionsRaw
      );
      await scoring.generateTier3Questions(
        selectedContext.orgFluencyRaw,
        t2Result.performanceSummary
      );
      setScreen("transition3");
    } catch {
      // error state handled by hook
    }
  }, [selectedContext, t1Responses, t2Responses, tier1QuestionsRaw, tier2QuestionsRaw, scoring.scoreTier2, scoring.generateTier3Questions]);

  const handleViewProfile = useCallback(async () => {
    if (!selectedContext) return;
    setScreen("analyzing_profile");
    try {
      const effectiveName = userName.trim() || "Anonymous";
      await scoring.scoreTier3AndGenerateProfile(
        t1Responses, t2Responses, t3Responses, intakeAnswers,
        orgName, selectedContext.orgFluencyRaw,
        tier1QuestionsRaw, tier2QuestionsRaw, effectiveName
      );
    } catch {
      // error state handled by hook
    }
  }, [selectedContext, userName, t1Responses, t2Responses, t3Responses, intakeAnswers, orgName, tier1QuestionsRaw, tier2QuestionsRaw, scoring.scoreTier3AndGenerateProfile]);

  return {
    // Screen state
    screen,
    setScreen,
    showHeader,
    getBackLabel,

    // Navigation handlers
    handleBack,
    handleReset,
    handleTier1Complete,
    handleTier2Complete,
    handleViewProfile,

    // Intake state
    intakeIndex,
    setIntakeIndex,
    intakeAnswers,
    setIntakeAnswers,

    // User & context
    userName,
    setUserName,
    selectedContext,
    setSelectedContext: handleSetSelectedContext,
    orgName,
    roleDescription,

    // Tier questions (display)
    tier1Questions,
    tier2Questions,
    tier2UserFacing,

    // Tier indices & responses
    t1Index,
    setT1Index,
    t1Responses,
    setT1Responses,
    t2Index,
    setT2Index,
    t2Responses,
    setT2Responses,
    t3Index,
    setT3Index,
    t3Responses,
    setT3Responses,

    // Session
    resumeCode,
    hydrateFromSession,

    // Scoring (forwarded)
    isScoring: scoring.isScoring,
    scoringStep: scoring.scoringStep,
    profile: scoring.profile,
    scoringError: scoring.error,
    t3Questions: scoring.t3Questions,
  };
}
