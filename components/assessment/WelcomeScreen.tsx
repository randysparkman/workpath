"use client";
import { useState, useRef, useEffect } from "react";
import { FadeIn } from "./FadeIn";
import { IconCircle, LayersIcon } from "./Icons";
import { NavButton } from "./NavButton";
import { workContexts, type WorkContext } from "@/data/work-contexts";
import { ChevronDown } from "lucide-react";

interface WelcomeScreenProps {
  onStart: (context: WorkContext) => void;
  preselectedContext?: WorkContext | null;
}

const aboutSections = [
  {
    label: "What you'll experience",
    body: "This has three sections, each with five short scenarios. The first section presents everyday workplace situations involving AI tools — these help establish how you think about AI when it shows up in your work. The second section shifts to scenarios grounded in your specific work context, reflecting the tasks and situations you'd actually encounter. The third section adapts based on your earlier responses — it rounds out the picture by exploring areas where your thinking was most interesting or where we want to understand more.",
  },
  {
    label: "How the scenarios work",
    body: "Every scenario describes a realistic situation and asks what you would do. There are no trick questions and no right answers. We're not testing what you know about AI — we're listening for how you think when AI tools are part of the picture. The scenarios progress from how you understand AI, to how you'd work with it, to how your reasoning holds when things get more complex.",
  },
  {
    label: "What you'll receive",
    body: "Your responses are read across three dimensions: whether you have a working mental model for AI tools, whether you can describe how you'd actually use them in your work, and whether you make sound decisions when the stakes are real or the situation is ambiguous. The result is a personalized readiness profile — not a pass/fail score, not a grade, but a clear picture of your capabilities and where your next growth is.",
  },
];

