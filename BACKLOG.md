# WorkPath — Backlog

## Performance & Scaling (pre-launch: 100 students)

- [x] Add retry logic with backoff to API calls (SDK maxRetries bumped from 2 to 4 — covers 429s, 5xx, and connection errors with exponential backoff)
- [x] Upgrade to Vercel Pro (300s function ceiling; unblocked generate-tier3 which was hitting 60s Hobby limit)
- [x] Raise Vercel function timeout (scorers 120s, generators 300s; internal AbortControllers adjusted accordingly)
- [ ] Anthropic tier upgrade — Tier 1 → Tier 3 request in flight. Does not affect per-call latency but is needed for 25 concurrent students without 429s
- [ ] Monitor Vercel Pro usage — GB-hours and invocation counts under student load
- [ ] Time the Sonnet/Opus split in production and tune time estimates on AnalyzingScreen
- [ ] Purchase Supabase Pro license before student launch (unpauses free-tier project, enables daily backups, removes row/egress caps)

## Model-Latency Reduction (methodical, one-at-a-time)

Context (2026-04-19): baseline per-assessment latency on Sonnet end-to-end is ~4 minutes, dominated by `generate-tier3` (~100s) and `score-tier2` (~60s). Instrumentation (`[timing]` lines) confirms essentially 100% of wall clock is Anthropic model time — Vercel overhead is negligible. Plan below is ordered by expected impact and is designed to be tackled one step at a time, with Claude Chat consulted for schema-level changes before implementation.

### Step 1 — Diagnose why generate-tier3 prompt cache is not engaging
- **Status (2026-04-20): superseded.** The monolithic `generate-tier3` route was retired (commit `925b4bb`) and replaced with `generate-tier3-stems` + parallel `generate-tier3-rubric` calls (commit `a96120f`). The original diagnosis target no longer exists. Re-audit caching on the two replacement routes if cost becomes a concern; otherwise leave closed.

### Step 2 — Compress score-tier2 output schema
- Current state: score-tier2 produces ~2.77k output tokens. At ~40–50 tok/s this is the structural 60s floor for that route.
- The output is `{scores: [5 objects], performanceSummary: {...}}`. Scores alone ≈ 1k tokens. The performance summary dominates.
- Actions:
  - Read `data/tier3-summary-template.json` and enumerate every field produced.
  - Cross-reference against what `generate-tier3` actually consumes from `performanceSummary`. Any field not read downstream is dead weight.
  - Consult Claude Chat on the minimum viable summary shape that still drives good T3 question generation.
  - Tighten prompt + schema. Measure before/after.
- Expected win: 500–1000 output tokens saved = 10–20s off score-tier2.

### Step 3 — Compress generate-tier3 output schema
- **Status (2026-04-20): largely landed.** Route was split into stems + parallel rubrics (commit `a96120f`); dead fields trimmed (commit `3e00cd7`). Five rubrics now generate in parallel rather than serially inside one giant call.
- **Remaining sub-item:** Tighten the rubric *body* itself (9-bullet emerging/developing/demonstrating per construct → terser language, or shared scaffolding across scoped question types). Still a real latency win per rubric call, gated on Claude Chat consult so accuracy doesn't degrade.

### Step 4 — Cache score-tier2 system prompt + rubrics
- **Status (2026-04-20): done for score-tier2** (commit `f9dfac5` — static system prompt restructured into cached array element). Plus a follow-on: the route was split in two for Ticket 1 (commit `29fe055`), so the `SCORE_ONLY_SYSTEM` and the summary prompt both benefit.
- **Remaining sub-item:** audit score-tier1 and score-tier3 for the same pattern — both still likely use plain-string system prompts.

