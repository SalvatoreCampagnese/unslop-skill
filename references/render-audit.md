# Render audit

```bash
node scripts/audit-render.mjs <file-or-url> [--widths=1280,768,420] [--json]
                              [--min-font=12] [--max=N] [--chrome=<path>]
```

Opens the page in headless Chrome at each width and measures what was painted.
No dependencies: it drives Chrome over the DevTools Protocol with Node's
built-in `WebSocket` (Node 22+). Exit `2` when P0/P1 findings exceed `--max`
(default 0).

**Why it exists.** The other two scanners read source, and source cannot tell
you that the hero headline sits on top of the nav at 420px. Removing slop is
not the same as being well made. A page can pass the whole catalog and still be
visibly broken — and a broken page is worse than the generic one it replaced,
because the generic one at least worked.

## Findings

| Code | Sev | What it means |
|---|---|---|
| `text_overlap` | P0 / P1 | Two unrelated text elements overlap by more than 18% of the smaller one. P0 above 50%. |
| `page_scrolls_sideways` | P0 | The document is wider than the viewport. Names the widest offending element. |
| `text_clipped` | P1 | An element clips its own text (`overflow: hidden` with real overflow, no ellipsis). |
| `text_offscreen` | P1 | Text extends past the left or right edge of the viewport. |
| `text_too_small` | P1 / P2 | Computed font size under the floor (default 12px). |
| `contrast_below_aa` | P1 / P2 | Measured against the background actually painted, compositing every translucent layer. 4.5:1, or 3:1 for large text. |
| `row_misaligned` | P1 / P2 | Three or more equal-width, equal-height siblings in a row whose short trailing labels sit at different heights. |
| `tap_target_small` | P2 | At ≤560px, an interactive control under 24×24, excluding links inside running prose. |

## What causes each one

**`text_overlap`** — nearly always an `position: absolute` that stopped being
true at a narrower width, or a `<details>` whose closed state was styled
instead of hidden. Two text blocks may share a stacking area only if exactly
one is visible at a time, and that has to be proved at every width.

**`page_scrolls_sideways`** — a flex or grid child without `min-width: 0`, so a
long word, a URL or a wide table pushes the row past the viewport. The fix is
`min-width: 0` on the child plus `overflow-wrap: anywhere` on the text.

**`text_clipped`** — a fixed `height` on a container whose text grew: a font
fell back, the language changed, the viewport narrowed. Use `min-height`.

**`row_misaligned`** — equal-height cards with differently sized bodies do not
align their footers by themselves. Make the card `display: flex;
flex-direction: column` and give the body `flex: 1` so the label is pushed to
the bottom. This is the single most common thing that makes an otherwise
careful page look amateur, and no rule about slop would ever catch it.

**`contrast_below_aa`** — the value in your token file is not what gets
painted once it sits translucent over a tinted surface. Move one stop along
the same ramp rather than changing the brand colour.

## A capture gotcha worth knowing

`chrome --headless --screenshot --window-size=390,2000` does **not** reliably
lay the page out at 390px: it will happily hand you an image that looks as if
the text runs off the right edge while `document.scrollWidth` is exactly 390.
Screenshots taken that way have had me doubting a page that was correct.

Measure and capture through the same path. This tool uses
`Emulation.setDeviceMetricsOverride` over the DevTools Protocol, and so should
any screenshot you compare against it. If a screenshot and this audit disagree,
check the screenshot first.

## Calibration

- It reports what is drawn, not what is tasteful. There is no judgment here and
  no catalog: every finding is a measurement with a number attached.
- It cannot see background images, so contrast is skipped over them rather than
  guessed.
- `row_misaligned` deliberately ignores two-column layouts and ragged prose
  bottoms: a rail beside content, or two paragraph columns ending at different
  points, are correct and are not reported.
- Inline links inside running prose are not reported as small tap targets.
- Webfonts are awaited before measuring, so a fallback-font layout is not
  mistaken for the real one.

## In CI

```bash
node scripts/audit-render.mjs dist/index.html --widths=1440,1024,768,390 --max=0
```

Pair it with the source scanner. The source scanner stops the page looking
generated; this one stops it shipping broken.

## `text_squeezed` — words crushed into a column too narrow to read

A box survives, its words do not. A `<caption>` left as `table-caption` inside
a table that became `display: block`, a grid child that lost its track, a flex
item sitting at min-content: the element keeps a sane height, nothing overlaps
it, nothing clips it and nothing runs off the screen, so every other check here
stays quiet while the page renders one letter per line.

The check fires when an element with at least eight characters of its own text
has a content width under three times its font size and still spills over four
lines or more. That combination does not happen on purpose.

It is rated **P0** because it is unreadable rather than merely untidy, and
because it is almost always a width-specific collapse: the same page is
perfectly fine one breakpoint up, which is how it survives review.

## Text hidden on purpose

A skip link, a table header replaced by per-cell `data-label` text, a label for
an icon-only control: this content is *meant* to be clipped, one pixel wide and
outside the viewport. The audit skips any element — and any descendant of one —
that matches the two visually-hidden patterns in general use (`clip-path:
inset(50%)` and the older `clip: rect(0 0 0 0)`), or that sits inside a box of
at most two pixels that hides its overflow.

Without that exemption the audit reports `text_clipped`, `text_offscreen` and
`tap_target_small` on every accessible page, which is the fastest way to teach
someone to stop building accessible pages.
