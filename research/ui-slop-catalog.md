# UI slop catalog (research draft for `/unslop ui`)

## Framing rules (apply before any single tell)

1. **A tell is evidence of a default nobody chose — not proof a model made it.** Fix, never accuse.
2. **Judge clusters, not single hits.** One gradient is not slop. Purple gradient + Inter + 3 icon cards + pill badge + fade-up-on-scroll = template.
3. **The brief wins.** If the brand IS purple, or the client asked for a centered hero, deliver it well.
4. **"It's just Tailwind/shadcn defaults" is true and beside the point.** The point is that nobody decided.
5. **Severity:** P0 = a layperson notices. P1 = a designer/dev notices. P2 = polish.
6. **Detectability:** `code` = greppable in source. `render` = needs pixels/screenshot. `judgment` = needs a human/model call.

---

## A. Color & gradients

| ID | Tell | Sev | Det |
|---|---|---|---|
| C1 | Purple/indigo→blue gradient (Tailwind `from-indigo-500 to-purple-600`, `#6366f1`, `#8b5cf6`), usually diagonal, usually the hero | P0 | code |
| C2 | Indigo/violet/purple primary button (`bg-indigo-600`, `bg-violet-500`) with no brand reason | P1 | code |
| C3 | Gradient clipped into headline text (`bg-clip-text` + `text-transparent`) | P0 | code |
| C4 | "VibeCode purple": dark bg + grey body text + lavender accent | P1 | render |
| C5 | Colored glow `box-shadow` (saturated, blur ≥8px) / `shadow-indigo-500/50` | P2 | code |
| C6 | Aurora / gradient blobs / radial mesh behind the hero | P1 | code |
| C7 | Dark mode nobody asked for, as the reflex default | P1 | judgment |
| C8 | Low-contrast dark mode: mid-grey text on slightly-less-mid-grey bg (fails WCAG AA 4.5:1) | P1 | code+render |
| C9 | "Two colors" that are one hue: primary and accent within ~20° of hue | P2 | code |
| C10 | Timid palette, evenly distributed — no 60/30/10 discipline | P1 | render |
| C11 | Emerald/teal as the *purple-avoiding* accent (`#10b981`) — the new default | P2 | code |
| C12 | Gradient on the "Get Started" CTA specifically | P1 | code |

## B. Typography

| ID | Tell | Sev | Det |
|---|---|---|---|
| T1 | Inter (or `system-ui`/Roboto/Arial) as the only typeface, everywhere | P0 | code |
| T2 | The "tasteful free font" set: Space Grotesk, Geist, Syne, Sora, Instrument Serif, Fraunces, Cal Sans, Plus Jakarta | P1 | code |
| T3 | Geist left untouched on a Next.js project (`geist/font`) | P1 | code |
| T4 | One serif-italic accent word inside an otherwise sans headline | P1 | code |
| T5 | Tracked ALL-CAPS eyebrow label above every section heading | P1 | code |
| T6 | Monospace for small labels/metadata with no real data behind it | P2 | code |
| T7 | One family, one weight, flat scale — no hierarchy (Inter 400/500/600 and nothing else) | P2 | render |
| T8 | Typeface declared in CSS but never actually shipped (no `@font-face`, no font link) | P1 | code |
| T9 | Title Case Everywhere Instead Of Sentence case | P2 | judgment |

## C. Spacing, radius, shadow, borders

