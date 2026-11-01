#!/usr/bin/env node
/**
 * unslop — UI slop scanner
 *
 * Deterministic detection of unchosen frontend defaults ("AI slop").
 * No network, no dependencies, no LLM. Node 18+.
 *
 * Design notes that matter:
 *  - Colour comparison happens in HSL after converting hex / rgb / hsl / oklch.
 *    oklch support is deliberate: Tailwind v4 and current shadcn themes ship
 *    oklch, so hex-only scanners silently miss modern purple.
 *  - CSS custom properties are collected across the whole scope and var()
 *    references are resolved, so `--primary: oklch(.55 .25 282)` is caught even
 *    when the button only says `background: var(--primary)`.
 *  - Findings are scored, not just counted. One gradient is not slop; a gradient
 *    plus Inter plus three icon cards plus a pill badge is a template.
 *
 * Usage:
 *   node detect-ui.mjs <paths...> [--json] [--min=P0|P1|P2] [--max-score=N]
 *                                 [--strict] [--include-examples] [--rules]
 *                                 [--record=<name>] [--profile=<p>]
 * Exit codes: 0 ok · 2 over threshold · 1 usage/internal error
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  loadConfig, paletteMatch, hasPalette, isNeutral, radiusAllowed,
  fontDeclared, hasDeclaredFonts, ruleOverride,
  SAMPLE_PALETTE, SAMPLE_STYLE, PALETTE_FILE, STYLE_FILE,
} from './unslop-config.mjs';

const SEV_WEIGHT = { P0: 10, P1: 4, P2: 1 };
const MAX_HITS_PER_RULE = 3;          // one noisy rule must not dominate the score
const DEFAULT_MAX_SCORE = 25;
const SCAN_EXT = new Set(['.html', '.htm', '.css', '.scss', '.sass', '.less', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte', '.astro', '.mdx', '.json']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt', '.svelte-kit', '.output', 'coverage', 'vendor', '.turbo', '.vercel', '.cache', '.unslop']);
const EXAMPLE_DIRS = new Set(['examples', 'example', 'fixtures', '__fixtures__', '__mocks__', 'stories', '.storybook']);

/* ------------------------------------------------------------------ colour */

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

// oklch -> sRGB (Björn Ottosson's oklab matrices), then HSL.
function oklchToHsl(L, C, Hdeg) {
  const hr = (Hdeg * Math.PI) / 180;
  const a = C * Math.cos(hr), b = C * Math.sin(hr);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  let R = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  let G = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  let B = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  const enc = (c) => {
    c = clamp(c, 0, 1);
    return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  };
  return rgbToHsl(enc(R), enc(G), enc(B));
}

const NAMED = { white: '#ffffff', black: '#000000', red: '#ff0000', blue: '#0000ff', green: '#008000', purple: '#800080', indigo: '#4b0082', violet: '#ee82ee', orange: '#ffa500', teal: '#008080' };

/** Parse one colour literal into {h,s,l,a,raw}. Returns null if not a colour. */
function parseColor(raw) {
  if (!raw) return null;
  let str = String(raw).trim().toLowerCase();
  if (NAMED[str]) str = NAMED[str];

  let m = str.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    const { h: hh, s, l } = rgbToHsl(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16));
    return { h: hh, s, l, a, raw };
  }
  m = str.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.%]+))?\s*\)$/);
  if (m) {
    const a = m[4] ? (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])) : 1;
    return { ...rgbToHsl(+m[1], +m[2], +m[3]), a, raw };
  }
  m = str.match(/^hsla?\(\s*([-\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:[\s,/]+([\d.%]+))?\s*\)$/);
  if (m) {
    const a = m[4] ? (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])) : 1;
    return { h: ((+m[1] % 360) + 360) % 360, s: +m[2], l: +m[3], a, raw };
  }
  // oklch(L C H) with L as 0-1 or percentage. This is where Tailwind v4 lives.
  m = str.match(/^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([-\d.]+)(?:deg)?(?:\s*\/\s*([\d.%]+))?\s*\)$/);
  if (m) {
    const L = m[1].endsWith('%') ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
    const a = m[4] ? (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])) : 1;
    return { ...oklchToHsl(L, +m[2], ((+m[3] % 360) + 360) % 360), a, raw };
  }
  return null;
}

const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const inHue = (c, lo, hi) => (lo <= hi ? c.h >= lo && c.h <= hi : c.h >= lo || c.h <= hi);

const isViolet    = (c) => c && inHue(c, 228, 300) && c.s >= 35 && c.l > 12 && c.l < 92;
const isSaturated = (c) => c && c.s >= 45 && c.l >= 20 && c.l <= 80;
const isCream     = (c) => c && c.l >= 88 && c.l <= 96.5 && c.s >= 18 && inHue(c, 20, 62);
const isTerracotta= (c) => c && inHue(c, 352, 30) && c.s >= 40 && c.l >= 33 && c.l <= 70;
const isNearBlack = (c) => c && c.l <= 10;
const isAcidGreen = (c) => c && inHue(c, 70, 165) && c.s >= 52 && c.l >= 36 && c.l <= 74;
const isEmerald   = (c) => c && inHue(c, 140, 175) && c.s >= 40 && c.l >= 30 && c.l <= 70;

function relLum(c) {
  // approximate: HSL -> rgb -> luminance
  const h = c.h / 360, s = c.s / 100, l = c.l / 100;
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(f(0)) + 0.7152 * lin(f(8)) + 0.0722 * lin(f(4));
}
const contrast = (a, b) => {
  const l1 = relLum(a), l2 = relLum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

/* ------------------------------------------------------------- file walking */

function walk(target, opts, acc = []) {
  let st;
  try { st = fs.statSync(target); } catch { return acc; }
  if (st.isFile()) {
    if (SCAN_EXT.has(path.extname(target))) {
      if (path.extname(target) === '.json' && path.basename(target) !== 'components.json') return acc;
      acc.push(target);
    }
    return acc;
  }
  if (!st.isDirectory()) return acc;
  for (const e of fs.readdirSync(target, { withFileTypes: true })) {
    const name = e.name;
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      if (!opts.includeExamples && EXAMPLE_DIRS.has(name)) continue;
      walk(path.join(target, name), opts, acc);
    } else if (e.isFile()) {
      walk(path.join(target, name), opts, acc);
    }
  }
  return acc;
}

/* --------------------------------------------------------------- extraction */

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/** Collect --custom-properties across every file, then resolve var() chains. */
function collectVars(files) {
  const vars = new Map();
  for (const { text } of files) {
    const re = /(--[a-z0-9-]+)\s*:\s*([^;{}]+)[;}]/gi;
    let m;
    while ((m = re.exec(stripComments(text)))) {
      const key = m[1].toLowerCase();
      const val = m[2].trim();
      if (!vars.has(key)) vars.set(key, val);
    }
  }
  const resolve = (val, depth = 0) => {
    if (depth > 4 || !val) return val;
    return val.replace(/var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]*)?\)/gi, (_, k) => {
      const v = vars.get(k.toLowerCase());
      return v ? resolve(v, depth + 1) : '';
    }).trim();
  };
  const resolved = new Map();
  for (const [k, v] of vars) resolved.set(k, resolve(v));
  return resolved;
}

/* A hex colour is 3, 4, 6 or 8 digits, and never the tail of a numeric HTML
   entity: "&#183;" is a middot, not the colour #183. The lookbehind is what
   keeps a page full of "&#8594;" or "&#183;" from reading as off-palette. */
const HEX = "(?<![&\\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\\b";
const FN = "rgba?\\([^)]*\\)|hsla?\\([^)]*\\)|oklch\\([^)]*\\)";

/** Every colour literal in a file, plus every colour reachable through vars. */
function colorsIn(text, vars) {
  const out = [];
  const body = stripComments(text);
  const lit = new RegExp(HEX + "|" + FN, "g");
  let m;
  while ((m = lit.exec(body))) {
    const c = parseColor(m[0]);
    if (c) out.push({ ...c, index: m.index });
  }
  const vr = /var\(\s*(--[a-z0-9-]+)/gi;
  while ((m = vr.exec(body))) {
    const v = vars.get(m[1].toLowerCase());
    const c = v && parseColor(v.split(/\s+/).find((p) => parseColor(p)) || v);
    if (c) out.push({ ...c, index: m.index, viaVar: m[1] });
  }
  return out;
}

function classesIn(text) {
  const out = [];
  const re = /(?:class|className)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{"([^"]*)"\})/g;
  let m;
  while ((m = re.exec(text))) {
    const raw = m[1] || m[2] || m[3] || m[4] || '';
    for (const c of raw.split(/\s+/)) if (c) out.push({ cls: c, index: m.index });
  }
  return out;
}

