"use client";
import { FadeIn } from "./FadeIn";

interface AnalyzingScreenProps {
  step: string;
  error?: string | null;
  onRetry?: () => void;
}

const stepMessages: Record<string, string> = {
  scoring_t1: "Analyzing your baseline responses…",
  scoring_t2: "Analyzing your role-specific responses…",
  generating_t3: "Designing your adaptive questions…",
  scoring_t3: "Analyzing your final responses…",
  generating_profile: "Building your readiness profile…",
  done: "Almost there…",
  error: "Something went wrong",
};

const stepTimingMessages: Record<string, string> = {
  scoring_t1: "This should take about 10 seconds.",
  scoring_t2: "This should take about 30–45 seconds. We're scoring your responses and designing adaptive questions tailored to you.",
  generating_t3: "This should take about 30–45 seconds. We're scoring your responses and designing adaptive questions tailored to you.",
  scoring_t3: "This should take about 30–45 seconds. We're finalizing your scores and building your profile.",
  generating_profile: "This should take about 30–45 seconds. We're finalizing your scores and building your profile.",
  done: "Wrapping up…",
};

export function AnalyzingScreen({ step, error, onRetry }: AnalyzingScreenProps) {
  const message = stepMessages[step] || "Processing…";

  return (
    <div className="max-w-[480px] mx-auto text-center py-16">
      <FadeIn delay={100}>
        {step !== "error" ? (
          <div className="mb-8">
            <div className="w-10 h-10 mx-auto mb-6 border-[2.5px] border-accent border-t-transparent rounded-full animate-spin" />
            <h2 className="font-serif text-[1.4rem] font-semibold text-foreground tracking-[-0.01em] mb-3 leading-[1.3]">
              {message}
            </h2>
            <p className="text-[0.88rem] text-muted-foreground leading-relaxed">
              {stepTimingMessages[step] || "We're analyzing your responses against our readiness framework."}
            </p>
          </div>
        ) : (
          <div className="mb-8">
            <div className="w-10 h-10 mx-auto mb-6 rounded-full bg-destructive/10 flex items-center justify-center">
              <span className="text-destructive text-lg font-bold">!</span>
            </div>
            <h2 className="font-serif text-[1.4rem] font-semibold text-foreground tracking-[-0.01em] mb-3 leading-[1.3]">
              {stepMessages.error}
            </h2>
            <p className="text-[0.88rem] text-muted-foreground leading-relaxed mb-6">
              {error || "We couldn't generate your profile. Please try again."}
            </p>
            {onRetry && (
              <button
                onClick={onRetry}
                className="py-3 px-7 bg-primary text-primary-foreground rounded-lg font-sans text-[0.88rem] font-medium cursor-pointer tracking-[0.02em] transition-all duration-200 hover:opacity-90 active:scale-[0.97]"
              >
                Try again
              </button>
            )}
          </div>
        )}
      </FadeIn>
    </div>
  );
}
