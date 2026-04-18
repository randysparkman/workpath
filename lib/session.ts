import { getSupabase } from "@/lib/supabase";
import type { IntakeAnswers } from "@/data/intake-questions";
import type { ScenarioQuestion, RawQuestion, ScoredResponse } from "@/data/assessment-types";
import type { Screen } from "@/hooks/use-assessment-flow";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

export interface SessionState {
  screen: Screen;
  userName: string;
  selectedContextId: string | null;
  assessmentStartedAt: string | null;
  intakeIndex: number;
  intakeAnswers: IntakeAnswers;
  t1Index: number;
  t1Responses: Record<string, string>;
  t1Scores: ScoredResponse[];
  t2Index: number;
  t2Responses: Record<string, string>;
  t2Scores: ScoredResponse[];
  t3Index: number;
  t3Responses: Record<string, string>;
  t3Scores: ScoredResponse[];
  t3Questions: ScenarioQuestion[];
  t3QuestionsRaw: RawQuestion[];
}

export function generateResumeCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

export async function saveSession(
  resumeCode: string,
  state: SessionState,
  roleProfile: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "supabase-not-configured" };

  const { error } = await supabase
    .from("assessment_sessions")
    .upsert(
      {
        resume_code: resumeCode,
        role_profile: roleProfile,
        state,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "resume_code" },
    );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function loadSession(
  resumeCode: string,
): Promise<{ state: SessionState; roleProfile: string | null } | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("assessment_sessions")
    .select("state, role_profile")
    .eq("resume_code", resumeCode)
    .maybeSingle();

  if (error || !data) return null;
  return { state: data.state as SessionState, roleProfile: data.role_profile };
}
