#!/usr/bin/env node
/**
 * Agentic persona run — simulates a full assessment end-to-end.
 *
 * Usage:
 *   node scripts/run-persona.mjs <persona-file.md> [base-url]
 *
 * Defaults to https://wkpath.com if base-url is omitted.
 * Output is written to regeneration-output/persona-run-<name>-<timestamp>.json
 *
 * The script:
 *  1. Parses T1/T2 responses from the persona file
 *  2. Scores T1 via /api/score-tier1
 *  3. Scores T2 + generates performance summary via /api/score-tier2
 *  4. Generates T3 stems via /api/generate-tier3-stems
 *  5. Generates T3 rubrics (parallel) via /api/generate-tier3-rubric
 *  6. Uses Claude to generate persona-appropriate T3 responses
 *  7. Scores T3 via /api/score-tier3
 *  8. Generates profile via /api/generate-profile
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ── Config ────────────────────────────────────────────────────────────────────

const personaFile = process.argv[2];
if (!personaFile) {
  console.error('Usage: node scripts/run-persona.mjs <persona-file.md> [base-url]');
  process.exit(1);
}
const BASE_URL = (process.argv[3] || 'https://wkpath.com').replace(/\/$/, '');

// ── Helpers ───────────────────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const apiTimings = [];

async function callApi(endpoint, body, label) {
  const url = `${BASE_URL}${endpoint}`;
  const t0 = Date.now();
  process.stdout.write(`  → POST ${endpoint}${label ? ` [${label}]` : ''} ... `);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  });
  const ms = Date.now() - t0;
  const elapsed = (ms / 1000).toFixed(1);
  apiTimings.push({ endpoint, label: label ?? null, ms, ok: res.ok });
  if (!res.ok) {
    console.log(`FAILED (${elapsed}s)`);
    const text = await res.text();
    throw new Error(`${endpoint} returned ${res.status}: ${text.slice(0, 300)}`);
  }
  console.log(`${elapsed}s`);
  return res.json();
}

function extractJsonBlock(md, startMarker, endMarker) {
  const start = md.indexOf(startMarker);
  const end   = md.indexOf(endMarker, start);
  if (start === -1 || end === -1) return null;
  const block = md.slice(start + startMarker.length, end).trim();
  // strip fenced code block markers if present
  const inner = block.replace(/^```json\s*/m, '').replace(/\s*```\s*$/m, '');
  return JSON.parse(inner);
}

function sectionByHeader(md, header) {
  const start = md.indexOf(header);
  if (start === -1) return '';
  const rest = md.slice(start + header.length);
  const nextHeaderMatch = rest.match(/\n#{1,3}\s/);
  const end = nextHeaderMatch ? nextHeaderMatch.index : rest.length;
  return rest.slice(0, end).trim();
}

function parsePersona(md) {
  // ── Name ────────────────────────────────────────────────────────────────────
  let name = 'Unknown';
  const nameMatch = md.match(/\*\*Full name:\*\*\s*(.+)/);
  if (nameMatch) {
    name = nameMatch[1].trim();
  } else {
    const h1Match = md.match(/^#\s+(?:Persona:\s*)?([^—\-\n#]+?)(?:\s*[—\-]|$)/m);
    if (h1Match) name = h1Match[1].trim();
  }

  // ── Slug ────────────────────────────────────────────────────────────────────
  let slug = 'unknown';
  const slugMatch = md.match(/\*\*Profile:\*\*[^\(]+\(([^)]+)\)/);
  if (slugMatch) {
    slug = slugMatch[1].trim();
  } else {
    // Look for a known profile name in the header/first paragraphs
    const known = ['cie499', 'medical-billing', 'front-door', 'general'];
    const head = md.slice(0, 800).toLowerCase();
    for (const s of known) {
      if (head.includes(s)) { slug = s; break; }
    }
  }

  // ── Calibration / persona summary / T3 behavior ─────────────────────────────
  const calibration =
    sectionByHeader(md, '## Calibration Profile') ||
    sectionByHeader(md, '## Who ' + name.split(' ')[0] + ' is') ||
    sectionByHeader(md, '## Predicted aggregate profile');

  const personaSummary =
    sectionByHeader(md, '## Persona Summary') ||
    sectionByHeader(md, '## Who ' + name.split(' ')[0] + ' is');

  const t3Match = md.match(/\*\*Tier 3 behavior:\*\*([^*\n]+(?:\n(?!\*\*)[^\n]+)*)/);
  const tier3Behavior = t3Match
    ? t3Match[1].trim()
    : sectionByHeader(md, '## How to use this in a calibration run') ||
      'Stay in persona voice. Match the calibration level demonstrated in T1/T2 — do not suddenly produce Demonstrating-level reasoning that was not present earlier.';

  // ── T1/T2 responses ─────────────────────────────────────────────────────────
  const t1Responses = parseResponses(md, 1);
  const t2Responses = parseResponses(md, 2);

  return { name, slug, calibration, personaSummary, tier3Behavior, t1Responses, t2Responses };
}

function parseResponses(md, tier) {
  const out = {};
  // Format A: **T1-Q1** ...\n> "response"
  const regexA = new RegExp(`\\*\\*T${tier}-Q(\\d+)\\*\\*[^\\n]*\\n>\\s*"([^"]+)"`, 'g');
  for (const m of md.matchAll(regexA)) {
    out[`t${tier}_q${m[1]}`] = m[2].trim();
  }
  if (Object.keys(out).length) return out;

  // Format B: ### T1Q1 — ...\n...\n**Response:**\n\n> line (possibly continued on subsequent > lines)
  const regexB = new RegExp(`###\\s*T${tier}Q(\\d+)[\\s\\S]*?\\*\\*Response:\\*\\*\\s*\\n+((?:>\\s*[^\\n]*\\n?)+)`, 'g');
  for (const m of md.matchAll(regexB)) {
    const qnum = m[1];
    const block = m[2]
      .split('\n')
      .map(line => line.replace(/^>\s?/, '').trim())
      .filter(Boolean)
      .join(' ')
      .replace(/^"(.*)"$/, '$1')
      .trim();
    out[`t${tier}_q${qnum}`] = block;
  }
  return out;
}

