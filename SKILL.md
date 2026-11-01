---
name: unslop
description: >
  Remove AI slop from UI and from prose. Use when asked to de-slop, unslop or
  "make this not look AI-generated"; to audit a page, component or document for
  AI tells; to fix generated frontend that looks generic; or to clean writing
  that reads machine-written. Two modes: `unslop ui` for frontend (HTML/CSS,
  React, Vue, Svelte, Astro, Tailwind, shadcn, MUI) and `unslop text` for prose
  (Markdown, HTML, plain text; English and Italian). Ships deterministic
  scanners, so findings are located and checkable rather than vibes.
license: MIT
compatibility: Any agent that can read and edit files. Node 18+ optional, for the scanners.
metadata:
  version: 0.1.0
  tags: design ui frontend prose writing ai-slop tailwind shadcn
---

# unslop

Generated work converges on the average of its training data. The result is not
ugly, it is **unchosen**: a purple gradient nobody picked, a sentence shape
nobody meant. unslop finds the unchosen defaults and replaces them with
decisions.

## The one rule that governs everything

> **A tell is evidence of a default nobody chose. It is not proof that a model
> wrote it, and it is not automatically wrong.**

So: fix, never accuse. Never say or imply "this was AI-generated". Report what
is generic and what to do instead.

## Routing

| Invocation | Scope |
|---|---|
| `unslop ui` | frontend files: layout, colour, type, components, motion, microcopy |
| `unslop text` | prose: documents, articles, READMEs, emails, landing-page copy as text |
| `unslop` (bare) | detect what is in scope and say which mode you are running |

