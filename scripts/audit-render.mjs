#!/usr/bin/env node
/**
 * unslop — render audit
 *
 * The other two scanners read source. This one opens the page in headless
 * Chrome at several widths and measures what actually got drawn, because a
 * page can be free of every tell in the catalog and still ship with its text
 * stacked on itself at 420px.
 *
 * It finds: text overlapping other text, text clipped by its own box, content
 * escaping the viewport, horizontal page scroll, text under a legible size,
 * contrast failures measured against the real painted background, and tap
 * targets too small to hit.
 *
 * No dependencies: it drives Chrome over the DevTools Protocol using Node's
 * built-in WebSocket (Node 22+).
 *
 * Usage:
 *   node audit-render.mjs <file-or-url> [--widths=1280,768,420] [--json]
 *                         [--chrome=<path>] [--max=N] [--min-font=12]
 * Exit codes: 0 clean · 2 findings at or above the gate · 1 usage/launch error
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_WIDTHS = [1280, 768, 420];
const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

const SEV_WEIGHT = { P0: 10, P1: 4, P2: 1 };

/* ------------------------------------------------------------------- chrome */

function findChrome(explicit) {
  if (explicit) return explicit;
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const c of CHROME_CANDIDATES) if (fs.existsSync(c)) return c;
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForEndpoint(port, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return await res.json();
    } catch { /* not up yet */ }
    await sleep(120);
  }
  throw new Error('Chrome did not open a debugging port in time');
}

/** Minimal CDP client over the built-in WebSocket. */
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.listeners.get(msg.method) || []) fn(msg.params);
      }
    });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error(`cannot connect to ${url}`)), { once: true });
    });
    return new CDP(ws);
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }
  close() { try { this.ws.close(); } catch { /* already gone */ } }
}

/* --------------------------------------------------- the in-page audit ---- */
/* Runs inside the page. Returns plain data, never a DOM node. */