async function generateT3Responses(persona, stems, rubrics) {
  console.log('  → Generating T3 responses via Claude (persona simulation)');

  const systemPrompt = `You are simulating a persona for an AI readiness assessment calibration run. Your job is to write realistic, in-character responses as this persona — matching their actual calibration level, NOT aspirational answers.

${persona.personaSummary}

${persona.calibration}

Tier 3 behavior note: ${persona.tier3Behavior}

CRITICAL: Write responses that authentically reflect this persona's limitations. Do NOT write "good" answers. Write answers that match their actual level — policy-habit language, vague escalation, no explanatory model. Short, deferential, and honest to who this person actually is.`;

  const responses = {};
  for (const stem of stems) {
    const rubric = rubrics[stem.id];
    const userPrompt = `Write a response as this persona to the following Tier 3 scenario. 2–4 sentences, conversational, in first person. Match their calibration level authentically.

SCENARIO: ${stem.scenario}
QUESTION: ${stem.prompt}

Rubric context (for calibration — do NOT aim for Demonstrating):
Emerging: ${rubric?.orientation?.emerging ?? ''}
Developing: ${rubric?.orientation?.developing ?? ''}

Respond as the persona only. No commentary. No quotes around the response.`;

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
    });
    responses[stem.id] = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
    console.log(`    • ${stem.id} generated`);
  }
  return responses;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const runStart = Date.now();
  const personaPath = path.resolve(personaFile);
  const personaMd   = fs.readFileSync(personaPath, 'utf8');
  const persona     = parsePersona(personaMd);

  console.log(`\nPersona run: ${persona.name} (${persona.slug})`);
  console.log(`Base URL: ${BASE_URL}\n`);

  // Load profile
  const profilePath = path.join(ROOT, 'data', `job-role-profile-${persona.slug}.md`);
  if (!fs.existsSync(profilePath)) {
    throw new Error(`Profile not found: ${profilePath}`);
  }
  const profileMd = fs.readFileSync(profilePath, 'utf8');
  const t1Data    = extractJsonBlock(profileMd, '<!-- tier1-questions-start -->', '<!-- tier1-questions-end -->');
  const t2Data    = extractJsonBlock(profileMd, '<!-- tier2-questions-start -->', '<!-- tier2-questions-end -->');
  if (!t1Data || !t2Data) throw new Error('Could not extract question JSON from profile');

  // Load templates
  const summaryTemplate  = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'tier3-summary-template.json'), 'utf8'));
  const questionTemplate = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'tier3-question-template.json'), 'utf8'));

  // ── Step 1: Score T1 ────────────────────────────────────────────────────────
  console.log('Step 1: Score Tier 1');
  const { scores: t1Scores } = await callApi('/api/score-tier1', {
    responses: persona.t1Responses,
    questions: t1Data.questions,
  });
  console.log(`  ✓ ${t1Scores.length} questions scored`);

  // ── Step 2: Score T2 + performance summary ─────────────────────────────────
  console.log('\nStep 2: Score Tier 2 + performance summary');
  const { scores: t2Scores, performanceSummary } = await callApi('/api/score-tier2', {
    responses:            persona.t2Responses,
    questions:            t2Data.questions,
    t1Scores,
    t1Questions:          t1Data.questions,
    t1Responses:          persona.t1Responses,
    summaryPromptTemplate: summaryTemplate.prompt_template,
  });
  console.log(`  ✓ ${t2Scores.length} questions scored`);
  console.log(`  ✓ Performance summary: orientation=${performanceSummary?.overall_placement?.orientation_band}, integration=${performanceSummary?.integration_profile?.modal_level}, judgment=${performanceSummary?.judgment_profile?.modal_level}`);

  // ── Step 3: Generate T3 stems ───────────────────────────────────────────────
  console.log('\nStep 3: Generate T3 stems');
  const { stems } = await callApi('/api/generate-tier3-stems', {
    performanceSummary,
    stemsPromptTemplate: questionTemplate.stems_prompt_template,
  });
  console.log(`  ✓ ${stems.length} stems generated`);

  // ── Step 4: Generate T3 rubrics (parallel) ─────────────────────────────────
  console.log('\nStep 4: Generate T3 rubrics (parallel)');
  const rubricResults = await Promise.all(
    stems.map(stem =>
      callApi('/api/generate-tier3-rubric', {
        stem,
        rubricPromptTemplate: questionTemplate.rubric_prompt_template,
      }, stem.id).then(r => ({ id: stem.id, rubric: r.rubric }))
    )
  );
  const rubricMap = Object.fromEntries(rubricResults.map(r => [r.id, r.rubric]));
  const t3Questions = stems.map(stem => ({ ...stem, rubric: rubricMap[stem.id] }));
  console.log(`  ✓ ${t3Questions.length} rubrics generated`);

  // ── Step 5: Generate T3 responses ──────────────────────────────────────────
  console.log('\nStep 5: Generate T3 persona responses');
  const t3Responses = await generateT3Responses(persona, stems, rubricMap);

  // ── Step 6: Score T3 ────────────────────────────────────────────────────────
  console.log('\nStep 6: Score Tier 3');
  const { scores: t3Scores } = await callApi('/api/score-tier3', {
    responses: t3Responses,
    questions: t3Questions,
  });
  console.log(`  ✓ ${t3Scores.length} questions scored`);

  // ── Step 7: Generate profile ────────────────────────────────────────────────
  console.log('\nStep 7: Generate profile');

  const buildScoredResponses = (questions, scores, responses, tier) =>
    scores.map((score, i) => ({
      ...score,
      tier,
      scenario: questions[i]?.scenario ?? '',
      user_response: responses[score.question_id] ?? '',
      question_angle: questions[i]?.angle ?? '',
      dol_content_area: questions[i]?.dol_content_area ?? '',
      human_function_activated: questions[i]?.human_function_activated ?? '',
    }));

  const allScored = [
    ...buildScoredResponses(t1Data.questions, t1Scores, persona.t1Responses, 1),
    ...buildScoredResponses(t2Data.questions, t2Scores, persona.t2Responses, 2),
    ...buildScoredResponses(t3Questions,       t3Scores, t3Responses,         3),
  ];

  const { profile } = await callApi('/api/generate-profile', {
    scored_responses: allScored,
    respondent_name:  persona.name,
  });
  console.log('  ✓ Profile generated');

  // ── Output ──────────────────────────────────────────────────────────────────
  const outputDir = path.join(ROOT, 'regeneration-output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const slug = persona.name.toLowerCase().replace(/\s+/g, '-');
  const outPath = path.join(outputDir, `persona-run-${slug}-${ts}.json`);

  const output = {
    meta: {
      persona: persona.name,
      profile: persona.slug,
      timestamp: new Date().toISOString(),
      base_url: BASE_URL,
    },
    t1_scores: t1Scores,
    t2_scores: t2Scores,
    performance_summary: performanceSummary,
    t3_questions: t3Questions,
    t3_responses: t3Responses,
    t3_scores: t3Scores,
    profile,
    all_scored_responses: allScored,
    api_timings: apiTimings,
  };

  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nOutput written to: ${path.relative(ROOT, outPath)}`);

  // ── Console summary ─────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════');
  console.log(`PERSONA RUN COMPLETE: ${persona.name}`);
  console.log('═══════════════════════════════════════════');

  const tally = (scores, construct) => {
    const counts = { emerging: 0, developing: 0, demonstrating: 0 };
    for (const s of scores) counts[s[`${construct}_level`]]++;
    return counts;
  };

  for (const [label, scores] of [['T1', t1Scores], ['T2', t2Scores], ['T3', t3Scores]]) {
    console.log(`\n${label} Scores (${scores.length} questions):`);
    for (const construct of ['orientation', 'integration', 'judgment']) {
      const c = tally(scores, construct);
      console.log(`  ${construct.padEnd(12)} E:${c.emerging} D:${c.developing} Dm:${c.demonstrating}`);
    }
  }

  const totalSec = ((Date.now() - runStart) / 1000).toFixed(1);
  console.log(`\nTotal run time: ${totalSec}s`);

  // API timings breakdown
  console.log(`\nAPI timings (wall-clock per call):`);
  const byEndpoint = new Map();
  for (const t of apiTimings) {
    if (!byEndpoint.has(t.endpoint)) byEndpoint.set(t.endpoint, []);
    byEndpoint.get(t.endpoint).push(t);
  }
  let apiTotalMs = 0;
  for (const [endpoint, calls] of byEndpoint) {
    const sum = calls.reduce((a, c) => a + c.ms, 0);
    apiTotalMs += sum;
    if (calls.length === 1) {
      console.log(`  ${endpoint.padEnd(32)} ${(calls[0].ms / 1000).toFixed(1)}s`);
    } else {
      const max = Math.max(...calls.map(c => c.ms));
      const each = calls.map(c => (c.ms / 1000).toFixed(1) + 's').join(', ');
      console.log(`  ${endpoint.padEnd(32)} ${calls.length}× [${each}] max ${(max / 1000).toFixed(1)}s sum ${(sum / 1000).toFixed(1)}s`);
    }
  }
  console.log(`  ${'TOTAL (sum of all calls)'.padEnd(32)} ${(apiTotalMs / 1000).toFixed(1)}s`);
  console.log(`\nPerformance Summary:`);
  console.log(`  Orientation: ${performanceSummary?.overall_placement?.orientation_band} (${performanceSummary?.overall_placement?.orientation_confidence} confidence)`);
  console.log(`  Integration: ${performanceSummary?.integration_profile?.modal_level} (${performanceSummary?.integration_profile?.level_quality})`);
  console.log(`  Judgment:    ${performanceSummary?.judgment_profile?.modal_level} (${performanceSummary?.judgment_profile?.level_quality})`);
}

main().catch(err => {
  console.error('\nRun failed:', err.message);
  process.exit(1);
});
