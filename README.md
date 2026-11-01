# unslop

Remove AI slop from UI and from prose.

AI-generated work converges on the average of its training data. The result is
rarely ugly — it is **unchosen**. A purple gradient nobody picked. A sentence
shape nobody meant. `unslop` finds the unchosen defaults and replaces them with
decisions.

```
/unslop ui     # frontend: layout, colour, type, components, motion, microcopy
/unslop text   # prose: documents, articles, READMEs, landing-page copy
```

It is a skill for coding agents (Claude Code and any agent that reads
`SKILL.md`), plus two dependency-free scanners you can run on their own or in CI.

![One brief, two directions: the same travel page generated with nothing declared (100/100, ai slop) beside the same page rebuilt against a declared palette (0/100, clean)](examples/travel/before-after.png)

## The one rule

> **A tell is evidence of a default nobody chose. It is not proof that a model
> wrote it, and it is not automatically wrong.**

So unslop fixes, it never accuses. There is no "87% AI" score anywhere in this
repo, and that is deliberate: human detection of AI prose is no better than
chance, and automated detectors have real error rates. What gets reported is
**located, named, checkable patterns**.

## Install

As a skill:

```bash
git clone https://github.com/SalvatoreCampagnese/unslop-skill ~/.claude/skills/unslop
```

Then ask your agent to "unslop this page" or "unslop this doc".

Standalone scanners (zero dependencies):

```bash
node scripts/detect-ui.mjs    src/             # frontend source
node scripts/detect-text.mjs  docs/ README.md  # prose
node scripts/audit-render.mjs dist/index.html  # what actually got drawn
```

The first two read source (Node 18+). The third opens the page in headless
Chrome at 1280, 768 and 420px and measures the result (Node 22+), because
**removing slop is not the same as being well made**: a page can pass the whole
catalog and still ship with its text stacked on itself at phone width. It
reports text overlapping text, text clipped by its own box, content escaping
the viewport, sideways page scroll, text under a legible size, contrast against
the background actually painted, tap targets, and card rows whose trailing
labels do not line up.

Flags: `--json` · `--min=P1` (quieter) · `--max-score=N` (CI gate) ·
`--strict` (fail on any P0) · `--lang=en|it` · `--rules` (list every rule) ·
`--record=<name>` (remember this pass, see below) · `--init-config` ·
`--no-config`.

Exit code `2` means over threshold, so it drops into CI as-is.

## Configure it for your brand

Without configuration the scanner asks *"is this colour violet?"* — a question
with no good answer, because some brands are violet. Two optional files change
the question to *"is this colour a decision somebody made?"*:

```bash
node scripts/detect-ui.mjs src/ --init-config   # scaffolds both, commented
```

```jsonc
// unslop.palette.json — the colours this brand owns, each with its role
{
  "name": "Kestrel",
  "colors": {
    "ground": "#000000", "surface": "#333333",
    "ink": "#ffffff", "muted": "#a1a1a1",
    "signal": "#ff6a00", "lift": "#ff9f1c"   // this brand really is orange
  },
  "tolerance": { "hue": 12, "sat": 18, "light": 14 }
}
```

```jsonc
// unslop.style.json — the shape, motion and copy decisions already taken
{
  "radius":    { "policy": "scale", "scale": [0, 3, 10] },
  "shadow":    { "policy": "none" },
  "gradients": { "allow": false },
  "fonts":     { "display": ["Söhne"], "mono": ["Berkeley Mono"] },
  "rules":     { "T2": "off", "P2": "P1" },
  "thresholds": { "maxScore": 10 },
  "text":      { "allowWords": ["robust"], "banWords": ["synergy"] }
}
```

Then the catalog answers to you:

- a declared colour stops being judged by hue: declare violet and `C1`/`C2` go
  quiet on it — **it is not an anti-purple tool**
- colours that are *not* in the palette start being reported as drift (`X1`)
- radii off the declared scale are reported (`X2`)
- declared faces are exempt from `T1`/`T2`; `shadow`, `gradients`, `glass`,
  `motion`, `icons` and `copy` switch their rules off or make them stricter
- `rules` disables or re-ranks any rule by id; `thresholds` sets the CI gate
- on the prose side, `allowWords` are words your product owns and `banWords`
  are a finding on first occurrence (`V4`)

Before a brand is settled the catalog protects you from defaults. After it is
settled the palette file protects you from drift. `--no-config` runs the default
catalog again, which is how you check that a config has not been used to silence
real problems.

Full reference: [`references/configuration.md`](references/configuration.md) ·
[`references/render-audit.md`](references/render-audit.md)

## What it looks for

Roughly 90 catalogued tells, ~50 of them checkable in source. Severity is who
notices: **P0** a layperson · **P1** a designer or developer · **P2** polish.