### Step 5 — Prompt-side: prevent preamble in generate-profile
- **Status (2026-04-20): unverified.** Recent edits to `lib/prompts/generate-profile-prompt.ts` for Tickets 2+3 (commit `6442717`) didn't add the explicit "output JSON only — no preamble" line. Worth a focused 10-min pass: read the prompt's tail, add the line if missing, observe whether parse retries drop.
- Expected win: fewer parse retries (retries are the most expensive failure mode — they effectively double the route's wall clock).

### Step 6 — Migrate scoring routes to `tool_use` structured output
- Tracked separately under "Structured Output (tool_use)" below. Complements Steps 2–5 by eliminating free-form JSON generation entirely.
- Do this after Step 3 — schema shrinkage has to happen first, since `tool_use` locks in whatever schema exists at migration time.

### Step 7 — Streaming for generate-tier3 (perceptual only)
- Tracked separately under "Wait Screen UX → Phase 2". Does not reduce actual time but converts a blank 100s wait into visible progress.
- Defer until Steps 1–6 have done what they can structurally.

### Ordering note (refreshed 2026-04-20)
Steps 1, 3 (structural), and 4 (score-tier2) are landed. Remaining latency levers in priority order: **Step 2** (score-tier2 schema compression — biggest unclaimed win, ~10–20s), **Step 3 carve-out** (rubric-body tightening per call), **Step 4 carve-out** (cache score-tier1 + score-tier3 system prompts), **Step 5** (verify anti-preamble line in generate-profile prompt), **Step 6** (tool_use migration — dependent refactor, do after Step 2 schema lands), **Step 7** (streaming, last-mile UX, deferred).

## Content & Profile Quality

- [ ] Tighten profile summary — currently too verbose, needs to be more concise
- [ ] Reduce inferred thinking — profile attributes reasoning to the respondent that wasn't explicitly stated; stay closer to what they actually said. _Partially addressed by Ticket 3 (commit `6442717` — doing_well first item must open with respondent-specific observation, not template). Broader prompt pass still warranted._
- [ ] Build 3–4 new job-role profiles (TBD which roles)
- [ ] Update `lib/generatePdf.ts` — replace "AI Readiness Profile" references with WorkPath branding
- [ ] Update `lib/prompts/generate-profile-prompt.ts` — align profile generation language with WorkPath brand voice (see `public/brochure.html` as reference)

## Calibration & Scoring

Recent shipped work (Jasmine post-rubric-retune audit, 2026-04-20):

- [x] **Ticket 1 — Deterministic level counts** (commit `29fe055`). Split `score-tier2` into two calls; deterministic `tallyConstruct` injects authoritative counts into the performance-summary prompt. Fixes "4 of 10 demonstrating" miscount when actual was 7/3. Verified on Jasmine re-run — narrative now matches `[counts]` log exactly.
- [x] **Ticket 2 — Within-construct mixed scoring** (commit `6442717`). Three additive edits to `generate-profile-prompt.ts`: new §3.6.1, qualifier on §4.3 editorial-moment permission, new §4.4 final-check item #5. Bans minimizing phrases like "matters less in practice than in theory." Verified — Orientation detail now surfaces both Demonstrating and Developing patterns as current.
- [x] **Ticket 3 — doing_well opener specificity** (commit `6442717`). First item must open with respondent-specific observation, not a template sentence.

### Calibration watchlist (open)

- [ ] **Demonstrating-inflation across personas (Maya / Rita / Jordan).** Three earlier agentic runs all scored Demonstrating despite personas designed with Developing-level gaps (HIPAA/PHI blind spot for Rita; principle-vs-application gap for Jordan). Today's tickets address the Jasmine pattern (within-construct flattening + miscount), but the fluency-over-substance concern is independent and remains live. Worth raising with Claude Chat during a structured rubric review session.
- [ ] **Re-run Maya / Rita / Jordan against the v0.3.0 rubric + Tickets 1–3.** Validates whether the retune + generator fixes also tighten the older personas, or whether they need their own targeted work.
- [ ] **CIE499 retune coverage check.** v0.3.0 retuned 4 of 10 Orientation questions. Confirm whether the remaining 6 need the same mechanism-bar treatment, or whether they're already calibrated.
- [ ] **Donna Hartley run (2026-04-21) — band inflation confirmed.** Donna is calibrated Emerging-overall with Integration flash of Developing. Run landed her at Developing across all three dimensions. Root cause: T2 Orientation scored 5/5 Demonstrating — the rubric is rewarding concrete workflow descriptions (COB appeal, write-off memo) as Orientation Demonstrating even without mechanism articulation. T2 Judgment scored 4/5 Demonstrating for similar reasons. T3 pulled back correctly (all Developing). The T2 rubric's Demonstrating threshold for Orientation may be too low — "describes a concrete verification workflow" is reading as mechanism understanding. Raise with Claude Chat.

## Licensing / Assessment Caps

- [ ] Add `assessment_limit` field to job-role profile `.md` files (e.g. `assessment_limit: 250`)
- [ ] On app load, query `assessment_completions` count for the role_profile
- [ ] Compare against limit — if at capacity, show "assessment unavailable" screen instead of welcome
- [ ] Build as a server-side API route (e.g. `/api/check-capacity`) — uses `SUPABASE_SERVICE_ROLE_KEY` (not public) to read count, keeps anon key insert-only
- [ ] Add `SUPABASE_SERVICE_ROLE_KEY` to Vercel env vars (find in Supabase → Settings → API → Service role key)

## Wait Screen UX

- [ ] **Phase 1 — Informational cards on `analyzing_t2t3`:** Show two phases while Tier 3 questions generate: (1) brief explanation that T3 questions are personalized based on their answers, (2) cards describing the three assessment tiers (Orientation, Integration, Judgment). Progress bar underneath runs on a time-based estimate (not wired to actual API progress). Copy must follow brand language conventions in CLAUDE.md.
- [ ] **Phase 2 (future) — Streaming progress:** Convert `generate-tier3/route.ts` to a streaming response and consume it on the client to drive a real progress signal. Defer until performance is otherwise optimized — wiring is non-trivial and the problem may be solved at the infrastructure level first.

## Framework

- [ ] Revisit the AI literacy framework "constitution" — foundational document defining the dimensions, levels, and underlying theory of AI readiness that the assessment is built on

## Save & Resume

- [x] Implement save/resume for in-progress assessments
- [x] New Supabase table `assessment_sessions` — stores serialized state + 6-char resume code
- [x] Auto-save after each question submission (debounced)
- [x] "Save My Progress" button in header after intake — shows resume code + copyable link
- [x] Resume via URL param (`?resume=CODE`) or code entry on welcome screen
- [x] 7-day session expiry
- [ ] **Prune stale `assessment_sessions` rows** — silent partial assessments accumulate as respondents abandon mid-flow. Add a scheduled cleanup (Supabase cron or manual SQL) to delete rows where `updated_at < now() - interval '7 days'`. Not urgent at low volume, but revisit before the student launch scales past a couple hundred rows.

## Backup & Recovery

- [ ] **Vendor config runbook** — single markdown file (gitignored or outside repo) documenting Vercel project settings + env var names, Supabase project ID + key roles + RLS policy, GoDaddy DNS records for `wkpath.com`, API key locations (Apple Passwords, `~/.zshrc`). The "how do I rebuild this deployment from scratch" doc.
- [ ] **Pre-launch: Supabase backup posture** — confirm whether the free tier's automatic backups are sufficient for student data, or set up scheduled exports. Zero urgency now (0 rows); real once students start completing.
- [ ] **Quarterly cold tarball** — `tar czf workpath-cold-YYYYMMDD.tar.gz` of the full repo dropped into Google Drive. Catches anything that somehow didn't make it into Git. _Last done: 2026-04-20 (post-calibration-ticket work). Excludes: node_modules, .next, .vercel, .claude/worktrees, tsconfig.tsbuildinfo._
- [ ] **Re-sync memory folder to Drive when it changes meaningfully** — the `~/.claude/projects/.../memory/` folder isn't in Git; re-upload the zipped copy after notable memory updates. _Last done: 2026-04-20 (bundled with responses/ artifacts in workpath-local-artifacts-YYYY-MM-DD.tar.gz)._

## Structured Output (tool_use)

- [ ] Migrate scoring routes to Claude `tool_use` structured output
- [ ] Priority 1: score-tier1/2/3 — eliminate `parseAIJson` fallback logic
- [ ] Priority 2: score-tier2 `performanceSummary` output (merged from old generate-tier3 step 1) — prevent cascade failures into Tier 3 question generation
- [ ] Priority 3: generate-tier3 (adaptive question generation) — shrink prompt template, enforce nested rubric schema
- [ ] Priority 4 (optional): generate-profile — add schema enforcement, keep prose guidance

## Tooling & Workflow

- [ ] **Session briefing bundle** — evaluate building a script that generates a zip of CLAUDE.md + BACKLOG.md + a requested file subset for single-upload bootstrap at the start of Claude Chat sessions. Current workflow (pull individual files from the repo) works; this is an optimization if session-start friction becomes an issue.
- [ ] **No duplicate files within the repo** — codify that `data/authoring/` is canonical for all authoring assets; `scripts/` contains runtime tooling only. In changelog #31 (2026-04-21), `scripts/` had a v0.2.1 copy of the T1/T2 generation prompts while `data/authoring/` was at v0.2.0 — drift from when the prompts were tightened during `regenerate-profile.mjs` development without syncing back. Resolved by deleting the `scripts/` copies and updating the script to read from `data/authoring/`. Convention: no file should exist in two repo locations.

