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
- [ ] **Bold-lead sentence length in `doing_well` and `next_capabilities`** — Some lead sentences are running 25–35 words, which loses the punch of the bold-lead pattern introduced in the front-matter overhaul (changelogs #32–34). Lead should be a short declarative sentence (10–15 words), with the body explaining. This is a generation-prompt concern, not a layout concern. Address in a future profile-prompt iteration.
- [ ] Reduce inferred thinking — profile attributes reasoning to the respondent that wasn't explicitly stated; stay closer to what they actually said. _Partially addressed by Ticket 3 (commit `6442717` — doing_well first item must open with respondent-specific observation, not template). Broader prompt pass still warranted._
- [ ] Build 3–4 new job-role profiles (TBD which roles)
- [ ] Update `lib/prompts/generate-profile-prompt.ts` — align profile generation language with WorkPath brand voice (see `public/brochure.html` as reference)
- [ ] Assessment badge version number — baseline the version shown on the "WORKPATH VERIFIED" badge (PDF page 1) and get it config-managed. Today it's baked into the PNG / render code; needs a single source of truth so future rubric or prompt revisions can bump it deliberately.
- [ ] **Profile PDF length reduction (pare from 13+ to 10 pages)** — Current profile PDF runs 13+ pages; target is 10. Tighten presentation without cutting content or sections. Primary trim candidates: appendix card density, repeated appendix header, construct card spacing, summary/next-move callout padding, inter-section spacing. Do not trim: placement scale, construct legend, verbatim appendix responses, footer attribution. Measurement baseline: Marcus Delgado and Jasmine Okafor profiles. No canonical file changes — PDF generation logic only. Open question: whether corporate/enterprise PDFs match the 10-page target or can run longer. _Precedes the durable skills callout item below._
- [ ] **Durable skills observational callout (profile output)** — Add an observational layer to the profile generator that flags notable demonstrations of human/durable skills surfaced in AI-context responses (collaboration, communication, critical thinking, ethical reasoning, adaptability, etc.). Not a scored construct — a qualitative, evidence-anchored callout, conditionally populated (same pattern as `organizational_opportunities`). Framework-level: cross-cutting observational layer, not a fourth construct. Preserves 3×3 scoring integrity. Scoring prompts unchanged; profile generation prompt only. Must follow existing behavioral-language discipline — anchor every callout in specific response evidence, no personality inference. Dual-dialect positioning rationale: speaks to both corporate AI-readiness buyers and post-secondary/workforce-agency buyers who use durable-skills language. Open decisions before building: which durable-skills taxonomy (America Succeeds / Lumina / JFF / custom 6–10), which current section(s) displace to make room, calibration on Marcus and Jasmine before shipping. _Dependency: page-count reduction item above must ship first._
- [ ] **"Working Posture" section — second analytical pass on assessment responses.** Add a new section to the profile output that reads the fifteen scenario responses through a different lens: the durable human qualities that show up through how the respondent engages with consequential work. The AI literacy framework, scenario authoring, scoring rubrics, construct placement, and AI-readiness profile output remain unchanged. This is an additional analytical pass against the same response data, surfacing signal the AI-readiness reading doesn't capture. _Conceptually the more ambitious successor to the durable-skills callout above — that item is the near-term, single-callout version; this is the full-section, longer-arc version. Either could absorb the other depending on what the data supports._

  **What it reads for** (preliminary, to be refined from real data):
  - Discernment — independent judgment under social or epistemic pressure
  - Agency — ownership of outputs, willingness to be the standard rather than defer to the tool or to peers
  - Curiosity — openness to new tools or approaches, paired with appropriate verification
  - Creativity — generative thinking that goes beyond the task as presented
  - Other qualities to be identified as patterns emerge across real respondent data

  Definitions should emerge from observing what's actually present in responses, not from theoretical taxonomy.

  **Naming candidates:** "Working Posture" (current frontrunner), "Durable Capabilities," "Operational Signals." Not "Human Response" (implies the AI-readiness reading isn't human). Not "Working Character" (risks personality-inference line).

  **Critical discipline to preserve:** evidence-anchored behavioral language only. No personality inference. The same rule that governs the existing profile prompt — behavior shown, not character claimed — applies here. A working-posture read says "in scenario X, the response chose to verify against policy rather than accept a peer's reassurance," not "this person is discerning."

  **Why this matters strategically:**
  - Most assessments measure one thing; this surfaces a second reading from the same responses.
  - Behavioral assessments (DISC, StrengthsFinder, Hogan) measure traits via self-report; cognitive assessments measure capability in artificial conditions; AI-readiness assessments measure tool fluency. None measure how durable human qualities show up through reasoning about consequential work. Open territory.
  - Particularly valuable for channel-partner contexts — workforce development, university workforce programs, corporate L&D. AI readiness is the entry point; durable-capability reads are the deeper finding that makes the instrument indispensable.
  - Strengthens cohort-level deliverable for engagements: "AI readiness placement + working-posture pattern + interaction between them" is a substantially more valuable report than AI placement alone.

  **Sequencing — do not build prematurely:**
  - **Near-term:** Cohort observation log captures these reads informally as completions accumulate. The "notable observations" field is where the durable-skill reads live initially. For each respondent, hand-curate what's visible.
  - **At ~30 respondents:** Look across accumulated observations. Which qualities recur? What vocabulary captures them without drifting to personality? Which scenarios surface which signals? This is the rubric-development pass — grounded in real data, not theoretical framework.
  - **After rubric defined:** Build a generation prompt for the section. Calibrate against existing hand-curated observations. Ship when it produces what the hand reads produced.

  **Estimated arc:** 6–9 months from now. Not a near-term build. The defensibility of this section depends on the same psychometric care as the AI-readiness rubrics, which means the rubric must emerge from data, not precede it.

  **Dependencies:**
  - Cohort observation log (separate backlog item) is the substrate from which this section's rubric emerges
  - Sufficient respondent volume across multiple role profiles to identify which qualities are universal vs. role-specific
- [ ] **Cohort observation log** — Hand-curated record of notable patterns surfaced in each completed assessment. Per-respondent "notable observations" entry where durable-capability reads (discernment, agency, curiosity, creativity, etc.) and any other signal worth remembering live initially, before any rubric exists. Format TBD — candidates: a single markdown file in the repo, a Google Doc, or a `notable_observations` column on `assessment_completions`. The marginal-cost choice depends on who's authoring (Randy alone → markdown or Doc; multiple authors or eventual programmatic read → Supabase column). Primary downstream consumer is the "Working Posture" section above; secondary is general calibration awareness — anything observed across cohorts that doesn't fit the existing rubric. Start lightweight as completions accumulate; revisit format once volume justifies more structure. _Open: pick the format and start logging now (even informally) so the substrate is ready when the Working Posture rubric pass arrives._
- [ ] **§3/§4 architectural seam — interpretive vs. output-shape boundary.** The profile-generation prompt has a recurring tension between fields that need both interpretive guidance (when to do something) and output-shape guidance (what shape it takes when done). Recent calibration work has consistently revealed that interpretive guidance embedded in §4 output-format field descriptions produces inconsistent behavior, while lifting that guidance to §3 as its own interpretive subsection produces stable behavior at recovered cost.
  Confirmed instances: §3.6.1 within-construct mixed scoring (April 20). §3.8 organizational opportunity threshold (April 25). The seventh dial (developmental posture, §4.1) is a near-instance — it sits in §4 but functions as interpretive guidance, and was deliberately placed in the voice engine because the architectural alternative (a §3.9 subsection on developmental framing) would have over-fragmented §3.
  When adding new fields or modifying existing ones, watch for the seam. If a field description is doing both jobs, lift the interpretive guidance to §3 and leave §4 as pure output shape. If §3 starts to fragment into many small interpretive subsections, consider whether they cluster into a smaller number of larger principles.
  Not blocking. Watch-and-respond pattern, not a refactor target.
- [ ] **PDF summary as paragraph array — deferred from April 24 voice engine change run.** The original voice engine implementation addendum specified two PDF changes: header spacing (shipped April 25) and rendering the summary as visually separated paragraphs within the summary card (deferred). The deferral was deliberate: the voice engine produces summary prose with enough internal sentence variance and full-stop cadence that the single-block rendering reads cleanly. Visual paragraph breaks would still be an improvement, but they are not currently solving an observed problem.
  The deferred change involves:
  - Schema: summary field becomes `string[]` (2–4 paragraph strings) instead of `string`
  - Prompt: §4.3 summary field description specifies paragraph-by-paragraph structure (first paragraph names the dominant pattern; middle paragraphs develop or qualify; last paragraph names placement and next step)
  - Renderer: read array, render each paragraph as its own block within the warm-background card, with 10–12 points of vertical space between paragraphs
  - Backward compatibility: renderer falls back to splitting on `\n\n` or treating as single paragraph if older single-string summaries are encountered

  **Revisit trigger:** When the summary block begins to feel too dense across multiple profiles, or when a sponsor or pilot reader specifically notes the visual heaviness. The voice engine's current cadence may carry indefinitely; this change should ship only when there's evidence it solves a real problem.

  **Reference:** Original specification in `voice-engine-implementation-brief-addendum.md` (April 24, 2026).

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

## Framework

- [ ] Revisit the AI literacy framework "constitution" — foundational document defining the dimensions, levels, and underlying theory of AI readiness that the assessment is built on
- [ ] **Evaluate five common AI-use functions for inclusion in literacy framework.** The front-door job-role-profile (`job-role-profile-front-door.md`) describes five recognizable patterns of how knowledge workers use AI, independent of job setting:
  1. Looking things up (when search would be slower)
  2. Thinking something through (second brain)
  3. Making a first draft (rather than starting from scratch)
  4. Working through a document or pile of data (faster than careful reading)
  5. Moving through the administrative/coordinative stream of the week

  These currently live only in the front-door profile's Work Context and Common Tasks sections. They function as a ~500-foot layer of empirical use patterns, sitting below the four human functions (Understand, Express, Ideate, Act) at ~5,000 feet.

  **Question to resolve:** Should the five patterns be incorporated into the AI literacy framework / constitution? If so, in what role:
  - (a) Descriptive examples that make the four functions concrete
  - (b) A parallel taxonomy at a different altitude, kept distinct from the four functions
  - (c) The primary authoring/scoring vocabulary, with the four functions repositioned or retired

  **Dependencies:**
  - Pressure-test the five against empirical LLM use research (NBER, Anthropic usage data, OpenAI/Ipsos, Epoch, Gallup) before locking — already tracked as backlog item #10
  - Resolve the lookup-vs-thinking-through boundary (most likely to blur in respondent language) with definitions clean enough to route scenarios in the authoring tool
  - Likely a v8 design doc decision, not a now decision

  **Status:** Parking lot — revisit alongside #10 (four-functions framework revisit) and the next design doc pass.

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
- [ ] **Surface silent completion-insert failures** — `hooks/use-assessment-flow.ts` lines 182–184 fire-and-forget the `assessment_completions` insert and only `console.error` on failure, which is invisible to the operator (visible only if the respondent opens dev tools). Discovered 2026-04-25 while probing the table: anon-key SELECT returns 0 rows by RLS design, so "table looks empty" from outside is uninformative — only a service-role read or the Supabase dashboard can tell whether real submissions are landing. Pre-launch, decide on at-minimum operator visibility. Options, lightest to heaviest: (a) periodic dashboard check + a quick `scripts/check-completions.mjs` that uses `SUPABASE_SERVICE_ROLE_KEY` to print row count + most recent `completed_at`; (b) server-side mirror — instead of inserting from the client, POST to a new `/api/record-completion` route that uses the service-role key and can log failures to Vercel logs where they're queryable; (c) wire up a real error sink (Sentry / PostHog). Option (b) also closes the door on a respondent's browser silently dropping the write due to network conditions late in the flow.
- [ ] **Quarterly cold tarball** — `tar czf workpath-cold-YYYYMMDD.tar.gz` of the full repo dropped into Google Drive. Catches anything that somehow didn't make it into Git. _Last done: 2026-04-20 (post-calibration-ticket work). Excludes: node_modules, .next, .vercel, .claude/worktrees, tsconfig.tsbuildinfo._
- [ ] **Re-sync memory folder to Drive when it changes meaningfully** — the `~/.claude/projects/.../memory/` folder isn't in Git; re-upload the zipped copy after notable memory updates. _Last done: 2026-04-20 (bundled with responses/ artifacts in workpath-local-artifacts-YYYY-MM-DD.tar.gz)._

## Security & Hygiene

- [ ] **Rotate `ANTHROPIC_API_KEY` and re-save as Sensitive in Vercel.** Vercel flags it as "Needs Attention" — value is visible to anyone with project access because the env var was added before the Sensitive toggle was set. Fix path: click "Rotate Variable" in Vercel → generate a new key at console.anthropic.com → paste into Vercel as Sensitive (lock icon) → verify a Production AI route still works → revoke the old key at Anthropic. _Discovered 2026-04-26 while reviewing Vercel env vars after the email-profile feature ship._
- [ ] **Verify `SUPABASE_SERVICE_ROLE_KEY` and `RESEND_API_KEY` are stored as Sensitive.** Both added 2026-04-26 during the email-profile feature build. If either was added without the Sensitive toggle, fix the same way as above. Lower priority than the Anthropic key since neither is currently flagged, but worth confirming proactively while in the env-var screen.

## Structured Output (tool_use)

- [ ] Migrate scoring routes to Claude `tool_use` structured output
- [ ] Priority 1: score-tier1/2/3 — eliminate `parseAIJson` fallback logic
- [ ] Priority 2: score-tier2 `performanceSummary` output (merged from old generate-tier3 step 1) — prevent cascade failures into Tier 3 question generation
- [ ] Priority 3: generate-tier3 (adaptive question generation) — shrink prompt template, enforce nested rubric schema
- [ ] Priority 4 (optional): generate-profile — add schema enforcement, keep prose guidance

## Tooling & Workflow

- [ ] **Session briefing bundle** — evaluate building a script that generates a zip of CLAUDE.md + BACKLOG.md + a requested file subset for single-upload bootstrap at the start of Claude Chat sessions. Current workflow (pull individual files from the repo) works; this is an optimization if session-start friction becomes an issue.
- [ ] **No duplicate files within the repo** — codify that `data/authoring/` is canonical for all authoring assets; `scripts/` contains runtime tooling only. In changelog #31 (2026-04-21), `scripts/` had a v0.2.1 copy of the T1/T2 generation prompts while `data/authoring/` was at v0.2.0 — drift from when the prompts were tightened during `regenerate-profile.mjs` development without syncing back. Resolved by deleting the `scripts/` copies and updating the script to read from `data/authoring/`. Convention: no file should exist in two repo locations.
- [ ] **PDF layout logic duplicated across `lib/generatePdf.ts` and `scripts/export-pdf.mjs`** — Surfaced during the front-matter overhaul (changelogs #32–34, 2026-04-25). The script is a near-verbatim Node-ESM port of the runtime TypeScript module, used to render production-layout PDFs from saved persona JSONs without booting the Next.js app. Every layout change has to land in both files in lockstep, which is a real maintenance tax and a drift risk. Possible consolidations: extract shared layout helpers into a plain-JS module both can import; or have `scripts/export-pdf.mjs` call into the compiled output of `lib/generatePdf.ts` via `tsx` / `esbuild`. Defer until a future change forces the issue or the duplication causes a real divergence bug.

