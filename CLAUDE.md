# WorkPath — Project Context for Claude

## What This Is
WorkPath is Randy Sparkman's AI readiness assessment product. It has two components:
1. **Brochure** — a static marketing page, live on Vercel
2. **Harness** — a Node.js pipeline that runs respondents through the assessment and generates a scored PDF profile

A third component — the **assessment app** (currently on Lovable) — will eventually be migrated into this repo under `app/`.

---

## Repo Structure
```
workpath/
  brochure/
    index.html          ← live brochure, single source of truth
  harness/
    harness.js          ← main scoring pipeline
    regen-profile.js    ← regenerate profile from existing scored JSON
    generate_pdf.py     ← convert scored JSON to PDF
    create_pdf.py
    package.json
    CLAUDE.md           ← detailed harness technical reference
  responses/            ← respondent Q&A JSON files (input to harness)
  profiles/             ← scored JSON outputs and generated PDFs
  app/                  ← future home of migrated assessment app
  vercel.json
  .gitignore
```

---

## GitHub & Deployment
- **GitHub repo:** `https://github.com/randysparkman/workpath`
- **Vercel project:** `workpath` (auto-deploys on push to `main`)
- **Live brochure URL:** `https://workpath-one.vercel.app/brochure`
- **Future custom domain:** TBD — not yet configured (not using "airp" subdomain)
- **Git remote:** `git@github.com:randysparkman/workpath.git` (SSH)

### Deploy workflow
```bash
cd /Users/randysparkman/Desktop/workpath
git add <files>
git commit -m "message"
git push   # Vercel auto-deploys in ~30 seconds
```

---

## The Brochure (`brochure/index.html`)

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
- **Contact button:** always links to `https://rsparkman.net`

### Page Sections (in order)
1. **Hero** — eyebrow, H1, subtitle, 3-stat bar (15 Scenarios / 3 Dimensions / <30 Minutes)
2. **Opportunity** — three cards: For the Individual, For the Organization, For the Workforce Developer
3. **What It Is** — two-column: description left, pull quote right
4. **How It Works** — three tiers: Baseline (01), Contextualized (02), Adaptive (03)
5. **What We Measure** — three dimension cards on navy: Orientation, Integration, Judgment
6. **The Output** — four deliverable items with icons
7. **Get Started** — CTA with contact button
8. **Footer** — "The WorkPath Assessment · rsparkman.net"

### Language Conventions
- "The WorkPath Assessment" — always use full name with "The"
- Dimensions are "Orientation," "Integration," and "Judgment"
- Levels are "Emerging," "Developing," "Demonstrating"
- Avoid "listens for how they think" — use "reveals how they think"
- "differently from" not "differently than"
- "three dimensions" not "three constructs"

---

## The Harness (`harness/`)

See `harness/CLAUDE.md` for full technical detail. Summary:

### Pipeline
T1 scoring (5 baseline Q&A) → T2 scoring (5 contextualized Q&A) → T3 rubric generation → T3 scoring (5 adaptive Q&A) → profile generation → PDF

### Key Commands
```bash
cd /Users/randysparkman/Desktop/workpath

# Full pipeline run (replay mode)
node harness/harness.js \
  --profile <path-to-job-role-profile.md> \
  --responses responses/<respondent>.json \
  --replay

# Regenerate profile only from existing scored JSON (~$0.14 vs ~$0.49)
node harness/regen-profile.js \
  profiles/<existing>.json \
  <path-to-profile-generation-prompt.md> \
  <path-to-job-role-profile.md> \
  responses/<respondent>.json

# Generate PDF from scored JSON
python3 harness/generate_pdf.py profiles/<file>.json
```

### Models
- Default: `claude-sonnet-4-20250514`
- High-fidelity: `claude-opus-4-6` (pass `--model claude-opus-4-6`)

### API Key
Stored in `~/.zshrc` as `ANTHROPIC_API_KEY`. Run `source ~/.zshrc` if not in environment.

### Respondents on File
| File | Person | Role |
|------|--------|------|
| `responses/james-wells-general.json` | James Wells | General |
| `responses/jane-maples-medical.json` | Jane Maples | Medical Billing Specialist |
| `responses/robert-howell-cie499.json` | Robert Howell | CIE499 profile |

### Reference Assets
Job role profiles and profile generation prompts live in a separate folder outside this repo:
`/Users/randysparkman/Desktop/AI-assessment-tool/`
- `job-role-profile-medical-billing.md`
- `profile-generation-prompt-v6.md`

---

## What's Next
- [ ] Set up custom domain (name TBD) in GoDaddy → Vercel
- [ ] Migrate assessment app from Lovable into `app/`
- [ ] Move reference assets (job role profiles, prompts) into `workpath/` repo
