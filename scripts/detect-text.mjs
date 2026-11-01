#!/usr/bin/env node
/**
 * unslop — text slop scanner
 *
 * Locates the patterns that make prose read as machine-written. Deliberately
 * NOT a detector: it never emits a probability that a text is AI-generated.
 * Human detection of AI prose is no better than chance and automated detectors
 * have non-trivial error rates, so a score here means "how much unchosen
 * default language is in this text", nothing about authorship.
 *
 * Two things most lists get wrong, and this one does not:
 *  - Single hits are noise. "delve" once is nothing; vocabulary rules only fire
 *    on density per 1000 words.
 *  - The em dash is a historical tell. Models were tuned off it, and the
 *    current artefact is comma-and-period monotony, which is checked instead.
 *
 * Languages: en, it (auto-detected per file, override with --lang=).
 * Usage: node detect-text.mjs <paths...> [--json] [--lang=en|it] [--min=P0|P1|P2]
 *                             [--max-score=N] [--rules]
 * Exit codes: 0 ok · 2 over threshold · 1 usage error
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, ruleOverride, DEFAULT_STYLE } from './unslop-config.mjs';

const SEV_WEIGHT = { P0: 10, P1: 4, P2: 1 };
const DEFAULT_MAX_SCORE = 25;
const MAX_HITS_PER_RULE = 4;
const TEXT_EXT = new Set(['.md', '.mdx', '.txt', '.markdown', '.html', '.htm', '.rst', '.adoc']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', 'coverage', 'vendor', '.unslop']);

/* ---------------------------------------------------------------- language */

const IT_STOP = ['che', 'non', 'per', 'con', 'una', 'del', 'della', 'degli', 'sono', 'anche', 'come', 'più', 'questo', 'alla', 'nel', 'sul', 'gli', 'dei'];
const EN_STOP = ['the', 'and', 'that', 'with', 'this', 'from', 'have', 'which', 'their', 'about', 'would', 'these', 'other', 'into'];

function detectLang(text) {
  const w = text.toLowerCase().match(/[a-zà-ü]+/g) || [];
  const set = new Map();
  for (const x of w) set.set(x, (set.get(x) || 0) + 1);
  const score = (list) => list.reduce((a, s) => a + (set.get(s) || 0), 0);
  return score(IT_STOP) > score(EN_STOP) ? 'it' : 'en';
}

/* ------------------------------------------------------------- preparation */

