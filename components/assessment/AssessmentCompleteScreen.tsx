"use client";
import { FadeIn } from "./FadeIn";
import { IconCircle, CompletionIcon } from "./Icons";
import { NavButton } from "./NavButton";

interface AssessmentCompleteScreenProps {
  onViewProfile: () => void;
}

export function AssessmentCompleteScreen({ onViewProfile }: AssessmentCompleteScreenProps) {
  return (
    <div className="max-w-[560px] mx-auto text-center">
      <FadeIn delay={200}><IconCircle><CompletionIcon /></IconCircle></FadeIn>
      <FadeIn delay={400}>
        <h2 className="font-serif text-[1.6rem] font-semibold text-foreground tracking-[-0.01em] mb-4 leading-[1.3]">
          You've completed the scenarios
        </h2>
      </FadeIn>
      <FadeIn delay={600}>
        <p className="text-base text-muted-foreground leading-[1.65] max-w-[440px] mx-auto mb-9">
          Before we build your profile, take a moment if you'd like. You can go back and revise a response, or generate your profile now.
        </p>
      </FadeIn>
      <FadeIn delay={1000}>
        <NavButton label="Generate My Profile →" onClick={onViewProfile} primary />
      </FadeIn>
    </div>
  );
}
