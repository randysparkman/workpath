"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { intakeQuestions } from "@/data/intake-questions";
import { getContextBySlug } from "@/data/work-contexts";
import { loadSession } from "@/lib/session";
import { WelcomeScreen } from "@/components/assessment/WelcomeScreen";
import { NameInputScreen } from "@/components/assessment/NameInputScreen";
import { IntakeScreen } from "@/components/assessment/IntakeScreen";
import { PlaybackScreen } from "@/components/assessment/PlaybackScreen";
import { TransitionScreen } from "@/components/assessment/TransitionScreen";
import { ScenarioScreen } from "@/components/assessment/ScenarioScreen";
import { AssessmentCompleteScreen } from "@/components/assessment/AssessmentCompleteScreen";
import { AnalyzingScreen } from "@/components/assessment/AnalyzingScreen";
import { ProfileScreen } from "@/components/assessment/ProfileScreen";
import { AppHeader } from "@/components/assessment/AppHeader";
import { InvalidProfileScreen } from "@/components/assessment/InvalidProfileScreen";
import { useAssessmentFlow } from "@/hooks/use-assessment-flow";
import type { AssessmentResponse } from "@/lib/generatePdf";

interface AssessmentPageProps {
  slug?: string;
}

export default function AssessmentPage({ slug }: AssessmentPageProps) {
  const preselectedContext = slug ? getContextBySlug(slug) : undefined;
  const isInvalidSlug = !!slug && !preselectedContext;

  const flow = useAssessmentFlow(slug);

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const resumeAttempted = useRef(false);
  const [resumeStatus, setResumeStatus] = useState<"idle" | "loading" | "notfound">("idle");

  useEffect(() => {
    if (resumeAttempted.current) return;
    const code = searchParams?.get("resume");
    if (!code) return;
    resumeAttempted.current = true;
    setResumeStatus("loading");

    loadSession(code.toUpperCase()).then((result) => {
      if (result && flow.hydrateFromSession(code.toUpperCase(), result.state)) {
        setResumeStatus("idle");
      } else {
        setResumeStatus("notfound");
      }
      // Clean the URL so a reload doesn't re-trigger
      router.replace(pathname ?? "/");
    });
  }, [searchParams, flow, router, pathname]);

  if (isInvalidSlug) {
    return <InvalidProfileScreen slug={slug} />;
  }

  if (resumeStatus === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 font-sans text-sm text-muted-foreground">
        Resuming your assessment…
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-background ${flow.showHeader ? "pt-7" : "py-[60px]"} px-6 font-sans`}>
      {flow.showHeader && (
        <AppHeader onBack={flow.handleBack} backLabel={flow.getBackLabel()} orgName={flow.orgName} roleDescription={flow.roleDescription} />
      )}

      {flow.screen === "welcome" && (
        <>
          {resumeStatus === "notfound" && (
            <div className="max-w-md mx-auto mt-4 mb-6 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              That resume code wasn't found or has expired. Starting a new assessment.
            </div>
          )}
          <WelcomeScreen
            onStart={(ctx) => { flow.setSelectedContext(ctx); flow.setScreen("name_input"); }}
            preselectedContext={preselectedContext}
          />
        </>
      )}

      {flow.screen === "name_input" && (
        <NameInputScreen
          userName={flow.userName}
          onNameChange={flow.setUserName}
          onContinue={() => flow.setScreen("intake")}
          onBack={() => flow.setScreen("welcome")}
        />
      )}

      {flow.screen === "intake" && (
        <IntakeScreen
          questions={intakeQuestions}
          questionIndex={flow.intakeIndex}
          selectedValue={flow.intakeAnswers[intakeQuestions[flow.intakeIndex].id]}
          onSelect={(val) =>
            flow.setIntakeAnswers({ ...flow.intakeAnswers, [intakeQuestions[flow.intakeIndex].id]: val })
          }
          onNext={() => {
            if (flow.intakeIndex < intakeQuestions.length - 1) flow.setIntakeIndex(flow.intakeIndex + 1);
            else flow.setScreen("playback");
          }}
          onBack={() => {
            if (flow.intakeIndex > 0) flow.setIntakeIndex(flow.intakeIndex - 1);
            else flow.setScreen("name_input");
          }}
        />
      )}

      {flow.screen === "playback" && (
        <PlaybackScreen
          answers={flow.intakeAnswers}
          userName={flow.userName}
          onConfirm={() => flow.setScreen("transition1")}
          onAdjust={() => {
            flow.setIntakeIndex(0);
            flow.setScreen("intake");
          }}
        />
      )}

      {flow.screen === "transition1" && (
        <TransitionScreen onBegin={() => flow.setScreen("tier1")} />
      )}

      {flow.screen === "tier1" && flow.tier1Questions.length > 0 && (
        <ScenarioScreen
          question={flow.tier1Questions[flow.t1Index]}
          questionIndex={flow.t1Index}
          totalQuestions={flow.tier1Questions.length}
          response={flow.t1Responses[flow.tier1Questions[flow.t1Index].id] || ""}
          onResponseChange={(val) =>
            flow.setT1Responses({ ...flow.t1Responses, [flow.tier1Questions[flow.t1Index].id]: val })
          }
          onNext={() => {
            if (flow.t1Index < flow.tier1Questions.length - 1) flow.setT1Index(flow.t1Index + 1);
            else flow.handleTier1Complete();
          }}
          onBack={() => {
            if (flow.t1Index > 0) flow.setT1Index(flow.t1Index - 1);
            else flow.setScreen("transition1");
          }}
          tierLabel="Tier 1 — Baseline"
        />
      )}

      {flow.screen === "analyzing_t1" && (
        <AnalyzingScreen
          step={flow.scoringStep}
          error={flow.scoringError}
          onRetry={flow.handleTier1Complete}
        />
      )}

      {flow.screen === "transition2" && (
        <TransitionScreen
          onBegin={() => flow.setScreen("tier2")}
          title="Nice work — let's get specific"
          subtitle={flow.tier2UserFacing.transition_text}
          tipText="Same format — 2–4 sentences, just your honest take."
        />
      )}

      {flow.screen === "tier2" && flow.tier2Questions.length > 0 && (
        <ScenarioScreen
          question={flow.tier2Questions[flow.t2Index]}
          questionIndex={flow.t2Index}
          totalQuestions={flow.tier2Questions.length}
          response={flow.t2Responses[flow.tier2Questions[flow.t2Index].id] || ""}
          onResponseChange={(val) =>
            flow.setT2Responses({ ...flow.t2Responses, [flow.tier2Questions[flow.t2Index].id]: val })
          }
          onNext={() => {
            if (flow.t2Index < flow.tier2Questions.length - 1) flow.setT2Index(flow.t2Index + 1);
            else flow.handleTier2Complete();
          }}
          onBack={() => {
            if (flow.t2Index > 0) flow.setT2Index(flow.t2Index - 1);
            else flow.setScreen("transition2");
          }}
          tierLabel="Tier 2 — Role-Specific"
        />
      )}

      {flow.screen === "analyzing_t2t3" && (
        <AnalyzingScreen
          step={flow.scoringStep}
          error={flow.scoringError}
          onRetry={flow.handleTier2Complete}
        />
      )}

      {flow.screen === "transition3" && (
        <TransitionScreen
          onBegin={() => flow.setScreen("tier3")}
          title="Final section"
          subtitle="These last scenarios are tailored to what we've learned so far. Same approach — tell us what you'd do."
          tipText="Almost done. Five more scenarios."
        />
      )}

      {flow.screen === "tier3" && flow.t3Questions.length > 0 && (
        <ScenarioScreen
          question={flow.t3Questions[flow.t3Index]}
          questionIndex={flow.t3Index}
          totalQuestions={flow.t3Questions.length}
          response={flow.t3Responses[flow.t3Questions[flow.t3Index].id] || ""}
          onResponseChange={(val) =>
            flow.setT3Responses({ ...flow.t3Responses, [flow.t3Questions[flow.t3Index].id]: val })
          }
          onNext={() => {
            if (flow.t3Index < flow.t3Questions.length - 1) flow.setT3Index(flow.t3Index + 1);
            else flow.setScreen("complete");
          }}
          onBack={() => {
            if (flow.t3Index > 0) flow.setT3Index(flow.t3Index - 1);
            else flow.setScreen("transition3");
          }}
          tierLabel="Tier 3 — Adaptive"
        />
      )}

      {flow.screen === "complete" && (
        <AssessmentCompleteScreen onViewProfile={flow.handleViewProfile} />
      )}

      {flow.screen === "analyzing_profile" && (
        <AnalyzingScreen
          step={flow.scoringStep}
          error={flow.scoringError}
          onRetry={flow.handleViewProfile}
        />
      )}

      {flow.screen === "profile" && flow.profile && (() => {
        const responses: AssessmentResponse[] = [];
        for (const q of flow.tier1Questions) {
          responses.push({ tier: 1, questionIndex: q.sequence - 1, scenario: q.scenario, prompt: q.prompt, response: flow.t1Responses[q.id] || "" });
        }
        for (const q of flow.tier2Questions) {
          responses.push({ tier: 2, questionIndex: q.sequence - 1, scenario: q.scenario, prompt: q.prompt, response: flow.t2Responses[q.id] || "" });
        }
        for (const q of flow.t3Questions) {
          responses.push({ tier: 3, questionIndex: q.sequence - 1, scenario: q.scenario, prompt: q.prompt, response: flow.t3Responses[q.id] || "" });
        }
        return (
          <ProfileScreen
            profile={flow.profile}
            onReset={flow.handleReset}
            userName={flow.userName.trim() || "Anonymous"}
            orgName={flow.orgName}
            assessmentResponses={responses}
          />
        );
      })()}
    </div>
  );
}