export function WelcomeScreen({ onStart, preselectedContext }: WelcomeScreenProps) {
  const [showAbout, setShowAbout] = useState(false);
  const [selectedContextId, setSelectedContextId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);

  const handleCopyEmail = () => {
    navigator.clipboard.writeText("info@wkpath.com").then(
      () => {
        setEmailCopied(true);
        setTimeout(() => setEmailCopied(false), 2000);
      },
      () => {
        // Clipboard unavailable — leave label unchanged
      }
    );
  };
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isPartnerMode = !!preselectedContext;
  const selectedContext = isPartnerMode
    ? preselectedContext
    : workContexts.find((c) => c.id === selectedContextId) || null;
  const canStart = !!selectedContext
    && selectedContext.tier1Data?.questions?.length > 0
    && selectedContext.tier2Data?.questions?.length > 0;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="text-center max-w-[560px] mx-auto bg-white/70 rounded-2xl border border-border-light/50 px-4 py-8 sm:px-8 sm:py-10 shadow-sm">
      <FadeIn delay={100}>
        <IconCircle><LayersIcon /></IconCircle>
      </FadeIn>
      <FadeIn delay={150}>
        <p className="text-[0.78rem] font-semibold uppercase tracking-[0.14em] text-accent mt-1 mb-3">
          Intelligence Applied
        </p>
      </FadeIn>
      <FadeIn delay={250}>
        <h1 className="font-serif text-[1.7rem] sm:text-[2.4rem] font-medium text-foreground tracking-[-0.01em] mb-0 leading-[1.15]">
          The WorkPath Assessment
        </h1>
      </FadeIn>
      <FadeIn delay={400}>
        <p className="text-[1.02rem] text-muted-foreground leading-[1.65] max-w-[480px] mx-auto mb-3 mt-6">
          A structured, scenario-based assessment that reveals how you actually use AI tools — and how you think when AI is part of your job.
        </p>
        <button
          onClick={() => setShowAbout(!showAbout)}
          className="text-[0.88rem] font-medium text-accent bg-transparent border-none cursor-pointer mb-4 mx-auto block"
          style={{
            textDecoration: "underline",
            textUnderlineOffset: "3px",
            textDecorationColor: "hsl(var(--accent) / 0.6)",
          }}
        >
          More about how this works
        </button>

        <div
          className="overflow-hidden transition-all duration-400 ease-in-out"
          style={{
            maxHeight: showAbout ? "1200px" : "0",
            opacity: showAbout ? 1 : 0,
          }}
        >
          <div className="text-left max-w-[480px] mx-auto mb-6 bg-card border border-border rounded-lg p-6">
            <h3 className="font-serif text-[1.1rem] font-semibold text-foreground mb-4">
              How This Works
            </h3>
            {aboutSections.map((s, i) => (
              <div key={i} className={i < aboutSections.length - 1 ? "mb-4" : ""}>
                <p className="text-[0.82rem] font-semibold uppercase tracking-[0.06em] text-accent mb-1.5">
                  {s.label}
                </p>
                <p className="text-[0.9rem] text-foreground leading-[1.7] m-0">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </FadeIn>
      <FadeIn delay={500}>
        <div className="flex justify-center mb-5 border border-border-light rounded-lg overflow-hidden max-w-[380px] mx-auto">
          <div className="flex-1 py-3 text-center border-r border-border-light">
            <span className="block font-serif text-[1.3rem] text-accent font-medium">15</span>
            <span className="block text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground mt-0.5">Scenarios</span>
          </div>
          <div className="flex-1 py-3 text-center border-r border-border-light">
            <span className="block font-serif text-[1.3rem] text-accent font-medium">3</span>
            <span className="block text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground mt-0.5">Dimensions</span>
          </div>
          <div className="flex-1 py-3 text-center">
            <span className="block font-serif text-[1.3rem] text-accent font-medium">&lt;30</span>
            <span className="block text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground mt-0.5">Minutes</span>
          </div>
        </div>
      </FadeIn>
      <FadeIn delay={650}>
        {isPartnerMode ? (
          <p className="text-[0.88rem] text-muted-foreground leading-relaxed max-w-[420px] mx-auto mb-10 italic">
            You are taking the assessment for: <span className="font-bold not-italic">{preselectedContext.label}</span>
          </p>
        ) : (
          <>
            <p className="text-[0.88rem] text-muted-foreground leading-relaxed max-w-[420px] mx-auto mb-6 italic">
              To begin, choose a job/role and the assessment will adapt accordingly.
            </p>

            <div className="max-w-[480px] mx-auto mb-10" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="w-full flex items-center justify-between px-4 py-3 bg-white rounded-[10px] text-left font-sans text-[0.95rem] transition-colors"
                style={{
                  border: dropdownOpen
                    ? "1.5px solid hsl(var(--accent))"
                    : "1.5px solid hsl(var(--border-light))",
                }}
              >
                <span className={selectedContext ? "text-foreground" : "text-muted-foreground"}>
                  {selectedContext ? selectedContext.label : "Select a job/role…"}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-muted-foreground transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
                />
              </button>

              {dropdownOpen && (
                <div
                  className="mt-1 bg-white rounded-[10px] overflow-hidden"
                  style={{
                    border: "1.5px solid hsl(var(--border-light))",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                  }}
                >
                  {workContexts.filter((ctx) => ctx.public).map((ctx) => (
                    <button
                      key={ctx.id}
                      disabled={!ctx.enabled}
                      onClick={() => {
                        if (ctx.enabled) {
                          setSelectedContextId(ctx.id);
                          setDropdownOpen(false);
                        }
                      }}
                      className={`w-full text-left px-4 py-3 transition-colors ${
                        !ctx.enabled
                          ? "opacity-50 cursor-not-allowed"
                          : selectedContextId === ctx.id
                          ? "bg-muted"
                          : "hover:bg-muted/50 cursor-pointer"
                      }`}
                    >
                      <span
                        className={`block text-[0.93rem] ${
                          selectedContextId === ctx.id ? "font-semibold" : "font-normal"
                        } text-foreground`}
                      >
                        {ctx.label}
                      </span>
                    </button>
                  ))}
                  <div className="px-4 py-3 border-t border-border-light">
                    <span className="block text-[0.85rem] italic text-gray-500">
                      Contact us about a custom job/role profile
                    </span>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {selectedContext && !canStart && (
          <p className="text-[0.82rem] text-muted-foreground leading-relaxed max-w-[420px] mx-auto mb-10">
            This profile route is live, but its assessment questions still need to be added.
          </p>
        )}
      </FadeIn>
      <FadeIn delay={800}>
        <NavButton
          label="Get Started"
          onClick={() => selectedContext && onStart(selectedContext)}
          primary
          disabled={!canStart}
        />
      </FadeIn>
      <FadeIn delay={950}>
        <p className="text-[0.78rem] text-muted-foreground mt-5">
          Contact:{" "}
          <button
            type="button"
            onClick={handleCopyEmail}
            className="text-accent hover:text-accent/80 transition-colors inline-flex items-center gap-1.5"
            style={{
              textDecoration: "underline",
              textUnderlineOffset: "3px",
            }}
          >
            {emailCopied ? "Copied \u2713" : "info@wkpath.com"}
            {!emailCopied && (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ width: "0.85em", height: "0.85em", opacity: 0.6 }}
              >
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
        </p>
      </FadeIn>
    </div>
  );
}
