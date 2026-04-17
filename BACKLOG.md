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

## Framework

- [ ] Revisit the AI literacy framework "constitution" — foundational document defining the dimensions, levels, and underlying theory of AI readiness that the assessment is built on

## Harness

- [ ] Update harness model strategy to match production: Sonnet for scoring, Opus for T3 question generation and profile generation

## Save & Resume

- [ ] Implement save/resume for in-progress assessments (see design: `.claude/projects/.../memory/project_save_resume.md`)
- [ ] New Supabase table `assessment_sessions` — stores serialized state + 6-char resume code
- [ ] Auto-save after each question submission (debounced)
- [ ] "Save My Progress" button in header after intake — shows resume code + copyable link
- [ ] Resume via URL param (`?resume=CODE`) or code entry on welcome screen
- [ ] 7-day session expiry

## Structured Output (tool_use)

- [ ] Migrate scoring routes to Claude `tool_use` structured output (see design: `.claude/projects/.../memory/project_structured_prompts.md`)
- [ ] Priority 1: score-tier1/2/3 — eliminate `parseAIJson` fallback logic
- [ ] Priority 2: generate-tier3 Step 1 (performance summary) — prevent cascade failures into question generation
- [ ] Priority 3: generate-tier3 Step 2 (question generation) — shrink prompt template, enforce nested rubric schema
- [ ] Priority 4 (optional): generate-profile — add schema enforcement, keep prose guidance

