/**
 * unslop — configuration
 *
 * Two optional files make the catalog answer to a brand instead of to a default:
 *
 *   unslop.palette.json   the colours this brand actually owns, with roles
 *   unslop.style.json     the shape, type, motion and copy decisions already made
 *
 * The point is not to silence the scanner. It is to move the question from
 * "is this colour violet?" to "is this colour a decision somebody made?".
 * A violet brand stops being flagged for violet, and starts being flagged for
 * the day a page drifts off its own palette.
 *
 * Both files are plain JSON and both accept // and /* *\/ comments.
 * Discovery walks up from the scanned path; --config, --palette and --style win.
 */

import fs from 'node:fs';
import path from 'node:path';

export const PALETTE_FILE = 'unslop.palette.json';
export const STYLE_FILE = 'unslop.style.json';

export const DEFAULT_STYLE = {
  radius: { policy: 'any', scale: null, tolerance: 1 },
  shadow: { policy: 'neutral' },
  glass: { allow: false },
  gradients: { allow: false },
  fonts: { display: [], body: [], mono: [], allowSystemStack: false },
  motion: { requireReducedMotion: true, allowBounce: false, allowUniformReveal: false },
  icons: { allowEmoji: false, allowSparkles: false },
  copy: { allowArrowsInCta: false, allowGenericCta: false, vocabulary: { allow: [], ban: [] } },
  rules: {},
  thresholds: { maxScore: 25, min: 'P2' },
  text: { lang: 'auto', maxScore: 25, allowWords: [], banWords: [] },
};

export const DEFAULT_PALETTE = {
  name: null,
  colors: {},
  tolerance: { hue: 12, sat: 18, light: 14 },
  neutralsAlwaysAllowed: true,
  allowOffPaletteDecoration: false,
};

/** JSON with comments, because a config nobody can annotate gets copied blindly. */
function parseJsonc(src, file) {
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'\\])\/\/.*$/gm, '$1');
  try {
    return JSON.parse(stripped);
  } catch (e) {
    throw new Error(`unslop: ${file} is not valid JSON — ${e.message}`);
  }
}

function readIfPresent(file) {
  try {
    if (!fs.statSync(file).isFile()) return null;
  } catch { return null; }
  return parseJsonc(fs.readFileSync(file, 'utf8'), path.basename(file));
}

function findUp(startDir, name, levels = 6) {
  let dir = path.resolve(startDir);
  for (let i = 0; i <= levels; i++) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) return candidate;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
function deepMerge(base, over) {
  if (!isObj(over)) return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = isObj(v) && isObj(base?.[k]) ? deepMerge(base[k], v) : v;
  }
  return out;
}

/**
 * @param {string} startDir where to start looking
 * @param {{config?:string, palette?:string, style?:string, noConfig?:boolean}} opts
 */
export function loadConfig(startDir, opts = {}) {
  const sources = [];
  if (opts.noConfig) {
    return { palette: { ...DEFAULT_PALETTE }, style: { ...DEFAULT_STYLE }, sources, configured: false };
  }

  const paletteFile = opts.palette
    || (opts.config ? path.join(opts.config, PALETTE_FILE) : null)
    || findUp(startDir, PALETTE_FILE);
  const styleFile = opts.style
    || (opts.config ? path.join(opts.config, STYLE_FILE) : null)
    || findUp(startDir, STYLE_FILE);

  let palette = { ...DEFAULT_PALETTE };
  let style = { ...DEFAULT_STYLE };

  const rawPalette = paletteFile && readIfPresent(paletteFile);
  if (rawPalette) { palette = deepMerge(DEFAULT_PALETTE, rawPalette); sources.push(paletteFile); }

  const rawStyle = styleFile && readIfPresent(styleFile);
  if (rawStyle) { style = deepMerge(DEFAULT_STYLE, rawStyle); sources.push(styleFile); }

  return { palette, style, sources, configured: sources.length > 0 };
}

/* ------------------------------------------------------------------ colour */

const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

/** Is this colour one the brand declared, within tolerance? */
export function paletteMatch(color, palette) {
  if (!color || !palette || !palette.colors) return null;
  const tol = palette.tolerance || DEFAULT_PALETTE.tolerance;
  for (const [role, raw] of Object.entries(palette.colors)) {
    const c = typeof raw === 'string' ? raw : raw?.value;
    const parsed = typeof c === 'string' ? palette.__parse?.(c) : null;
    if (!parsed) continue;
    // a near-neutral declared colour only needs lightness to agree
    const neutral = parsed.s < 10 || color.s < 10;
    const hueOk = neutral || hueDist(parsed.h, color.h) <= tol.hue;
    const satOk = Math.abs(parsed.s - color.s) <= tol.sat;
    const lightOk = Math.abs(parsed.l - color.l) <= tol.light;
    if (hueOk && satOk && lightOk) return role;
  }
  return null;
}