const PAGE_AUDIT = (minFont) => `(() => {
  const MIN_FONT = ${minFont};
  const out = [];
  const vw = window.innerWidth, vh = window.innerHeight;

  const add = (code, sev, el, message, extra) => out.push({
    code, sev, message,
    selector: sel(el), text: textOf(el).slice(0, 70), ...extra,
  });

  function sel(el) {
    if (!el || !el.tagName) return '?';
    if (el.id) return '#' + el.id;
    const parts = [];
    let n = el, depth = 0;
    while (n && n.tagName && depth < 4) {
      let s = n.tagName.toLowerCase();
      if (n.id) { parts.unshift('#' + n.id); break; }
      const cls = (n.className && typeof n.className === 'string')
        ? n.className.trim().split(/\\s+/).filter(Boolean).slice(0, 2) : [];
      if (cls.length) s += '.' + cls.join('.');
      parts.unshift(s);
      n = n.parentElement; depth++;
    }
    return parts.join(' > ');
  }

  function textOf(el) {
    let t = '';
    for (const node of el.childNodes) if (node.nodeType === 3) t += node.nodeValue;
    return t.replace(/\\s+/g, ' ').trim();
  }

  function visible(el, cs) {
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    if (parseFloat(cs.opacity) < 0.08) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    return true;
  }

  /* Text put offscreen on purpose, for screen readers only: a skip link, a
     table header replaced by per-cell labels, a label for an icon-only
     control. It is meant to be clipped and offscreen, so measuring it as a
     layout fault reports every accessible page as broken. Matches the two
     patterns in general use plus a 1px box that hides its overflow. */
  function srOnly(el) {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const c = getComputedStyle(n);
      if (/inset\\(\\s*50%/.test(c.clipPath || '')) return true;
      if (/rect\\(0(px)?[,\\s]/.test(c.clip || '')) return true;
      const r = n.getBoundingClientRect();
      const tiny = r.width <= 2 || r.height <= 2;
      const hides = c.overflow === 'hidden' || c.overflow === 'clip'
        || c.overflowX === 'hidden' || c.overflowY === 'hidden';
      if (tiny && hides) return true;
    }
    return false;
  }

  /* ---- gather every element that paints its own text ---- */
  const texts = [];
  const all = document.querySelectorAll('body *');
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (!visible(el, cs)) continue;
    if (srOnly(el)) continue;
    const own = textOf(el);
    if (!own) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom < -2000 || r.top > document.documentElement.scrollHeight + 2000) continue;
    texts.push({ el, cs, r, own, fs: parseFloat(cs.fontSize) || 0 });
  }

  /* ---- 1. text under a legible size ---- */
  for (const t of texts) {
    if (t.fs && t.fs < MIN_FONT) {
      add('text_too_small', t.fs < MIN_FONT - 2 ? 'P1' : 'P2', t.el,
        Math.round(t.fs) + 'px is under the ' + MIN_FONT + 'px floor', { fontSize: Math.round(t.fs) });
    }
  }

  /* ---- 2. text overlapping other text ---- */
  const related = (a, b) => a.contains(b) || b.contains(a);
  const seenPairs = new Set();
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const A = texts[i], B = texts[j];
      if (related(A.el, B.el)) continue;
      const x = Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left);
      const y = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top);
      if (x <= 1 || y <= 1) continue;
      const area = x * y;
      const smaller = Math.min(A.r.width * A.r.height, B.r.width * B.r.height);
      if (smaller <= 0) continue;
      const frac = area / smaller;
      if (frac < 0.18) continue;
      const key = sel(A.el) + '|' + sel(B.el);
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      add('text_overlap', frac > 0.5 ? 'P0' : 'P1', A.el,
        'overlaps "' + B.own.slice(0, 32) + '" by ' + Math.round(frac * 100) + '%',
        { other: sel(B.el), overlapPct: Math.round(frac * 100) });
    }
  }

  /* ---- 2b. text crushed into a column too narrow to read ----
     A table-caption inside a display:block table, a grid child that lost its
     track, a flex item at min-content: the box survives, the words come out
     one letter per line. Nothing overlaps and nothing is clipped, so every
     other check here stays quiet while the page looks broken. */
  for (const t of texts) {
    if (t.own.length < 8) continue;
    const fs_ = t.fs || 16;
    const cw = t.el.clientWidth || t.r.width;
    if (cw >= fs_ * 3) continue;
    const lh = parseFloat(t.cs.lineHeight) || fs_ * 1.4;
    const lines = Math.round(t.r.height / lh);
    if (lines < 4) continue;
    add('text_squeezed', 'P0', t.el,
      Math.round(cw) + 'px of measure for ' + t.own.length + ' characters, broken over ' + lines + ' lines');
  }

  /* ---- 3. text clipped by a box, its own or an ancestor's ----
     The element doing the clipping usually holds no text of its own, so this
     walks every element, not only the ones that paint text. */
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (!visible(el, cs)) continue;
    if (srOnly(el)) continue;
    const clipsX = cs.overflowX === 'hidden' || cs.overflowX === 'clip';
    const clipsY = cs.overflowY === 'hidden' || cs.overflowY === 'clip';
    if (!clipsX && !clipsY) continue;
    const inner = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!inner) continue;
    const oxw = el.scrollWidth - el.clientWidth;
    const ohh = el.scrollHeight - el.clientHeight;
    if (clipsX && oxw > 2 && cs.textOverflow !== 'ellipsis') {
      out.push({ code: 'text_clipped', sev: 'P1', selector: sel(el), text: inner.slice(0, 70),
        message: 'clips its content horizontally by ' + Math.round(oxw) + 'px', by: Math.round(oxw) });
    } else if (clipsY && ohh > 2) {
      out.push({ code: 'text_clipped', sev: 'P1', selector: sel(el), text: inner.slice(0, 70),
        message: 'clips its content vertically by ' + Math.round(ohh) + 'px', by: Math.round(ohh) });
    }
  }

  /* ---- 4. content escaping the viewport ---- */
  for (const t of texts) {
    if (t.r.right > vw + 2) {
      add('text_offscreen', 'P1', t.el, 'extends ' + Math.round(t.r.right - vw) + 'px past the right edge',
        { by: Math.round(t.r.right - vw) });
    } else if (t.r.left < -2) {
      add('text_offscreen', 'P1', t.el, 'starts ' + Math.round(-t.r.left) + 'px left of the viewport',
        { by: Math.round(-t.r.left) });
    }
  }

  /* ---- 5. horizontal page scroll ---- */
  const docW = document.documentElement.scrollWidth;
  if (docW > vw + 2) {
    let worst = null, worstRight = vw;
    for (const el of all) {
      const cs = getComputedStyle(el);
      if (!visible(el, cs)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > worstRight + 2 && r.width < vw * 3) { worstRight = r.right; worst = el; }
    }
    out.push({
      code: 'page_scrolls_sideways', sev: 'P0',
      message: 'the page scrolls sideways by ' + Math.round(docW - vw) + 'px',
      selector: worst ? sel(worst) : 'document', text: worst ? textOf(worst).slice(0, 70) : '',
      by: Math.round(docW - vw),
    });
  }

  /* ---- 6. contrast against the background actually painted ---- */
  function parseRGB(s) {
    const m = /rgba?\\(([^)]+)\\)/.exec(s || '');
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  function over(fg, bg) {
    const a = fg.a;
    return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
  }
  function lum(c) {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  function effectiveBg(el) {
    let n = el, acc = null;
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n);
      const c = parseRGB(cs.backgroundColor);
      if (c && c.a > 0) {
        acc = acc ? over(acc, c) : c;
        if (acc.a >= 0.999) return acc;
      }
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null; // can't judge an image
      n = n.parentElement;
    }
    const body = parseRGB(getComputedStyle(document.body).backgroundColor);
    const base = body && body.a > 0 ? body : { r: 255, g: 255, b: 255, a: 1 };
    return acc ? over(acc, base) : base;
  }
  for (const t of texts) {
    const fg = parseRGB(t.cs.color);
    if (!fg || fg.a < 0.1) continue;
    const bg = effectiveBg(t.el);
    if (!bg) continue;
    const flat = fg.a < 1 ? over(fg, bg) : fg;
    const l1 = lum(flat), l2 = lum(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const bold = parseInt(t.cs.fontWeight, 10) >= 700;
    const large = t.fs >= 24 || (bold && t.fs >= 18.66);
    const need = large ? 3 : 4.5;
    if (ratio < need) {
      add('contrast_below_aa', ratio < need - 1 ? 'P1' : 'P2', t.el,
        ratio.toFixed(2) + ':1 against its background, needs ' + need + ':1',
        { ratio: Number(ratio.toFixed(2)), needs: need });
    }
  }

  /* ---- 7. tap targets, excluding links that sit inside running prose ---- */
  if (vw <= 560) {
    const PROSE = new Set(['P', 'LI', 'BLOCKQUOTE', 'DD', 'FIGCAPTION', 'TD', 'SPAN']);
    for (const el of document.querySelectorAll('a, button, [role="button"], input, select, summary')) {
      const cs = getComputedStyle(el);
      if (!visible(el, cs)) continue;
      if (srOnly(el)) continue;
      const inline = cs.display.startsWith('inline');
      const parent = el.parentElement;
      const inProse = inline && parent && PROSE.has(parent.tagName) && textOf(parent).length > 0;
      if (inProse) continue;
      const r = el.getBoundingClientRect();
      if (r.height < 24 || r.width < 24) {
        add('tap_target_small', 'P2', el,
          Math.round(r.width) + '×' + Math.round(r.height) + 'px is under 24×24',
          { w: Math.round(r.width), h: Math.round(r.height) });
      }
    }
  }

  /* ---- 8. siblings in a row whose trailing lines do not line up ----
     Three cards side by side, each ending in a small label: if the labels sit
     at three different heights the row reads as broken, and no rule about
     slop would ever catch it. */
  function lastTextRect(el) {
    let best = null;
    const walk = (n) => {
      for (const c of n.children) {
        const cs = getComputedStyle(c);
        if (!visible(c, cs)) continue;
        if (textOf(c)) {
          const r = c.getBoundingClientRect();
          if (!best || r.top > best.top) best = { top: r.top, el: c, text: textOf(c) };
        }
        walk(c);
      }
    };
    walk(el);
    return best;
  }
  const rowSeen = new Set();
  for (const container of all) {
    const cs = getComputedStyle(container);
    if (cs.display !== 'grid' && cs.display !== 'flex') continue;
    if (cs.display === 'flex' && cs.flexDirection.startsWith('column')) continue;
    const kids = [...container.children].filter((c) => {
      const k = getComputedStyle(c);
      return visible(c, k);
    });
    /* only a repeated set of equal boxes: a rail beside content, or two
       columns of prose ending ragged, are correct and must not be reported */
    if (kids.length < 3 || kids.length > 8) continue;
    const rects = kids.map((k) => k.getBoundingClientRect());
    const tops = rects.map((r) => r.top);
    if (Math.max(...tops) - Math.min(...tops) >= 4) continue;
    const ws = rects.map((r) => r.width), hs = rects.map((r) => r.height);
    if (Math.min(...ws) <= 0 || Math.max(...ws) / Math.min(...ws) > 1.15) continue;
    if (Math.max(...hs) - Math.min(...hs) > 8) continue;
    const lasts = kids.map(lastTextRect).filter(Boolean);
    if (lasts.length < kids.length) continue;
    /* a short trailing label or button should line up; a ragged paragraph need not */
    if (!lasts.every((l) => l.text.length <= 48)) continue;
    const ys = lasts.map((l) => l.top);
    const spread = Math.max(...ys) - Math.min(...ys);
    if (spread <= 6) continue;
    const key = sel(container);
    if (rowSeen.has(key)) continue;
    rowSeen.add(key);
    const low = lasts[ys.indexOf(Math.max(...ys))];
    add('row_misaligned', spread > 24 ? 'P1' : 'P2', container,
      kids.length + ' items in a row end at ' + Math.round(spread) + 'px apart ("' + low.text.slice(0, 24) + '" sits lowest)',
      { spread: Math.round(spread), items: kids.length });
  }

  return { findings: out, viewport: { w: vw, h: vh }, docHeight: document.documentElement.scrollHeight };
})()`;