function prepare(raw, ext) {
  let t = raw;
  const masked = [];
  const mask = (re) => { t = t.replace(re, (m) => { masked.push(m); return '\u0000'.repeat(Math.min(m.length, 4)); }); };
  mask(/^---\n[\s\S]*?\n---\n/);          // frontmatter
  mask(/```[\s\S]*?```/g);                 // fenced code
  mask(/~~~[\s\S]*?~~~/g);
  mask(/`[^`\n]+`/g);                      // inline code
  mask(/\]\([^)]*\)/g);                    // link targets
  if (ext === '.html' || ext === '.htm') {
    t = t.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  }
  return t;
}

const words = (t) => (t.match(/[\p{L}']+/gu) || []).length;
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

function per1000(count, wordCount) { return wordCount ? (count * 1000) / wordCount : 0; }

/* -------------------------------------------------------------- vocabulary */

const VOCAB = {
  en: {
    core: ['additionally', 'align with', 'boasts', 'bolstered', 'crucial', 'deep dive', 'delve', 'delves', 'emphasizing', 'enduring', 'enhance', 'enhances', 'enhancing', 'fostering', 'foster', 'garner', 'interplay', 'intricate', 'intricacies', 'landscape', 'meticulous', 'meticulously', 'pivotal', 'robust', 'showcase', 'showcases', 'showcasing', 'tapestry', 'testament', 'underscore', 'underscores', 'underscoring', 'vibrant', 'multifaceted', 'nestled', 'realm', 'myriad', 'navigate the', 'harness the'],
    promo: ['seamless', 'seamlessly', 'leverage', 'leveraging', 'elevate', 'empower', 'empowering', 'cutting-edge', 'innovative', 'game-changing', 'unlock', 'supercharge', 'revolutionize', 'holistic', 'synergy', 'bespoke', 'curated', 'groundbreaking', 'renowned', 'diverse array', 'commitment to', 'exemplifies', 'profound'],
    stiff: [['authored', 'wrote'], ['utilize', 'use'], ['utilized', 'used'], ['utilizing', 'using'], ['attempted', 'tried'], ['facilitate', 'help'], ['regarding', 'about'], ['prior to', 'before'], ['in order to', 'to'], ['subsequently', 'then'], ['numerous', 'many'], ['commence', 'start'], ['additionally', 'also'], ['furthermore', 'also']],
  },
  it: {
    core: ['approfondire', 'approfondimento', 'panorama', 'scenario', 'fondamentale', 'cruciale', 'robusto', 'solido', 'intricato', 'vibrante', 'testimonianza', 'sottolineando', 'sottolinea', 'evidenziando', 'garantendo', 'arricchire', 'valorizzare', 'molteplici', 'variegato', 'tessuto', 'pietra angolare', 'punto di svolta', 'ruolo chiave', 'in continua evoluzione'],
    promo: ['senza soluzione di continuità', "all'avanguardia", 'sfruttare', 'potenziare', 'rivoluzionare', 'innovativo', 'immersivo', 'olistico', 'su misura', 'di altissimo livello', 'rinomato', 'ampia gamma', 'impegno verso', 'eccellenza'],
    stiff: [['utilizzare', 'usare'], ['effettuare', 'fare'], ['al fine di', 'per'], ['in merito a', 'su'], ['successivamente', 'poi'], ['numerosi', 'molti'], ['usufruire', 'usare'], ['nonché', 'e']],
  },
};

/* ------------------------------------------------------------------- rules */

const RULES = [
  {
    id: 'V1', sev: 'P1', title: 'High density of AI-vocabulary words',
    why: 'Density is the signal, not presence. Models over-select the same set, so a cluster of them in short prose is the strongest lexical tell there is.',
    fix: 'Replace each with the specific word the sentence actually needs. Do not swap synonyms; say the concrete thing.',
    test(ctx) {
      const list = ctx.words_allow
        ? VOCAB[ctx.lang].core.filter((w) => !ctx.words_allow.has(w.toLowerCase()))
        : VOCAB[ctx.lang].core;
      const hits = [];
      for (const w of list) {
        const re = new RegExp(`\\b${w.replace(/[-\s]/g, '[-\\s]')}\\w{0,3}\\b`, 'gi');
        for (const m of ctx.text.matchAll(re)) hits.push({ w: m[0], index: m.index });
      }
      const rate = per1000(hits.length, ctx.words);
      if (hits.length >= 3 && rate >= 4) {
        return [{ line: lineOf(ctx.raw, hits[0].index), evidence: `${hits.length} hits (${rate.toFixed(1)}/1000 words): ${[...new Set(hits.map((h) => h.w.toLowerCase()))].slice(0, 8).join(', ')}` }];
      }
      return [];
    },
  },
  {
    id: 'V2', sev: 'P2', title: 'Marketing superlatives',
    why: 'Words that survive edits because they commit to nothing checkable.',
    fix: 'Each one becomes a number, a verb, or a claim someone could dispute.',
    test(ctx) {
      const hits = [];
      const promo = ctx.words_allow
        ? VOCAB[ctx.lang].promo.filter((w) => !ctx.words_allow.has(w.toLowerCase()))
        : VOCAB[ctx.lang].promo;
      for (const w of promo) {
        const re = new RegExp(`\\b${w.replace(/[-\s']/g, "[-\\s']")}\\w{0,3}\\b`, 'gi');
        for (const m of ctx.text.matchAll(re)) hits.push({ w: m[0], index: m.index });
      }
      if (hits.length >= 2) return [{ line: lineOf(ctx.raw, hits[0].index), evidence: `${hits.length}: ${[...new Set(hits.map((h) => h.w.toLowerCase()))].slice(0, 6).join(', ')}` }];
      return [];
    },
  },
  {
    id: 'V3', sev: 'P2', title: 'Stiff synonym where a plain word exists',
    why: 'Humans write "used" and "wrote". Models reach for "utilized" and "authored".',
    fix: 'Use the plain word.',
    test(ctx) {
      const out = [];
      for (const [stiff, plain] of VOCAB[ctx.lang].stiff) {
        const re = new RegExp(`\\b${stiff.replace(/\s/g, '\\s')}\\b`, 'gi');
        const m = re.exec(ctx.text);
        if (m) out.push({ line: lineOf(ctx.raw, m.index), evidence: `"${m[0]}" -> "${plain}"` });
      }
      return out.slice(0, 6);
    },
  },

  {
    id: 'V4', sev: 'P1', title: 'Word this project refuses',
    why: 'The style file bans this word. A banned word is a decision, so one occurrence is enough.',
    fix: 'Use the word the sentence actually needs.',
    test(ctx) {
      if (!ctx.words_ban || !ctx.words_ban.length) return [];
      const out = [];
      for (const w of ctx.words_ban) {
        const re = new RegExp(`\\b${String(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[-\s]/g, '[-\\s]')}\\w{0,3}\\b`, 'gi');
        for (const m of ctx.text.matchAll(re)) out.push({ line: lineOf(ctx.raw, m.index), evidence: `"${m[0]}" is on this project's ban list` });
      }
      return out.slice(0, 8);
    },
  },
  {
    id: 'B1', sev: 'P0', title: 'Negative parallelism',
    why: 'The "not just X, it is Y" frame argues against a claim nobody made. It is the single most recognisable construction in machine prose.',
    fix: 'State Y. Delete the straw man.',
    test(ctx) {
      const pats = ctx.lang === 'it'
        ? [/non\s+(?:è|si\s+tratta)\s+(?:solo|soltanto|semplicemente)\s*(?:di\s+)?[^.;]{0,80}?,\s*(?:ma|bensì)\b/gi, /non\s+solo[^.;]{0,60}?\s+ma anche\b/gi, /non\s+(?:è|era)\s+[^.;]{0,50}?,\s*(?:ma|bensì)\s+/gi]
        : [/\b(?:it(?:'s| is)|that(?:'s| is)|this is)\s+not\s+(?:just|merely|only|simply)\b[^.;]{0,90}?[,—-]\s*it(?:'s| is)\b/gi, /\bnot\s+(?:just|only|merely|simply)\s+[^.;,]{1,60},?\s+but\s+(?:also\s+)?/gi, /\bno\s+\w+[^.;]{0,40},\s*no\s+\w+[^.;]{0,40},\s*just\b/gi, /\bis\s+not\s+(?:a|an|the)\s+\w+[^.;]{0,40}\s+but\s+(?:a|an|the)\b/gi, /\brather\s+than\s+(?:a|an|the)\s+\w+/gi];
      const out = [];
      for (const p of pats) for (const m of ctx.text.matchAll(p)) out.push({ line: lineOf(ctx.raw, m.index), evidence: m[0].replace(/\s+/g, ' ').slice(0, 80) });
      return out;
    },
  },
  {
    id: 'B2', sev: 'P1', title: 'Participle tail of significance',
    why: 'A trailing -ing clause that evaluates instead of informing: "..., further cementing its role as a hub of innovation."',
    fix: 'Cut the clause. If the significance is real, make it a sentence with evidence.',
    test(ctx) {
      const pats = ctx.lang === 'it'
        ? [/,\s*(?:sottolineando|evidenziando|garantendo|contribuendo|riflettendo|consolidando|rafforzando|testimoniando|segnando)\b[^.]{0,90}\./gi]
        : [/,\s*(?:highlighting|underscoring|emphasi[sz]ing|ensuring|reflecting|symboli[sz]ing|contributing|cementing|solidifying|further\s+\w+ing|marking|showcasing|demonstrating|reinforcing)\b[^.]{0,90}\./gi];
      const out = [];
      for (const p of pats) for (const m of ctx.text.matchAll(p)) out.push({ line: lineOf(ctx.raw, m.index), evidence: m[0].replace(/\s+/g, ' ').slice(0, 80) });
      return out;
    },
  },
  {
    id: 'B3', sev: 'P1', title: 'Copulative avoidance',
    why: 'Never says "is" or "has". Everything "serves as", "stands as", "represents" or "boasts".',
    fix: 'Write "is". It is not a weaker verb; it is the accurate one.',
    test(ctx) {
      const pats = ctx.lang === 'it'
        ? [/\b(?:rappresenta|si configura come|si pone come|costituisce|vanta|si presenta come|funge da)\b/gi]
        : [/\b(?:serves as|stands as|functions as|operates as|represents a|represents an|boasts a|boasts an|boasts the|marks a|constitutes a)\b/gi];
      const out = [];
      for (const p of pats) for (const m of ctx.text.matchAll(p)) out.push({ line: lineOf(ctx.raw, m.index), evidence: m[0] });
      return out;
    },
  },
  {
    id: 'B4', sev: 'P2', title: 'Rule of three',
    why: 'Triads used to look comprehensive: "resilience, cultural richness, and natural beauty".',
    fix: 'Keep the one that is true and specific. Drop the rhythm.',
    test(ctx) {
      const out = [];
      for (const m of ctx.text.matchAll(/\b(\w{4,})\s*,\s*(\w{4,})\s*,?\s+(?:and|e|ed)\s+(\w{4,})\b/gi)) {
        out.push({ line: lineOf(ctx.raw, m.index), evidence: m[0].slice(0, 70) });
      }
      return out.length >= 2 ? out : [];
    },
  },
  {
    id: 'B5', sev: 'P1', title: 'Significance inflation',
    why: 'Arbitrary details tied to a broader theme: "a pivotal moment", "a testament to", "reflects broader trends".',
    fix: 'Say what happened. Let the reader decide what it means.',
    test(ctx) {
      const pats = ctx.lang === 'it'
        ? [/\b(?:rappresenta un (?:punto di svolta|momento)|testimonianza di|un ruolo (?:chiave|fondamentale|cruciale)|riflette (?:una|un) (?:tendenza|cambiamento) più ampi?[ao]|ha lasciato un segno|in continua evoluzione|pietra angolare)\b/gi]
        : [/\b(?:is a testament to|stands as a|serves as a reminder|a (?:crucial|pivotal|vital|significant|key) (?:role|moment|step)|underscores (?:its|the) (?:importance|significance)|reflects? broader|symboli[sz]ing its|setting the stage for|marks a shift|key turning point|evolving landscape|indelible mark|deeply rooted|cornerstone of)\b/gi];
      const out = [];
      for (const p of pats) for (const m of ctx.text.matchAll(p)) out.push({ line: lineOf(ctx.raw, m.index), evidence: m[0] });
      return out;
    },
  },
  {
    id: 'B6', sev: 'P1', title: 'Vague attribution',
    why: '"Experts argue", "industry reports", "observers have noted": authority with no address.',
    fix: 'Name the source, or drop the claim.',
    test(ctx) {
      const pats = ctx.lang === 'it'
        ? [/\b(?:gli esperti (?:sostengono|affermano|concordano)|secondo (?:alcuni|gli|molti) (?:esperti|osservatori|analisti)|si ritiene (?:che|generalmente)|è (?:ampiamente|generalmente) riconosciuto|diversi stud[io])\b/gi]
        : [/\b(?:experts? (?:argue|agree|say|note|suggest)|industry reports?|observers have|some critics argue|it is widely (?:believed|regarded|considered)|studies (?:show|suggest|have shown)|research (?:shows|suggests)|many believe|it(?:'s| is) widely)\b/gi];
      const out = [];
      for (const p of pats) for (const m of ctx.text.matchAll(p)) out.push({ line: lineOf(ctx.raw, m.index), evidence: m[0] });
      return out;
    },
  },
  {
    id: 'B7', sev: 'P1', title: 'Challenges-and-future formula',
    why: '"Despite these challenges, X continues to..." The formula is the tell, not the mention of difficulty.',
    fix: 'Name the specific obstacle and what is being done about it, or cut the paragraph.',
    test(ctx) {
      const pats = ctx.lang === 'it'
        ? [/\bnonostante (?:queste|le|i|tali) (?:sfide|difficoltà|limiti|ostacoli)\b/gi, /\bguarda(?:ndo)? al futuro\b/gi, /\bprospettive future\b/gi]
        : [/\bdespite (?:these|its|the) (?:challenges|limitations|hurdles|obstacles|setbacks)\b/gi, /\bfaces? (?:several|a number of|various) challenges\b/gi, /\blooking (?:ahead|to the future)\b/gi, /\bfuture (?:outlook|prospects)\b/gi];
      const out = [];
      for (const p of pats) for (const m of ctx.text.matchAll(p)) out.push({ line: lineOf(ctx.raw, m.index), evidence: m[0] });
      return out;
    },
  },
  {
    id: 'B8', sev: 'P1', title: 'Hedging disclaimer about sources',
    why: 'The 2026 signature: "While specific details are limited...", "based on available information".',
    fix: 'Either find the detail or omit the subject. The hedge is not information.',
    test(ctx) {
      const pats = ctx.lang === 'it'
        ? [/\b(?:sebbene (?:i|le) (?:dettagli|informazioni)|le informazioni disponibili|non (?:è|sono) ampiamente documentat[oi]|è importante notare che|va notato che)\b/gi]
        : [/\b(?:while specific details (?:are|remain) limited|not widely documented|based on available information|it(?:'s| is) (?:important|worth) (?:to )?not(?:e|ing) that|should not be confused with|should be treated as)\b/gi];
      const out = [];
      for (const p of pats) for (const m of ctx.text.matchAll(p)) out.push({ line: lineOf(ctx.raw, m.index), evidence: m[0] });
      return out;
    },
  },

  {
    id: 'R1', sev: 'P1', title: 'Even sentence rhythm',
    why: 'Uniform sentence length is the quietest tell and the hardest to fake away. Human prose varies; a three-word sentence sits next to a thirty-word one.',
    fix: 'Break one long sentence in half. Let one sentence be four words.',
    test(ctx) {
      const sents = ctx.text.split(/(?<=[.!?])\s+/).map((s) => words(s)).filter((n) => n >= 3);
      if (sents.length < 8) return [];
      const mean = sents.reduce((a, b) => a + b, 0) / sents.length;
      const sd = Math.sqrt(sents.reduce((a, b) => a + (b - mean) ** 2, 0) / sents.length);
      const cv = sd / mean;
      const shortest = Math.min(...sents);
      if (cv < 0.42 && shortest >= 8) {
        return [{ line: 1, evidence: `${sents.length} sentences, mean ${mean.toFixed(1)} words, variation ${(cv * 100).toFixed(0)}% (human prose is usually >50%), shortest ${shortest}` }];
      }
      return [];
    },
  },
  {
    id: 'R2', sev: 'P2', title: 'Comma-and-period monotony',
    why: 'The post-em-dash artefact. Models tuned off the em dash fell back on commas and full stops, so flat punctuation variety is now its own signal.',
    fix: 'Use a colon, a semicolon, parentheses. Vary the joints.',
    test(ctx) {
      if (ctx.words < 150) return [];
      const marks = { ',': 0, '.': 0, ';': 0, ':': 0, '(': 0, '?': 0, '!': 0, '—': 0 };
      for (const ch of ctx.text) if (ch in marks) marks[ch]++;
      const others = marks[';'] + marks[':'] + marks['('] + marks['?'] + marks['—'];
      const base = marks[','] + marks['.'];
      if (base >= 25 && others / base < 0.06) {
        return [{ line: 1, evidence: `${base} commas+periods, ${others} other marks (${((others / base) * 100).toFixed(1)}%)` }];
      }
      return [];
    },
  },
  {
    id: 'R3', sev: 'P2', title: 'Spaced em dashes',
    why: 'Historical tell, kept at low severity on purpose: humans use em dashes, and newer models were tuned off them. Only unusual density counts.',
    fix: 'Nothing, unless they are everywhere. Then vary the punctuation.',
    test(ctx) {
      const n = (ctx.text.match(/\s—\s/g) || []).length;
      const rate = per1000(n, ctx.words);
      if (n >= 3 && rate >= 3) return [{ line: lineOf(ctx.raw, ctx.raw.indexOf('—')), evidence: `${n} spaced em dashes (${rate.toFixed(1)}/1000 words)` }];
      return [];
    },
  },

  {
    id: 'F1', sev: 'P1', title: 'Inline-header list',
    why: '**Label:** text, repeated for every bullet. The most distinctive formatting habit in generated prose.',
    fix: 'Write the list as sentences, or make the labels a real table.',
    test(ctx) {
      const n = (ctx.raw.match(/^\s*[-*]\s+\*\*[^*\n]{2,40}\*\*\s*[:.—-]?\s*\S/gm) || []).length;
      if (n >= 3) return [{ line: lineOf(ctx.raw, ctx.raw.search(/^\s*[-*]\s+\*\*/m)), evidence: `${n} bullets shaped "**Label:** text"` }];
      return [];
    },
  },
  {
    id: 'F2', sev: 'P2', title: 'Bold scattered through prose',
    why: 'Mid-sentence boldface used as emphasis the sentence has not earned.',
    fix: 'Let the sentence carry the emphasis. Keep bold for genuine labels.',
    test(ctx) {
      const n = (ctx.raw.match(/\*\*[^*\n]{3,60}\*\*/g) || []).length;
      const rate = per1000(n, ctx.words);
      if (n >= 6 && rate >= 8) return [{ line: 1, evidence: `${n} bold spans (${rate.toFixed(1)}/1000 words)` }];
      return [];
    },
  },
  {
    id: 'F3', sev: 'P1', title: 'Emoji in headings or list items',
    why: 'Emoji as structural decoration.',
    fix: 'Remove them. The heading already is the heading.',
    test(ctx) {
      const out = [];
      const re = /^(?:#{1,6}\s|\s*[-*]\s).{0,40}?[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gmu;
      for (const m of ctx.raw.matchAll(re)) out.push({ line: lineOf(ctx.raw, m.index), evidence: m[0].trim().slice(0, 50) });
      return out;
    },
  },
  {
    id: 'F4', sev: 'P2', title: 'Title Case headings',
    why: 'Every Heading Capitalised Like This, where the surrounding prose is sentence case.',
    fix: 'Sentence case, unless house style says otherwise.',
    test(ctx) {
      const heads = ctx.raw.match(/^#{2,4}\s+(.+)$/gm) || [];
      if (heads.length < 3) return [];
      const title = heads.filter((h) => {
        const ws = h.replace(/^#+\s+/, '').split(/\s+/).filter((w) => w.length > 3);
        return ws.length >= 2 && ws.every((w) => /^[A-Z]/.test(w));
      });
      if (title.length >= 3) return [{ line: lineOf(ctx.raw, ctx.raw.indexOf(title[0])), evidence: `${title.length}/${heads.length} headings in Title Case` }];
      return [];
    },
  },

  {
    id: 'S1', sev: 'P1', title: 'Closing summary section',
    why: '"Conclusion", "In summary", "Overall" tacked on because the shape demands an ending.',
    fix: 'End on the last real point, or on what the reader should do.',
    test(ctx) {
      const pats = ctx.lang === 'it'
        ? [/^#{1,6}\s*(?:conclusion[ei]|in sintesi|riepilogo|considerazioni finali)\s*$/gim, /\b(?:in conclusione|in sintesi|riassumendo)\b/gi]
        : [/^#{1,6}\s*(?:conclusion|in summary|summary|final thoughts|wrapping up)\s*$/gim, /\b(?:in conclusion|in summary|to sum up|all in all|at the end of the day)\b/gi];
      const out = [];
      for (const p of pats) for (const m of ctx.raw.matchAll(p)) out.push({ line: lineOf(ctx.raw, m.index), evidence: m[0].trim() });
      return out;
    },
  },
  {
    id: 'S2', sev: 'P1', title: 'Essay-shell opener',
    why: '"In this article, we will explore..." announces the shape instead of starting.',
    fix: 'Start with the thing itself.',
    test(ctx) {
      const pats = ctx.lang === 'it'
        ? [/\bin questo (?:articolo|post|guida)[^.]{0,40}(?:esploreremo|vedremo|scopriremo|analizzeremo)\b/gi, /\bin un mondo (?:in cui|dove|sempre più)\b/gi, /\bnell'era (?:digitale|dell')/gi]
        : [/\bin this (?:article|post|guide|piece)[^.]{0,40}(?:we(?:'ll| will)|you(?:'ll| will))\b/gi, /\bin (?:today(?:'s)?|a) world (?:where|of)\b/gi, /\bin the (?:digital|modern) (?:age|era)\b/gi, /\bwhether you(?:'re| are) (?:a|an)\b/gi];
      const out = [];
      for (const p of pats) for (const m of ctx.text.matchAll(p)) out.push({ line: lineOf(ctx.raw, m.index), evidence: m[0].slice(0, 70) });
      return out;
    },
  },
  {
    id: 'S3', sev: 'P2', title: 'Question-shaped headings',
    why: 'Headings written as the questions a model imagines the reader asking.',
    fix: 'State the answer as the heading.',
    test(ctx) {
      const qs = (ctx.raw.match(/^#{2,6}\s+.*\?\s*$/gm) || []);
      if (qs.length >= 2) return [{ line: lineOf(ctx.raw, ctx.raw.indexOf(qs[0])), evidence: `${qs.length} question headings: ${qs[0].replace(/^#+\s*/, '').slice(0, 40)}` }];
      return [];
    },
  },

  {
    id: 'X1', sev: 'P0', title: 'Chatbot leftover',
    why: 'Assistant-register text that was never meant to ship. This is evidence, not style.',
    fix: 'Delete it.',
    test(ctx) {
      const pats = [
        /\b(?:I hope this helps|Of course!|Certainly!|You(?:'re| are) absolutely right|Would you like me to|Is there anything else|Let me know if you)\b/gi,
        /\bas an? (?:AI|large) language model\b/gi,
        /\b(?:up to|as of) my (?:last )?(?:training|knowledge) (?:update|cutoff)\b/gi,
        /\bhere(?:'s| is) (?:a|the) (?:revised|rewritten|polished|updated) version\b/gi,
        /\bI(?:'ve| have) (?:carefully )?(?:reviewed|analy[sz]ed) (?:your|the)\b/gi,
        /\bspero che (?:questo\s+|quest[oa]\s+)?(?:ti\s+|vi\s+)?(?:aiuti|sia utile|possa aiutare)/gi,
        /\bcertamente!|\bassolutamente!/gi,
        /\bfammi sapere se\b/gi,
        /utm_source=(?:openai|chatgpt\.com|copilot\.com|perplexity)/gi,
        /contentReference\[oaicite/gi,
      ];
      const out = [];
      for (const p of pats) for (const m of ctx.raw.matchAll(p)) out.push({ line: lineOf(ctx.raw, m.index), evidence: m[0].slice(0, 60) });
      return out;
    },
  },
  {
    id: 'X2', sev: 'P0', title: 'Unfilled placeholder',
    why: 'A bracketed slot that shipped.',
    fix: 'Fill it or cut the sentence.',
    test(ctx) {
      const out = [];
      const pats = [/\[(?:Your|Insert|Add|Describe|Article Title|Company|Name|TODO)[^\]\n]{0,40}\]/gi, /\b(?:20\d\d-XX-XX|INSERT_[A-Z_]+|PASTE_[A-Z_]+|XXX+)\b/g, /\[(?:inserisci|nome|azienda|descrivi)[^\]\n]{0,40}\]/gi];
      for (const p of pats) for (const m of ctx.raw.matchAll(p)) out.push({ line: lineOf(ctx.raw, m.index), evidence: m[0].slice(0, 50) });
      return out;
    },
  },
];

/* ----------------------------------------------------------------- scoring */

function score(findings) {
  const byRule = new Map();
  for (const f of findings) {
    if (!byRule.has(f.id)) byRule.set(f.id, []);
    byRule.get(f.id).push(f);
  }
  let raw = 0;
  for (const [, hits] of byRule) {
    const n = Math.min(hits.length, MAX_HITS_PER_RULE);
    raw += SEV_WEIGHT[hits[0].sev] * (1 + (n - 1) * 0.3);
  }
  const distinct = [...byRule.values()].filter((h) => h[0].sev !== 'P2').length;
  const mult = distinct >= 6 ? 1.6 : distinct >= 3 ? 1.3 : 1;
  const total = Math.min(100, Math.round(raw * mult));
  return {
    score: total,
    verdict: total >= 50 ? 'ai slop' : total >= 25 ? 'slop-leaning' : total >= 10 ? 'traces' : 'clean',
    distinctSignificant: distinct, clusterMultiplier: mult, rulesFired: byRule.size,
  };
}

/* -------------------------------------------------------------------- main */

function walk(target, acc = []) {
  let st; try { st = fs.statSync(target); } catch { return acc; }
  if (st.isFile()) { if (TEXT_EXT.has(path.extname(target))) acc.push(target); return acc; }
  if (!st.isDirectory()) return acc;
  for (const e of fs.readdirSync(target, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(target, e.name), acc); }
    else walk(path.join(target, e.name), acc);
  }
  return acc;
}

function main() {
  const argv = process.argv.slice(2);
  const o = { paths: [], json: false, lang: null, min: null, maxScore: null, rules: false,
    config: null, palette: null, style: null, noConfig: false };
  for (const a of argv) {
    if (a === '--json') o.json = true;
    else if (a === '--rules') o.rules = true;
    else if (a.startsWith('--lang=')) o.lang = a.slice(7);
    else if (a.startsWith('--min=')) o.min = a.slice(6).toUpperCase();
    else if (a.startsWith('--max-score=')) o.maxScore = +a.slice(12);
    else if (a.startsWith('--config=')) o.config = a.slice(9);
    else if (a.startsWith('--style=')) o.style = a.slice(8);
    else if (a === '--no-config') o.noConfig = true;
    else if (a.startsWith('-')) { console.error(`unslop: unknown flag ${a}`); process.exit(1); }
    else o.paths.push(a);
  }
  if (o.rules) { for (const r of RULES) console.log(`${r.id.padEnd(4)} ${r.sev}  ${r.title}`); process.exit(0); }
  if (!o.paths.length) { console.error('unslop text — usage: node detect-text.mjs <paths...> [--json] [--lang=en|it] [--min=P1] [--max-score=25]'); process.exit(1); }

  const startDir = (() => {
    try { return fs.statSync(o.paths[0]).isDirectory() ? o.paths[0] : path.dirname(o.paths[0]); }
    catch { return process.cwd(); }
  })();
  let cfg;
  try { cfg = loadConfig(startDir, o); } catch (e) { console.error(e.message); process.exit(1); }
  const tcfg = cfg.style.text || DEFAULT_STYLE.text;
  if (o.min === null) o.min = String(tcfg.min || cfg.style.thresholds?.min || 'P2').toUpperCase();
  if (o.maxScore === null) o.maxScore = typeof tcfg.maxScore === 'number' ? tcfg.maxScore : DEFAULT_MAX_SCORE;
  if (!o.lang && tcfg.lang && tcfg.lang !== 'auto') o.lang = tcfg.lang;
  const wordsAllow = new Set((tcfg.allowWords || []).map((w) => String(w).toLowerCase()));
  const wordsBan = (tcfg.banWords || []).map((w) => String(w).toLowerCase());

  const files = [...new Set(o.paths.flatMap((p) => walk(p)))];
  if (!files.length) { console.error('unslop: no text files found (.md .mdx .txt .html)'); process.exit(1); }

  const minRank = { P0: 0, P1: 1, P2: 2 }[o.min] ?? 2;
  const findings = [];
  const langs = new Set();

  for (const file of files) {
    let raw; try { raw = fs.readFileSync(file, 'utf8'); } catch { continue; }
    if (/unslop-ignore-file/.test(raw)) continue;
    const ext = path.extname(file);
    const text = prepare(raw, ext);
    const lang = o.lang || detectLang(text);
    langs.add(lang);
    const ctx = { file, raw, text, ext, lang, words: words(text),
      words_allow: (wordsAllow.size || wordsBan.length) ? wordsAllow : null, words_ban: wordsBan };
    if (ctx.words < 40) continue;
    const lines = raw.split('\n');
    for (const rule of RULES) {
      const override = ruleOverride(rule.id, cfg.style);
      if (override === 'off') continue;
      const sev = override || rule.sev;
      if ({ P0: 0, P1: 1, P2: 2 }[sev] > minRank) continue;
      let hits = [];
      try { hits = rule.test(ctx) || []; } catch { hits = []; }
      for (const h of hits) {
        const ln = h.line || 1;
        const here = (lines[ln - 1] || '') + ' ' + (lines[ln - 2] || '');
        const ig = here.match(/unslop-ignore:?\s*([A-Z0-9, ]+)/);
        if (ig && ig[1].split(/[,\s]+/).includes(rule.id)) continue;
        findings.push({ id: rule.id, sev, title: rule.title, why: rule.why, fix: rule.fix, file: path.relative(process.cwd(), file) || file, line: ln, lang, evidence: String(h.evidence || '').replace(/\s+/g, ' ').slice(0, 110) });
      }
    }
  }

  const s = score(findings);
  const payload = { tool: 'unslop-text', version: '0.2.0', filesScanned: files.length, languages: [...langs], ...s, threshold: o.maxScore,
    config: { configured: cfg.configured, sources: cfg.sources }, note: 'Score measures density of default language, NOT probability of AI authorship.', findings };

  if (o.json) console.log(JSON.stringify(payload, null, 2));
  else {
    const order = { P0: 0, P1: 1, P2: 2 };
    findings.sort((a, b) => order[a.sev] - order[b.sev] || a.id.localeCompare(b.id) || a.line - b.line);
    console.log(`\nunslop text — ${files.length} file(s), lang ${[...langs].join('+') || 'n/a'}`);
    if (cfg.configured) console.log(`config: ${cfg.sources.map((f) => path.basename(f)).join(' + ')}`);
    console.log(`score ${s.score}/100  ·  ${s.verdict}  ·  ${s.rulesFired} rule(s) fired  ·  cluster x${s.clusterMultiplier}`);
    let last = null;
    for (const f of findings) {
      if (f.sev !== last) { console.log(`\n${f.sev}`); last = f.sev; }
      console.log(`  ${f.id.padEnd(3)} ${f.file}:${f.line}  ${f.title}`);
      console.log(`      ${f.evidence}`);
    }
    if (!findings.length) console.log('\nNo patterns above the reporting threshold.');
    console.log('');
  }
  process.exit(s.score >= o.maxScore ? 2 : 0);
}

main();
