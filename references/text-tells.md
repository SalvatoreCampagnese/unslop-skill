# Text tells

IDs match `scripts/detect-text.mjs`. Primary source: Wikipedia's
*Signs of AI writing*, built by the WikiProject AI Cleanup editors, plus its own
framing, which this skill adopts:

> this list is descriptive, not prescriptive; it consists of observations, not rules

**The score is not a detector.** Human detection of AI prose is no better than
chance, and automated detectors have non-trivial error rates and break on
paraphrase. The number here measures how much default language is present.
Never report it as a probability of authorship.

**Root cause:** models regress to the mean. A specific fact ("invented the first
train-coupling device") becomes a generic one ("a revolutionary titan of
industry"). Slop is lost specificity, not bad grammar. Every fix should restore
the specific thing that was flattened.

## Vocabulary — density only, never single hits

| ID | Tell | Sev |
|---|---|---|
| V1 | High density of AI-vocabulary words (≥3 hits and ≥4 per 1000 words) | P1 |
| V2 | Marketing superlatives | P2 |
| V3 | Stiff synonym where a plain word exists | P2 |

**EN core:** additionally, align with, boasts, bolstered, crucial, deep dive,
delve, emphasizing, enduring, enhance, fostering, garner, highlight (v),
interplay, intricate, landscape (abstract), meticulous, pivotal, robust,
showcase, tapestry, testament, underscore (v), vibrant, multifaceted, nestled,
realm, myriad.

**By era**, useful for dating text: GPT-4 added *key, landscape*; GPT-4o
*align with, enhance, fostering, showcasing*; GPT-5 *emphasizing, highlighting*;
GPT-6 *challenge, dependable, echoed, foster, leverage, matters, multifaceted,
practical, prioritize, quietly, steady, universally*. Grok: *causal, empirical,
correlate*.

**IT core** (no published guide exists; this set is this skill's own and should
be refined against real corpora): approfondire, panorama, scenario,
fondamentale, cruciale, robusto, solido, intricato, vibrante, testimonianza,
sottolineando, evidenziando, garantendo, valorizzare, molteplici, variegato,
tessuto, punto di svolta, ruolo chiave, in continua evoluzione, senza soluzione
di continuità, all'avanguardia, sfruttare.

**Caveats.** A word being overused by AI does not mean its synonyms are. Context
matters: *underscore* is literal in typography. `delve` peaked in 2023–24, then
collapsed, and is now a false-positive trap: humans avoid it on purpose and
podcasters parrot it.

| V4 | Word this project refuses (`banWords` in the style file) | P1 |

`allowWords` removes a word from `V1`/`V2` — *robust* is not slop in a
structural-engineering document. `banWords` adds one, and unlike the density
rules a single occurrence is enough, because a ban is an explicit decision.
See `configuration.md`.

## Constructions — stronger signals than vocabulary

| ID | Tell | Sev | Example |
|---|---|---|---|
| B1 | Negative parallelism | P0 | "It's not just a tool, it's a platform" · "non si tratta solo di X, ma di Y" · reversed 2026 form: "Y rather than X" |
| B2 | Participle tail of significance | P1 | ", further underscoring its importance as a hub of innovation" |
| B3 | Copulative avoidance | P1 | "serves as", "stands as", "represents a", "boasts a" · "rappresenta un", "si configura come" |
| B4 | Rule of three | P2 | "resilience, cultural richness, and natural beauty" |
| B5 | Significance inflation | P1 | "a pivotal moment", "is a testament to", "reflects broader trends", "cornerstone of" |
| B6 | Vague attribution | P1 | "Experts argue", "Industry reports", "Studies show" with nothing cited |
| B7 | Challenges-and-future formula | P1 | "Despite these challenges, X continues to…" — the formula, not the difficulty |
| B8 | Hedging disclaimer about sources | P1 | "While specific details are limited…", "it's important to note that" |
| — | Vague association | P1 | "is associated with X" where "was head of X" is the fact |
| — | List-title-as-proper-noun lead | P2 | "EuroGames editions is the chronological list of…" |

## Rhythm and punctuation

| ID | Tell | Sev | Note |
|---|---|---|---|
| R1 | Even sentence rhythm (variation < 42%, nothing shorter than 8 words) | P1 | The quietest tell and the hardest to fake away |
| R2 | Comma-and-period monotony (<6% other marks) | P2 | **The current artefact.** Models tuned off the em dash fell back on commas |
| R3 | Spaced em dashes, at density | P2 | **Historical.** Deliberately low severity: humans use em dashes and new models avoid them |

Also: curly quotes mixed with straight ones in one document; `→`, `·`, `✦` in
prose.

## Formatting

| ID | Tell | Sev |
|---|---|---|
| F1 | Inline-header list (`**Label:** text` × many) — the most distinctive formatting habit | P1 |
| F2 | Bold scattered through prose (≥6 spans and ≥8/1000 words) | P2 |
| F3 | Emoji in headings or list items | P1 |
| F4 | Title Case headings (≥3) | P2 |

Also: Markdown leaking where it does not belong (`**`, `#`, `---`, backticks);
an H1 repeating the title, or several H1s; every bullet the same length.

## Structure

| ID | Tell | Sev |
|---|---|---|
| S1 | Closing summary section ("Conclusion", "In conclusion", "In sintesi") | P1 |
| S2 | Essay-shell opener ("In this article we will explore", "In a world where", "Whether you're a…") | P1 |
| S3 | Question-shaped headings (≥2) | P2 |

Also: "Challenges and Legacy" / "Future Outlook" sections; "Awards and
recognition"; sections of near-identical length; canned emphasis on notability
and media coverage ("featured in national outlets", "maintains an active social
media presence").

## Leftovers — evidence, not style

| ID | Tell | Sev |
|---|---|---|
| X1 | Chatbot leftover ("I hope this helps", "Certainly!", "as an AI language model", "Here's a revised version", "spero che questo ti aiuti") | P0 |
| X2 | Unfilled placeholder (`[Your Company]`, `2026-XX-XX`, `INSERT_SOURCE_URL`) | P0 |

Also: `utm_source=openai` / `chatgpt.com` / `copilot.com` in links;
`contentReference[oaicite:…]`; abrupt mid-sentence cut-off; customer-service
register ("I have carefully reviewed", "apologies for any inconvenience this may
have caused").

## Restore these — the signs of human writing

Deleting is half the job. Prose that has only had slop removed reads sanded
down. Put back:

- plain copulatives: **"there is a"**, **"it has a"**, "was"
- plain verbs: *wrote* not *authored*, *used* not *utilized*, *tried* not
  *attempted*, *died* not *passed away*, *help* not *facilitate*
- definitive claims: "one of the best", "the only", "the first"
- qualifiers and intensifiers: "very", "perhaps", "tends to"
- mildly wordy human joins: "as a result of", "the fact that", "in order to"
- uneven rhythm: a four-word sentence beside a thirty-word one
- specific nouns and real numbers in place of abstractions
- an opinion, with a subject attached to it

## Do not flag

From Wikipedia's own "ineffective indicators":

- perfect grammar
- mixed formal and casual register
- "bland" or "robotic" prose as a vibe
- formal or elaborate prose in general — only *specific* words are overused
- transition words on their own
- unsourced content
- correct markup, or stray HTML (usually editor bugs)
- **a single em dash, a single "delve"**
- anything written before 2022-11-30
