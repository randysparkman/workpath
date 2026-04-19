# WorkPath — Project Context for Claude

## What This Is
WorkPath is Randy Sparkman's AI readiness assessment product. It has two components:
1. **Assessment App** — a Next.js App Router application, live on Vercel (migrated from Lovable, April 2026)
2. **Brochure** — a static marketing page served from `public/brochure.html`

---

## Repo Structure
```
workpath/
  app/                            # Next.js App Router
    layout.tsx, globals.css
    page.tsx                      # Assessment at /
    [slug]/page.tsx               # Assessment at /:slug
    api/
      score-tier1/route.ts        # Sonnet — rubric scoring
      score-tier2/route.ts        # Sonnet — rubric scoring + performance summary (merged)
      score-tier3/route.ts        # Sonnet — rubric scoring
      generate-tier3/route.ts     # Sonnet — adaptive question generation (cached prompt)
      generate-profile/route.ts   # Sonnet — narrative profile (cached prompt)
  components/
    AssessmentPage.tsx            # Main page component
    assessment/                   # 17 screen + shared components
  data/                           # Job-role profiles, questions, templates
  hooks/                          # useAssessmentFlow, useAssessmentScoring
  lib/
    anthropic.ts                  # Shared Anthropic SDK client
    supabase.ts                   # Lazy Supabase client (getSupabase())
    generatePdf.ts                # Client-side jsPDF generation
    parse-ai-json.ts              # JSON extraction from Claude responses
    utils.ts                      # cn() utility
    prompts/
      generate-profile-prompt.ts  # ~440-line profile generation system prompt
  public/
    brochure.html                 # Static brochure (served via rewrite at /brochure)
  scripts/
    regenerate-profile.mjs        # Authoring tool: regenerates T1/T2 questions for a profile
    tier1-question-generation-prompt.md  # v0.2.1 — source of truth for T1 question design
    tier2-question-generation-prompt.md  # v0.2.1 — source of truth for T2 question design
  BACKLOG.md                      # Project backlog and pre-launch items
```

---

## GitHub & Deployment
- **GitHub repo:** `https://github.com/randysparkman/workpath`
- **Vercel project:** `workpath` (Framework Preset: Next.js, auto-deploys on push to `main`, **Pro plan** — 300s function ceiling)
- **Live URLs:**
  - `https://wkpath.com/` — assessment app
  - `https://wkpath.com/brochure` — static brochure
  - `https://wkpath.com/medical-billing` — Medical Billing context
  - `https://wkpath.com/cie499` — CIE499 context
- **Fallback URL:** `https://workpath-one.vercel.app/` (still live, useful for debugging)
- **Git remote:** `git@github.com:randysparkman/workpath.git` (SSH)

### Deploy workflow
```bash
cd /Users/randysparkman/Desktop/workpath
git add <files>
git commit -m "message"
git push   # Vercel auto-deploys in ~30 seconds
```

### Environment Variables (Vercel)
- `ANTHROPIC_API_KEY` — for API routes
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key (insert-only RLS)

---

## Assessment App Architecture

### Model Strategy
| Route | Model | Why |
|-------|-------|-----|
| score-tier1 | `claude-sonnet-4-6` | Structured rubric scoring — fast, cheap |
| score-tier2 | `claude-sonnet-4-6` | Rubric scoring + performance summary in one call (merged from old generate-tier3 step 1) |
| score-tier3 | `claude-sonnet-4-6` | Structured rubric scoring — fast, cheap |
| generate-tier3 | `claude-sonnet-4-6` | Adaptive question design. Static template cached (ephemeral). Switched from Opus when generate exceeded Hobby 60s; now on Vercel Pro with 300s ceiling |
| generate-profile | `claude-sonnet-4-6` | Narrative synthesis — switched from Opus to simplify language and reduce latency |

**Cost:** ~$0.20–0.25 per full assessment (before cache discounts).

### Assessment Flow (14 screens)
welcome → name_input → intake → playback → transition1 → tier1 → analyzing_t1 → transition2 → tier2 → analyzing_t2t3 → transition3 → tier3 → complete → analyzing_profile → profile

### Database
- Fresh Supabase project (Postgres only, no edge functions)
- One table: `assessment_completions` (insert-only, anon RLS policy)
- Client uses lazy `getSupabase()` — returns null if env vars not set

---

## The Brochure (`public/brochure.html`)

### Brand & Design System
- **Product name:** The WorkPath Assessment
- **Eyebrow:** Intelligence Applied
- **Fonts:** Playfair Display (headings, serif) + Inter (body, sans-serif)
- **Colors:**
  - Navy: `#0C2D48`
  - Navy mid: `#1A4A6B`
  - Gold: `#C9983A`
  - Light: `#F7F8FA`
  - Muted: `#6B7F8E`
- **Contact:** CTA is a copy-to-clipboard button for `info@wkpath.com` (mailto is unreliable across devices)
- **Domain:** `wkpath.com`

### Language Conventions
- "The WorkPath Assessment" — always use full name with "The"
- Dimensions are "Orientation," "Integration," and "Judgment"
- Levels are "Emerging," "Developing," "Demonstrating"
- Avoid "listens for how they think" — use "reveals how they think"
- "differently from" not "differently than"
- "three dimensions" not "three constructs"

---

## Reference Assets
All canonical build assets live in the repo:
- Job-role profiles: `data/job-role-profile-*.md`
- Profile-generation prompt: `lib/prompts/generate-profile-prompt.ts`
- Tier 3 templates: `data/tier3-question-template.json`, `data/tier3-summary-template.json`

Historical design-era artifacts (Lovable changelogs, prototype .jsx, versioned prompt drafts, design docs, org-fluency source files) live outside the repo at `~/Desktop/AI-assessment-tool-claude-chat/`. These are reference-only and not consumed by the current build.

---

## What's Next
- [ ] See `BACKLOG.md` for performance optimization and student launch prep