/* --------------------------------------------------------------------- run */

async function auditOnce(cdp, sessionId, url, width, minFont) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width, height: 900, deviceScaleFactor: 1, mobile: width <= 560,
  }, sessionId);

  const loaded = new Promise((resolve) => {
    const done = () => resolve();
    cdp.on('Page.loadEventFired', done);
    setTimeout(done, 12000);
  });
  await cdp.send('Page.navigate', { url }, sessionId);
  await loaded;
  // let webfonts settle, then re-measure
  await sleep(900);
  await cdp.send('Runtime.evaluate', { expression: 'document.fonts && document.fonts.ready', awaitPromise: true }, sessionId).catch(() => {});
  await sleep(250);

  const res = await cdp.send('Runtime.evaluate', {
    expression: PAGE_AUDIT(minFont), returnByValue: true, awaitPromise: false,
  }, sessionId);
  if (res.exceptionDetails) throw new Error('audit script failed: ' + (res.exceptionDetails.text || 'unknown'));
  return res.result.value;
}

function parseArgs(argv) {
  const o = { target: null, widths: DEFAULT_WIDTHS, json: false, chrome: null, max: 0, minFont: 12 };
  for (const a of argv) {
    if (a === '--json') o.json = true;
    else if (a.startsWith('--widths=')) o.widths = a.slice(9).split(',').map((x) => parseInt(x, 10)).filter(Boolean);
    else if (a.startsWith('--chrome=')) o.chrome = a.slice(9);
    else if (a.startsWith('--max=')) o.max = +a.slice(6);
    else if (a.startsWith('--min-font=')) o.minFont = +a.slice(11);
    else if (a.startsWith('-')) { console.error(`unslop: unknown flag ${a}`); process.exit(1); }
    else o.target = a;
  }
  return o;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.target) {
    console.error('unslop render audit — usage: node audit-render.mjs <file-or-url> [--widths=1280,768,420] [--json]');
    process.exit(1);
  }
  const url = /^https?:\/\//.test(opts.target)
    ? opts.target
    : 'file://' + path.resolve(opts.target);

  const chrome = findChrome(opts.chrome);
  if (!chrome) {
    console.error('unslop: no Chrome found. Pass --chrome=<path> or set CHROME_PATH.');
    process.exit(1);
  }

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'unslop-render-'));
  const port = 9000 + Math.floor((Date.now() % 900));
  const proc = spawn(chrome, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars',
    '--allow-file-access-from-files', '--disable-extensions', 'about:blank',
  ], { stdio: 'ignore' });

  let cdp, sessionId;
  const cleanup = () => {
    try { cdp && cdp.close(); } catch { /* ignore */ }
    try { proc.kill(); } catch { /* ignore */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
  };

  const byWidth = {};
  try {
    const version = await waitForEndpoint(port);
    cdp = await CDP.connect(version.webSocketDebuggerUrl);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    ({ sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }));
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);

    for (const w of opts.widths) {
      byWidth[w] = await auditOnce(cdp, sessionId, url, w, opts.minFont);
    }
  } catch (e) {
    cleanup();
    console.error(`unslop: ${e.message}`);
    process.exit(1);
  }
  cleanup();

  const findings = [];
  for (const [w, r] of Object.entries(byWidth)) {
    for (const f of r.findings) findings.push({ ...f, width: +w });
  }

  // one line per (code, selector) — a problem at three widths is one problem
  const grouped = new Map();
  for (const f of findings) {
    const key = `${f.code}|${f.selector}|${f.other || ''}`;
    if (!grouped.has(key)) grouped.set(key, { ...f, widths: [] });
    grouped.get(key).widths.push(f.width);
  }
  const list = [...grouped.values()].sort((a, b) => {
    const o = { P0: 0, P1: 1, P2: 2 };
    return o[a.sev] - o[b.sev] || a.code.localeCompare(b.code);
  });

  let raw = 0;
  for (const f of list) raw += SEV_WEIGHT[f.sev];
  const score = Math.min(100, raw);
  const gate = opts.max || 0;

  if (opts.json) {
    console.log(JSON.stringify({
      tool: 'unslop-render', version: '0.1.0', url,
      widths: opts.widths, score, gate,
      counts: {
        P0: list.filter((f) => f.sev === 'P0').length,
        P1: list.filter((f) => f.sev === 'P1').length,
        P2: list.filter((f) => f.sev === 'P2').length,
      },
      findings: list,
    }, null, 2));
  } else {
    console.log(`\nunslop render — ${path.basename(opts.target)} at ${opts.widths.join(', ')}px`);
    const p0 = list.filter((f) => f.sev === 'P0').length;
    const p1 = list.filter((f) => f.sev === 'P1').length;
    const p2 = list.filter((f) => f.sev === 'P2').length;
    console.log(`${list.length} finding(s)  ·  P0 ${p0} · P1 ${p1} · P2 ${p2}`);
    let last = null;
    for (const f of list) {
      if (f.sev !== last) { console.log(`\n${f.sev}`); last = f.sev; }
      console.log(`  ${f.code.padEnd(22)} @${f.widths.join('/')}px  ${f.selector}`);
      console.log(`     ${f.message}`);
      if (f.text) console.log(`     text: ${JSON.stringify(f.text)}`);
    }
    if (!list.length) console.log('\nNothing drawn wrong at any tested width.');
    console.log('');
  }

  process.exit(list.filter((f) => f.sev === 'P0' || f.sev === 'P1').length > gate ? 2 : 0);
}

main();
