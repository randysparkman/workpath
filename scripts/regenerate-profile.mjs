#!/usr/bin/env node
/**
 * regenerate-profile.mjs
 *
 * Regenerates Tier 1 and Tier 2 questions for an existing job-role-profile
 * using Sonnet 4.6. Outputs an assembled production-ready .md, a review PDF,
 * raw JSON dumps, and a run log.
 *
 * Usage:
 *   export ANTHROPIC_API_KEY=sk-ant-...
 *   node scripts/regenerate-profile.mjs <path-to-profile.md>
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────

const MODEL_ID         = 'claude-sonnet-4-6';
const MAX_TOKENS       = 8000;
const TIER1_PROMPT     = path.join(__dirname, '..', 'data', 'authoring', 'tier1-question-generation-prompt.md');
const TIER2_PROMPT     = path.join(__dirname, '..', 'data', 'authoring', 'tier2-question-generation-prompt.md');
const OUTPUT_ROOT      = path.join(process.cwd(), 'regeneration-output');

const DOL_AREAS = [
  '#1 Understand AI Principles',
  '#2 Explore AI Uses',
  '#3 Direct AI Effectively',
  '#4 Evaluate AI Outputs',
  '#5 Use AI Responsibly',
];
const HUMAN_FUNCTIONS = ['Understand', 'Express', 'Ideate', 'Act'];

// ─────────────────────────────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────────────────────────────

const logLines = [];
function log(line) {
  console.log(line);
  logLines.push(`[${new Date().toISOString()}] ${line}`);
}
function warn(line) {
  console.warn(`⚠ ${line}`);
  logLines.push(`[${new Date().toISOString()}] WARN: ${line}`);
}

// ─────────────────────────────────────────────────────────────────────
// Anthropic call
// ─────────────────────────────────────────────────────────────────────

async function callAnthropic(apiKey, userMessage) {
  const started = Date.now();
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL_ID,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  const elapsedMs = Date.now() - started;
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status}: ${body.slice(0, 500)}`);
  }
  const data = await response.json();
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  return { text, elapsedMs, usage: data.usage };
}

// ─────────────────────────────────────────────────────────────────────
// JSON extraction + validation
// ─────────────────────────────────────────────────────────────────────

function extractJson(raw) {
  let cleaned = raw.trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/```\s*$/, '');
  try { return JSON.parse(cleaned); }
  catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Could not extract JSON from response');
  }
}

function validateTierJson(parsed, tier) {
  const issues = [];
  if (!parsed.meta) issues.push('missing top-level "meta"');
  if (!parsed.user_facing) issues.push('missing top-level "user_facing"');
  if (!Array.isArray(parsed.questions)) issues.push('missing/invalid "questions" array');
  else if (parsed.questions.length !== 5) issues.push(`expected 5 questions, got ${parsed.questions.length}`);

  // Per-question rubric check
  const rubricLevels = ['emerging', 'developing', 'demonstrating'];
  const constructs = ['orientation', 'integration', 'judgment'];
  (parsed.questions || []).forEach((q, i) => {
    if (!q.rubric) { issues.push(`Q${i + 1}: missing rubric`); return; }
    for (const c of constructs) {
      if (!q.rubric[c]) { issues.push(`Q${i + 1}: missing rubric.${c}`); continue; }
      for (const lvl of rubricLevels) {
        if (!q.rubric[c][lvl] || typeof q.rubric[c][lvl] !== 'string' || q.rubric[c][lvl].length < 20) {
          issues.push(`Q${i + 1}: rubric.${c}.${lvl} missing or too short`);
        }
      }
    }
    if (!q.scenario) issues.push(`Q${i + 1}: missing scenario`);
    if (!q.prompt) issues.push(`Q${i + 1}: missing prompt`);
    if (!q.dol_content_area) issues.push(`Q${i + 1}: missing dol_content_area`);
    if (!q.human_function_activated) issues.push(`Q${i + 1}: missing human_function_activated`);
  });

  // DOL coverage across the 5 questions
  const dolHit = new Set();
  (parsed.questions || []).forEach(q => {
    const found = DOL_AREAS.find(a => (q.dol_content_area || '').startsWith(a.slice(0, 2)));
    if (found) dolHit.add(found);
  });
  const dolMissing = DOL_AREAS.filter(a => !dolHit.has(a));
  if (dolMissing.length > 0) {
    issues.push(`DOL coverage gap — missing: ${dolMissing.join(', ')} (this means ≥1 area is duplicated)`);
  }

  // Human function coverage — at least 3 of 4 required
  const hfHit = new Set();
  (parsed.questions || []).forEach(q => {
    const found = HUMAN_FUNCTIONS.find(fn => (q.human_function_activated || '').includes(fn));
    if (found) hfHit.add(found);
  });
  if (hfHit.size < 3) {
    issues.push(`Human function coverage — only ${hfHit.size} of 4 activated, need ≥3`);
  }

  return { valid: issues.length === 0, issues, dolHit: Array.from(dolHit), hfHit: Array.from(hfHit) };
}

// ─────────────────────────────────────────────────────────────────────
// Profile parsing + assembly
// ─────────────────────────────────────────────────────────────────────

function extractContextBlock(body) {
  const marker = body.indexOf('<!-- tier1-questions-start -->');
  if (marker === -1) {
    // No marker — assume entire body is context (defensive for hand-edited files)
    return body.trim();
  }
  // Trim off trailing `---` separator that typically precedes "## Tier 1 Questions"
  let context = body.slice(0, marker);
  const tier1Heading = context.lastIndexOf('## Tier 1 Questions');
  if (tier1Heading !== -1) context = context.slice(0, tier1Heading);
  return context.trim();
}

function bumpMinorVersion(version) {
  const parts = (version || '0.0.0').split('.').map(n => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  return `${parts[0]}.${parts[1] + 1}.0`;
}

function assembleProfile(frontmatter, contextBody, tier1Json, tier2Json, newVersion) {
  const fm = {
    role_identifier: frontmatter.role_identifier,
    role_label: frontmatter.role_label,
    role_description: frontmatter.role_description,
    version: newVersion,
  };
  const fmBlock = [
    '---',
    `role_identifier: "${fm.role_identifier}"`,
    `role_label: "${fm.role_label}"`,
    `role_description: "${fm.role_description}"`,
    `version: "${fm.version}"`,
    '---',
  ].join('\n');

  // Also bump the version inside each tier's meta block so it stays in sync.
  if (tier1Json.meta) tier1Json.meta.version = newVersion;
  if (tier2Json.meta) tier2Json.meta.version = newVersion;

  return [
    fmBlock,
    '',
    contextBody,
    '',
    '---',
    '',
    '## Tier 1 Questions',
    '',
    '<!-- tier1-questions-start -->',
    '```json',
    JSON.stringify(tier1Json, null, 2),
    '```',
    '<!-- tier1-questions-end -->',
    '',
    '---',
    '',
    '## Tier 2 Questions',
    '',
    '<!-- tier2-questions-start -->',
    '```json',
    JSON.stringify(tier2Json, null, 2),
    '```',
    '<!-- tier2-questions-end -->',
    '',
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────
// PDF generation (puppeteer)
// ─────────────────────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderQuestion(q, tierAccent) {
  const levels = ['emerging', 'developing', 'demonstrating'];
  const constructs = [
    { key: 'orientation', label: 'Orientation' },
    { key: 'integration', label: 'Integration' },
    { key: 'judgment', label: 'Judgment' },
  ];
  const rubricHtml = constructs.map(c => {
    const rows = levels.map(lvl => `
      <div class="rubric-row">
        <div class="rubric-level level-${lvl}">${lvl}</div>
        <div class="rubric-text">${escapeHtml((q.rubric?.[c.key]?.[lvl]) || '')}</div>
      </div>
    `).join('');
    return `
      <div class="rubric-block">
        <div class="rubric-construct">${c.label}</div>
        ${rows}
      </div>
    `;
  }).join('');

  return `
    <section class="question" style="--accent: ${tierAccent};">
      <div class="q-head">
        <div class="q-num">Q${q.sequence}</div>
        <div class="q-angle">${escapeHtml(q.angle || '')}</div>
      </div>
      <div class="q-tags">
        <span class="tag">${escapeHtml(q.dol_content_area || '')}</span>
        <span class="tag">${escapeHtml(q.human_function_activated || '')}</span>
        <span class="tag">${escapeHtml(q.decision_band || '')}</span>
      </div>
      <div class="q-scenario"><strong>Scenario.</strong> ${escapeHtml(q.scenario || '')}</div>
      <div class="q-prompt"><strong>Prompt.</strong> ${escapeHtml(q.prompt || '')}</div>
      <div class="q-notes"><strong>Internal notes.</strong> ${escapeHtml(q.internal_notes || '')}</div>
      <div class="rubric">${rubricHtml}</div>
    </section>
  `;
}

function renderMetaSummary(meta, tierLabel) {
  const dol = (meta?.dol_coverage || []).map(d => `<li>${escapeHtml(d)}</li>`).join('');
  const hf = (meta?.human_functions_activated || []).join(' · ');
  return `
    <section class="meta-block">
      <h2>${tierLabel}</h2>
      <div class="meta-label">${escapeHtml(meta?.label || '')}</div>
      <div class="meta-row"><strong>Primary construct:</strong> ${escapeHtml(meta?.primary_construct || '')}</div>
      <div class="meta-row"><strong>Human functions:</strong> ${escapeHtml(hf)}</div>
      <div class="meta-row"><strong>DOL coverage:</strong><ul class="dol-list">${dol}</ul></div>
      <div class="meta-rationale">${escapeHtml(meta?.design_rationale || '')}</div>
    </section>
  `;
}

function buildHtml({ frontmatter, newVersion, tier1Json, tier2Json, generatedAt }) {
  const tier1Html = (tier1Json.questions || []).map(q => renderQuestion(q, '#0C2D48')).join('');
  const tier2Html = (tier2Json.questions || []).map(q => renderQuestion(q, '#2D5A3D')).join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Review — ${escapeHtml(frontmatter.role_label)} v${newVersion}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Source+Serif+4:wght@500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #f8f7f4;
    --ink: #1a1a1a;
    --muted: #6B7F8E;
    --navy: #0C2D48;
    --gold: #C9983A;
    --green: #2D5A3D;
    --slate: #6B7F8E;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--ink); font-family: 'DM Sans', system-ui, sans-serif; font-size: 11pt; line-height: 1.5; }
  h1, h2, h3 { font-family: 'Source Serif 4', Georgia, serif; font-weight: 600; color: var(--navy); margin: 0; }
  h1 { font-size: 26pt; line-height: 1.15; }
  h2 { font-size: 18pt; }
  h3 { font-size: 13pt; }
  .page { padding: 0.75in 0.75in; page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  .cover { min-height: 9in; display: flex; flex-direction: column; justify-content: center; border-left: 6px solid var(--navy); padding-left: 0.6in; }
  .cover .eyebrow { font-size: 9pt; letter-spacing: 0.15em; text-transform: uppercase; color: var(--gold); font-weight: 600; margin-bottom: 12pt; }
  .cover h1 { margin-bottom: 14pt; }
  .cover .role-id { font-family: 'DM Sans'; font-size: 10pt; color: var(--muted); font-weight: 500; }
  .cover .meta { margin-top: 32pt; font-size: 10pt; color: var(--muted); }
  .cover .meta div { margin-bottom: 4pt; }
  .cover .note { margin-top: 40pt; padding: 14pt 16pt; background: #fff; border-left: 3px solid var(--gold); font-size: 10pt; color: var(--ink); }

  .summary-page h2 { margin-bottom: 18pt; }
  .meta-block { margin-bottom: 28pt; padding: 18pt 20pt; background: #fff; border-radius: 4pt; box-shadow: 0 1px 0 rgba(0,0,0,0.04); }
  .meta-block h2 { margin-bottom: 6pt; font-size: 15pt; }
  .meta-label { font-size: 10pt; color: var(--muted); margin-bottom: 12pt; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 500; }
  .meta-row { margin-bottom: 8pt; font-size: 10.5pt; }
  .meta-row strong { color: var(--navy); }
  .dol-list { margin: 6pt 0 0 0; padding-left: 18pt; font-size: 10pt; }
  .meta-rationale { margin-top: 14pt; padding-top: 14pt; border-top: 1px solid #eee; font-size: 10.5pt; color: var(--ink); line-height: 1.6; }

  .tier-header { min-height: 9in; display: flex; flex-direction: column; justify-content: center; border-left: 6px solid var(--accent, var(--navy)); padding-left: 0.6in; }
  .tier-header .eyebrow { font-size: 9pt; letter-spacing: 0.15em; text-transform: uppercase; color: var(--gold); font-weight: 600; margin-bottom: 12pt; }
  .tier-header h1 { color: var(--accent, var(--navy)); }
  .tier-header .subtitle { margin-top: 14pt; font-size: 11pt; color: var(--muted); max-width: 5in; line-height: 1.6; }

  .question { padding: 0; border-left: 4px solid var(--accent, var(--navy)); padding-left: 18pt; }
  .q-head { display: flex; align-items: baseline; gap: 14pt; margin-bottom: 8pt; }
  .q-num { font-family: 'Source Serif 4'; font-weight: 700; color: var(--accent); font-size: 18pt; }
  .q-angle { font-family: 'DM Sans'; font-weight: 500; color: var(--ink); font-size: 13pt; }
  .q-tags { display: flex; gap: 6pt; margin-bottom: 14pt; flex-wrap: wrap; }
  .tag { font-size: 8.5pt; padding: 2pt 8pt; border-radius: 999pt; background: #fff; border: 1px solid #d9d9d9; color: var(--muted); font-weight: 500; }
  .q-scenario, .q-prompt, .q-notes { margin-bottom: 10pt; font-size: 10.5pt; line-height: 1.55; }
  .q-scenario { background: #fff; padding: 12pt 14pt; border-radius: 3pt; }
  .q-notes { color: var(--muted); font-size: 9.5pt; }
  .rubric { margin-top: 14pt; display: grid; gap: 10pt; }
  .rubric-block { background: #fff; padding: 12pt 14pt; border-radius: 3pt; }
  .rubric-construct { font-family: 'Source Serif 4'; font-weight: 600; color: var(--navy); font-size: 11pt; margin-bottom: 8pt; border-bottom: 1px solid #eee; padding-bottom: 4pt; }
  .rubric-row { display: grid; grid-template-columns: 110pt 1fr; gap: 10pt; margin-bottom: 6pt; }
  .rubric-level { font-size: 8.5pt; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; padding: 2pt 8pt; border-radius: 3pt; text-align: center; height: fit-content; }
  .level-emerging { background: #E1E7EC; color: #4A5A67; }
  .level-developing { background: #F5E4C0; color: #7A5A1E; }
  .level-demonstrating { background: #D4E4D9; color: #1F4A2E; }
  .rubric-text { font-size: 10pt; line-height: 1.5; }

  @page { size: letter; margin: 0; }
  @media print {
    .page { page-break-after: always; }
  }
</style>
</head>
<body>

<div class="page cover">
  <div class="eyebrow">WorkPath · Review Copy</div>
  <h1>${escapeHtml(frontmatter.role_label)}</h1>
  <div class="role-id">${escapeHtml(frontmatter.role_identifier)} · v${newVersion}</div>
  <div class="meta">
    <div><strong>Generated:</strong> ${escapeHtml(generatedAt)}</div>
    <div><strong>Model:</strong> ${escapeHtml(MODEL_ID)}</div>
  </div>
  <div class="note">
    This PDF is a review copy of freshly-generated Tier 1 and Tier 2 questions.
    Use it to evaluate voice, rubric quality, scenario fit, and construct discipline
    before the assembled <code>.md</code> is promoted to production.
  </div>
</div>

<div class="page summary-page">
  <h1 style="margin-bottom: 22pt;">Summary</h1>
  ${renderMetaSummary(tier1Json.meta, 'Tier 1 — ' + (tier1Json.meta?.label || ''))}
  ${renderMetaSummary(tier2Json.meta, 'Tier 2 — ' + (tier2Json.meta?.label || ''))}
</div>

<div class="page tier-header" style="--accent: #0C2D48;">
  <div class="eyebrow">Tier 1</div>
  <h1>Baseline Orientation</h1>
  <div class="subtitle">Five scenarios calibrated to routine and lower judgment-embedded decisions. Tests whether the person recognizes what AI is doing in familiar work contexts.</div>
</div>

<div class="page">${tier1Html}</div>

<div class="page tier-header" style="--accent: #2D5A3D;">
  <div class="eyebrow">Tier 2</div>
  <h1>Applied Integration</h1>
  <div class="subtitle">Five scenarios in the judgment-embedded and escalation bands. Tests whether the person can describe concrete processes for working with AI on multi-step tasks.</div>
</div>

<div class="page">${tier2Html}</div>

</body>
</html>`;
}

async function generatePdf(html, outputPath) {
  const browser = await puppeteer.launch({ headless: 'new' });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: outputPath,
      format: 'letter',
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    await browser.close();
  }
}

// ─────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────

async function main() {
  const profileArg = process.argv[2];
  if (!profileArg) {
    console.error('Usage: node scripts/regenerate-profile.mjs <path-to-profile.md>');
    process.exit(1);
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ERROR: ANTHROPIC_API_KEY not set.');
    process.exit(1);
  }

  const profilePath = path.resolve(profileArg);
  log(`Reading profile: ${profilePath}`);
  const [profileRaw, tier1PromptText, tier2PromptText] = await Promise.all([
    fs.readFile(profilePath, 'utf-8'),
    fs.readFile(TIER1_PROMPT, 'utf-8'),
    fs.readFile(TIER2_PROMPT, 'utf-8'),
  ]);

  const { data: frontmatter, content: body } = matter(profileRaw);
  const required = ['role_identifier', 'role_label', 'role_description', 'version'];
  for (const k of required) {
    if (!frontmatter[k]) throw new Error(`Profile front matter missing: ${k}`);
  }
  const newVersion = bumpMinorVersion(frontmatter.version);
  log(`Profile: ${frontmatter.role_label} (${frontmatter.role_identifier})`);
  log(`Version: ${frontmatter.version} → ${newVersion}`);

  const contextBody = extractContextBlock(body);
  log(`Context block: ${contextBody.length} chars`);

  // ─── Prepare output directory ─────────────────────────────────────
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = path.join(OUTPUT_ROOT, frontmatter.role_identifier, ts);
  await fs.mkdir(outDir, { recursive: true });
  log(`Output dir: ${outDir}`);

  const profileContextMessage = `JOB-ROLE-PROFILE:\n\n${contextBody}`;

  // ─── Tier 1 ──────────────────────────────────────────────────────
  log('\n→ Generating Tier 1...');
  const t1User = `${tier1PromptText}\n\n---\n\n${profileContextMessage}`;
  let tier1;
  try {
    const { text, elapsedMs, usage } = await callAnthropic(apiKey, t1User);
    log(`  Tier 1 response in ${(elapsedMs / 1000).toFixed(1)}s — ${usage?.input_tokens} in / ${usage?.output_tokens} out`);
    try {
      tier1 = extractJson(text);
    } catch (e) {
      const rawPath = path.join(outDir, 'tier1-raw.txt');
      await fs.writeFile(rawPath, text);
      throw new Error(`Tier 1 JSON parse failed: ${e.message}. Raw saved to ${rawPath}`);
    }
    await fs.writeFile(path.join(outDir, 'tier1-raw.json'), JSON.stringify(tier1, null, 2));
  } catch (e) {
    log(`FATAL: Tier 1 generation failed: ${e.message}`);
    await fs.writeFile(path.join(outDir, 'run.log'), logLines.join('\n'));
    process.exit(1);
  }
  const t1Check = validateTierJson(tier1, 1);
  if (!t1Check.valid) {
    log(`  Tier 1 validation issues:\n    - ${t1Check.issues.join('\n    - ')}`);
    warn('Tier 1 has structural defects — review before promoting. Continuing so you can see the review PDF.');
  } else {
    log(`  Tier 1 validation: PASS (DOL ${t1Check.dolHit.length}/5, HF ${t1Check.hfHit.length}/4)`);
  }

  // ─── Tier 2 ──────────────────────────────────────────────────────
  log('\n→ Generating Tier 2...');
  const t2User = [
    tier2PromptText,
    '',
    '---',
    '',
    profileContextMessage,
    '',
    '---',
    '',
    'TIER 1 QUESTIONS (already generated — your Tier 2 must be complementary and non-overlapping):',
    '',
    '```json',
    JSON.stringify(tier1, null, 2),
    '```',
  ].join('\n');
  let tier2;
  try {
    const { text, elapsedMs, usage } = await callAnthropic(apiKey, t2User);
    log(`  Tier 2 response in ${(elapsedMs / 1000).toFixed(1)}s — ${usage?.input_tokens} in / ${usage?.output_tokens} out`);
    try {
      tier2 = extractJson(text);
    } catch (e) {
      const rawPath = path.join(outDir, 'tier2-raw.txt');
      await fs.writeFile(rawPath, text);
      throw new Error(`Tier 2 JSON parse failed: ${e.message}. Raw saved to ${rawPath}`);
    }
    await fs.writeFile(path.join(outDir, 'tier2-raw.json'), JSON.stringify(tier2, null, 2));
  } catch (e) {
    log(`FATAL: Tier 2 generation failed: ${e.message}`);
    await fs.writeFile(path.join(outDir, 'run.log'), logLines.join('\n'));
    process.exit(1);
  }
  const t2Check = validateTierJson(tier2, 2);
  if (!t2Check.valid) {
    log(`  Tier 2 validation issues:\n    - ${t2Check.issues.join('\n    - ')}`);
    warn('Tier 2 has structural defects — review before promoting.');
  } else {
    log(`  Tier 2 validation: PASS (DOL ${t2Check.dolHit.length}/5, HF ${t2Check.hfHit.length}/4)`);
  }

  // ─── Assemble .md ────────────────────────────────────────────────
  log('\n→ Assembling profile .md...');
  const assembled = assembleProfile(frontmatter, contextBody, tier1, tier2, newVersion);
  const mdFilename = `job-role-profile-${frontmatter.role_identifier}-v${newVersion}.md`;
  const mdPath = path.join(outDir, mdFilename);
  await fs.writeFile(mdPath, assembled);
  log(`  Wrote ${mdPath} (${assembled.length} chars)`);

  // ─── Generate review PDF ─────────────────────────────────────────
  log('\n→ Generating review PDF...');
  const html = buildHtml({
    frontmatter,
    newVersion,
    tier1Json: tier1,
    tier2Json: tier2,
    generatedAt: new Date().toISOString(),
  });
  const pdfFilename = `review-${frontmatter.role_identifier}-v${newVersion}.pdf`;
  const pdfPath = path.join(outDir, pdfFilename);
  try {
    await generatePdf(html, pdfPath);
    log(`  Wrote ${pdfPath}`);
  } catch (e) {
    warn(`PDF generation failed: ${e.message}`);
    const htmlPath = path.join(outDir, 'review.html');
    await fs.writeFile(htmlPath, html);
    log(`  Saved HTML fallback to ${htmlPath}`);
  }

  // ─── Write run log ───────────────────────────────────────────────
  log('\n✓ Done.');
  log(`  Review PDF:  ${pdfPath}`);
  log(`  Assembled .md:  ${mdPath}`);
  log(`  Raw JSON:  ${outDir}/tier{1,2}-raw.json`);
  await fs.writeFile(path.join(outDir, 'run.log'), logLines.join('\n'));
}

main().catch(async e => {
  console.error('Fatal:', e);
  logLines.push(`[${new Date().toISOString()}] FATAL: ${e.message}\n${e.stack}`);
  // Try to flush log if we have an outDir; otherwise just print.
  process.exit(1);
});
