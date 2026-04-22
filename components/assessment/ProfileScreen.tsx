"use client";
import { useState, useRef } from "react";
import { FadeIn } from "./FadeIn";
import { DownloadIcon } from "./Icons";
import type { ProfileData } from "@/data/mock-profile";
import { downloadProfilePdf, type AssessmentResponse } from "@/lib/generatePdf";

interface ProfileScreenProps {
  profile: ProfileData;
  onReset: () => void;
  userName?: string;
  orgName?: string;
  assessmentResponses?: AssessmentResponse[];
}

const BAND_COLORS: Record<string, string> = {
  Emerging: "text-band-emerging",
  Developing: "text-accent",
  Demonstrating: "text-green",
};

const CONSTRUCT_ACCENT: Record<string, string> = {
  orientation: "bg-navy",
  integration: "bg-green",
  judgment: "bg-accent",
};

const CONSTRUCT_LABELS: Record<string, string> = {
  orientation: "ORIENTATION",
  integration: "INTEGRATION",
  judgment: "JUDGMENT",
};

function PlacementScale({ band }: { band: string }) {
  const bands = ["Emerging", "Developing", "Demonstrating"] as const;
  return (
    <div className="flex items-center gap-2 text-[0.82rem]">
      {bands.map((b, i) => (
        <span key={b} className="flex items-center gap-2">
          {i > 0 && <span className="text-border">·</span>}
          <span
            className={
              b === band
                ? `font-semibold ${BAND_COLORS[b]}`
                : "text-border"
            }
          >
            {b}
          </span>
        </span>
      ))}
    </div>
  );
}

function ConstructCard({
  name,
  level,
  detail,
  delay,
}: {
  name: string;
  level: string;
  detail: string;
  delay: number;
}) {
  const key = name.toLowerCase() as keyof typeof CONSTRUCT_ACCENT;
  const accentClass = CONSTRUCT_ACCENT[key] || "bg-navy";
  const badgeColor = BAND_COLORS[level] || "text-muted-foreground";

  return (
    <FadeIn delay={delay}>
      <div className="bg-card border-[1.5px] border-border rounded-lg overflow-hidden mb-3">
        <div className="flex">
          <div className={`w-[5px] flex-shrink-0 ${accentClass}`} />
          <div className="p-5 flex-1">
            <div className="flex items-center gap-3 mb-3">
              <span className="font-serif text-[1rem] font-semibold text-foreground tracking-wide">
                {CONSTRUCT_LABELS[key] || name.toUpperCase()}
              </span>
              <span
                className={`text-[0.7rem] font-semibold px-2.5 py-0.5 rounded ${badgeColor} bg-current/10`}
                style={{
                  backgroundColor:
                    level === "Emerging"
                      ? "hsl(var(--band-emerging-muted))"
                      : level === "Developing"
                      ? "hsl(var(--band-developing-muted))"
                      : "hsl(var(--band-demonstrating-muted))",
                }}
              >
                <span className={badgeColor}>{level}</span>
              </span>
            </div>
            <p className="text-[0.88rem] text-foreground leading-[1.6] m-0">
              {detail}
            </p>
          </div>
        </div>
      </div>
    </FadeIn>
  );
}

function ListSection({
  title,
  items,
  dotColorClass,
  delay,
}: {
  title: string;
  items: string[];
  dotColorClass: string;
  delay: number;
}) {
  return (
    <FadeIn delay={delay}>
      <h3 className="font-serif text-[1.15rem] font-semibold text-foreground mb-4 mt-8 tracking-[-0.01em]">
        {title}
      </h3>
      <div className="bg-card border-[1.5px] border-border rounded-lg p-5 mb-3.5">
        {items.map((item, i) => (
          <div
            key={i}
            className={`flex gap-3 items-start py-2 ${
              i < items.length - 1 ? "border-b border-border-light" : ""
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full ${dotColorClass} flex-shrink-0 mt-1.5`}
            />
            <p className="text-[0.9rem] text-foreground leading-[1.55] m-0">
              {item}
            </p>
          </div>
        ))}
      </div>
    </FadeIn>
  );
}