const NAMED_ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '\u00B7', bull: '\u2022', ndash: '\u2013', mdash: '\u2014', rarr: '\u2192', larr: '\u2190', hellip: '\u2026', euro: '\u20AC', pound: '\u00A3', copy: '\u00A9', reg: '\u00AE', trade: '\u2122', check: '\u2713', star: '\u2606', sparkles: '\u2728' };

/** Real pages encode glyphs as entities, so a scanner that skips them is blind. */
function decodeEntities(str) {
  return str
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return _; } })
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(+d); } catch { return _; } })
    .replace(/&([a-z]+);/gi, (m, n) => NAMED_ENT[n.toLowerCase()] ?? m);
}

function visibleTextOf(text, ext) {
  if (ext === '.css' || ext === '.scss' || ext === '.less' || ext === '.sass') return '';
  let t = text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  t = t.replace(/<[^>]+>/g, '\n');
  return decodeEntities(t);
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/* -------------------------------------------------------------------- rules */

/* ctx: { file, rel, ext, text, vars, colors, classes, visible, hasClass(re), cssHas(re) } */

const RULES = [
  /* ---- colour ---- */
  {
    id: 'C1', sev: 'P0', det: 'code', title: 'Purple/indigo gradient',
    why: 'The indigo-to-violet gradient is the single loudest unchosen default in AI-built UI.',
    fix: 'Use a tonal gradient inside one brand hue, or a flat ground. If the brand really is violet, keep it and note why.',
    test(ctx) {
      const out = [];
      if (ctx.style.gradients?.allow) return out;
      const grad = /(?:linear|radial|conic)-gradient\(([^;]*?)\)/gi;
      let m;
      while ((m = grad.exec(stripComments(ctx.text)))) {
        const inner = m[1];
        const lits = inner.match(new RegExp(HEX + "|" + FN + "|var\\(\\s*--[a-z0-9-]+", "g")) || [];
        for (const l of lits) {
          const c = l.startsWith('var(') ? parseColor((ctx.vars.get(l.replace(/var\(\s*/, '').toLowerCase()) || '').split(/\s+/)[0]) : parseColor(l);
          if (isViolet(c) && !ctx.onBrand(c)) { out.push({ line: lineOf(ctx.text, m.index), evidence: l }); break; }
        }
      }
      for (const { cls, index } of ctx.classes) {
        if (/^(?:bg-gradient-to-|bg-linear-|bg-radial|bg-conic)/.test(cls)) {
          const near = ctx.classes.filter((c) => Math.abs(c.index - index) < 2);
          void near;
        }
        if (/^(?:from|via|to)-(?:indigo|violet|purple|fuchsia)-\d{2,3}$/.test(cls)) out.push({ line: lineOf(ctx.text, index), evidence: cls });
      }
      return out;
    },
  },
  {
    id: 'C2', sev: 'P1', det: 'code', title: 'Violet primary action',
    why: 'Indigo/violet as the primary button colour with no brand reason.',
    fix: 'Tie the primary action to the brand colour and give it real hover/active states.',
    test(ctx) {
      const out = [];
      for (const { cls, index } of ctx.classes) {
        if (/^bg-(?:indigo|violet|purple)-(?:4|5|6|7)\d{2}$/.test(cls)) out.push({ line: lineOf(ctx.text, index), evidence: cls });
      }
      for (const name of ['--primary', '--color-primary', '--brand', '--accent']) {
        const v = ctx.vars.get(name);
        const c = v && parseColor(v.split(/\s+/).find((p) => parseColor(p)) || v);
        if (isViolet(c) && !ctx.onBrand(c)) out.push({ line: ctx.varLine(name), evidence: `${name}: ${v}` });
      }
      return out;
    },
  },
  {
    id: 'C3', sev: 'P0', det: 'code', title: 'Gradient headline text',
    why: 'Gradient clipped into heading letters reads as generated, and it hurts legibility.',
    fix: 'Solid ink. Let scale and weight carry the emphasis.',
    test(ctx) {
      const out = [];
      const css = stripComments(ctx.text);
      if (/background-clip\s*:\s*text/i.test(css) && /(?:-webkit-text-fill-color|color)\s*:\s*transparent/i.test(css)) {
        out.push({ line: lineOf(ctx.text, css.search(/background-clip\s*:\s*text/i)), evidence: 'background-clip:text + transparent' });
      }
      const hasClip = ctx.classes.find((c) => c.cls === 'bg-clip-text');
      const hasTrans = ctx.classes.find((c) => c.cls === 'text-transparent');
      if (hasClip && hasTrans) out.push({ line: lineOf(ctx.text, hasClip.index), evidence: 'bg-clip-text text-transparent' });
      return out;
    },
  },
  {
    id: 'C4', sev: 'P2', det: 'code', title: 'Coloured glow shadow',
    why: 'Saturated glow shadows are decoration standing in for hierarchy.',
    fix: 'Shadow communicates elevation. Use neutral shadows, or none.',
    test(ctx) {
      const out = [];
      const policy = ctx.style.shadow?.policy || 'neutral';
      if (policy === 'any') return out;
      const css = stripComments(ctx.text);
      const re = /box-shadow\s*:\s*([^;}]+)/gi;
      let m;
      while ((m = re.exec(css))) {
        if (/inset/i.test(m[1]) || /:\s*none/i.test(m[1])) continue;
        const blur = m[1].match(/(-?[\d.]+)px/g);
        if (!blur || blur.length < 3) continue;
        if (policy === 'none') { out.push({ line: lineOf(ctx.text, m.index), evidence: `shadow where the style file allows none: ${m[1].trim().slice(0, 44)}` }); continue; }
        const c = (m[1].match(new RegExp(HEX + "|" + FN)) || [])[0];
        const p = parseColor(c);
        if (p && isSaturated(p) && p.a >= 0.2) out.push({ line: lineOf(ctx.text, m.index), evidence: m[1].trim().slice(0, 60) });
      }
      for (const { cls, index } of ctx.classes) {
        if (/^shadow-(?:indigo|violet|purple|fuchsia|pink|blue|sky|cyan|emerald|teal)-\d{2,3}/.test(cls)) out.push({ line: lineOf(ctx.text, index), evidence: cls });
      }
      return out;
    },
  },
  {
    id: 'C5', sev: 'P1', det: 'code', title: 'Aurora / gradient blob background',
    why: 'Blurred gradient blobs behind the hero are the default way to fill empty space.',
    fix: 'Earn the space with content, a real product shot, or a deliberate flat ground.',
    test(ctx) {
      const out = [];
      const css = stripComments(ctx.text);
      const re = /filter\s*:\s*blur\(\s*(\d+)/gi;
      let m;
      while ((m = re.exec(css))) if (+m[1] >= 40) out.push({ line: lineOf(ctx.text, m.index), evidence: `blur(${m[1]}px)` });
      for (const { cls, index } of ctx.classes) {
        if (/^blur-(?:2xl|3xl)$/.test(cls)) out.push({ line: lineOf(ctx.text, index), evidence: cls });
      }
      return out;
    },
  },
  {
    id: 'C6', sev: 'P2', det: 'code', title: 'One hue pretending to be two',
    why: 'Primary and accent within ~20 degrees of hue do not give the eye two signals.',
    fix: 'Give the second colour a different job, or drop it.',
    test(ctx) {
      const pick = (names) => { for (const n of names) { const v = ctx.vars.get(n); const c = v && parseColor(v.split(/\s+/).find((p) => parseColor(p)) || v); if (c && c.s > 15) return { c, n }; } return null; };
      const a = pick(['--primary', '--brand', '--color-primary']);
      const b = pick(['--accent', '--secondary', '--signal', '--highlight']);
      if (a && b && hueDist(a.c.h, b.c.h) < 20) return [{ line: ctx.varLine(b.n), evidence: `${a.n} vs ${b.n}: ${Math.round(hueDist(a.c.h, b.c.h))}deg apart` }];
      return [];
    },
  },
  {
    id: 'A1', sev: 'P1', det: 'code', title: 'Muted text below WCAG AA',
    why: 'Grey-on-grey body text is the most common real harm in generated UI.',
    fix: 'Raise the muted foreground until it clears 4.5:1 against its ground.',
    test(ctx) {
      const out = [];
      const grounds = ['--background', '--bg', '--ground', '--color-background', '--card'];
      let ground = null;
      for (const g of grounds) { const v = ctx.vars.get(g); const c = v && parseColor(v.split(/\s+/).find((p) => parseColor(p)) || v); if (c) { ground = c; break; } }
      if (!ground) return out;
      for (const [k, v] of ctx.vars) {
        if (!/mut|subtle|secondary-foreground|placeholder|text-dim/.test(k)) continue;
        const c = parseColor(v.split(/\s+/).find((p) => parseColor(p)) || v);
        if (!c) continue;
        const r = contrast(c, ground);
        if (r < 4.5) out.push({ line: ctx.varLine(k), evidence: `${k} vs ground = ${r.toFixed(2)}:1` });
      }
      return out;
    },
  },

  /* ---- typography ---- */
  {
    id: 'T1', sev: 'P0', det: 'code', title: 'Inter / system stack as the only face',
    why: 'Inter everywhere is the default nobody chose. It is not a bad face; it is an unmade decision.',
    fix: 'Choose faces for the brief and give display and body different jobs.',
    test(ctx) {
      const out = [];
      const css = stripComments(ctx.text);
      const re = /font-family\s*:\s*([^;}]+)/gi;
      let m;
      while ((m = re.exec(css))) {
        const first = m[1].split(',')[0].replace(/['"]/g, '').trim().toLowerCase();
        if (fontDeclared(first, ctx.style)) continue;
        if (first === 'system-ui' || first === '-apple-system') { if (ctx.style.fonts?.allowSystemStack) continue; }
        if (['inter', 'roboto', 'arial', 'helvetica', 'system-ui', '-apple-system'].includes(first)) {
          out.push({ line: lineOf(ctx.text, m.index), evidence: m[1].trim().slice(0, 60) });
        }
      }
      if (!fontDeclared('inter', ctx.style)
        && (/next\/font\/google[\s\S]{0,200}\bInter\s*\(/.test(ctx.text) || /family=Inter[:&]/.test(ctx.text))) {
        out.push({ line: lineOf(ctx.text, ctx.text.search(/Inter/)), evidence: 'Inter via next/font or Google Fonts' });
      }
      return out;
    },
  },
  {
    id: 'T2', sev: 'P1', det: 'code', title: 'The "tasteful free font" set',
    why: 'Space Grotesk, Geist, Syne, Sora, Instrument Serif, Fraunces, Cal Sans are the second-order default.',
    fix: 'Keep only if the brief earns it. Never ship the face your last three projects shipped.',
    test(ctx) {
      const out = [];
      const faces = ['space grotesk', 'syne', 'sora', 'instrument serif', 'fraunces', 'cal sans', 'plus jakarta', 'geist']
        .filter((f) => !fontDeclared(f, ctx.style));
      const body = ctx.text.toLowerCase();
      for (const f of faces) {
        let i = body.indexOf(f);
        while (i !== -1) {
          const ctxAround = body.slice(Math.max(0, i - 80), i);
          if (/font-family|family=|fontfamily|next\/font|@font-face|--font/.test(ctxAround)) {
            out.push({ line: lineOf(ctx.text, i), evidence: f });
            break;
          }
          i = body.indexOf(f, i + 1);
        }
      }
      return out;
    },
  },
  {
    id: 'T3', sev: 'P1', det: 'code', title: 'Tracked all-caps eyebrow label',
    why: 'A small spaced uppercase label above every heading is template chrome, not information.',
    fix: 'Keep the label only if it carries information. Otherwise delete it.',
    test(ctx) {
      const hits = [];
      const css = stripComments(ctx.text);
      const re = /text-transform\s*:\s*uppercase/gi;
      let m;
      while ((m = re.exec(css))) {
        const around = css.slice(Math.max(0, m.index - 200), m.index + 200);
        if (/letter-spacing/i.test(around)) hits.push({ line: lineOf(ctx.text, m.index), evidence: 'uppercase + letter-spacing' });
      }
      for (const { cls, index } of ctx.classes) {
        if (cls === 'uppercase') {
          const near = ctx.classes.some((c) => Math.abs(c.index - index) < 400 && /^tracking-(?:wide|wider|widest|\[)/.test(c.cls));
          if (near) hits.push({ line: lineOf(ctx.text, index), evidence: 'uppercase + tracking-*' });
        }
      }
      return hits.length >= 2 ? hits : [];
    },
  },
  {
    id: 'T4', sev: 'P1', det: 'code', title: 'One accented word in the headline',
    why: 'Colouring or italicising a single word inside the H1 is the most copied headline move of 2026.',
    fix: 'Carry emphasis through the type system: scale, weight, or line breaks.',
    test(ctx) {
      const out = [];
      const re = /<h1\b[^>]*>([\s\S]{0,400}?)<\/h1>/gi;
      let m;
      while ((m = re.exec(ctx.text))) {
        const inner = m[1];
        const span = inner.match(/<(span|em|i|mark|strong)\b[^>]*>([^<]{1,40})<\/\1>/i);
        if (span && span[2].trim().split(/\s+/).length <= 3) {
          out.push({ line: lineOf(ctx.text, m.index), evidence: `<${span[1]}>${span[2].trim()}</${span[1]}>` });
        }
      }
      return out;
    },
  },

  /* ---- shape / surface ---- */
  {
    id: 'S1', sev: 'P1', det: 'code', title: 'rounded-2xl + shadow on every surface',
    why: 'Identical radius and shadow on every element means role is not encoded in form.',
    fix: 'Vary radius and elevation by role. A card and a button are not the same object.',
    test(ctx) {
      const out = [];
      const css = stripComments(ctx.text);
      const re = /border-radius\s*:\s*(\d+)px/gi;
      let m;
      const radii = [];
      while ((m = re.exec(css))) {
        radii.push(+m[1]);
        const around = css.slice(m.index, m.index + 300);
        const declaredScale = ctx.style.radius?.policy === 'scale' && Array.isArray(ctx.style.radius.scale) && ctx.style.radius.scale.length;
        if (declaredScale && radiusAllowed(+m[1], ctx.style)) continue;
        if (+m[1] >= 12 && +m[1] <= 32 && /box-shadow\s*:\s*(?!none)/i.test(around)) out.push({ line: lineOf(ctx.text, m.index), evidence: `radius ${m[1]}px + box-shadow` });
      }
      let pairs = 0, firstIdx = -1;
      for (const { cls, index } of ctx.classes) {
        if (/^rounded-(?:xl|2xl|3xl)$/.test(cls)) {
          const near = ctx.classes.some((c) => Math.abs(c.index - index) < 300 && /^shadow-(?:md|lg|xl|2xl)$/.test(c.cls));
          if (near) { pairs++; if (firstIdx < 0) firstIdx = index; }
        }
      }
      if (pairs >= 3) out.push({ line: lineOf(ctx.text, firstIdx), evidence: `rounded-*xl + shadow-* on ${pairs} surfaces` });
      return out;
    },
  },
  {
    id: 'S2', sev: 'P1', det: 'code', title: 'shadcn default radius untouched',
    why: '--radius left at 0.5rem / 0.625rem means the component kit was installed, not themed.',
    fix: 'Pick a radius that says something: 0 for editorial, 2px for tooling, 20px for consumer warmth.',
    test(ctx) {
      const v = ctx.vars.get('--radius');
      if (v && /^0\.(?:5|625)rem$/.test(v.trim())) {
        const px = parseFloat(v) * 16;
        if (radiusAllowed(px, ctx.style) && ctx.style.radius?.policy === 'scale') return [];
        return [{ line: ctx.varLine('--radius'), evidence: `--radius: ${v}` }];
      }
      return [];
    },
  },
  {
    id: 'S3', sev: 'P1', det: 'code', title: 'Coloured accent stripe on cards',
    why: 'A 3-4px coloured left or top border is nearly as reliable a tell as the em dash in prose.',
    fix: 'Drop the stripe. Use weight, scale or position to rank the card.',
    test(ctx) {
      const out = [];
      const css = stripComments(ctx.text);
      const re = /border-(?:left|top)\s*:\s*([2-9])px\s+solid\s+([^;}]+)/gi;
      let m;
      while ((m = re.exec(css))) {
        const c = parseColor(m[2].trim()) || parseColor((ctx.vars.get(m[2].replace(/var\(\s*|\s*\)/g, '').toLowerCase()) || '').split(/\s+/)[0]);
        if (isSaturated(c)) out.push({ line: lineOf(ctx.text, m.index), evidence: m[0].slice(0, 60) });
      }
      for (const { cls, index } of ctx.classes) {
        if (/^border-[lt]-(?:2|4|8)$/.test(cls)) {
          const near = ctx.classes.some((c) => Math.abs(c.index - index) < 200 && /^border-(?:indigo|violet|purple|blue|emerald|teal|amber|orange|rose)-\d{2,3}$/.test(c.cls));
          if (near) out.push({ line: lineOf(ctx.text, index), evidence: cls });
        }
      }
      return out;
    },
  },
  {
    id: 'S4', sev: 'P1', det: 'code', title: 'Glassmorphism by reflex',
    why: 'backdrop-blur on a card that is not layered over anything is decoration with no referent.',
    fix: 'Blur only where real content passes underneath, such as a sticky nav.',
    test(ctx) {
      const out = [];
      if (ctx.style.glass?.allow) return out;
      const css = stripComments(ctx.text);
      let m; const re = /backdrop-filter\s*:\s*[^;}]*blur/gi;
      while ((m = re.exec(css))) out.push({ line: lineOf(ctx.text, m.index), evidence: 'backdrop-filter: blur()' });
      for (const { cls, index } of ctx.classes) if (/^backdrop-blur/.test(cls)) out.push({ line: lineOf(ctx.text, index), evidence: cls });
      return out;
    },
  },

  /* ---- layout ---- */
  {
    id: 'L1', sev: 'P0', det: 'code', title: 'Pill badge above a centered H1',
    why: 'Badge, centered headline, centered subhead, two centered buttons: the default hero.',
    fix: 'Left-align, or let oversized type carry the hero. Drop the badge unless it is dated news.',
    test(ctx) {
      const out = [];
      const h1 = ctx.text.search(/<h1\b/i);
      if (h1 < 0) return out;
      const before = ctx.text.slice(Math.max(0, h1 - 900), h1);
      const badge = /class(?:Name)?\s*=\s*["'][^"']*(?:\bbadge\b|\bpill\b|\bchip\b|\beyebrow\b|rounded-full)/i.test(before);
      const centered = /text-center|text-align\s*:\s*center/i.test(ctx.text.slice(Math.max(0, h1 - 400), h1 + 400));
      if (badge && centered) out.push({ line: lineOf(ctx.text, h1), evidence: 'pill/badge + centered h1' });
      return out;
    },
  },
  {
    id: 'L2', sev: 'P0', det: 'code', title: 'Three identical icon-topped feature cards',
    why: 'Icon, three-word title, two lines of body, times three, all equally weighted.',
    fix: 'Rank them. Alternating rows, one showcase plus a list, or prose.',
    test(ctx) {
      const out = [];
      const css = stripComments(ctx.text);
      const gridCss = /grid-template-columns\s*:\s*repeat\(\s*3\s*,/i.test(css);
      const gridCls = ctx.classes.some((c) => /^(?:md:|lg:)?grid-cols-3$/.test(c.cls));
      if (!gridCss && !gridCls) return out;
      const svgCount = (ctx.text.match(/<svg\b/gi) || []).length;
      const iconish = svgCount >= 3 || (ctx.text.match(/<(?:i|span)\b[^>]*class(?:Name)?="[^"]*icon/gi) || []).length >= 3;
      if (iconish) {
        const idx = gridCls ? ctx.classes.find((c) => /grid-cols-3$/.test(c.cls)).index : css.search(/grid-template-columns/i);
        out.push({ line: lineOf(ctx.text, idx), evidence: `3-column grid + ${svgCount} icons` });
      }
      return out;
    },
  },
  {
    id: 'L3', sev: 'P1', det: 'code', title: 'Round-number stat strip',
    why: 'Three suspiciously round numbers in a row ("10,000+ · 99.9% · 4.9") claim nothing checkable.',
    fix: 'Use the real numbers, or cut the strip.',
    test(ctx) {
      const t = ctx.visible;
      const nums = t.match(/\b\d{1,3}(?:,\d{3})*\+|\b\d{2}(?:\.\d)?%|\b\d\.\d\s*(?:\/\s*5|stars?|★)|\b\d{1,3}(?:k|K|M)\+?\b/g) || [];
      if (nums.length >= 3) return [{ line: lineOf(ctx.text, ctx.text.indexOf(nums[0])), evidence: nums.slice(0, 4).join(' · ') }];
      return [];
    },
  },
  {
    id: 'L4', sev: 'P1', det: 'code', title: 'Decorative 01 / 02 / 03 markers',
    why: 'Zero-padded numbers on things that are not a sequence.',
    fix: 'Number only real steps or rankings.',
    test(ctx) {
      const hits = (ctx.visible.match(/(?:^|\s)0[1-9](?=\s|$)/gm) || []);
      if (hits.length >= 3) return [{ line: lineOf(ctx.text, ctx.text.search(/0[1-9]/)), evidence: hits.slice(0, 4).join(' ') }];
      return [];
    },
  },
  {
    id: 'L5', sev: 'P1', det: 'code', title: 'Cookie-cutter section order',
    why: 'Hero, logos, features, how-it-works, testimonials, stats, pricing, FAQ, final CTA. Interchangeable with any other page.',
    fix: 'Order sections by what this audience needs to decide, and cut the ones that carry nothing.',
    test(ctx) {
      const t = ctx.visible.toLowerCase();
      const marks = [
        [/trusted by|used by|loved by|as seen in/, 'logo cloud'],
        [/how it works|get started in|three steps/, 'how it works'],
        [/what (?:our )?(?:customers|users|clients) say|testimonial/, 'testimonials'],
        [/pricing|per month|\/mo\b|choose your plan/, 'pricing'],
        [/frequently asked|faq/, 'faq'],
        [/ready to (?:get started|start|try|transform)|start (?:your )?free trial/, 'final CTA'],
        [/features|everything you need/, 'features'],
        [/join \d|\d+\+? (?:customers|users|teams)/, 'social proof stats'],
      ];
      const found = marks.filter(([re]) => re.test(t)).map(([, n]) => n);
      if (found.length >= 5) return [{ line: 1, evidence: `${found.length} stock sections: ${found.join(', ')}` }];
      return [];
    },
  },
  {
    id: 'L6', sev: 'P2', det: 'code', title: 'One container width for every section',
    why: 'max-w-7xl mx-auto on everything means rhythm was never considered.',
    fix: 'Vary measure by section role. Prose wants a narrower column than a grid.',
    test(ctx) {
      const n = ctx.classes.filter((c) => /^max-w-(?:7xl|6xl|screen-xl)$/.test(c.cls)).length;
      const m = ctx.classes.filter((c) => c.cls === 'mx-auto').length;
      if (n >= 3 && m >= 3) return [{ line: lineOf(ctx.text, ctx.classes.find((c) => /^max-w-/.test(c.cls)).index), evidence: `${n}x max-w-7xl + ${m}x mx-auto` }];
      return [];
    },
  },

  /* ---- components / kit ---- */
  {
    id: 'K1', sev: 'P0', det: 'code', title: 'Untouched shadcn/ui base',
    why: 'Stock zinc/slate base colour and stock tokens: the kit was installed, not themed.',
    fix: 'Theme the base colour, the radius and at least the button and card primitives.',
    test(ctx) {
      const out = [];
      if (path.basename(ctx.file) === 'components.json') {
        const m = ctx.text.match(/"baseColor"\s*:\s*"(zinc|slate|neutral|gray|stone)"/);
        if (m) out.push({ line: lineOf(ctx.text, m.index), evidence: `baseColor: ${m[1]}` });
      }
      const known = ['240 5.9% 10%', '240 5.9% 10%', '0 0% 9%', '222.2 47.4% 11.2%', 'oklch(0.205 0 0)', 'oklch(0.208 0.042 265.755)'];
      const p = ctx.vars.get('--primary');
      if (p && known.includes(p.trim())) out.push({ line: ctx.varLine('--primary'), evidence: `--primary: ${p}` });
      return out;
    },
  },
  {
    id: 'K2', sev: 'P1', det: 'code', title: 'Icon in a tinted rounded square',
    why: 'Every feature gets the same 40px tinted chip with the same stroke icon inside.',
    fix: 'Make the icon treatment a real decision, or drop the chips and let the text rank itself.',
    test(ctx) {
      let pairs = 0, first = -1;
      for (const { cls, index } of ctx.classes) {
        if (!/^rounded-(?:md|lg|xl|2xl)$/.test(cls)) continue;
        const near = ctx.classes.filter((c) => Math.abs(c.index - index) < 250);
        const tinted = near.some((c) => /^bg-[a-z]+-\d{2,3}\/(?:5|10|15|20)$/.test(c.cls));
        const small = near.some((c) => /^(?:h|w|size)-(?:8|9|10|11|12|14)$/.test(c.cls));
        if (tinted && small) { pairs++; if (first < 0) first = index; }
      }
      return pairs >= 2 ? [{ line: lineOf(ctx.text, first), evidence: `${pairs} tinted icon chips` }] : [];
    },
  },
  {
    id: 'K3', sev: 'P1', det: 'code', title: 'Missing interaction states',
    why: 'No :focus-visible anywhere. Keyboard users get nothing, and it signals nobody used the page.',
    fix: 'Define :hover, :focus-visible, :active and :disabled, with a transition.',
    scope: 'page',
    test(ctx) {
      const interactive = /<(?:button|a|input|select|textarea)\b/i.test(ctx.text) || /onClick/.test(ctx.text);
      if (!interactive) return [];
      if (/focus-visible|:focus\b|focus:/.test(ctx.text)) return [];
      return [{ line: 1, evidence: 'interactive elements, no focus style' }];
    },
  },
  {
    id: 'K4', sev: 'P1', det: 'code', title: 'Stock effect-library components',
    why: 'Spotlight, BackgroundBeams, ShimmerButton and friends are recognisable on sight.',
    fix: 'Build one effect that belongs to this product, or ship none.',
    test(ctx) {
      const names = ['Spotlight', 'BackgroundBeams', 'AnimatedBeam', 'ShimmerButton', 'NumberTicker', 'BorderBeam', 'Meteors', 'SparklesCore', 'AuroraBackground', 'RetroGrid', 'TypewriterEffect', 'TextGenerateEffect', 'HeroHighlight', 'WavyBackground', 'InfiniteMovingCards', 'MagicCard', 'NeonGradientCard', 'ShineBorder', 'RainbowButton', 'FlipWords', 'MovingBorder', 'GlowingEffect', 'OrbitingCircles', 'DotPattern', 'GridPattern'];
      const out = [];
      for (const n of names) {
        const i = ctx.text.indexOf(`<${n}`);
        const j = ctx.text.search(new RegExp(`(?:magicui|aceternity)[/\\\\]${n}`, 'i'));
        if (i >= 0) out.push({ line: lineOf(ctx.text, i), evidence: `<${n}>` });
        else if (j >= 0) out.push({ line: lineOf(ctx.text, j), evidence: n });
      }
      return out;
    },
  },

  /* ---- icons ---- */
  {
    id: 'I1', sev: 'P1', det: 'code', title: 'Sparkles as the AI glyph',
    why: 'Nielsen Norman Group tested it: not one participant said "AI" when shown sparkles alone. It communicates nothing.',
    fix: 'Label the feature in words, or use a mark tied to what it actually does.',
    test(ctx) {
      const out = [];
      if (ctx.style.icons?.allowSparkles) return out;
      const re = /\u2728|\u2726|\u2727|\bSparkles\b/g;
      for (const m of ctx.text.matchAll(re)) out.push({ line: lineOf(ctx.text, m.index), evidence: m[0] });
      if (!out.length) for (const m of ctx.visible.matchAll(re)) out.push({ line: 1, evidence: m[0] });
      return out;
    },
  },
  {
    id: 'I2', sev: 'P1', det: 'code', title: 'The worn Lucide set',
    why: 'Zap, Rocket, Shield, BarChart3, ArrowRight, CheckCircle2: the same eight icons on every generated page.',
    fix: 'Pick icons for meaning, not for availability. A shield does not mean "secure" to anyone.',
    test(ctx) {
      const m = ctx.text.match(/from\s+['"]lucide-react['"]/);
      if (!m) return [];
      const imp = ctx.text.slice(Math.max(0, ctx.text.lastIndexOf('import', m.index)), m.index);
      const worn = ['Sparkles', 'Zap', 'Rocket', 'Shield', 'BarChart3', 'ArrowRight', 'CheckCircle2', 'CheckCircle', 'Star', 'Check'];
      const hit = worn.filter((w) => new RegExp(`\\b${w}\\b`).test(imp));
      return hit.length >= 3 ? [{ line: lineOf(ctx.text, m.index), evidence: hit.join(', ') }] : [];
    },
  },
  {
    id: 'I3', sev: 'P1', det: 'code', title: 'Emoji used as interface icons',
    why: 'Emoji in nav, headings or before every list item is a placeholder that shipped.',
    fix: 'A real icon set, or nothing. Emoji render differently on every platform.',
    test(ctx) {
      const out = [];
      if (ctx.style.icons?.allowEmoji) return out;
      const re = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{1F000}-\u{1F0FF}]/gu;
      const seen = [];
      for (const m of ctx.visible.matchAll(re)) seen.push(m[0]);
      if (seen.length >= 2) { const i = ctx.text.search(re); out.push({ line: i >= 0 ? lineOf(ctx.text, i) : 1, evidence: seen.slice(0, 6).join(' ') }); }
      return out;
    },
  },
  {
    id: 'I4', sev: 'P1', det: 'code', title: 'Placeholder identities and media',
    why: 'dicebear, pravatar, picsum and aspect-video grey boxes shipped as if they were content.',
    fix: 'Real avatars, real screenshots, or remove the slot.',
    test(ctx) {
      const out = [];
      const re = /dicebear|pravatar|boring-avatars|ui-avatars|robohash|randomuser\.me|placehold\.co|via\.placeholder|picsum\.photos|unsplash\.com\/random/gi;
      for (const m of ctx.text.matchAll(re)) out.push({ line: lineOf(ctx.text, m.index), evidence: m[0] });
      return out;
    },
  },

  /* ---- motion ---- */
  {
    id: 'M1', sev: 'P2', det: 'code', title: 'Same fade-up on every section',
    why: 'One reveal animation applied uniformly adds latency and no meaning.',
    fix: 'One or two staggered moments where the motion explains something.',
    test(ctx) {
      const out = [];
      if (ctx.style.motion?.allowUniformReveal) return [];
      const sig = [/whileInView/, /data-aos\s*=\s*["']fade-up/, /@keyframes\s+(?:fade-?in-?up|fadeUp|slide-?up)/i, /initial=\{\{\s*opacity:\s*0,\s*y:/];
      const hit = sig.filter((r) => r.test(ctx.text));
      if (hit.length) {
        const n = (ctx.text.match(/whileInView|data-aos=["']fade-up|animate-fade-up/g) || []).length;
        if (n >= 3 || hit.length >= 2) out.push({ line: lineOf(ctx.text, ctx.text.search(hit[0])), evidence: `${n || hit.length} fade-up reveals` });
      }
      return out;
    },
  },
  {
    id: 'M2', sev: 'P1', det: 'code', title: 'Animation without prefers-reduced-motion',
    why: 'Motion with no reduced-motion branch is an accessibility failure, not a taste call.',
    fix: 'Wrap motion in @media (prefers-reduced-motion: no-preference), or honour the query.',
    scope: 'page',
    test(ctx) {
      if (ctx.style.motion?.requireReducedMotion === false) return [];
      const animated = /@keyframes|animation\s*:|transition\s*:|framer-motion|gsap|data-aos/.test(ctx.text);
      if (!animated) return [];
      if (/prefers-reduced-motion|useReducedMotion|reducedMotion/.test(ctx.text)) return [];
      return [{ line: 1, evidence: 'animation present, no reduced-motion handling' }];
    },
  },
  {
    id: 'M3', sev: 'P2', det: 'code', title: 'Bounce / elastic easing',
    why: 'Overshooting easing on UI makes a product feel like a toy.',
    fix: 'Ease out without overshoot. 150-250ms.',
    test(ctx) {
      const out = [];
      if (ctx.style.motion?.allowBounce) return out;
      const re = /cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/gi;
      let m;
      while ((m = re.exec(ctx.text))) {
        const ys = [+m[2], +m[4]];
        if (ys.some((y) => y > 1.05 || y < -0.05)) out.push({ line: lineOf(ctx.text, m.index), evidence: m[0] });
      }
      for (const m2 of ctx.text.matchAll(/animate-bounce|easeOutBack|easeInOutBack|elastic/g)) out.push({ line: lineOf(ctx.text, m2.index), evidence: m2[0] });
      return out;
    },
  },

  /* ---- copy ---- */
  {
    id: 'P1', sev: 'P1', det: 'code', title: 'Vague aspirational headline',
    why: 'A headline that would fit any product tells the reader nothing.',
    fix: 'Say what it does, for whom, and what changes. Specific beats inspiring.',
    test(ctx) {
      const pats = [/\belevate your\b/i, /\bbuild the future\b/i, /\ball[- ]in[- ]one (?:platform|solution|workspace|tool)\b/i, /\bscale without limits\b/i, /\bunleash the (?:power|potential)\b/i, /\brevolutioni[sz]e (?:your|the way)\b/i, /\btransform (?:your|the way|how)\b/i, /\bsupercharge your\b/i, /\breimagine (?:your|how)\b/i, /\bnext[- ]generation\b/i, /\bthe future of [a-z ]+ is here\b/i, /\beverything you need to\b/i, /\btake your [a-z ]+ to the next level\b/i, /\bwhere [a-z ]+ meets [a-z ]+\b/i];
      const out = [];
      for (const p of pats) { const m = ctx.visible.match(p); if (m) out.push({ line: lineOf(ctx.text, Math.max(0, ctx.text.search(p))), evidence: m[0] }); }
      return out;
    },
  },
  {
    id: 'P2', sev: 'P2', det: 'code', title: 'Generic superlatives',
    why: 'seamless, powerful, robust, cutting-edge: words that survive because they commit to nothing.',
    fix: 'Replace each with a number, a verb, or a checkable claim.',
    test(ctx) {
      const voc = ctx.style.copy?.vocabulary || {};
      const allow = new Set((voc.allow || []).map((w) => String(w).toLowerCase()));
      const words = ['seamless', 'seamlessly', 'cutting-edge', 'best-in-class', 'world-class', 'powerful', 'robust', 'effortless', 'effortlessly', 'game-changing', 'next-level', 'state-of-the-art', 'revolutionary', 'blazing fast', 'lightning fast', 'unparalleled', 'leverage']
        .filter((w) => !allow.has(w))
        .concat((voc.ban || []).map((w) => String(w).toLowerCase()));
      const out = [];
      for (const w of words) {
        const re = new RegExp(`\\b${w.replace(/[-\s]/g, '[-\\s]')}\\b`, 'i');
        const m = ctx.visible.match(re);
        if (m) out.push({ line: lineOf(ctx.text, Math.max(0, ctx.text.search(re))), evidence: m[0] });
      }
      return out;
    },
  },
  {
    id: 'P3', sev: 'P1', det: 'code', title: 'Arrow welded to every link',
    why: 'Learn more -> on every CTA. The arrow is decoration standing in for a verb.',
    fix: 'Name the action and its object: "See the pricing", "Read the spec".',
    test(ctx) {
      const out = [];
      if (ctx.style.copy?.allowArrowsInCta) return out;
      for (const m of ctx.visible.matchAll(/[^\n]{0,40}?[\u2192\u27F6\u279C\u2794]\s*$/gm)) {
        const frag = m[0].trim();
        if (frag.length > 1) { const i = ctx.text.indexOf(frag); out.push({ line: i >= 0 ? lineOf(ctx.text, i) : 1, evidence: frag.slice(0, 40) }); }
      }
      return out;
    },
  },
  {
    id: 'P4', sev: 'P2', det: 'code', title: 'Tricolon slogan',
    why: '"Faster. Smarter. Simpler." Three adjectives in a row is rhythm pretending to be substance.',
    fix: 'One concrete claim.',
    test(ctx) {
      const m = ctx.visible.match(/\b(\w+(?:er|ly|est))[.,]\s+(\w+(?:er|ly|est))[.,]\s+(\w+(?:er|ly|est))\b[.!]?/i);
      return m ? [{ line: lineOf(ctx.text, Math.max(0, ctx.text.indexOf(m[0]))), evidence: m[0] }] : [];
    },
  },
  {
    id: 'P5', sev: 'P2', det: 'code', title: 'Generic CTA labels',
    why: '"Get started" / "Learn more" / "Click here" name no action and no destination.',
    fix: 'Verb plus object, and keep the verbs consistent across the page.',
    test(ctx) {
      const out = [];
      if (ctx.style.copy?.allowGenericCta) return out;
      for (const m of ctx.text.matchAll(/>\s*(Get [Ss]tarted|Learn [Mm]ore|Click [Hh]ere|Submit|Read [Mm]ore)\s*(?:<|\u2192)/g)) {
        out.push({ line: lineOf(ctx.text, m.index), evidence: m[1] });
      }
      return out;
    },
  },

  /* ---- second-order defaults ---- */
  {
    id: 'SD1', sev: 'P1', det: 'code', title: 'Cream ground + terracotta accent',
    why: 'The "tasteful" escape from purple became its own default. #F4F1EA with #D97757 is now a signature.',
    fix: 'Derive ground and accent from the subject, or move off those coordinates.',
    test(ctx) {
      const cream = ctx.colors.find((c) => isCream(c) && !ctx.onBrand(c));
      const terra = ctx.colors.find((c) => isTerracotta(c) && !ctx.onBrand(c));
      if (cream && terra) return [{ line: lineOf(ctx.text, terra.index), evidence: `${cream.raw} ground + ${terra.raw} accent` }];
      return [];
    },
  },
  {
    id: 'SD2', sev: 'P1', det: 'code', title: 'Near-black + acid accent',
    why: 'Near-black ground with one lime or vermilion accent is the other post-purple default.',
    fix: 'Go dark only if the product earns it, and choose the signal colour for meaning.',
    test(ctx) {
      const black = ctx.colors.find((c) => isNearBlack(c) && !ctx.onBrand(c));
      const acid = ctx.colors.find((c) => isAcidGreen(c) && !ctx.onBrand(c));
      if (black && acid) return [{ line: lineOf(ctx.text, acid.index), evidence: `${black.raw} ground + ${acid.raw} accent` }];
      return [];
    },
  },
  {
    id: 'SD3', sev: 'P2', det: 'code', title: 'Emerald as the purple-avoiding accent',
    why: 'Tailwind emerald-500 is what a model reaches for once told not to use purple.',
    fix: 'Tie the accent to the brand or the subject and give it a job.',
    test(ctx) {
      const out = [];
      for (const { cls, index } of ctx.classes) if (/^(?:bg|text|border|from|to|ring)-emerald-\d{2,3}$/.test(cls)) out.push({ line: lineOf(ctx.text, index), evidence: cls });
      if (ctx.hasBrandPalette) { const ok = ctx.colors.find((c) => isEmerald(c) && ctx.onBrand(c)); if (ok) return []; }
      const e = ctx.colors.find((c) => isEmerald(c) && c.s > 55);
      if (e && !out.length) out.push({ line: lineOf(ctx.text, e.index), evidence: e.raw });
      return out;
    },
  },
  {
    id: 'SD4', sev: 'P2', det: 'code', title: 'Template chrome bundle',
    why: 'Mono micro-labels, middle-dot meta strings and WORD-em-dash-fragment labels travel together.',
    fix: 'Keep a label only if it carries information.',
    test(ctx) {
      let n = 0; const ev = [];
      if ((ctx.visible.match(/\S+\s+\u00B7\s+\S+/g) || []).length >= 2) { n++; ev.push('A · B · C meta strings'); }
      if (/font-mono|font-family\s*:\s*(?:ui-)?monospace|'JetBrains|Menlo|Consolas/i.test(ctx.text) && /text-xs|font-size\s*:\s*1[0-2]px/.test(ctx.text)) { n++; ev.push('mono micro-labels'); }
      if ((ctx.visible.match(/\b[A-Z]{3,}\s+\u2014\s+[a-z]/g) || []).length >= 1) { n++; ev.push('WORD — fragment'); }
      return n >= 2 ? [{ line: 1, evidence: ev.join(' + ') }] : [];
    },
  },

  /* ---- drift from the brand's own declared decisions ---- */
  {
    id: 'X1', sev: 'P2', det: 'code', title: 'Colour off the declared palette',
    why: 'The palette file names the colours this brand owns. Anything else arrived without a decision.',
    fix: 'Use a declared colour, or add this one to unslop.palette.json with the job it does.',
    test(ctx) {
      if (!ctx.hasBrandPalette || ctx.palette.allowOffPaletteDecoration) return [];
      const out = [];
      const seen = new Set();
      for (const c of ctx.colors) {
        if (isNeutral(c) && ctx.palette.neutralsAlwaysAllowed !== false) continue;
        if (c.a < 0.25) continue;
        if (ctx.onBrand(c)) continue;
        const key = `${Math.round(c.h / 6)}:${Math.round(c.s / 10)}:${Math.round(c.l / 10)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ line: lineOf(ctx.text, c.index), evidence: `${c.raw} is not in the ${ctx.palette.name || 'declared'} palette` });
      }
      return out;
    },
  },
  {
    id: 'X2', sev: 'P2', det: 'code', title: 'Radius off the declared scale',
    why: 'The style file fixes a radius scale. A value off it is a one-off nobody chose.',
    fix: 'Round to the nearest value on the scale, or widen the scale on purpose.',
    test(ctx) {
      if (ctx.style.radius?.policy !== 'scale') return [];
      const out = [];
      const css = stripComments(ctx.text);
      const re = /border-radius\s*:\s*([^;}]+)/gi;
      let m;
      const seen = new Set();
      while ((m = re.exec(css))) {
        for (const tok of m[1].trim().split(/\s+/)) {
          const px = /rem$/.test(tok) ? parseFloat(tok) * 16 : /px$/.test(tok) ? parseFloat(tok) : null;
          if (px === null || Number.isNaN(px)) continue;
          if (radiusAllowed(px, ctx.style)) continue;
          if (seen.has(px)) continue;
          seen.add(px);
          out.push({ line: lineOf(ctx.text, m.index), evidence: `${tok} is not on [${(ctx.style.radius.scale || []).join(', ')}]` });
        }
      }
      return out;
    },
  },

  /* ---- fingerprints ---- */
  {
    id: 'F1', sev: 'P1', det: 'code', title: 'Builder signature left in',
    why: 'A generator tag shipped to production.',
    fix: 'Remove it unless the builder licence requires attribution.',
    test(ctx) {
      const out = [];
      for (const m of ctx.text.matchAll(/lovable-tagger|lovable\.dev|gpt-engineer|v0\.dev|v0\.app|bolt\.new|<meta[^>]+name=["']generator["'][^>]*>/gi)) {
        out.push({ line: lineOf(ctx.text, m.index), evidence: m[0].slice(0, 60) });
      }
      return out;
    },
  },
];

/* ------------------------------------------------------------------ scoring */

function score(findings) {
  const byRule = new Map();
  for (const f of findings) {
    if (!byRule.has(f.id)) byRule.set(f.id, []);
    byRule.get(f.id).push(f);
  }
  let raw = 0;
  for (const [, hits] of byRule) {
    const n = Math.min(hits.length, MAX_HITS_PER_RULE);
    raw += SEV_WEIGHT[hits[0].sev] * (1 + (n - 1) * 0.35);
  }
  const distinct = [...byRule.values()].filter((h) => h[0].sev !== 'P2').length;
  let mult = 1;
  if (distinct >= 6) mult = 1.6;
  else if (distinct >= 3) mult = 1.3;
  const total = Math.min(100, Math.round(raw * mult));
  const verdict = total >= 50 ? 'ai slop' : total >= 25 ? 'slop-leaning' : total >= 10 ? 'traces' : 'clean';
  return { score: total, verdict, distinctSignificant: distinct, clusterMultiplier: mult, rulesFired: byRule.size };
}

/* -------------------------------------------------------------- direction  */

/** Fingerprint the page's actual direction, so repeat runs can be caught. */
function direction(vars, colors) {
  const pick = (names) => { for (const n of names) { const v = vars.get(n); const c = v && parseColor(v.split(/\s+/).find((p) => parseColor(p)) || v); if (c) return c; } return null; };
  // the sort was backwards: a ground is the most extreme lightness on the page,
  // not the one nearest mid-grey
  const ground = pick(['--background', '--bg', '--ground', '--paper', '--canvas', '--surface',
    '--color-background', '--base', '--field', '--page', '--body', '--backdrop', '--shell'])
    || [...colors].filter((c) => c.a > 0.9)
      .sort((x, y) => (Math.min(100 - x.l, x.l) - Math.min(100 - y.l, y.l)))[0]
    || null;
  const signal = pick(['--primary', '--accent', '--signal', '--brand', '--mark', '--highlight'])
    || colors.filter((c) => c.s > 40 && c.l > 20 && c.l < 80).sort((x, y) => y.s - x.s)[0]
    || null;
  const fmt = (c) => (c ? { h: Math.round(c.h), s: Math.round(c.s), l: Math.round(c.l) } : null);
  return { ground: fmt(ground), signal: fmt(signal) };
}

function historyPath(root) { return path.join(root, '.unslop', 'history.json'); }

function readHistory(root) {
  try { return JSON.parse(fs.readFileSync(historyPath(root), 'utf8')); } catch { return { runs: [] }; }
}

function repeatOfPrevious(dir, hist) {
  if (!dir.ground || !dir.signal) return null;
  for (const run of hist.runs || []) {
    const g = run.direction?.ground, s = run.direction?.signal;
    if (!g || !s) continue;
    if (hueDist(g.h, dir.ground.h) < 14 && Math.abs(g.l - dir.ground.l) < 9 &&
        hueDist(s.h, dir.signal.h) < 14 && Math.abs(s.l - dir.signal.l) < 12) {
      return run;
    }
  }
  return null;
}

/* --------------------------------------------------------------------- main */

function parseArgs(argv) {
  const o = { paths: [], json: false, min: null, maxScore: null, strict: false, includeExamples: false, rules: false, record: null, profile: null,
    config: null, palette: null, style: null, noConfig: false, initConfig: false };
  for (const a of argv) {
    if (a === '--json') o.json = true;
    else if (a === '--strict') o.strict = true;
    else if (a === '--include-examples') o.includeExamples = true;
    else if (a === '--rules') o.rules = true;
    else if (a.startsWith('--min=')) o.min = a.slice(6).toUpperCase();
    else if (a.startsWith('--max-score=')) o.maxScore = +a.slice(12);
    else if (a.startsWith('--record=')) o.record = a.slice(9);
    else if (a.startsWith('--profile=')) o.profile = a.slice(10);
    else if (a.startsWith('--config=')) o.config = a.slice(9);
    else if (a.startsWith('--palette=')) o.palette = a.slice(10);
    else if (a.startsWith('--style=')) o.style = a.slice(8);
    else if (a === '--no-config') o.noConfig = true;
    else if (a === '--init-config') o.initConfig = true;
    else if (a.startsWith('-')) { console.error(`unslop: unknown flag ${a}`); process.exit(1); }
    else o.paths.push(a);
  }
  return o;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.rules) {
    for (const r of RULES) console.log(`${r.id.padEnd(5)} ${r.sev}  ${r.title}`);
    process.exit(0);
  }

  if (opts.initConfig) {
    const dir = opts.paths[0] || '.';
    let wrote = 0;
    for (const [name, body] of [[PALETTE_FILE, SAMPLE_PALETTE], [STYLE_FILE, SAMPLE_STYLE]]) {
      const target = path.join(dir, name);
      if (fs.existsSync(target)) { console.log(`exists, left alone:  ${target}`); continue; }
      fs.writeFileSync(target, body);
      console.log(`wrote  ${target}`);
      wrote++;
    }
    console.log(wrote ? '\nEdit both, then run the scanner again. What you declare stops being judged by the default catalog.' : '\nNothing to write.');
    process.exit(0);
  }
  if (!opts.paths.length) {
    console.error('unslop ui — usage: node detect-ui.mjs <paths...> [--json] [--min=P1] [--max-score=25] [--strict] [--record=name]');
    process.exit(1);
  }

  const files = [];
  for (const p of opts.paths) for (const f of walk(p, opts)) files.push(f);
  const uniq = [...new Set(files)];
  const loaded = [];
  for (const f of uniq) {
    let text;
    try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
    if (!opts.includeExamples && /slop-example/.test(text)) continue;
    loaded.push({ file: f, text });
  }
  if (!loaded.length) { console.error('unslop: no scannable files found'); process.exit(1); }

  const firstPath = opts.paths[0];
  const startDir = (() => {
    try { return fs.statSync(firstPath).isDirectory() ? firstPath : path.dirname(firstPath); }
    catch { return process.cwd(); }
  })();
  let cfg;
  try {
    cfg = loadConfig(startDir, opts);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  cfg.palette.__parse = parseColor;
  const brandPalette = hasPalette(cfg.palette);
  const onBrand = (c) => (brandPalette ? !!paletteMatch(c, cfg.palette) : false);

  if (opts.min === null) opts.min = (cfg.style.thresholds?.min || 'P2').toUpperCase();
  if (opts.maxScore === null) {
    const t = cfg.style.thresholds?.maxScore;
    opts.maxScore = typeof t === 'number' ? t : DEFAULT_MAX_SCORE;
  }

  const vars = collectVars(loaded);
  const varLineCache = new Map();
  for (const { file, text } of loaded) {
    const re = /(--[a-z0-9-]+)\s*:/gi; let m;
    while ((m = re.exec(text))) if (!varLineCache.has(m[1].toLowerCase())) varLineCache.set(m[1].toLowerCase(), lineOf(text, m.index));
    void file;
  }

  const minRank = { P0: 0, P1: 1, P2: 2 }[opts.min] ?? 2;
  const findings = [];

  for (const { file, text } of loaded) {
    const ext = path.extname(file);
    const rel = path.relative(process.cwd(), file) || file;
    const fileIgnore = text.match(/unslop-ignore-file:?\s*([A-Z0-9, ]*)/);
    const fileIgnoreIds = fileIgnore ? fileIgnore[1].split(/[,\s]+/).filter(Boolean) : null;
    if (fileIgnore && fileIgnoreIds.length === 0) continue;

    const ctx = {
      file, rel, ext, text,
      vars,
      colors: colorsIn(text, vars),
      classes: classesIn(text),
      visible: visibleTextOf(text, ext),
      varLine: (n) => varLineCache.get(n.toLowerCase()) || 1,
      style: cfg.style,
      palette: cfg.palette,
      hasBrandPalette: brandPalette,
      onBrand,
    };

    const lines = text.split('\n');
    for (const rule of RULES) {
      const override = ruleOverride(rule.id, cfg.style);
      if (override === 'off') continue;
      const sev = override || rule.sev;
      if ({ P0: 0, P1: 1, P2: 2 }[sev] > minRank) continue;
      if (fileIgnoreIds && fileIgnoreIds.includes(rule.id)) continue;
      let hits = [];
      try { hits = rule.test(ctx) || []; } catch { hits = []; }
      for (const h of hits) {
        const ln = h.line || 1;
        const here = (lines[ln - 1] || '') + ' ' + (lines[ln - 2] || '');
        const ig = here.match(/unslop-ignore:?\s*([A-Z0-9, ]+)/);
        if (ig && ig[1].split(/[,\s]+/).includes(rule.id)) continue;
        findings.push({ id: rule.id, sev, det: rule.det, title: rule.title, why: rule.why, fix: rule.fix, file: rel, line: ln, evidence: String(h.evidence || '').replace(/\s+/g, ' ').slice(0, 90) });
      }
    }
  }

  const allColors = loaded.flatMap(({ text }) => colorsIn(text, vars));
  const dir = direction(vars, allColors);
  const root = fs.statSync(opts.paths[0]).isDirectory() ? opts.paths[0] : path.dirname(opts.paths[0]);
  const hist = readHistory(root);
  let repeat = repeatOfPrevious(dir, hist);
  // A declared brand is supposed to look like itself: repeating a direction the
  // palette file fixes is loyalty, not laziness. SD0 only means something for
  // choices that were still open.
  if (repeat && brandPalette) {
    const groundOnBrand = dir.ground && onBrand({ h: dir.ground.h, s: dir.ground.s, l: dir.ground.l, a: 1 });
    const signalOnBrand = dir.signal && onBrand({ h: dir.signal.h, s: dir.signal.s, l: dir.signal.l, a: 1 });
    if (groundOnBrand && signalOnBrand) repeat = null;
  }
  if (repeat) {
    findings.push({ id: 'SD0', sev: 'P1', det: 'code', title: 'Repeat of a direction you already used', why: `Ground and signal match the run recorded as "${repeat.name}" on ${repeat.date}. Varying across runs is the point.`, fix: 'Derive a different direction from this subject, not from your last one.', file: path.relative(process.cwd(), historyPath(root)), line: 1, evidence: `matches ${repeat.name}` });
  }

  const s = score(findings);

  if (opts.record) {
    try {
      fs.mkdirSync(path.join(root, '.unslop'), { recursive: true });
      hist.runs = (hist.runs || []).slice(-19);
      hist.runs.push({ name: opts.record, date: new Date().toISOString().slice(0, 10), score: s.score, direction: dir });
      fs.writeFileSync(historyPath(root), JSON.stringify(hist, null, 2) + '\n');
    } catch (e) { console.error(`unslop: could not record history (${e.message})`); }
  }

  const payload = {
    tool: 'unslop-ui', version: '0.2.0', filesScanned: loaded.length, ...s,
    threshold: opts.maxScore, direction: dir,
    config: { configured: cfg.configured, sources: cfg.sources, brand: cfg.palette.name || null },
    findings,
  };

  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    const order = { P0: 0, P1: 1, P2: 2 };
    findings.sort((a, b) => order[a.sev] - order[b.sev] || a.id.localeCompare(b.id) || a.line - b.line);
    console.log(`\nunslop ui — ${loaded.length} file(s) scanned`);
    if (cfg.configured) {
      console.log(`config: ${cfg.sources.map((f) => path.basename(f)).join(' + ')}${cfg.palette.name ? ` · brand ${cfg.palette.name}` : ''}`);
    } else {
      console.log('config: none (default catalog) — run with --init-config to declare a brand');
    }
    console.log(`score ${s.score}/100  ·  ${s.verdict}  ·  ${s.rulesFired} rule(s) fired  ·  cluster x${s.clusterMultiplier}`);
    if (dir.ground || dir.signal) {
      const f = (c) => (c ? `hsl(${c.h} ${c.s}% ${c.l}%)` : 'n/a');
      console.log(`direction: ground ${f(dir.ground)} · signal ${f(dir.signal)}`);
    }
    let last = null;
    for (const f of findings) {
      if (f.sev !== last) { console.log(`\n${f.sev}`); last = f.sev; }
      console.log(`  ${f.id.padEnd(4)} ${f.file}:${f.line}  ${f.title}`);
      console.log(`       ${f.evidence}`);
    }
    if (!findings.length) console.log('\nNo tells above the reporting threshold.');
    console.log('');
  }

  if (opts.strict && findings.some((f) => f.sev === 'P0')) process.exit(2);
  process.exit(s.score >= opts.maxScore ? 2 : 0);
}

main();
