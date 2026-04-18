# WorkPath — Backlog

## Performance & Scaling (pre-launch: 100 students)

- [x] Add retry logic with backoff to API calls (SDK maxRetries bumped from 2 to 4 — covers 429s, 5xx, and connection errors with exponential backoff)
- [ ] Check Anthropic rate limit tier and upgrade if needed for 25 concurrent users
- [x] Raise Vercel function timeout (maxDuration = 60s on all API routes — Hobby default of 10s was blocking Opus profile generation)
- [ ] Monitor Vercel Hobby plan limits — serverless function invocations (still watch GB-hours and 100k invocation cap)
- [ ] Time the Sonnet/Opus split in production and tune time estimates on AnalyzingScreen
- [ ] Consider Vercel Pro if Hobby limits are too tight for student load

## Content & Profile Quality

- [ ] Tighten profile summary — currently too verbose, needs to be more concise
- [ ] Reduce inferred thinking — profile attributes reasoning to the respondent that wasn't explicitly stated; stay closer to what they actually said
- [ ] Key prompt tuning directions (in `lib/prompts/generate-profile-prompt.ts`):
  - "Stay close to the evidence." Don't infer thinking the respondent didn't demonstrate. If a response is thin, say so honestly.
  - "Match the register." If someone gave a two-sentence answer, don't write a paragraph of analysis about it.
  - "Emerging is not a failure." Calibrate toward accuracy, not encouragement — the prompt may be biased toward generous interpretation.
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

## Harness

- [ ] **Revisit the harness concept** — step back and evaluate whether the offline scoring pipeline is still doing what we need. Originally built for respondent replay + PDF generation before the Next.js app existed; now that the live app is the primary surface, confirm the harness's purpose (regression testing? prompt iteration? batch scoring for clients without the UI?) and align its capabilities accordingly
- [ ] **Fix broken harness paths** — `harness.js:26` hardcodes `ASSESSMENT_DIR = '/Users/randysparkman/Desktop/AI-assessment-tool'` (folder no longer exists); references `profile-generation-prompt-v5.md` and `tier3-*-template-v2.json` (diverged from canonical repo versions). Repoint to `../data/` and `../lib/prompts/` or pass as CLI args. Blocks any harness run today.
- [ ] Update harness model strategy to match production: Sonnet 4.6 for scoring, Opus 4.7 for T3 question generation and profile generation (deferred pending harness concept review)

## Save & Resume

- [ ] Implement save/resume for in-progress assessments (see design: `.claude/projects/.../memory/project_save_resume.md`)
- [ ] New Supabase table `assessment_sessions` — stores serialized state + 6-char resume code
- [ ] Auto-save after each question submission (debounced)
- [ ] "Save My Progress" button in header after intake — shows resume code + copyable link
- [ ] Resume via URL param (`?resume=CODE`) or code entry on welcome screen
- [ ] 7-day session expiry

## Backup & Recovery

- [ ] **Vendor config runbook** — single markdown file (gitignored or outside repo) documenting Vercel project settings + env var names, Supabase project ID + key roles + RLS policy, GoDaddy DNS records for `wkpath.com`, API key locations (Apple Passwords, `~/.zshrc`). The "how do I rebuild this deployment from scratch" doc.
- [ ] **Pre-launch: Supabase backup posture** — confirm whether the free tier's automatic backups are sufficient for student data, or set up scheduled exports. Zero urgency now (0 rows); real once students start completing.
- [ ] **Quarterly cold tarball** — `tar czf workpath-cold-YYYYMMDD.tar.gz` of the full repo dropped into Google Drive. Catches anything that somehow didn't make it into Git.
- [ ] **Re-sync memory folder to Drive when it changes meaningfully** — the `~/.claude/projects/.../memory/` folder isn't in Git; re-upload the zipped copy after notable memory updates.

## Structured Output (tool_use)

- [ ] Migrate scoring routes to Claude `tool_use` structured output (see design: `.claude/projects/.../memory/project_structured_prompts.md`)
- [ ] Priority 1: score-tier1/2/3 — eliminate `parseAIJson` fallback logic
- [ ] Priority 2: score-tier2 `performanceSummary` output (merged from old generate-tier3 step 1) — prevent cascade failures into Tier 3 question generation
- [ ] Priority 3: generate-tier3 (adaptive question generation) — shrink prompt template, enforce nested rubric schema
- [ ] Priority 4 (optional): generate-profile — add schema enforcement, keep prose guidance