export function hasPalette(palette) {
  return !!(palette && palette.colors && Object.keys(palette.colors).length);
}

/** Near-greys are structural, not brand decisions. */
export function isNeutral(c) {
  return !!c && (c.s < 8 || c.l > 96 || c.l < 5);
}

/* ------------------------------------------------------------- style gates */

export function radiusAllowed(px, style) {
  const r = style?.radius || DEFAULT_STYLE.radius;
  if (r.policy === 'any' || !Array.isArray(r.scale) || !r.scale.length) return true;
  const tol = typeof r.tolerance === 'number' ? r.tolerance : 1;
  return r.scale.some((v) => Math.abs(v - px) <= tol);
}

export function fontDeclared(family, style) {
  const f = style?.fonts || DEFAULT_STYLE.fonts;
  const all = [...(f.display || []), ...(f.body || []), ...(f.mono || [])].map((x) => String(x).toLowerCase());
  return all.includes(String(family).toLowerCase());
}

export function hasDeclaredFonts(style) {
  const f = style?.fonts || DEFAULT_STYLE.fonts;
  return !!((f.display || []).length || (f.body || []).length || (f.mono || []).length);
}

/** "off" removes a rule; "P0"|"P1"|"P2" re-ranks it. */
export function ruleOverride(id, style) {
  const o = style?.rules || {};
  const v = o[id];
  if (v === undefined || v === null) return null;
  if (v === false || String(v).toLowerCase() === 'off') return 'off';
  const s = String(v).toUpperCase();
  return ['P0', 'P1', 'P2'].includes(s) ? s : null;
}

/* --------------------------------------------------------------- scaffold */

export const SAMPLE_PALETTE = `{
  // unslop.palette.json — the colours this brand owns, with the job each one does.
  // Declared colours are decisions, so the hue rules (C1, C2, SD1-SD3) stop firing
  // on them. Anything that is NOT in here starts being reported as drift (X1).
  "name": "Acme",

  "colors": {
    "ground":  "#000000",
    "surface": "#333333",
    "ink":     "#ffffff",
    "muted":   "#a1a1a1",
    "signal":  "#ff6a00",
    "lift":    "#ff9f1c"
  },

  // how far a colour may sit from a declared one and still count as that colour
  "tolerance": { "hue": 12, "sat": 18, "light": 14 },

  // near-greys are structure, not brand: never reported as drift
  "neutralsAlwaysAllowed": true,

  // true if decorative one-offs outside the palette are fine
  "allowOffPaletteDecoration": false
}
`;

export const SAMPLE_STYLE = `{
  // unslop.style.json — the shape, type, motion and copy decisions already made.
  // Everything here is optional. What you declare stops being judged by the
  // default catalog and starts being judged against your own choice.

  // "any" ignores radius. "scale" reports radii that are not on the scale (X2).
  "radius": { "policy": "scale", "scale": [0, 2, 6, 14], "tolerance": 1 },

  // "none" reports every shadow, "neutral" reports coloured ones, "any" ignores them
  "shadow": { "policy": "neutral" },

  "glass": { "allow": false },
  "gradients": { "allow": false },

  // declared faces are decisions: T1 and T2 stop firing on them
  "fonts": {
    "display": ["Söhne"],
    "body": ["Söhne"],
    "mono": ["Berkeley Mono"],
    "allowSystemStack": false
  },

  "motion": {
    "requireReducedMotion": true,
    "allowBounce": false,
    "allowUniformReveal": false
  },

  "icons": { "allowEmoji": false, "allowSparkles": false },

  "copy": {
    "allowArrowsInCta": false,
    "allowGenericCta": false,
    // words this product owns, and words it refuses, whatever the catalog says
    "vocabulary": { "allow": [], "ban": [] }
  },

  // per-rule: "off" removes it, "P0"|"P1"|"P2" re-ranks it
  "rules": {},

  "thresholds": { "maxScore": 25, "min": "P2" },

  // prose side (/unslop text)
  "text": {
    "lang": "auto",
    "maxScore": 25,
    "allowWords": [],
    "banWords": []
  }
}
`;
