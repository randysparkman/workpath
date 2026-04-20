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
- Current state: template moved into `system` array with `cache_control: ephemeral`, matching the working `generate-profile` pattern. Despite this, `cache_write=0 cache_read=0` on back-to-back runs. `generate-profile` caches successfully (`cache_write=10137`).
- Hypothesis: token count of the combined system block (short prefix + ~1.6k template) may be sitting right at Sonnet's 1024-token minimum; or the concatenation is producing content below the threshold after tokenization.
- Actions:
  - Log the exact system-block size being sent (char + rough token count) and verify it's comfortably above 1024.
  - Try a two-element system array (`[prefix, template]` with `cache_control` on the template element) instead of a single concatenated string.
  - If still not caching, read Anthropic's current cache docs for any constraints specific to content-block structure we may be missing.
- Expected win: ~0.5s per call (not a latency lever; this is a cost + correctness item).

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
- Current state: ~5.1k output tokens (5 full scenarios each with 9 rubric bullets + `tier3_meta`).
- Actions:
  - Audit `tier3_meta` usage across the codebase — if nothing consumes it, drop it from the schema. Pure design-time artifact.
  - Look at the 9-bullet-per-question rubric format. Each question currently emits emerging/developing/demonstrating descriptions for orientation, integration, and judgment. Options: one-sentence descriptions instead of multi-clause, or shared rubric language across scoped question types.
  - Consult Claude Chat on whether trimmed rubrics still give score-tier3 enough signal to grade accurately. This is the highest-risk change — don't cut too deep.
- Expected win: 1–2k output tokens saved = 20–40s off generate-tier3. Largest single latency lever in the whole assessment.

### Step 4 — Cache score-tier2 system prompt + rubrics
- Current state: `SYSTEM_PROMPT` is a plain string literal (not cacheable). Rubric text for all 5 T2 questions is rebuilt into a string on every call — identical per deployment but never cached.
- Actions:
  - Restructure `SYSTEM_PROMPT` into a system array element with `cache_control`.
  - Move the rubric block into a cached system element if it's static per profile (rubrics come from the profile `.md`, which doesn't change within a deploy).
  - Similarly audit score-tier1 and score-tier3.
- Expected win: ~3–5s per scoring call. Also reduces cost materially across 100 students.

### Step 5 — Prompt-side: prevent preamble in generate-profile
- Current state: Sonnet occasionally prefixes prose ("I'll work through this...") before the JSON, causing parse failures. Parser was hardened to slice `{...}`, but prevention is better than cure.
- Actions:
  - Review `lib/prompts/generate-profile-prompt.ts` for any phrasing that invites Sonnet to narrate its reasoning before outputting JSON.
  - Add an explicit "output JSON only — no preamble, no explanation, no markdown fences" line near the end of the prompt.
- Expected win: fewer parse retries (retries are the most expensive failure mode — they effectively double the route's wall clock).

### Step 6 — Migrate scoring routes to `tool_use` structured output
- Tracked separately under "Structured Output (tool_use)" below. Complements Steps 2–5 by eliminating free-form JSON generation entirely.
- Do this after Step 3 — schema shrinkage has to happen first, since `tool_use` locks in whatever schema exists at migration time.

### Step 7 — Streaming for generate-tier3 (perceptual only)
- Tracked separately under "Wait Screen UX → Phase 2". Does not reduce actual time but converts a blank 100s wait into visible progress.
- Defer until Steps 1–6 have done what they can structurally.

### Ordering note
Steps 1, 4, and 5 are low-risk and independent — safe to do in any order. Steps 2 and 3 are the big latency wins but require schema decisions that should be reviewed with Claude Chat before implementing. Step 6 is a dependent refactor. Step 7 is the last-mile UX item.

## Content & Profile Quality

- [ ] Tighten profile summary — currently too verbose, needs to be more concise
- [ ] Reduce inferred thinking — profile attributes reasoning to the respondent that wasn't explicitly stated; stay closer to what they actually said
- [ ] Build 3–4 new job-role profiles (TBD which roles)
- [ ] Update `lib/generatePdf.ts` — replace "AI Readiness Profile" references with WorkPath branding
- [ ] Update `lib/prompts/generate-profile-prompt.ts` — align profile generation language with WorkPath brand voice (see `public/brochure.html` as reference)

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
- [ ] **Quarterly cold tarball** — `tar czf workpath-cold-YYYYMMDD.tar.gz` of the full repo dropped into Google Drive. Catches anything that somehow didn't make it into Git.
- [ ] **Re-sync memory folder to Drive when it changes meaningfully** — the `~/.claude/projects/.../memory/` folder isn't in Git; re-upload the zipped copy after notable memory updates.

## Structured Output (tool_use)

- [ ] Migrate scoring routes to Claude `tool_use` structured output
- [ ] Priority 1: score-tier1/2/3 — eliminate `parseAIJson` fallback logic
- [ ] Priority 2: score-tier2 `performanceSummary` output (merged from old generate-tier3 step 1) — prevent cascade failures into Tier 3 question generation
- [ ] Priority 3: generate-tier3 (adaptive question generation) — shrink prompt template, enforce nested rubric schema
- [ ] Priority 4 (optional): generate-profile — add schema enforcement, keep prose guidance

