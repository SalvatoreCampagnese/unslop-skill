# Text slop catalog (research draft for `/unslop text`)

Primary source: **Wikipedia:Signs of AI writing** (WikiProject AI Cleanup) — the most rigorous field guide that exists, ~15k words, explicitly *descriptive, not prescriptive*. Its own caveats matter:

> "this list is descriptive, not prescriptive; it consists of observations, not rules"
> "The patterns listed here are also only potential signs of a problem, not the problem itself."
> "Please do not merely treat these signs as the problems to be fixed; that could just make detection harder."

**Root mechanism:** LLMs regress to the mean and RLHF smooths output. A specific fact ("inventor of the first train-coupling device") becomes a generic one ("a revolutionary titan of industry"). Slop is *loss of specificity*, not bad grammar. Every rule below should ultimately serve: **restore the specific thing that was flattened.**

**Density, not presence.** One "delve" is nothing. Twelve is a signature.

---

## A. Vocabulary (high-density flag, never single-hit)

**Core overused set (Wikipedia's verbatim list):** additionally (sentence-initial), align with, boasts (= has), bolstered, crucial, deep dive, delve, emphasizing, enduring, enhance, fostering, garner, highlight (verb), interplay, intricate/intricacies, landscape (abstract), meticulous/meticulously, pivotal, robust, showcase, tapestry (abstract), testament, underscore (verb), valuable, vibrant.

**By model era** (useful for dating text):
- GPT-4 (2023–mid-2024): + key, landscape. `delve` peaked here, collapsed in 2025.
- GPT-4o (mid-2024–mid-2025): align with, enhance, fostering, highlighting, showcasing.
- GPT-5 (mid-2025–mid-2026): emphasizing, enhance, highlighting, showcasing.
- GPT-6 (mid-2026+): challenge, clearer, dependable, echoed, foster, leverage, matters, multifaceted, practical, prioritize, quietly, steady, universally — plus shorter 8–20 word sentences and more commas/periods (a *reaction* to em-dash suppression).
- Grok: causal, empirical, correlate, underscore.

**Marketing/promo layer:** seamless, leverage, elevate, empower, cutting-edge, innovative, game-changing, unlock, supercharge, revolutionize, holistic, synergy, bespoke, curated, dynamic, rich, profound, groundbreaking, renowned, diverse array, in the heart of, nestled, natural beauty, commitment to, exemplifies.

**Caveats:** a word being overused by AI does not mean its synonyms are. Context matters (`underscore` is literal in typography, a music term in film). `delve` and the em dash are now **false-positive traps** — humans have started avoiding them, and podcasters/YouTubers have started parroting them.

## B. Sentence constructions (stronger than vocabulary)

| ID | Pattern | Examples |
|---|---|---|
| B1 | **Negative parallelism** — the single most recognizable tell | "It's not just X, it's Y" / "not only… but also" / "no X, no Y, just Z" / "is not a mirror but a portal" |
| B2 | **Reversed negative parallelism** (the 2026 form) | "Y rather than X", "rather than a replacement for…" |
| B3 | **Participle tail of significance** — a trailing `-ing` clause that evaluates instead of informing | "…, further enhancing its significance as a dynamic hub of activity and culture" / "…, reflecting its continued relevance in the regional landscape" |
| B4 | **Rule of three** — triads to look comprehensive | "resilience, cultural richness, and natural beauty" / "Faster, smarter, simpler" |
| B5 | **Copulative avoidance** — never says "is/has" | serves as, stands as, marks, functions as, operates as, represents a, boasts a, features, maintains, offers a, refers to; "ventured into politics as a candidate" for "was a candidate" |
| B6 | **Significance inflation** | stands/serves as, is a testament/reminder, a crucial/pivotal/vital role, underscores its importance, reflects broader, symbolizing its enduring, setting the stage for, marks a shift, key turning point, evolving landscape, indelible mark, deeply rooted |
| B7 | **Vague association** instead of a fact | "is associated with X", "in connection with", "sources identified X as being associated with leadership of Z" |
| B8 | **Vague attribution / weasel sourcing** | "Industry reports", "Observers have cited", "Experts argue", "Some critics argue", "several publications" (with one cited), "such as" implying a non-exhaustive list |
| B9 | **Challenges-and-future formula** | "Despite its [positive words], X faces several challenges, including…" / "Despite these challenges…" — the *formula* is the tell, not the mention of challenges |
| B10 | **Hedging disclaimer about sources** (very 2026) | "While specific details are limited…", "not widely documented", "based on available information", "should be treated as… rather than…", "should not be confused with" |
| B11 | **Editorializing about nuance** | "this distinction is important because…", "it's important to note that…" |
| B12 | **List-title-as-proper-noun lead** | "EuroGames editions is the chronological list of…", "The 'List of songs about Mexico' is a curated compilation…" |
| B13 | **Uniform sentence length / even rhythm** — no short punchy sentence anywhere | |
| B14 | **Elegant variation** — cycling synonyms for one referent | (weak; non-native writers do it too) |

## C. Punctuation & typography

| ID | Tell | Notes |
|---|---|---|
| D1 | Em-dash overuse, especially **spaced** ` — ` | Wikipedia now files this under *historical* (2022–Sept 2026): newer models were restricted from it |
| D2 | **Over-reliance on commas and periods** — the post-em-dash artifact | The new tell, per the same guide |
| D3 | Curly quotes/apostrophes `“ ” ’` where the surrounding text uses straight ones | Mixed-mode within one doc is the real signal |
| D4 | `→` arrows, `·` middle dots, `✦` sparkle glyphs in prose | |
| D5 | Non-breaking-space and Unicode artifacts from markdown paste | |

## D. Formatting

- **Markdown leaking into non-markdown contexts:** `**bold**`, `#` headings, `---` dividers, `[text](url)`, triple-backtick blocks.
- **Overused boldface in prose**, often mid-sentence, sometimes with stray asterisks.
- **Inline-header vertical lists:** `**Label:** text` repeated for every bullet. The most distinctive formatting tell.
- **Emoji before section headings or list items.**
- **Title Case for every heading** instead of sentence case.
- **Broken heading levels:** an H1 repeating the document title, or several H1s.
- **Three-item bullet lists** throughout, every bullet the same length.

## E. Document structure

- Closing **"Conclusion" / "In summary" / "In conclusion" / "Overall"** section.
- **"Challenges and Legacy" / "Future Outlook" / "Future Prospects"** sections.
- **"Awards and recognition"** and generally `X and Y` section titles.
- **Question-shaped section headings** ("Why does this matter?").
- **"In this article, we will explore…"** opener.
- Symmetrical sections of near-identical length.
- Canned emphasis on notability/media coverage: "independent coverage", "featured in national media outlets", "trade publications", "maintains an active social media presence", "was profiled in".

## F. Chatbot leftovers (hard evidence, not style)

- "Of course!", "Certainly!", "You're absolutely right!", "I hope this helps", "Would you like…", "Is there anything else", "Let me know if…", "Here is a … before publishing", "a Wikipedia-style article".
- "As an AI language model…", "Up to my last training update", "As of my last knowledge update".
- Placeholders: `[Article Title 1]`, `[Describe the specific section…]`, `(Add your channel URL here)`, `2026-XX-XX`, `INSERT_SOURCE_URL`, `<!-- Add if available -->`.
- Markup leakage: `contentReference[oaicite:1]`.
- Tracking params in links: `utm_source=openai`, `utm_source=chatgpt.com`, `utm_source=copilot.com`, `referrer=grok.com`.
- Abrupt mid-sentence cut-off.
- Customer-service register: "I have carefully reviewed…", "apologies for any inconvenience this may have caused", "I hope this message finds you well", "Dear Team, I am writing to…".

## G. Signs of *human* writing — the rewrite targets

The skill shouldn't only delete. It should restore these:

- Plain copulatives: **"there is a"**, **"it has a"**, "was", "has".
- Plain verbs over stiff synonyms: *wrote* not *authored*, *used* not *utilized*, *tried* not *attempted*, *died* not *passed away*, *about* not *regarding*, *help* not *facilitate*.
- Definitive claims and superlatives: "one of the best", "is the only", "was the first".
- Qualifiers and intensifiers: "very", "perhaps", "tends to".
- Mildly wordy human constructions: "as a result of", "in order to", "the fact that", "a part of".
- Uneven rhythm: a three-word sentence next to a thirty-word one.
- Specific nouns and numbers in place of abstractions.
- A real opinion, with a subject attached to it.

## H. NOT indicators — do not flag (anti-false-positive list)

Per Wikipedia's own "ineffective indicators" section:
- Perfect grammar.
- Mixed formal/casual register.
- "Bland" or "robotic" prose as a vibe.
- Formal or fancy prose in general (only *specific* words are overused).
- Transition words on their own.
- Unsourced content.
- Correct markup; stray HTML (usually editor/browser bugs).
- **A single em dash. A single "delve."**
- Anything in text written before 2022-11-30.

Also: AI detectors (GPTZero, Pangram) have non-trivial error rates and break on paraphrase; humans detect AI writing **no better than chance** (2025 study). So `/unslop text` should never output a probability score — only *named, located, fixable* patterns.

## I. Italian-language slop (hypothesis — needs validation)

No published guide found for Italian. Candidate markers to test before shipping:
- Lexicon: *approfondire, panorama, nel panorama attuale, fondamentale, cruciale, robusto, solido, senza soluzione di continuità, all'avanguardia, sfruttare, valorizzare, testimonianza, intricato, vibrante, un ruolo chiave, un punto di svolta*.
- Constructions: *"Non si tratta solo di X, ma di Y"*, *"È importante notare che…"*, *"In un mondo in cui…"*, *"In conclusione"*, *"Che tu sia X o Y…"*, participle tails (*"sottolineando l'importanza di…"*), *"rappresenta un"* instead of *"è"*.
- Structure: "In questo articolo esploreremo…", a closing "Conclusioni", rule-of-three everywhere.
- ⚠️ Italian uses the em dash far less than English, so D1 barely applies; the *lineetta* in Italian AI text is itself an anglicism tell.

---

## Design implications for the skill

1. **Report density + location, never a score.** "11 tells in 340 words, here they are" beats "87% AI".
2. **Two modes, like the design prior art:** `detect` (audit only) and `rewrite` (apply fixes).
3. **Preserve meaning, voice and facts.** The failure mode of a text-unslopper is flattening the author's actual voice into a *different* default.
4. **Never swap one default for another** (deleting em dashes → comma soup is exactly the 2026 GPT-6 signature).
5. **Needs per-line ignore comments** and a configurable threshold, or it'll be unusable on real repos.
6. **Language-aware.** English rules applied to Italian text will produce nonsense.
