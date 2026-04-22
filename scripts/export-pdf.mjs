#!/usr/bin/env node
/**
 * Export a profile PDF from a persona run output JSON.
 * Uses the same layout logic as lib/generatePdf.ts.
 *
 * Usage:
 *   node scripts/export-pdf.mjs <run-output.json> [output.pdf]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { jsPDF } from 'jspdf';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const inputFile = process.argv[2];
if (!inputFile) {
  console.error('Usage: node scripts/export-pdf.mjs <run-output.json> [output.pdf]');
  process.exit(1);
}

const data    = JSON.parse(fs.readFileSync(path.resolve(inputFile), 'utf8'));

const BADGE_PNG = path.join(ROOT, 'public', 'workpath_verified_badge.png');
const badgeImageData = fs.existsSync(BADGE_PNG)
  ? 'data:image/png;base64,' + fs.readFileSync(BADGE_PNG).toString('base64')
  : null;
const profile = data.profile;
const name    = data.meta?.persona ?? '';
const org     = '';

// Build assessment responses from all_scored_responses
const assessmentResponses = (data.all_scored_responses ?? []).map((r, i) => ({
  tier: r.tier,
  questionIndex: i % 5,
  scenario: r.scenario ?? '',
  prompt: '',
  response: r.user_response ?? '',
}));

// ── Colors ──────────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

const NAVY          = hexToRgb('#14213d');
const BADGE_NAVY    = hexToRgb('#0C2D48');
const GREEN         = hexToRgb('#1b4332');
const GOLD          = hexToRgb('#c9a227');
const TEXT_MAIN     = [42,42,42];
const TEXT_MUTED    = [130,130,130];
const TEXT_LIGHT    = [107,107,107];
const DIVIDER       = [210,205,198];
const BORDER        = [224,221,214];
const BG_WARM       = [250,249,246];
const INACTIVE_GRAY = [192,189,182];
const LEGEND_GRAY   = [168,164,160];

const BAND_COLORS = { Emerging: hexToRgb('#4a5568'), Developing: GOLD, Demonstrating: GREEN };
const CONSTRUCT_COLORS = { Orientation: NAVY, Integration: GREEN, Judgment: GOLD };
const TIER_COLORS  = { 1: NAVY, 2: GREEN, 3: GOLD };
const TIER_LABELS  = { 1: 'TIER 1 — BASELINE', 2: 'TIER 2 — CONTEXTUALIZED', 3: 'TIER 3 — ADAPTIVE' };

// ── Layout constants ─────────────────────────────────────────────────────────

const PAGE_W       = 210;
const PAGE_H       = 297;
const MARGIN_X     = 22;
const MARGIN_TOP   = 22;
const MARGIN_BOTTOM = 25;
const CONTENT_W    = PAGE_W - MARGIN_X * 2;
const META_LABEL_X = MARGIN_X;
const META_VALUE_X = MARGIN_X + 38;

// ── Generate ─────────────────────────────────────────────────────────────────

const doc = new jsPDF({ unit: 'mm', format: 'a4' });
let y = MARGIN_TOP;

function checkSpace(needed) {
  if (y + needed > PAGE_H - MARGIN_BOTTOM) {
    doc.addPage();
    y = MARGIN_TOP;
  }
}

function drawFooter() {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(...DIVIDER);
    doc.setLineWidth(0.5);
    doc.line(MARGIN_X, PAGE_H - 18, PAGE_W - MARGIN_X, PAGE_H - 18);
    doc.setFontSize(7.5);
    doc.setTextColor(...TEXT_MUTED);
    doc.setFont('helvetica', 'normal');
    doc.text(`WorkPath Profile · Confidential · ${i}`, MARGIN_X, PAGE_H - 13);
    doc.text('The WorkPath Assessment · wkpath.com', PAGE_W - MARGIN_X, PAGE_H - 13, { align: 'right' });
  }
}

function drawMetaRow(label, value) {
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MUTED);
  doc.setFont('helvetica', 'normal');
  doc.text(label, META_LABEL_X, y);
  doc.setTextColor(...TEXT_MAIN);
  doc.setFont('helvetica', 'bold');
  doc.text(value, META_VALUE_X, y);
  y += 6;
}

function drawPlacementRow(activeBand) {
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MUTED);
  doc.setFont('helvetica', 'normal');
  doc.text('Placement', META_LABEL_X, y);
  const bands = ['Emerging', 'Developing', 'Demonstrating'];
  let xPos = META_VALUE_X;
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    const isActive = b === activeBand;
    if (i > 0) {
      doc.setTextColor(...DIVIDER);
      doc.setFont('helvetica', 'normal');
      doc.text('  ·  ', xPos, y);
      xPos += doc.getTextWidth('  ·  ');
    }
    const color = isActive ? (BAND_COLORS[b] || TEXT_MAIN) : INACTIVE_GRAY;
    doc.setTextColor(...color);
    doc.setFont('helvetica', isActive ? 'bold' : 'normal');
    doc.text(b, xPos, y);
    xPos += doc.getTextWidth(b);
  }
  y += 6;
}

function drawVerificationBadge(bx, by, bw) {
  const CAP_H = 1.8;
  const PAD_X = 4.5;
  const PAD_TOP = 3.0;

  const TITLE_SIZE = 7.5;
  const BODY_SIZE = 8.5;
  const META_SIZE = 7.5;

  const TITLE_TO_BODY_GAP = 2.0;
  const LINE_H = 4.5;
  const BEFORE_DIVIDER_GAP = 2.5;
  const AFTER_DIVIDER_GAP = 2.0;
  const BOTTOM_PAD = 2.5;

  const BODY_LINES = [
    'Structured Scenario Assessment',
    'Role-Specific Rubric',
    '15 Scored Scenarios',
  ];

  const TOTAL_H =
    CAP_H +
    PAD_TOP +
    3 +
    TITLE_TO_BODY_GAP +
    BODY_LINES.length * LINE_H +
    BEFORE_DIVIDER_GAP +
    0.3 +
    AFTER_DIVIDER_GAP +
    3 +
    BOTTOM_PAD;

  doc.setFillColor(...BG_WARM);
  doc.setDrawColor(217, 212, 204);
  doc.setLineWidth(0.4);
  doc.rect(bx, by, bw, TOTAL_H, 'FD');

  doc.setFillColor(...BADGE_NAVY);
  doc.rect(bx, by, bw, CAP_H, 'F');

  let ly = by + CAP_H + PAD_TOP + 3;
  doc.setFontSize(TITLE_SIZE);
  doc.setTextColor(...BADGE_NAVY);
  doc.setFont('helvetica', 'bold');
  doc.text('WORKPATH VERIFIED', bx + PAD_X, ly);
  ly += TITLE_TO_BODY_GAP;

  doc.setFontSize(BODY_SIZE);
  doc.setTextColor(...TEXT_MAIN);
  doc.setFont('helvetica', 'normal');
  for (const line of BODY_LINES) {
    doc.text(line, bx + PAD_X, ly);
    ly += LINE_H;
  }

  ly += BEFORE_DIVIDER_GAP;
  doc.setDrawColor(217, 212, 204);
  doc.setLineWidth(0.3);
  doc.line(bx + PAD_X, ly, bx + bw - PAD_X, ly);
  ly += AFTER_DIVIDER_GAP;

  doc.setFontSize(META_SIZE);
  doc.setTextColor(...TEXT_MUTED);
  doc.setFont('helvetica', 'normal');
  doc.text('Assessment v1.4', bx + PAD_X, ly);
}

function drawHeaderBlock(showBadge = false) {
  const BADGE_W = 54;
  const BADGE_X = PAGE_W - MARGIN_X - BADGE_W;

  doc.setFontSize(18);
  doc.setTextColor(...TEXT_MAIN);
  doc.setFont('times', 'bold');
  const firstName = (name || '').trim().split(/\s+/)[0];
  const profileTitle = firstName ? `${firstName}'s WorkPath Profile` : 'WorkPath Profile';
  doc.text(profileTitle, MARGIN_X, y);
  y += 7;

  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MUTED);
  doc.setFont('helvetica', 'normal');
  doc.text('Structured scenario assessment with evidence-based placement', MARGIN_X, y);
  y += 8;

  // Gold accent divider — stops short of badge area
  const goldRuleY = y;
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(2);
  doc.line(MARGIN_X, y, showBadge ? BADGE_X - 4 : PAGE_W - MARGIN_X, y);
  y += 8;

  if (showBadge && badgeImageData) {
    const badgeH = BADGE_W / 1.450;
    doc.addImage(badgeImageData, 'PNG', BADGE_X, goldRuleY - 5, BADGE_W, badgeH);
  }

  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  if (name.trim()) drawMetaRow('Prepared for', name.trim());
  drawMetaRow('Date completed', dateStr);
  drawPlacementRow(profile.band);

  doc.setFontSize(7.5);
  doc.setTextColor(...TEXT_MUTED);
  doc.setFont('helvetica', 'normal');
  const noteLines = doc.splitTextToSize(
    'Placement reflects demonstrated performance across scored scenarios, not self-report.',
    showBadge ? BADGE_X - MARGIN_X - 6 : CONTENT_W
  );
  doc.text(noteLines, MARGIN_X, y);
  y += noteLines.length * 3.8 + 4;

  doc.setDrawColor(...DIVIDER);
  doc.setLineWidth(0.5);
  doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
  y += 6;
}

function drawSectionHeading(title, color = TEXT_MAIN, spaceBefore = 10) {
  checkSpace(14);
  y += spaceBefore;
  doc.setFontSize(13);
  doc.setTextColor(...color);
  doc.setFont('times', 'bold');
  doc.text(title, MARGIN_X, y);
  y += 7;
}

function drawBulletList(items, dotColor) {
  for (const item of items) {
    const lines = doc.splitTextToSize(item, CONTENT_W - 10);
    checkSpace(lines.length * 4.2 + 4);
    doc.setFillColor(...dotColor);
    doc.circle(MARGIN_X + 3, y + 0.8, 1, 'F');
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_MAIN);
    doc.setFont('helvetica', 'normal');
    doc.text(lines, MARGIN_X + 8, y + 1.5, { lineHeightFactor: 1.45 });
    y += lines.length * 4.2 + 3;
  }
  y += 4;
}

function drawConstructCard(name, level, detail) {
  const accentColor = CONSTRUCT_COLORS[name] || NAVY;
  const badgeColor  = BAND_COLORS[level] || TEXT_MUTED;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const detailLines = doc.splitTextToSize(detail, CONTENT_W - 24);
  const detailH = detailLines.length * 4.2;
  const cardH = 16 + 18 + detailH + 12;
  checkSpace(cardH + 4);
  doc.setFillColor(255,255,255);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.5);
  doc.roundedRect(MARGIN_X, y, CONTENT_W, cardH, 2, 2, 'FD');
  doc.setFillColor(...accentColor);
  doc.rect(MARGIN_X, y, 5, cardH, 'F');
  const textX = MARGIN_X + 14;
  let cy = y + 12;
  doc.setFontSize(11);
  doc.setTextColor(...TEXT_MAIN);
  doc.setFont('times', 'bold');
  doc.text(name.toUpperCase(), textX, cy);
  const nameW   = doc.getTextWidth(name.toUpperCase());
  const badgeX  = textX + nameW + 8;
  const badgeW  = doc.getTextWidth(level) + 12;
  doc.setFillColor(...badgeColor);
  doc.roundedRect(badgeX, cy - 5, badgeW, 8, 2, 2, 'F');
  doc.setFontSize(7.5);
  doc.setTextColor(255,255,255);
  doc.setFont('helvetica', 'bold');
  doc.text(level, badgeX + 6, cy - 0.5);
  cy += 12;
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MAIN);
  doc.setFont('helvetica', 'normal');
  doc.text(detailLines, textX, cy, { lineHeightFactor: 1.45 });
  y += cardH + 6;
}

// ── Page 1 ───────────────────────────────────────────────────────────────────

drawHeaderBlock(true);

// Summary
doc.setFontSize(13);
doc.setTextColor(...TEXT_MAIN);
doc.setFont('times', 'bold');
doc.text('Summary', MARGIN_X, y);
y += 7;

doc.setFontSize(9.5);
doc.setTextColor(...TEXT_MAIN);
doc.setFont('helvetica', 'normal');
const summaryLines = doc.splitTextToSize(profile.summary, CONTENT_W - 10);
const summaryBoxH  = summaryLines.length * 4.5 + 8;
checkSpace(summaryBoxH + 4);
doc.setFillColor(...BG_WARM);
doc.roundedRect(MARGIN_X, y - 3, CONTENT_W, summaryBoxH, 2, 2, 'F');
doc.setFillColor(...GOLD);
doc.rect(MARGIN_X, y - 3, 1.2, summaryBoxH, 'F');
doc.text(summaryLines, MARGIN_X + 5, y + 2, { lineHeightFactor: 1.5 });
y += summaryBoxH + 4;

// Dimensions
if (profile.dimensions) {
  drawSectionHeading('Readiness Dimensions');
  doc.setFontSize(8);
  doc.setTextColor(...LEGEND_GRAY);
  doc.setFont('helvetica', 'bold');
  let lx = MARGIN_X;
  const legendItems = [
    { name: 'Orientation', desc: ' — How well you understand AI' },
    { name: 'Integration', desc: ' — How effectively you use AI' },
    { name: 'Judgment',    desc: ' — How well you reason under pressure' },
  ];
  for (let i = 0; i < legendItems.length; i++) {
    if (i > 0) {
      doc.setFont('helvetica', 'normal');
      doc.text('   ·   ', lx, y);
      lx += doc.getTextWidth('   ·   ');
    }
    doc.setFont('helvetica', 'bold');
    doc.text(legendItems[i].name, lx, y);
    lx += doc.getTextWidth(legendItems[i].name);
    doc.setFont('helvetica', 'normal');
    doc.text(legendItems[i].desc, lx, y);
    lx += doc.getTextWidth(legendItems[i].desc);
  }
  y += 8;
  drawConstructCard('Orientation', profile.dimensions.orientation.level, profile.dimensions.orientation.detail);
  drawConstructCard('Integration', profile.dimensions.integration.level, profile.dimensions.integration.detail);
  drawConstructCard('Judgment',    profile.dimensions.judgment.level,    profile.dimensions.judgment.detail);
}

// Doing well
drawSectionHeading("What You're Doing Well", GREEN);
drawBulletList(profile.doing_well, GREEN);

// Next capabilities
drawSectionHeading('Next Capabilities to Build', GOLD);
drawBulletList(profile.next_capabilities, GOLD);

// Next step box
checkSpace(30);
const nextStepLines  = doc.splitTextToSize(profile.primary_next_step, CONTENT_W - 24);
const nextStepBoxH   = 16 + nextStepLines.length * 4.5 + 16;
checkSpace(nextStepBoxH + 10);
doc.setFillColor(...BG_WARM);
doc.setDrawColor(...BORDER);
doc.setLineWidth(0.5);
doc.roundedRect(MARGIN_X, y, CONTENT_W, nextStepBoxH, 2, 2, 'FD');
doc.setFillColor(...GOLD);
doc.rect(MARGIN_X, y, 5, nextStepBoxH, 'F');
doc.setFontSize(11);
doc.setTextColor(...TEXT_MAIN);
doc.setFont('times', 'bold');
doc.text('Your Next Step', MARGIN_X + 14, y + 12);
doc.setFontSize(9.5);
doc.setFont('helvetica', 'normal');
doc.text(nextStepLines, MARGIN_X + 14, y + 24, { lineHeightFactor: 1.5 });
y += nextStepBoxH + 8;

// Org opportunities
if (profile.organizational_opportunities?.length > 0) {
  drawSectionHeading('Organizational Opportunities', TEXT_MUTED);
  doc.setFontSize(8.5);
  doc.setTextColor(...TEXT_LIGHT);
  doc.setFont('helvetica', 'italic');
  doc.text(
    'The following recommendations are addressed to the organization based on patterns observed in this assessment.',
    MARGIN_X, y
  );
  y += 6;
  drawBulletList(profile.organizational_opportunities, TEXT_MUTED);
}

// ── Appendix ─────────────────────────────────────────────────────────────────

if (assessmentResponses.length > 0) {
  doc.addPage();
  y = MARGIN_TOP;
  drawHeaderBlock();
  drawSectionHeading('Assessment Responses', TEXT_MAIN, 2);
  y += 2;

  let currentTier = 0;
  for (const resp of assessmentResponses) {
    if (resp.tier !== currentTier) {
      currentTier = resp.tier;
      const tierColor = TIER_COLORS[currentTier] || NAVY;
      const tierLabel = TIER_LABELS[currentTier] || `TIER ${currentTier}`;
      checkSpace(34);
      doc.setFillColor(...tierColor);
      doc.roundedRect(MARGIN_X, y, CONTENT_W, 12, 2, 2, 'F');
      doc.setFontSize(9);
      doc.setTextColor(255,255,255);
      doc.setFont('helvetica', 'bold');
      doc.text(tierLabel, MARGIN_X + 8, y + 8);
      y += 16;
    }
    const questionLines  = doc.splitTextToSize(resp.scenario, CONTENT_W - 20);
    const responseLines  = doc.splitTextToSize(resp.response, CONTENT_W - 24);
    const qH     = questionLines.length * 3.8;
    const rH     = responseLines.length * 4;
    const cardH  = 14 + qH + 8 + 10 + rH + 10;
    checkSpace(cardH + 8);
    doc.setFontSize(9.5);
    doc.setTextColor(...TEXT_MAIN);
    doc.setFont('helvetica', 'bold');
    doc.text(`Question ${resp.questionIndex + 1}`, MARGIN_X, y);
    y += 6;
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.3);
    doc.setFillColor(255,255,255);
    const qCardH = qH + 10;
    doc.roundedRect(MARGIN_X, y - 2, CONTENT_W, qCardH, 2, 2, 'FD');
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_MAIN);
    doc.setFont('helvetica', 'normal');
    doc.text(questionLines, MARGIN_X + 6, y + 3, { lineHeightFactor: 1.5 });
    y += qCardH + 2;
    const respBlockH = 10 + rH + 8;
    doc.setFillColor(...BG_WARM);
    doc.roundedRect(MARGIN_X, y - 2, CONTENT_W, respBlockH, 2, 2, 'F');
    doc.setFontSize(8);
    doc.setTextColor(153,153,153);
    doc.setFont('helvetica', 'bold');
    doc.text('YOUR RESPONSE', MARGIN_X + 6, y + 3);
    doc.setFontSize(9.5);
    doc.setTextColor(...TEXT_MAIN);
    doc.setFont('helvetica', 'normal');
    doc.text(responseLines, MARGIN_X + 6, y + 9, { lineHeightFactor: 1.5 });
    y += respBlockH + 8;
  }
}

drawFooter();

// ── Write to disk ─────────────────────────────────────────────────────────────

const slug    = (name || 'profile').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
const outFile = process.argv[3] ?? path.join(ROOT, 'regeneration-output', `ai-readiness-profile-${slug}.pdf`);
const buf     = Buffer.from(doc.output('arraybuffer'));
fs.writeFileSync(outFile, buf);
console.log(`PDF written to: ${outFile}`);
