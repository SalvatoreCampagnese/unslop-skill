# UI tells

IDs match `scripts/detect-ui.mjs`. **Sev**: P0 a layperson notices · P1 a
designer or dev notices · P2 polish. **Det**: `code` the scanner finds it ·
`render` needs pixels · `judgment` needs a call.

Accessibility findings (A1, K3, M2) are high priority whatever their tier.

`node scripts/detect-ui.mjs --rules` lists what is automated. IDs in this file
that the scanner does not list are render-level, judgment calls, or not yet
automated — audit those by hand and tag the finding **inferred**.

## Colour

| ID | Tell | Sev | Det | Fix |
|---|---|---|---|---|
| C1 | Purple/indigo→violet gradient | P0 | code | Tonal gradient inside one brand hue, or a flat ground |
| C2 | Violet primary action (incl. `oklch` themes) | P1 | code | Tie the primary to the brand; add real states |
| C3 | Gradient clipped into headline text | P0 | code | Solid ink; let scale carry emphasis |
| C4 | Coloured glow shadow | P2 | code | Shadow means elevation; keep it neutral |
| C5 | Aurora / blurred gradient blobs | P1 | code | Earn the space with content |
| C6 | One hue pretending to be two (<20° apart) | P2 | code | Give the second colour a different job |
| A1 | Muted text below 4.5:1 | P1 | code | Raise it until it clears AA |
| C7 | Dark mode nobody asked for | P1 | judgment | Pick light or dark on purpose |
| C8 | Timid palette, evenly distributed | P1 | render | 60/30/10 discipline |
| C9 | Low-contrast dark mode (grey on grey) | P1 | render | Real dark palette at AA |

## Typography

| ID | Tell | Sev | Det | Fix |
|---|---|---|---|---|
| T1 | Inter / Roboto / Arial / `system-ui` as the only face | P0 | code | Choose faces for the brief; separate display and body |
| T2 | The "tasteful free font" set (Space Grotesk, Geist, Syne, Sora, Instrument Serif, Fraunces, Cal Sans, Plus Jakarta) | P1 | code | Keep only if earned. Never the face your last three projects used |
| T3 | Tracked all-caps eyebrow above every heading | P1 | code | Keep only if it carries information |
| T4 | One accented word in the headline (colour, italic, weight, highlight) | P1 | code | Emphasis through the type system |
| T5 | One family, one weight, flat scale | P2 | render | A real type scale |
| T6 | Face declared but never shipped | P1 | code* | Ship the files |
| T7 | Title Case everywhere | P2 | judgment | Sentence case |

## Shape and surface

| ID | Tell | Sev | Det | Fix |
|---|---|---|---|---|
| S1 | `rounded-2xl` + shadow on every surface | P1 | code | Vary radius and elevation by role |
| S2 | shadcn `--radius` left at 0.5/0.625rem | P1 | code | A radius that says something |
| S3 | Coloured 3–4px accent stripe on cards | P1 | code | Drop it; rank with weight, scale, position |
| S4 | `backdrop-blur` by reflex | P1 | code | Blur only where content really passes under |
| S5 | Off-scale spacing (24/28/32 with no system) | P2 | code | 4-8-16-24-32-48-64 |
| S6 | Uniform padding and gap, no rhythm | P2 | render | Soft signal. Do not lead with it |
| S7 | Cards inside cards | P2 | render | One level of containment |

## Layout

| ID | Tell | Sev | Det | Fix |
|---|---|---|---|---|
| L1 | Pill badge → centered H1 → centered sub → two CTAs | P0 | code | Left-align, or let type carry the hero |
| L2 | Three identical icon-topped feature cards | P0 | code | Rank them: alternating rows, one showcase, or prose |
| L3 | Round-number stat strip | P1 | code | Real numbers or cut the strip |
| L4 | Decorative `01 / 02 / 03` | P1 | code | Number only real sequences |
| L5 | Cookie-cutter section order (5+ of 8 stock sections) | P1 | code | Order by what the reader needs to decide |
| L6 | One container width everywhere | P2 | code | Vary measure by section role |
| L7 | Bento grid where tile size encodes nothing | P1 | judgment | Only when size means importance |
| L8 | Oversized hero pushing content below the fold | P1 | render | Let content start above the fold |
| L9 | Default 4-column footer + newsletter + socials | P1 | judgment | Build from what the site has |
| L10 | Design-system drift across pages | P0 | render | Lock a `DESIGN.md` contract |

## Components

| ID | Tell | Sev | Det | Fix |
|---|---|---|---|---|
| K1 | Untouched shadcn base (zinc/slate/neutral, stock tokens) | P0 | code | Theme base colour, radius, button, card |
| K2 | Icon in a tinted rounded square, one per feature | P1 | code | Make it a decision or drop the chips |
| K3 | No `:focus-visible` / no interaction states | P1 | code | hover, focus-visible, active, disabled |
| K4 | Stock effect-library components (Spotlight, BackgroundBeams, ShimmerButton, NumberTicker, Meteors, BorderBeam…) | P1 | code | One effect that belongs here, or none |
| K5 | Three pricing tiers with a "Most Popular" ring | P1 | judgment | Structure follows the real offer |
| K6 | Status chips with no real state behind them | P2 | render | Chips only for changing state |
| K7 | Fake window chrome as hero visual | P2 | code | A real screenshot |

