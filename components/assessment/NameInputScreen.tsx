"use client";
import { useState } from "react";
import { FadeIn } from "./FadeIn";
import { ProgressBar } from "./ProgressBar";
import { NavButton } from "./NavButton";
import { VALID_ACCESS_TOKEN } from "@/lib/config";

interface NameInputScreenProps {
  userName: string;
  onNameChange: (name: string) => void;
  onContinue: () => void;
  onBack: () => void;
}

export function NameInputScreen({ userName, onNameChange, onContinue, onBack }: NameInputScreenProps) {
  const [token, setToken] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [emailCopied, setEmailCopied] = useState(false);

  const handleCopyEmail = () => {
    navigator.clipboard.writeText("info@wkpath.com").then(
      () => {
        setEmailCopied(true);
        setTimeout(() => setEmailCopied(false), 2000);
      },
      () => {}
    );
  };

  const handleContinue = () => {
    const trimmed = token.trim();
    if (trimmed.length === 0) {
      setError("Please enter your access token.");
      return;
    }
    if (trimmed.toUpperCase() === VALID_ACCESS_TOKEN.toUpperCase()) {
      setError(null);
      setAttempts(0);
      onContinue();
      return;
    }
    setAttempts((n) => n + 1);
    setError("That token doesn't match. Please check and try again.");
  };

  const showAccessCard = attempts >= 2;

  return (
    <div className="max-w-[520px] mx-auto">
      <ProgressBar current={1} total={7} />
      <FadeIn delay={100}>
        <p className="text-[0.8rem] text-muted-foreground uppercase tracking-[0.08em] mb-2 font-medium">
          Before we start
        </p>
      </FadeIn>
      <FadeIn delay={200}>
        <h2 className="font-serif text-[1.45rem] font-semibold text-foreground tracking-[-0.01em] mb-2 leading-[1.35]">
          Enter Access Token
        </h2>
      </FadeIn>
      <FadeIn delay={300}>
        <p className="text-[0.88rem] text-muted-foreground/80 leading-[1.6] mb-3">
          Enter the code provided to you.
        </p>
      </FadeIn>
      <FadeIn delay={350}>
        <div className="mb-8">
          <input
            id="access-token"
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleContinue();
            }}
            placeholder="e.g. AB123"
            maxLength={10}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Access Token"
            className="w-full py-3.5 px-5 border-[1.5px] border-border bg-white rounded-[10px] text-[0.95rem] text-foreground font-sans placeholder:text-muted-foreground/50 transition-colors duration-250 ease-out focus:outline-none focus:border-accent"
          />
          {error && (
            <p className="text-[0.78rem] text-destructive mt-2" role="alert">
              {error}
            </p>
          )}
        </div>
      </FadeIn>
      <FadeIn delay={400}>
        <h2 className="font-serif text-[1.45rem] font-semibold text-foreground tracking-[-0.01em] mb-2 leading-[1.35]">
          What name should we use on your assessment?
        </h2>
      </FadeIn>
      <FadeIn delay={420}>
        <p className="text-[0.88rem] text-muted-foreground/80 leading-[1.6] mb-3">
          This will appear on your readiness profile and downloadable report.
        </p>
      </FadeIn>
      <FadeIn delay={450}>
        <div>
          <input
            type="text"
            value={userName}
            onChange={(e) => onNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleContinue();
            }}
            placeholder="Your first and last name"
            className="w-full py-3.5 px-5 border-[1.5px] border-border bg-white rounded-[10px] text-[0.95rem] text-foreground font-sans placeholder:text-muted-foreground/50 transition-colors duration-250 ease-out focus:outline-none focus:border-accent mb-2"
          />
          <p className="text-[0.75rem] text-muted-foreground/60 mb-6">
            Press enter to remain anonymous
          </p>
        </div>
      </FadeIn>
      {showAccessCard && (
        <FadeIn delay={0}>
          <div className="mb-6 rounded-[10px] border border-amber-200 bg-amber-50 px-5 py-4">
            <p className="text-[0.9rem] text-foreground/85 leading-[1.6]">
              Looking for access? To request access to The WorkPath Assessment contact us at{" "}
              <button
                type="button"
                onClick={handleCopyEmail}
                className="text-accent hover:text-accent/80 transition-colors inline-flex items-center gap-1.5"
                style={{ textDecoration: "underline", textUnderlineOffset: "3px" }}
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
              .
            </p>
          </div>
        </FadeIn>
      )}
      <FadeIn delay={500}>
        <div className="flex justify-between items-center">
          <NavButton label="← Back" onClick={onBack} />
          <NavButton label="Continue →" onClick={handleContinue} primary />
        </div>
      </FadeIn>
    </div>
  );
}
