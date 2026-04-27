#!/usr/bin/env node
/**
 * Insert an `assessment_completions` row from a recovery JSON + the original
 * `assessment_sessions` row. Matches the schema written by the client at
 * hooks/use-assessment-flow.ts after a successful run, so the recovered row
 * is indistinguishable from one that completed normally.
 *
 * Usage:
 *   node scripts/insert-completion-from-recovery.mjs <recovery-json> <RESUME_CODE>
 */

import fs from 'fs';
import path from 'path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const envPath = path.join(ROOT, '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const recoveryFile = process.argv[2];
const resumeCode = process.argv[3];
if (!recoveryFile || !resumeCode) {
  console.error('Usage: node scripts/insert-completion-from-recovery.mjs <recovery-json> <RESUME_CODE>');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(path.resolve(recoveryFile), 'utf8'));
const profile = data.profile;
const respondentName = data.meta.persona;
const slug = data.meta.profile;

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Pull intake_answers + start time from the session row
const { data: sessionRow, error: sessErr } = await sb
  .from('assessment_sessions')
  .select('state')
  .eq('resume_code', resumeCode)
  .maybeSingle();
if (sessErr || !sessionRow) {
  console.error('Failed to load session:', sessErr || 'not found');
  process.exit(1);
}
const sessionState = sessionRow.state;

// Idempotency: don't double-insert if a completion for this person + role
// already exists with the same band (i.e., already recovered).
const { data: existing } = await sb
  .from('assessment_completions')
  .select('id, completed_at')
  .eq('respondent_name', respondentName)
  .eq('role_profile', slug);
if (existing && existing.length > 0) {
  console.error(`Completion(s) already exist for ${respondentName} / ${slug}:`);
  for (const r of existing) console.error(`  ${r.id}  ${r.completed_at}`);
  console.error('Aborting to avoid duplicate.');
  process.exit(1);
}

// Build scored_responses in the shape the client writes (use-assessment-flow.ts:136-152)
const scoredResponses = data.all_scored_responses.map((r) => ({
  question_id: r.question_id,
  tier: r.tier,
  scenario: r.scenario,
  prompt: r.prompt,
  response: r.response ?? r.user_response ?? '',
  orientation_level: r.orientation_level ?? '',
  integration_level: r.integration_level ?? '',
  judgment_level: r.judgment_level ?? '',
  evidence_notes: r.evidence_notes ?? '',
}));

const assessmentData = {
  intake_answers: Object.values(sessionState.intakeAnswers || {}),
  scored_responses: scoredResponses,
  profile_output: {
    band: profile.band,
    summary: profile.summary,
    dimensions: profile.dimensions,
    doing_well: profile.doing_well,
    growth_individual: profile.next_capabilities,
    growth_organizational: profile.organizational_opportunities,
  },
  timing: {
    started_at: sessionState.assessmentStartedAt || new Date().toISOString(),
    profile_generated: data.meta.timestamp,
  },
  recovered_from_resume_code: resumeCode,
};

const newId = crypto.randomUUID();
const insertPayload = {
  id: newId,
  role_profile: slug,
  respondent_name: respondentName,
  band: profile.band,
  orientation_level: profile.dimensions.orientation.level,
  integration_level: profile.dimensions.integration.level,
  judgment_level: profile.dimensions.judgment.level,
  assessment_data: assessmentData,
  completed_at: data.meta.timestamp,
};

console.log('About to insert:');
console.log(`  id:                ${insertPayload.id}`);
console.log(`  respondent_name:   ${insertPayload.respondent_name}`);
console.log(`  role_profile:      ${insertPayload.role_profile}`);
console.log(`  band:              ${insertPayload.band}`);
console.log(`  orientation:       ${insertPayload.orientation_level}`);
console.log(`  integration:       ${insertPayload.integration_level}`);
console.log(`  judgment:          ${insertPayload.judgment_level}`);
console.log(`  completed_at:      ${insertPayload.completed_at}`);
console.log(`  scored_responses:  ${scoredResponses.length}`);
console.log(`  intake_answers:    ${assessmentData.intake_answers.length}\n`);

const { error: insertErr } = await sb
  .from('assessment_completions')
  .insert(insertPayload);

if (insertErr) {
  console.error('Insert failed:', insertErr);
  process.exit(1);
}

console.log(`✓ Inserted completion row ${newId}`);
