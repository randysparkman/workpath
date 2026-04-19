// @ts-ignore — webpack raw loader for .md files (configured in next.config.js)
import jobRoleGeneralRaw from "./job-role-profile-general.md";
// @ts-ignore
import jobRoleMedicalRaw from "./job-role-profile-medical-billing.md";
// @ts-ignore
import jobRoleCie499Raw from "./job-role-profile-cie499.md";
// @ts-ignore
import jobRoleFrontDoorRaw from "./job-role-profile-front-door.md";
import { parseJobRoleProfile } from "./parse-job-role-profile";
import type { ScenarioQuestion, RawQuestion } from "./assessment-types";

const generalProfile = parseJobRoleProfile(jobRoleGeneralRaw);
const medicalProfile = parseJobRoleProfile(jobRoleMedicalRaw);
const cie499Profile = parseJobRoleProfile(jobRoleCie499Raw);
const frontDoorProfile = parseJobRoleProfile(jobRoleFrontDoorRaw);

export interface WorkContext {
  id: string;
  slug: string;
  label: string;
  description: string;
  roleDescription: string;
  enabled: boolean;
  /** Whether this profile appears in the public dropdown on the root welcome screen. */
  public: boolean;
  orgName: string;
  orgFluencyRaw: string;
  tier1Data: any;
  tier2Data: any;
}

export const workContexts: WorkContext[] = [
  {
    id: "front-door",
    slug: "front-door",
    label: frontDoorProfile.roleLabel,
    description: "",
    roleDescription: frontDoorProfile.roleDescription,
    enabled: true,
    public: true,
    orgName: frontDoorProfile.roleLabel,
    orgFluencyRaw: frontDoorProfile.roleContext,
    tier1Data: frontDoorProfile.tier1Data,
    tier2Data: frontDoorProfile.tier2Data,
  },
  {
    id: "general",
    slug: "general",
    label: generalProfile.roleLabel,
    description: "",
    roleDescription: generalProfile.roleDescription,
    enabled: true,
    public: false,
    orgName: generalProfile.roleLabel,
    orgFluencyRaw: generalProfile.roleContext,
    tier1Data: generalProfile.tier1Data,
    tier2Data: generalProfile.tier2Data,
  },
  {
    id: "medical",
    slug: "medical-billing",
    label: medicalProfile.roleLabel,
    description: "",
    roleDescription: medicalProfile.roleDescription,
    enabled: true,
    public: false,
    orgName: medicalProfile.roleLabel,
    orgFluencyRaw: medicalProfile.roleContext,
    tier1Data: medicalProfile.tier1Data,
    tier2Data: medicalProfile.tier2Data,
  },
  {
    id: "cie499",
    slug: "cie499",
    label: cie499Profile.roleLabel,
    description: "",
    roleDescription: cie499Profile.roleDescription,
    enabled: true,
    public: false,
    orgName: cie499Profile.roleLabel,
    orgFluencyRaw: cie499Profile.roleContext,
    tier1Data: cie499Profile.tier1Data,
    tier2Data: cie499Profile.tier2Data,
  },
  {
    id: "custom",
    slug: "custom",
    label: "Contact us to talk about a custom job profile",
    description: "",
    roleDescription: "",
    enabled: false,
    public: false,
    orgName: "",
    orgFluencyRaw: "",
    tier1Data: null,
    tier2Data: null,
  },
];

export function getContextBySlug(slug: string): WorkContext | undefined {
  return workContexts.find((c) => c.slug === slug && c.enabled);
}

export function getContextById(id: string): WorkContext | undefined {
  return workContexts.find((c) => c.id === id && c.enabled);
}

export function getTier1Questions(context: WorkContext): ScenarioQuestion[] {
  return context.tier1Data.questions.map((q: RawQuestion) => ({
    id: q.id,
    sequence: q.sequence,
    label: `Scenario ${q.sequence} of ${context.tier1Data.questions.length}`,
    scenario: q.scenario,
    prompt: q.prompt,
  }));
}

export function getTier1QuestionsRaw(context: WorkContext): RawQuestion[] {
  return context.tier1Data.questions;
}

export function getTier2Questions(context: WorkContext): ScenarioQuestion[] {
  return context.tier2Data.questions.map((q: RawQuestion) => ({
    id: q.id,
    sequence: q.sequence,
    label: `Scenario ${q.sequence} of 5`,
    scenario: q.scenario,
    prompt: q.prompt,
  }));
}

export function getTier2QuestionsRaw(context: WorkContext): RawQuestion[] {
  return context.tier2Data.questions;
}

export function getTier2UserFacing(context: WorkContext) {
  return context.tier2Data.user_facing;
}