## Icons and imagery

| ID | Tell | Sev | Det | Fix |
|---|---|---|---|---|
| I1 | ✨ Sparkles as the AI glyph | P1 | code | NN/g tested it: nobody reads "AI" from sparkles. Use words |
| I2 | The worn Lucide set (Zap, Rocket, Shield, BarChart3, ArrowRight, CheckCircle2…) | P1 | code | Icons for meaning, not availability |
| I3 | Emoji as interface icons | P1 | code | A real set, or nothing |
| I4 | Placeholder identities and media (dicebear, pravatar, picsum, grey `aspect-video`) | P1 | code | Real avatars and screenshots, or remove the slot |
| I5 | Thin-line outline set, one stroke weight, generic mapping | P1 | render | Choose weight and mapping deliberately |
| I6 | Stock "diverse team at a laptop" | P1 | render | Real product imagery |
| I7 | Glossy 3D blobs / iridescent abstract hero art | P1 | render | Show the product |
| I8 | Full-page grain overlay | P2 | code | Texture needs a reason |

## Motion

| ID | Tell | Sev | Det | Fix |
|---|---|---|---|---|
| M1 | Same fade-up on every section | P2 | code | One or two staggered moments |
| M2 | Animation with no `prefers-reduced-motion` | P1 | code | Gate it. This is a defect, not taste |
| M3 | Bounce / elastic easing | P2 | code | Ease out without overshoot, 150–250ms |
| M4 | Count-up stat animation | P2 | code | Show the real number |
| M5 | Cursor-following hero glow | P2 | code | Cut it |
| M6 | Hover lift on every card; buttons that just fade | P2 | render | One shared motion language |

## Microcopy

| ID | Tell | Sev | Det | Fix |
|---|---|---|---|---|
| P1 | Vague aspirational headline ("Elevate your…", "Build the future of…", "The all-in-one platform for…") | P1 | code | What it does, for whom, what changes |
| P2 | Generic superlatives (seamless, powerful, robust, cutting-edge, best-in-class…) | P2 | code | A number, a verb, or a disputable claim |
| P3 | Arrow welded to every link | P1 | code | Name the action and its object |
| P4 | Tricolon slogan | P2 | code | One concrete claim |
| P5 | Generic CTA labels | P2 | code | Verb + object, consistent across the page |
| P6 | **Swap test**: paste the copy on a competitor's site. Nothing breaks → it says nothing | P0 | judgment | Rewrite from what is actually true here |

## Second-order defaults

The anti-slop advice became training data. "Tasteful" is now its own template.

| ID | Tell | Sev | Det |
|---|---|---|---|
| SD0 | A direction you already shipped (hue within 14° of a recorded run) | P1 | code |
| SD1 | Cream ground `#F4F1EA` + terracotta `#D97757` + serif | P1 | code |
| SD2 | Near-black ground + one acid-green or vermilion accent | P1 | code |
| SD3 | Emerald/teal as the purple-avoiding accent | P2 | code |
| SD4 | Template chrome bundle: mono micro-labels + `A · B · C` + `WORD — fragment` | P2 | code |
| SD5 | Broadsheet cosplay on a non-publication | P2 | render |
| SD6 | Orange accent + serif, the 2026 "I avoided purple" signature | P2 | render |

## Drift from a declared brand

These only exist once `unslop.palette.json` / `unslop.style.json` are present.
They are the inverse of the catalog: not "is this a default?" but "is this off
the decision you already made?". See `configuration.md`.

| ID | Tell | Sev | Det |
|---|---|---|---|
| X1 | Colour off the declared palette | P2 | code |
| X2 | Radius off the declared scale | P2 | code |

A declared palette also silences `C1`, `C2`, `SD1`, `SD2` and `SD3` for its own
colours, and declared faces silence `T1` and `T2`. That is the point: a brand
that is genuinely violet should never be told its violet is slop.

## Fingerprints

| ID | Tell | Sev | Det |
|---|---|---|---|
| F1 | Builder signature shipped (`lovable-tagger`, `v0.dev`, `bolt.new`, `<meta generator>`) | P1 | code |

Repo-level signals — `CLAUDE.md`, `AGENTS.md`, `claude/*` branches, co-author
trailers — prove *tooling*, not bad design. They belong in an audit note, never
in the rewrite, and never as an accusation.

## Do not flag

- Rounded corners, cards, Inter, gradients, glassmorphism, bento grids, aurora
  backgrounds **in isolation**. Designers shipped all of these before LLMs.
- Restraint executed well. That is a decision, not timidity.
- Spacing uniformity on its own.
- Corporate Memphis illustration (pre-AI lineage).
- Anything the brief asked for.
- A violet brand that really is violet.
- Fewer than ~3 co-occurring P0/P1 tells. Below that, report nothing.