**UI** — purple/indigo gradients (including `oklch`), gradient headline text,
Inter as the only face, untouched shadcn tokens, `rounded-2xl shadow-lg` on
everything, coloured card stripes, the pill-badge-over-centered-hero, three
identical icon cards, round-number stat strips, worn Lucide icons, ✨ as the AI
glyph, emoji as UI, placeholder avatars, uniform fade-up-on-scroll, missing
focus states, muted text under 4.5:1, "Elevate your workflow".

**Text** — negative parallelism ("it's not just X, it's Y"), participle tails of
significance, copulative avoidance ("serves as", "represents a"), significance
inflation, vague attribution, the challenges-and-future formula, hedging
disclaimers, even sentence rhythm, inline-header lists, emoji headings, closing
"Conclusion" sections, chatbot leftovers, unfilled placeholders.

Full catalogs: [`references/ui-tells.md`](references/ui-tells.md) ·
[`references/text-tells.md`](references/text-tells.md)

## What makes this one different

Four design decisions, each one a response to how existing de-slopping tools
fail:

**1. Density, not presence.** One gradient is not slop. One em dash is not slop.
Findings are scored with a cluster multiplier, so a single tell never fails a
build but the template bundle does. The threshold is yours (`--max-score`).
Tools that fire on any single hit get turned off within a week.

**2. It reads `oklch`.** Tailwind v4 and current shadcn themes ship colours as
`oklch(0.55 0.25 282)`. Scanners that pattern-match hex and `hsl()` are blind to
modern purple. This one converts `oklch` through oklab to sRGB and compares in
HSL, and it resolves `var()` chains through custom properties, so
`background: var(--primary)` is caught where `--primary` is defined.

**3. It catches the second-order default.** The anti-slop advice became training
data, so "tasteful" is now its own template: cream `#F4F1EA` + terracotta
`#D97757`, near-black + acid green, emerald-because-not-purple. Those are
catalogued (SD1–SD6). And because your own last three passes are a style menu
too, `--record=<name>` writes the ground/signal fingerprint to
`.unslop/history.json`, and rule **SD0** fires when a new direction lands within
14° of hue of one you already shipped. The anti-default check is mechanical, not
a promise to self-review.

**4. The brief is a file, not an argument.** Other tools tell the agent "the
brief wins" and hope. Here the brief is `unslop.palette.json` and
`unslop.style.json`, the scanner reads them, and the pass *writes* them — so the
next page and the next agent are checked against the same contract
mechanically, instead of against a prose `DESIGN.md` nobody re-reads.

**5. It checks the page, not just the code.** Every other de-slopping tool
greps source and stops there. unslop also measures the rendered page at three
widths, so "this no longer looks AI-generated" and "this is not broken" are
both verified rather than assumed. The gate is not negotiable in the skill's
workflow: a de-slopped page that renders badly is worse than the generic one it
replaced.

**6. It restores, it does not only delete.** Prose with the slop stripped out
reads sanded down. The skill carries an explicit restore list — plain
copulatives, definitive claims, qualifiers, uneven rhythm, real numbers — because
deleting the machine habits is only half the job. Likewise in UI: the workflow
makes you *derive* a direction from the subject's material world before you
touch anything, and the fix for purple is not terracotta.

## The honest caveats

- **Every tell is a heuristic.** Designers shipped rounded cards and Inter long
  before LLMs, and writers used em dashes for two centuries. Only accessibility
  findings (contrast, focus, reduced motion) are hard failures.
- **The brief wins.** A violet brand really is violet — declare it in
  `unslop.palette.json` rather than fighting findings. For genuine one-offs,
  `unslop-ignore: <ID>` on the line, or `unslop-ignore-file`.
- **A config can be abused.** Anything here can be switched off, including the
  accessibility rules, which are defects rather than preferences. Run
  `--no-config` before believing a clean report.
- **The Italian prose rules are this project's own.** No published guide for
  Italian AI writing exists; that rule set is a first pass and needs corpus
  validation. PRs welcome.
- **Render-level tells are judgment calls.** The scanner covers what is in the
  source. Hierarchy, palette balance and the silhouette test need pixels and an
  opinion.

## Prior art

[`avoid-ai-design`](https://github.com/funboy322/avoid-ai-design) (MIT) and its
sibling `avoid-ai-writing` got there first and are worth reading. unslop differs
in the four points above, and in covering UI and prose in one skill.

Wikipedia's [Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing)
is the best field guide to machine prose that exists, and the source of most of
the text catalog. Its framing is adopted here wholesale: *descriptive, not
prescriptive; observations, not rules.*

## License

MIT. See [LICENSE](LICENSE).
