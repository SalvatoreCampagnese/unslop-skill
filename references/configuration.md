# Configuration

Two optional files. Both plain JSON, both accept `//` and `/* */` comments,
both discovered by walking up from the scanned path (six levels), both
overridable with `--config=<dir>`, `--palette=<file>`, `--style=<file>`.

```bash
node scripts/detect-ui.mjs <dir> --init-config   # scaffold both, commented
node scripts/detect-ui.mjs <dir> --no-config     # ignore them, run the default catalog
```

## Why

Without configuration the scanner asks *"is this colour violet?"* — a question
with no good answer, because some brands are violet.

With it the question becomes *"is this colour a decision somebody made?"*, which
is the question that was always meant. A declared violet stops being a finding.
An undeclared colour starts being one.

That inversion is the whole point: before a brand is settled, the catalog
protects you from defaults; after it is settled, the palette file protects you
from drift.

---

## `unslop.palette.json`

```jsonc
{
  "name": "Kestrel",

  // the colours this brand owns, each with the job it does
  "colors": {
    "ground":  "#000000",
    "surface": "#333333",
    "ink":     "#ffffff",
    "muted":   "#a1a1a1",
    "signal":  "#ff6a00",
    "lift":    "#ff9f1c"
  },

  // how far a colour may sit from a declared one and still count as it
  "tolerance": { "hue": 12, "sat": 18, "light": 14 },

  // near-greys are structure, not brand: never reported as drift
  "neutralsAlwaysAllowed": true,

  // true if decorative one-offs outside the palette are fine
  "allowOffPaletteDecoration": false
}
```

| Key | Effect |
|---|---|
| `colors` | Any colour within `tolerance` of one of these is **on brand**: `C1`, `C2`, `SD1`, `SD2`, `SD3` stop firing on it. Values may be hex, `rgb()`, `hsl()` or `oklch()`. |
| `tolerance` | Per-channel slack in HSL. A declared near-grey only has to match on lightness, since hue is meaningless at low saturation. |
| `neutralsAlwaysAllowed` | Keeps `X1` quiet for near-greys and near-whites. |
| `allowOffPaletteDecoration` | Switches `X1` off entirely. |

Declaring a palette switches on **`X1` — colour off the declared palette** (P2):
every distinct colour that is not on brand and not neutral, reported once each
with the colour that caused it.

## `unslop.style.json`

```jsonc
{
  "radius":    { "policy": "scale", "scale": [0, 3, 10], "tolerance": 1 },
  "shadow":    { "policy": "none" },
  "glass":     { "allow": false },
  "gradients": { "allow": false },

  "fonts": {
    "display": ["Söhne"],
    "body":    ["Söhne"],
    "mono":    ["Berkeley Mono"],
    "allowSystemStack": false
  },

  "motion": { "requireReducedMotion": true, "allowBounce": false, "allowUniformReveal": false },
  "icons":  { "allowEmoji": false, "allowSparkles": false },
  "copy":   {
    "allowArrowsInCta": false,
    "allowGenericCta": false,
    "vocabulary": { "allow": [], "ban": [] }
  },

  "rules": { "T2": "off", "P2": "P1" },
  "thresholds": { "maxScore": 25, "min": "P2" },

  "text": { "lang": "auto", "maxScore": 25, "allowWords": [], "banWords": [] }
}
```

| Key | Effect |
|---|---|
| `radius.policy` | `"any"` ignores radius. `"scale"` switches on **`X2` — radius off the declared scale**, and exempts on-scale radii from `S1` and `S2`. |
| `shadow.policy` | `"any"` disables `C4`. `"neutral"` (default) reports coloured shadows. `"none"` reports every outer shadow. |
| `glass.allow` | `true` disables `S4`. |
| `gradients.allow` | `true` disables `C1`. |
| `fonts.*` | A declared face is exempt from `T1` and `T2`. `allowSystemStack` additionally permits `system-ui` / `-apple-system`. |
| `motion.requireReducedMotion` | `false` disables `M2`. Think twice: it is an accessibility rule, not a taste rule. |
| `motion.allowBounce` | `true` disables `M3`. |
| `motion.allowUniformReveal` | `true` disables `M1`. |
| `icons.allowEmoji` / `allowSparkles` | Disable `I3` / `I1`. |
| `copy.allowArrowsInCta` / `allowGenericCta` | Disable `P3` / `P5`. |
| `copy.vocabulary.allow` | Words this product owns; removed from `P2`. |
| `copy.vocabulary.ban` | Words it refuses; added to `P2` whatever the catalog says. |
| `rules` | `"off"` removes a rule by id; `"P0"`/`"P1"`/`"P2"` re-ranks it. Works for every rule in both scanners. |
| `thresholds` | Defaults for `--max-score` and `--min`. |

### `text` — the prose side

| Key | Effect |
|---|---|
| `lang` | `"auto"` (default), `"en"` or `"it"`. Overrides per-file detection. |
| `allowWords` | Removed from the `V1` density list and from `V2`. A word the subject genuinely needs — *robust* in a structural-engineering doc — stops being a finding. |
| `banWords` | Switches on **`V4` — word this project refuses** (P1). Unlike the density rules, one occurrence is enough, because a ban is an explicit decision. |
| `maxScore` / `min` | Thresholds for `detect-text.mjs`. |

---

## Honest warnings

- **A configuration can be used to make a bad page pass.** That is why
  `--no-config` exists and why the skill's verify step says to run it. If the
  only thing that changed between two passes is the config file, nothing was
  fixed.
- **Do not configure your way out of an accessibility finding.** `A1` (contrast),
  `K3` (focus) and `M2` (reduced motion) are defects, not preferences. They can
  be switched off through `rules`, and almost never should be.
- **A palette is a commitment.** Once declared, every new colour is a finding.
  That is the intent, and it is also why you should declare the real palette
  rather than the one from the last page you happened to build.
- **Config does not replace the derivation.** It fixes colour and shape. Layout,
  density, type hierarchy, copy and the one signature detail are still yours to
  derive from the subject.