**Mode within each:** `rewrite` is the default — audit, decide, edit the files.
Switch to `detect` (audit only, no edits) when the user says "just audit",
"scan", "flag only", "what's AI about this", "don't change anything", or when
the code is not yours to change (a dependency, someone else's PR, a reference).

## Non-negotiables

1. **Never break working code.** Props, state, routing, data flow, event
   handlers and accessibility survive intact. Copy keeps its meaning.
2. **The brief wins, and the brief is a file.** A design system, brand
   guideline, stated font or colour outranks your taste — even when it asks for
   something on the tell list. Write it into `unslop.palette.json` and
   `unslop.style.json` rather than arguing with findings one at a time. A brand
   whose signal really is violet declares that violet and stops being flagged
   for it. Use `unslop-ignore` only for genuine one-offs.
3. **Never invent facts.** In text mode especially: you may cut a vague claim,
   you may not replace it with a specific one you made up. If a sentence needs a
   number you do not have, leave a marked gap and say so.
4. **Keep the author's voice.** The failure mode of a prose unslopper is
   replacing someone's voice with a different default. Cut the machine habits,
   keep the person.
5. **Density, not presence.** One gradient is not slop. One em dash is not slop.
   Act on clusters.
6. **A clean audit is a valid result.** Do not manufacture findings. If the work
   is already good, say so and stop.

---

## Configuration

Two optional files turn the catalog from a fixed opinion into a contract with
this brand. Both are plain JSON, both accept comments, and both are discovered
by walking up from the scanned path.

| File | Declares |
|---|---|
| `unslop.palette.json` | the colours this brand owns, each with its role |
| `unslop.style.json` | radius scale, shadow and gradient policy, faces, motion, copy rules, per-rule overrides, thresholds |

```bash
node <skill-dir>/scripts/detect-ui.mjs <dir> --init-config   # scaffold both, commented
```

What changes once they exist:

- **A declared colour is a decision.** The hue rules (`C1` violet gradient,
  `C2` violet primary, `SD1`–`SD3`) stop firing on colours in the palette.
- **The question inverts.** `X1` now reports colours that are *not* in the
  palette — drift away from the brand, which is the thing worth catching once
  the brand is settled.
- **`X2`** reports radii off the declared scale.
- **Declared faces** are exempt from `T1` and `T2`.
- `shadow.policy`, `gradients.allow`, `glass.allow`, `motion.*`, `icons.*` and
  `copy.*` switch the matching rules off, or make them stricter.
- `rules: { "T2": "off", "P2": "P1" }` disables or re-ranks any rule by id.
- `thresholds` sets the default `--max-score` and `--min`.
- `text: { lang, allowWords, banWords, maxScore }` does the same for prose: a
  word in `allowWords` is a word this product owns, and a word in `banWords`
  is a finding (`V4`) on its first occurrence.

`--no-config` ignores the files and runs the default catalog, which is how you
check whether a configuration has quietly been used to silence real problems.

**Writing the config is part of the pass.** At step 8 you do not write a prose
`DESIGN.md` and hope later pages read it — you write the decisions into these
two files, and every later run is checked against them mechanically.

## Workflow

### 1. Scope

Read the actual files. Never judge from the prompt alone. Establish: what the
artifact is, the stack, whether a design system or style guide already exists,
whether the work spans more than one page or document.

**Look for `unslop.palette.json` and `unslop.style.json` first.** If they exist,
they are the contract: read them before forming any opinion, and say in one line
what they fix. If they do not and the brand clearly has settled colours, plan to
write them at step 8.

Set the **profile**, and state it in one line — it decides how hard to push:

| Profile | Strictness |
|---|---|
| `landing` / `artifact` / `marketing` | full strength on everything |
| `app-component` | surgical. Fix tells inside the component, do not redesign the app |
| `inside-design-system` | surgical only. Report system-level tells separately as advice |
| `dashboard` | favour density, legibility and hierarchy over decoration |
| `docs` / `README` (text) | keep scannability. Lists and headings are not slop here |
| `personal-voice` (text) | the author's quirks are the point. Cut only machine habits |

### 2. Scan

```bash
node <skill-dir>/scripts/detect-ui.mjs   <paths...>   # frontend source
node <skill-dir>/scripts/detect-text.mjs <paths...>   # prose
node <skill-dir>/scripts/audit-render.mjs <page>      # what actually got drawn
```

The first two read source. **The third opens the page in headless Chrome at
1280, 768 and 420px and measures what was painted**: text overlapping text,
text clipped by its own box, content escaping the viewport, horizontal page
scroll, text under a legible size, contrast against the real painted
background, tap targets, and repeated card rows whose trailing labels do not
line up. A page can be free of every tell in the catalog and still ship with
its text stacked on itself at 420px. Removing slop is not the same as being
well made, and that gap is what this third scanner closes.

Useful flags: `--json`, `--min=P1` (quieter), `--max-score=N` (gate),
`--strict` (fail on any P0), `--lang=it`, `--rules` (list every rule),
`--config=<dir>` / `--palette=<file>` / `--style=<file>`, `--no-config`.

The first line of the report says whether a configuration was found and which
brand it names. If it says `config: none` and the project clearly has a brand,
that is itself worth reporting.

The scanners cover only what is checkable in source. Without Node, walk
`references/ui-tells.md` and `references/text-tells.md` by hand and mark every
finding as **inferred**.

Read the score as a density measure, not a verdict on authorship:

| Score | Means |
|---|---|
| 0–9 | clean |
| 10–24 | traces — worth a look, not a rewrite |
| 25–49 | slop-leaning — a real pass is justified |
| 50+ | ai slop — rebuild the direction |

### 3. Render (ui mode only)

Run the render audit first — it is measurement, not opinion:

```bash
node <skill-dir>/scripts/audit-render.mjs <page> --widths=1280,768,420
```

Then, if any screenshot tool is available, look at the page and judge what
neither source nor measurement can show:

- **Silhouette test.** Reduce the layout to blocks. Could this silhouette be any
  product's page? If yes, the structure is the problem, not the palette.
- **Squint at 25%.** If everything has the same visual weight, hierarchy is
  missing — the most common invisible failure.
- **Palette count.** More than ~3 hues competing with no job each.

Without a render, mark visual tells as inferred, lower confidence. Say so.

### 4. Audit

Merge scanner output, render observations, and a pass through every category in
the reference catalog — including the **SD (second-order defaults)** section,
which the scanner only partly covers.

For each finding record: **ID · location · one line on why it reads as generic ·
tag** (`code-certain`, `rendered`, or `inferred`).

### 5. Ground the direction — the step that actually matters

A fix list produces a different template. A direction produces a design.

If a configuration or design system exists, **it is the direction**: adopt it as
a contract and match it exactly. Do not re-derive colours a palette file already
fixes — derive only what is still open. Otherwise derive one from the subject,
concretely:

1. **Name the subject.** What is this thing, who uses it, when, and in what
   state of mind?
2. **Find its material world.** What does the subject's real world look like?
   A payroll tool lives among forms and ledgers. A climbing app lives among
   topo maps and chalk. A pasta shop lives among paper, flour and brass.
   This is where colour, texture and type come from.
3. **Write the plan down**, in five lines:
   - 4–6 named colours **with roles** (ground, ink, muted, signal, maybe one more)
   - the faces and what each one does
   - the layout idea, in one sentence
   - the one signature detail the page gets
   - what you are deliberately refusing, by tell ID
4. **Say where each choice came from.** A choice with no stated source in step 2
   is a choice you took off a list.

`references/deriving-a-direction.md` is vocabulary for naming moves. It is **not
a menu to pick from**. If you can trace your plan to a line in it, start over.

### 6. Anti-default gate

This is where most de-slopping fails: it swaps indigo for terracotta and calls
it taste. Two checks, both required.

A configured brand narrows this step rather than removing it: the palette is
settled, so the decisions still to make are layout, type, density and the one
signature detail. A brand colour is never the reason a page looks generated.

**Mechanical.** Record every pass and let the scanner catch repeats:

```bash
node <skill-dir>/scripts/detect-ui.mjs <paths> --record=<project-name>
```

This writes the ground/signal fingerprint to `.unslop/history.json`. On a later
run, rule **SD0** fires if the new direction lands within 14° of hue of one you
already shipped. Your own last three passes are a style menu too.

**By hand.** For every line of the plan ask: *would I have arrived here for any
similar page?* If yes, revise it and state what changed. Then check the plan
against SD1–SD4 explicitly: cream+terracotta, near-black+acid, emerald accent,
template chrome.

If a user is present, show the plan plus one alternative in a sentence, and
pause. If not, state the assumption in one line and continue.

### 7. Calibrate depth

Match the size of the rewrite to the artifact. A component gets a surgical pass.
A standalone landing page can be rebuilt. **If the original is already strong,
make the few cuts it needs and stop.**

### 8. Rewrite

Edit the real files. Add no dependencies silently. For multi-page or multi-doc
work, write the contract to `DESIGN.md` (ui) or `VOICE.md` (text) so page two
cannot drift from page one — drift across pages is itself a P0 tell.

Write the decisions down as configuration, not prose: create or update
`unslop.palette.json` and `unslop.style.json` so the next page, and the next
agent, is checked against them. For prose, the same job is done by the `text`
section of the style file.

**In text mode, replace rather than delete:**

| Cut | Restore |
|---|---|
| "serves as", "represents a", "stands as" | "is", "has" |
| "not just X, it's Y" | Y, stated plainly |
| ", further underscoring its importance as…" | nothing, or a sentence with evidence |
| "utilize", "authored", "facilitate" | "use", "wrote", "help" |
| "Experts argue that…" | the named source, or cut the claim |
| even 18-word sentences | one four-word sentence next to a long one |
| "In conclusion," | the last real point |

Human prose has texture the scanners read as noise: definitive claims ("the
only", "the first"), qualifiers ("perhaps", "tends to"), mildly wordy joins
("as a result of"), uneven rhythm. Putting these back is the job.

### 9. Verify

Re-run the scanner and report a before/after. The pass succeeds only if **all**
hold:

- score dropped below the threshold (the style file's, if it sets one)
- no P0 remains
- no `X1`/`X2` drift from the declared palette and radius scale remains
- **no new SD tell appeared** that the brief did not ask for
- accessibility findings (contrast, focus, reduced motion) are at zero
- **the render audit is clean at every width you ship.** No overlap, no
  clipping, no sideways scroll, no contrast failure, no misaligned row. This
  gate is not negotiable: a de-slopped page that renders badly is worse than
  the generic one it replaced, because the generic one at least worked.
- the artifact still works

A clean scan is **necessary but not sufficient**. Then judge by eye:

1. Could you tell this apart from the other output of its kind?
2. Does every choice have a reason you could name out loud?
3. Is it not a second-order default — not your cream-and-terracotta move, not
   your near-black-and-lime move?
4. Did meaning, facts, voice and function survive?

## The hero

More slop per square inch lands here than anywhere else on a page, because the
hero is where a model reaches for the thing it has seen most: a centred claim,
a gradient word, a product shot with a glow, and a table of particulars parked
in the right-hand column.

- **Give the hero one protagonist.** Not a headline *and* a facts table *and* a
  screenshot. One thing is the subject; everything else is subordinate to it or
  belongs further down the page.
- **Prefer evidence to assertion.** A figure the reader can check outranks a
  sentence they have to believe. If the subject has one number that settles the
  argument, that number is the hero and the sentence is the caption.
- **The best figure is usually the one the client would rather hide.** *One in
  five scoping weeks ends with us telling you not to build it* earns more than
  any accuracy percentage, because nobody fabricates a statistic that costs
  them work. Ask for that number explicitly; it is rarely in the brief.
- **Do not fill the right-hand column just because it is empty.** A definition
  list beside the headline is the layout equivalent of a filler paragraph. Open
  space next to a headline is a decision available to you, not a defect.
- **Without icons, gradients or product imagery, graphic weight has to come
  from real content at display scale** — a figure, a record of what shipped and
  what did not, a single ruled line of particulars. Invent nothing to fill the
  hole. If the subject genuinely has nothing that can carry that weight, the
  hero is type and space and nothing else, and that is a finished answer rather
  than an unfinished one.
- **Whatever leads the hero sets the contract for the page.** Lead with a
  number and every section below has to keep paying in numbers; lead with a
  sentence and the page has to stay willing to argue.
- **Compose the hero at 390px before 1440.** A hero that works by two-column
  balance has no balance on a phone: it becomes a stack, and the stacked order
  is the real reading order. Decide that order on purpose.

## Building pages that survive the render audit

Most render findings come from the same handful of habits. Writing these in
from the start is cheaper than fixing them at step 9.

- **Never give a text container a fixed height.** Use `min-height`. Text grows
  when the font falls back, when the language changes, when the viewport
  narrows. A fixed height plus `overflow: hidden` is how text gets clipped.
- **Never stack two text blocks absolutely in the same area** unless exactly
  one is visible at a time, and prove it with the audit. Nearly every
  `text_overlap` finding is an `position: absolute` that stopped being true at
  a narrower width, or a `<details>` whose closed state was styled rather than
  hidden.
- **Flex and grid children need `min-width: 0`**, or a long word pushes the row
  wider than the viewport. This is the usual cause of `page_scrolls_sideways`.
- **Set `overflow-wrap: anywhere`** on anything that can receive a URL, an
  email address, a long identifier or a figure.
- **Repeated cards: push the trailing label to the bottom.** Equal-height cards
  with differently sized bodies do not align their footers by themselves — make
  the card a column flex container and give the body `flex: 1`. This is
  `row_misaligned`, and it is the single most common thing that makes an
  otherwise careful page look amateur.
- **Check contrast against the colour actually painted**, not the one you
  intended: a translucent foreground over a tinted surface is not the value in
  your token file. A button that measures 4.35:1 fails, and moving one stop
  along the same ramp usually fixes it without touching the brand.
- **Give interactive controls a real hit area** — 24px minimum on the short
  side, from padding rather than a larger font.
- **Test at three widths, not one.** 1280 proves nothing about 420.

## Output format

**rewrite mode**

1. **Profile and scope** — one line.
2. **Audit** — findings grouped by severity, each with ID, location, reason and
   confidence tag. Lead with the scanner score and the render audit counts.
3. **Direction** — the five-line plan, with the subject each choice came from,
   plus what the anti-default gate changed.
4. **Changes** — what changed and why, not a line-by-line diff.
5. **Verification** — before/after score table, the render audit at every
   width, and the four judgments.

**detect mode**

1. **Audit** — grouped P0/P1/P2 with IDs and locations.
2. **Assessment** — for each finding: a clear problem, or a judgment call. Say
   which you would fix and which you would leave, and why.

## Self-reference escape hatch

This skill's own documentation is full of slop examples. Illustrative slop is
exempt only with a concrete signal: a `slop-example` comment, a path under
`examples/`, `fixtures/`, `__mocks__/` or `stories/`, an `unslop-ignore: <ID>`
comment on the line, or `unslop-ignore-file` at the top. Nothing else.

## References

- `references/ui-tells.md` — the UI catalog, with IDs, severity and fixes
- `references/text-tells.md` — the prose catalog, both languages
- `references/deriving-a-direction.md` — how to ground a direction, and what not to flag
- `references/configuration.md` — every key in both config files, with examples
- `references/render-audit.md` — every render finding, what causes it, how to fix it