| ID | Tell | Sev | Det |
|---|---|---|---|
| S1 | `rounded-2xl shadow-lg` (radius 12–28px + box-shadow) on every single surface | P1 | code |
| S2 | Identical corner radius on every element regardless of role | P1 | code |
| S3 | shadcn default `--radius: 0.5rem` / `0.625rem` untouched | P1 | code |
| S4 | Colored left/top accent stripe on cards (3–4px, purple/blue/gradient) — "almost as reliable as em dashes" | P1 | code |
| S5 | Off-scale spacing: 24 / 28 / 32px with no system. Fix: 4-8-16-24-32-48-64 | P2 | code |
| S6 | Uniform padding + gap everywhere, no rhythm (soft signal, don't lead with it) | P2 | render |
| S7 | Heavy shadows on floating panels | P2 | code |
| S8 | Pills everywhere / "piles of pills" | P2 | code |

## D. Components

| ID | Tell | Sev | Det |
|---|---|---|---|
| K1 | Untouched shadcn/ui base (zinc/slate/neutral, stock `--primary`, stock `components.json` baseColor) — the single most reliable technical fingerprint | P0 | code |
| K2 | Glassmorphism by reflex: `backdrop-blur` + semi-transparent card over a gradient | P1 | code |
| K3 | Pill/badge above the H1: "AI-Powered", "New ✨", "Backed by Y Combinator" | P1 | code |
| K4 | Icon in a tinted rounded-square chip, one per feature | P1 | code |
| K5 | No `:focus-visible` / no `:hover`/`:active`/`:disabled` states defined | P1 | code |
| K6 | Default dark SaaS card: `bg-zinc-900` + `border-white/10` | P1 | code |
| K7 | Stock effect-library components: Spotlight, BackgroundBeams, AnimatedBeam, ShimmerButton, NumberTicker, BorderBeam, Meteors, Marquee, SparklesCore, AuroraBackground, RetroGrid, TypewriterEffect, BentoGrid, MagicCard, ShineBorder, RainbowButton, MovingBorder | P1 | code |
| K8 | Cards inside cards (nested containment) | P2 | render |
| K9 | Status-chip soup: badges on every row with no real state behind them | P2 | render |
| K10 | Fake window chrome / traffic-light dots (`#ff5f57 #febc2e #28c840`) as hero visual | P2 | code |
| K11 | Three pricing tiers with a "Most Popular" ring / `scale-105` | P1 | code |
| K12 | Default 4-column footer with newsletter input + social row | P1 | code |

## E. Layout & section order

| ID | Tell | Sev | Det |
|---|---|---|---|
| L1 | Centered hero: pill badge → centered H1 → centered subhead → two centered CTAs | P0 | code |
| L2 | Three identical feature cards: icon on top, short title, two lines of body, equal weight | P0 | code |
| L3 | Logo cloud "Trusted by" right under the hero | P1 | code |
| L4 | Round-number stat strip: "12,000+ · 99.9% · 4.9★" | P1 | code |
| L5 | Numbered "How it works" 1-2-3 that isn't a real sequence | P2 | judgment |
| L6 | Decorative `01 / 02 / 03` markers on non-sequences | P1 | code |
| L7 | Bento grid as the default composition, tile sizes encoding nothing | P1 | judgment |
| L8 | Cookie-cutter section order — flag at 6+ of 9: hero, logos, features, how-it-works, testimonials, stats, pricing, FAQ, final CTA | P1 | code |
| L9 | Default page shell: `container mx-auto` / `max-w-7xl mx-auto` on every section, same width throughout | P1 | code |
| L10 | Oversized hero that pushes all content below the fold | P1 | render |
| L11 | Grids of stat cards where no stats are needed | P2 | render |
| L12 | Broadsheet cosplay: hairline rules, zero radius, newspaper columns on a non-publication | P2 | render |
| L13 | Design-system drift across pages (font/palette/radius/nav change page to page) | P0 | render |

## F. Icons & imagery

| ID | Tell | Sev | Det |
|---|---|---|---|
| I1 | ✨ Sparkles = AI. NN/g tested it: *zero* participants said "AI" when shown sparkles alone | P1 | code |
| I2 | The worn Lucide set: `Sparkles, Zap, Rocket, ArrowRight, Shield, BarChart3, CheckCircle2, Star, Check` | P1 | code |
| I3 | Thin-line outline icons, one stroke weight, generic mapping (gear=settings, shield=trust) | P1 | code |
| I4 | Emoji as UI: in nav, sidebars, headings (🚀🔒✨), or before every list item | P1 | code |
| I5 | Placeholder identities/media: dicebear, pravatar, boring-avatars, ui-avatars, robohash, randomuser.me, placehold.co, picsum.photos, `aspect-video bg-muted` | P1 | code |
| I6 | Stock "diverse team at a laptop" photography | P1 | render |
| I7 | AI-generated glossy 3D blobs / iridescent abstract shapes as hero art | P1 | render |
| I8 | Corporate Memphis blob-people (pre-AI lineage — context, not a fresh tell) | P2 | render |
| I9 | Grain/noise texture overlay over the whole page | P2 | code |
| I10 | Small colored status dots in front of labels with no status behind them | P2 | code |

## G. Motion

| ID | Tell | Sev | Det |
|---|---|---|---|
| M1 | The same fade-up-on-scroll on every section (`whileInView`, `data-aos="fade-up"`, `fadeInUp`) | P2 | code |
| M2 | Bounce/elastic easing, overshooting cubic-bezier, `animate-bounce`, `easeOutBack` | P2 | code |
| M3 | Count-up stat animation (`NumberTicker`, `CountUp`) | P2 | code |
| M4 | No `prefers-reduced-motion` handling anywhere despite animation | P1 | code |
| M5 | Cursor-following glow on the hero | P2 | code |
| M6 | Hover lift on every card; buttons that just drop to `opacity: .8` | P2 | code |
| M7 | Copied "Linear glow" behind a product shot | P2 | render |
| M8 | Scattered micro-interactions with no shared easing/duration scale | P2 | render |

## H. UI microcopy

| ID | Tell | Sev | Det |
|---|---|---|---|
| P1 | Vague aspirational headline: "Build the future of…", "Elevate your workflow", "Unleash the power of", "Scale without limits", "Supercharge your", "Transform the way you…", "The all-in-one platform for" | P1 | code |
| P2 | Generic superlatives: seamless, powerful, robust, cutting-edge, best-in-class, world-class, game-changing, next-level, state-of-the-art, revolutionary, blazing fast, effortless | P2 | code |
| P3 | Tricolon slogan: "Faster. Smarter. Simpler." | P2 | code |
| P4 | Arrow glyph welded to every CTA/link: `Learn more →` | P1 | code |
| P5 | Generic CTA labels: "Get started", "Learn more", "Submit", "Click here" | P2 | code |
| P6 | `A · B · C` middle-dot meta strings; `WORD — fragment` labels | P2 | code |
| P7 | Em dashes in UI copy | P2 | code |
| P8 | **Swap test:** paste the copy on a competitor's site. If nothing breaks, it says nothing | P0 | judgment |

## I. Stack & generator fingerprints (evidence, not aesthetics)

- Default stack signature: Next.js + Tailwind + shadcn/ui + Lucide + Inter/Geist (the combination recommended by popular LLM frontend guides).
- Builder signatures left in: `lovable-tagger`, `lovable.dev`, `gpt-engineer`, `v0.dev`/`v0.app`, `bolt.new`, `<meta name="generator">`.
- Repo-level: `CLAUDE.md` / `AGENTS.md` at root, `claude/*` or `codex/*` branches, `Co-Authored-By: Claude`, `Co-authored-by: Codex <…@openai.com>`, "Generated with Claude Code / Codex" footers.
- Code smells: emoji in commits/docs/code, comments added to unchanged code, broad `try/catch` nets that swallow failures, unrequested abstractions.
- ⚠️ These prove *tooling*, not bad design. Useful for an audit report, not for the rewrite.

## J. Accessibility tells (objective — the only hard-failing rules)

- Body/muted text below 4.5:1 contrast (`--muted-foreground` is the usual culprit).
- Missing `:focus-visible`.
- No `prefers-reduced-motion`.
- Icon-only buttons with no accessible label.

## K. Second-order defaults — the *new* slop (2026)

The anti-slop advice got absorbed into the models, so "tasteful" is now its own template:

| ID | Tell | Notes |
|---|---|---|
| SD1 | Cream ground `#F4F1EA` + terracotta/clay accent `#D97757` + high-contrast serif — "the Claude look" | Terracotta is close to Anthropic's brand color |
| SD2 | Near-black ground `#0B0B0B–#111` + one acid-green or vermilion accent | |
| SD3 | Slightly-tinted black instead of black | |
| SD4 | Template chrome bundle: tracked caps eyebrows + mono micro-labels + `·` separators + `→` on every link | Flag when 3+ co-occur |
| SD5 | One accented word in the headline (any mechanism: color, italic, weight, highlight) | |
| SD6 | Orange accent + serif = the 2026 "I avoided purple" signature | |
| SD7 | Editorial/newspaper layout on a product page | |

**Implication for the skill:** `/unslop ui` must not simply map purple→terracotta. That is swapping one default for another. The rewrite has to derive color/type/layout from the subject.

## L. What NOT to flag (calibration — prevents the skill from being annoying)

- Rounded corners, cards, Inter, gradients, glassmorphism, bento grids, aurora backgrounds **in isolation**. Humans shipped all of these pre-LLM.
- Restraint executed well — that's a decision, not timidity.
- Spacing uniformity alone (soft signal).
- Corporate Memphis (pre-AI).
- Anything the brief explicitly asked for.
- A purple brand that is actually purple.
- Low tell-density overall. Below ~3 co-occurring P0/P1 tells, report nothing.

---

## Prior art

- **`github.com/funboy322/avoid-ai-design`** (MIT) — 67-tell catalog plus a
  zero-dependency `detect.mjs` scanner (50 code rules), ignore comments, hook
  mode. The closest existing project to this one; see the README for how unslop
  differs.
- **`github.com/conorbronsdon/avoid-ai-writing`** — its prose sibling (not
  verified at the time of writing).
- **Adrian Krebs**, `adriankrebs.ch/blog/design-slop/` — a 16-pattern rubric
  scored with Playwright and computed styles. A good model for detection that
  does not need an LLM judge.