export function ProfileScreen({
  profile,
  onReset,
  userName = "",
  orgName = "",
  assessmentResponses = [],
}: ProfileScreenProps) {
  const p = profile;
  const [audioState, setAudioState] = useState<"idle" | "loading" | "playing">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function handleListenSummary() {
    if (audioState === "playing") {
      audioRef.current?.pause();
      setAudioState("idle");
      return;
    }
    setAudioState("loading");
    try {
      const res = await fetch("/api/generate-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: p.summary }),
      });
      if (!res.ok) throw new Error("audio generation failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setAudioState("idle");
      audio.play();
      setAudioState("playing");
    } catch {
      setAudioState("idle");
    }
  }

  const firstName = userName.trim().split(/\s+/)[0];
  const profileTitle = firstName
    ? `${firstName}'s WorkPath Profile`
    : "WorkPath Profile";
  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="max-w-[640px] mx-auto">
      {/* Title + Placement */}
      <FadeIn delay={100}>
        <p className="text-[0.72rem] text-accent uppercase tracking-[0.1em] font-semibold mb-1.5">
          Your Results
        </p>
        <h1 className="font-serif text-[1.8rem] font-bold text-foreground tracking-[-0.02em] mb-1.5 leading-[1.2]">
          {profileTitle}
        </h1>
        <p className="text-[0.85rem] text-muted-foreground mb-3">{dateStr}</p>
        <PlacementScale band={p.band} />
        <div className="mt-6 mb-8" />
      </FadeIn>

      {/* Summary */}
      <FadeIn delay={300}>
        <div className="bg-card border-[1.5px] border-border rounded-lg p-6 mb-8 border-l-[3px] border-l-accent">
          <p className="text-[0.98rem] text-foreground leading-[1.7] m-0">
            {p.summary}
          </p>
        </div>
      </FadeIn>

      {/* Readiness Dimensions */}
      {p.dimensions && (
        <>
          <FadeIn delay={400}>
            <h3 className="font-serif text-[1.15rem] font-semibold text-foreground mb-2 mt-8 tracking-[-0.01em]">
              Readiness Dimensions
            </h3>
            <p className="text-[0.75rem] leading-[1.5] mb-5" style={{ color: "#a8a4a0" }}>
              <span className="font-semibold">Orientation</span> — How well you
              understand AI &nbsp;·&nbsp;{" "}
              <span className="font-semibold">Integration</span> — How
              effectively you use AI &nbsp;·&nbsp;{" "}
              <span className="font-semibold">Judgment</span> — How well you
              reason under pressure
            </p>
          </FadeIn>

          <ConstructCard
            name="orientation"
            level={p.dimensions.orientation.level}
            detail={p.dimensions.orientation.detail}
            delay={450}
          />
          <ConstructCard
            name="integration"
            level={p.dimensions.integration.level}
            detail={p.dimensions.integration.detail}
            delay={500}
          />
          <ConstructCard
            name="judgment"
            level={p.dimensions.judgment.level}
            detail={p.dimensions.judgment.detail}
            delay={550}
          />
        </>
      )}

      {/* What You're Doing Well */}
      <ListSection
        title="What You're Doing Well"
        items={p.doing_well}
        dotColorClass="bg-green"
        delay={600}
      />

      {/* Next Capabilities to Build */}
      <ListSection
        title="Next Capabilities to Build"
        items={p.next_capabilities}
        dotColorClass="bg-accent"
        delay={700}
      />

      {/* Your Next Step */}
      <FadeIn delay={800}>
        <h3 className="font-serif text-[1.15rem] font-semibold text-foreground mb-4 mt-8 tracking-[-0.01em]">
          Your Next Step
        </h3>
        <div className="bg-background border-[1.5px] border-border rounded-lg p-6 mb-3.5 border-l-[4px] border-l-accent">
          <p className="text-[0.98rem] text-foreground leading-[1.7] m-0 font-medium">
            {p.primary_next_step}
          </p>
        </div>
      </FadeIn>

      {/* Organizational Opportunities */}
      {p.organizational_opportunities &&
        p.organizational_opportunities.length > 0 && (
          <FadeIn delay={900}>
            <h3 className="font-serif text-[1.15rem] font-semibold text-foreground mb-2 mt-8 tracking-[-0.01em]">
              Organizational Opportunities
            </h3>
            <p className="text-[0.78rem] text-muted-foreground italic mb-4">
              The following recommendations are addressed to the organization
              based on patterns observed in this assessment.
            </p>
            <div className="bg-card border-[1.5px] border-border rounded-lg p-5 mb-3.5">
              {p.organizational_opportunities.map((item, i) => (
                <div
                  key={i}
                  className={`flex gap-3 items-start py-2 ${
                    i < p.organizational_opportunities.length - 1
                      ? "border-b border-border-light"
                      : ""
                  }`}
                >
                  <div className="w-2 h-2 rounded-full bg-muted-foreground flex-shrink-0 mt-1.5" />
                  <p className="text-[0.9rem] text-foreground leading-[1.55] m-0">
                    {item}
                  </p>
                </div>
              ))}
            </div>
          </FadeIn>
        )}

      <FadeIn delay={1000}>
        <div className="text-center mt-10 mb-10">
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button
              onClick={() =>
                downloadProfilePdf(p, userName, orgName, assessmentResponses)
              }
              className="py-3 px-7 bg-transparent text-primary border-[1.5px] border-primary rounded-lg font-sans text-[0.88rem] font-medium cursor-pointer tracking-[0.02em] transition-all duration-250 ease-out inline-flex items-center gap-2 hover:bg-primary hover:text-primary-foreground active:scale-[0.97]"
            >
              <DownloadIcon />
              Download PDF
            </button>
            <button
              onClick={handleListenSummary}
              disabled={audioState === "loading"}
              className="py-3 px-7 bg-transparent text-primary border-[1.5px] border-primary rounded-lg font-sans text-[0.88rem] font-medium cursor-pointer tracking-[0.02em] transition-all duration-250 ease-out inline-flex items-center gap-2 hover:bg-primary hover:text-primary-foreground active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {audioState === "loading" ? (
                <>
                  <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Generating…
                </>
              ) : audioState === "playing" ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                  Stop
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  </svg>
                  Listen to Summary
                </>
              )}
            </button>
          </div>
          <p className="text-[0.78rem] text-muted-foreground mt-2.5">
            Download a formatted PDF · or hear your summary read aloud
          </p>
          <button
            onClick={onReset}
            className="mt-6 py-2.5 px-6 bg-transparent text-muted-foreground border border-border-light rounded-lg font-sans text-[0.82rem] cursor-pointer transition-colors duration-200 hover:text-foreground hover:border-border active:scale-[0.97]"
          >
            Start New Assessment
          </button>
        </div>
      </FadeIn>
    </div>
  );
}
