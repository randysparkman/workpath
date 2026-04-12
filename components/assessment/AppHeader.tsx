"use client";
import { useState } from "react";
import { Info } from "lucide-react";

interface AppHeaderProps {
  onBack: () => void;
  backLabel?: string;
  orgName?: string;
  roleDescription?: string;
}

export function AppHeader({ onBack, backLabel = "Back", orgName, roleDescription }: AppHeaderProps) {
  const [showDescription, setShowDescription] = useState(false);

  return (
    <div className="max-w-[640px] mx-auto mb-10 pb-5 border-b border-border-light">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[0.82rem] text-muted-foreground hover:text-foreground transition-colors duration-200 cursor-pointer bg-transparent border-none py-1 px-0"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {backLabel}
        </button>
        <div className="w-[52px]" />
      </div>
      <div className="text-center">
        <p className="font-serif text-[1.05rem] font-semibold text-foreground tracking-[-0.01em] m-0">
          The WorkPath Assessment
        </p>
        {orgName && (
          <button
            onClick={() => roleDescription && setShowDescription(!showDescription)}
            className={`text-[0.82rem] text-muted-foreground tracking-[0.02em] mt-px m-0 bg-transparent border-none inline-flex items-center gap-1 ${
              roleDescription ? "cursor-pointer hover:text-foreground transition-colors duration-200" : ""
            }`}
            style={roleDescription ? {
              textDecoration: "underline",
              textDecorationColor: "hsl(var(--border-light))",
              textUnderlineOffset: "3px",
              textDecorationStyle: "dotted",
            } : undefined}
          >
            {orgName}
            {roleDescription && (
              <Info className="w-3 h-3 text-muted-foreground opacity-60" />
            )}
          </button>
        )}

        {/* Expandable role description */}
        <div
          className="overflow-hidden transition-all duration-300 ease-in-out"
          style={{
            maxHeight: showDescription ? "200px" : "0",
            opacity: showDescription ? 1 : 0,
          }}
        >
          <div className="mt-3 mx-auto max-w-[520px] text-left bg-card border border-border rounded-lg p-4">
            <p className="text-[0.88rem] text-foreground leading-[1.65] m-0">
              {roleDescription}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
