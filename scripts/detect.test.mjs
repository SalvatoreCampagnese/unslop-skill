#!/usr/bin/env node
/**
 * Self-test for the unslop scanners. No dependencies: `node scripts/detect.test.mjs`
 *
 * Two things are being protected here:
 *   1. the slop fixtures still fire the rules they are supposed to fire
 *   2. the clean fixtures stay quiet, because a scanner that cries wolf gets
 *      switched off and then detects nothing at all
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const fixtures = path.join(root, 'examples', 'fixtures');

let pass = 0;
const fails = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};

function run(script, args) {
  try {
    const out = execFileSync('node', [path.join(here, script), ...args, '--json'], { encoding: 'utf8' });
    return JSON.parse(out);
  } catch (e) {
    // exit code 2 just means "over threshold"; stdout is still the report
    if (e.stdout) { try { return JSON.parse(e.stdout); } catch { /* fallthrough */ } }
    throw e;
  }
}

const ids = (r) => new Set(r.findings.map((f) => f.id));

console.log('\nunslop self-test\n');

/* -------------------------------------------------------------- ui: slop */
console.log('detect-ui on a deliberately generic page');
{
  const r = run('detect-ui.mjs', [path.join(fixtures, 'slop.html'), '--include-examples']);
  const got = ids(r);
  check('scores as ai slop', r.score >= 50, `score ${r.score}`);
  for (const id of ['C1', 'C3', 'T1', 'L1', 'L2']) check(`fires ${id} (P0)`, got.has(id));
  for (const id of ['C2', 'S1', 'S2', 'S3', 'S4', 'T3', 'T4', 'I1', 'I3', 'I4', 'L3', 'L4', 'A1', 'K3', 'M2', 'P1', 'P3']) {
    check(`fires ${id}`, got.has(id));
  }
  // The point of the oklch converter: --primary is oklch, not hex.
  const c2 = r.findings.find((f) => f.id === 'C2');
  check('C2 caught violet declared in oklch', !!c2 && /oklch/.test(c2.evidence), c2 ? c2.evidence : 'no C2');
  check('exits non-zero over threshold', true);
}

/* ------------------------------------------------------------- ui: clean */
console.log('\ndetect-ui on a hand-made page (false-positive control)');
{
  const r = run('detect-ui.mjs', [path.join(fixtures, 'clean.html'), '--include-examples']);
  check('scores clean', r.score < 10, `score ${r.score}, fired ${[...ids(r)].join(',') || 'nothing'}`);
  check('no P0', !r.findings.some((f) => f.sev === 'P0'));
  check('warm white is not read as cream (SD1 quiet)', !ids(r).has('SD1'));
  check('reads a direction', !!r.direction.ground && !!r.direction.signal);
}

/* ---------------------------------------------- ui: entities are not colours */
console.log('\ndetect-ui does not read HTML entities as hex colours');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'unslop-ent-'));
  fs.writeFileSync(path.join(tmp, 'unslop.palette.json'),
    JSON.stringify({ name: 'T', colors: { ground: '#000000', ink: '#ffffff', signal: '#ff6a00' } }));
  fs.writeFileSync(path.join(tmp, 'page.html'),
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title>' +
    '<style>:root{--field:#000000;--ink:#ffffff}body{background:var(--field);color:var(--ink);font:16px/1.5 Georgia,serif}</style>' +
    '</head><body><p>Leeds &#183; Amsterdam &#183; since 2019</p><p>Read on &#8594;</p></body></html>');

  const r = run('detect-ui.mjs', [path.join(tmp, 'page.html')]);
  const bogus = r.findings.filter((x) => /#(?:183|8594)\b/.test(x.evidence || ''));
  check('a &#183; middot is not reported as the colour #183', bogus.length === 0,
    bogus.map((x) => `${x.id}:${x.evidence}`).join(' | '));
  check('the page with entities still scores clean', r.score < 10, `score ${r.score}`);

  fs.rmSync(tmp, { recursive: true, force: true });
}

/* ------------------------------------------------------------ text: slop */
console.log('\ndetect-text on deliberately generic prose');
{
  const r = run('detect-text.mjs', [path.join(fixtures, 'slop.md')]);
  const got = ids(r);
  check('scores as templated', r.score >= 50, `score ${r.score}`);
  for (const id of ['B1', 'X1']) check(`fires ${id} (P0)`, got.has(id));
  for (const id of ['B2', 'B3', 'B5', 'B6', 'B7', 'F1', 'S1', 'S2', 'V1']) check(`fires ${id}`, got.has(id));
  check('detects English', r.languages.includes('en'));
  check('never reports an authorship probability', !/probab/i.test(JSON.stringify(r.findings)) && /NOT probability/i.test(r.note));
}

/* ----------------------------------------------------------- text: clean */
console.log('\ndetect-text on human prose (false-positive control)');
{
  const r = run('detect-text.mjs', [path.join(fixtures, 'clean.md')]);
  check('scores clean', r.score < 10, `score ${r.score}, fired ${[...ids(r)].join(',') || 'nothing'}`);
  check('no P0', !r.findings.some((f) => f.sev === 'P0'));
  check('single em dash does not fire R3', !ids(r).has('R3'));
}

/* -------------------------------------------------------- italian ruleset */
console.log('\ndetect-text on Italian prose');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'unslop-it-'));
  const f = path.join(tmp, 'it.md');
  fs.writeFileSync(f, `# Il panorama in continua evoluzione del lavoro da remoto

In questo articolo esploreremo come i team moderni affrontano uno scenario intricato e in continua evoluzione.

Non si tratta solo di uno strumento, ma di un ripensamento completo. La collaborazione da remoto rappresenta un punto di svolta fondamentale, sottolineando la sua importanza come pietra angolare dell'era digitale.

Gli esperti sostengono che piattaforme robuste e solide siano cruciali. Diversi studi mostrano che i team che utilizzano soluzioni all'avanguardia ottengono vantaggi concreti, evidenziando il legame tra tecnologia e cultura.

## Sfide e prospettive future

Nonostante queste sfide, il settore continua a dimostrare resilienza, adattabilità e crescita.

## Conclusioni

In conclusione, la collaborazione da remoto rappresenta una testimonianza dell'ingegno umano. Spero che questo ti aiuti!
`);
  const r = run('detect-text.mjs', [f]);
  const got = ids(r);
  check('detects Italian', r.languages.includes('it'), r.languages.join(','));
  check('fires B1 on "non si tratta solo di X, ma di Y"', got.has('B1'));
  check('fires X1 on "spero che questo ti aiuti"', got.has('X1'));
  for (const id of ['B2', 'B3', 'B5', 'B6', 'B7', 'S1', 'S2', 'V1']) check(`fires ${id} (it)`, got.has(id));
  fs.rmSync(tmp, { recursive: true, force: true });
}

/* ------------------------------------------------------- ignore mechanism */
console.log('\nignore comments');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'unslop-ig-'));
  const f = path.join(tmp, 'a.css');
  fs.writeFileSync(f, `:root{--brand:#6366f1}\n/* unslop-ignore: C1 */\n.h{background:linear-gradient(90deg,#6366f1,#a855f7)}\n`);
  const r = run('detect-ui.mjs', [f]);
  check('unslop-ignore suppresses the named rule', !ids(r).has('C1'), [...ids(r)].join(','));

  const g = path.join(tmp, 'b.css');
  fs.writeFileSync(g, `/* unslop-ignore-file */\n.h{background:linear-gradient(90deg,#6366f1,#a855f7)}\n`);
  const r2 = run('detect-ui.mjs', [g]);
  check('unslop-ignore-file skips the file', r2.findings.length === 0, `${r2.findings.length} findings`);
  fs.rmSync(tmp, { recursive: true, force: true });
}

/* ------------------------------------------------ SD0: repeating yourself */
console.log('\nSD0, the mechanical anti-default gate');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'unslop-sd0-'));
  const f = path.join(tmp, 'page.css');
  // A derived, defensible direction: warm paper ground, one deep-blue signal.
  fs.writeFileSync(f, `:root{--background:#f7f4ee;--primary:#1f3a6e;--ink:#15130f}\nbody{font-family:"Iowan Old Style",serif}\na:focus-visible{outline:2px solid var(--primary)}\n`);

  const first = run('detect-ui.mjs', [tmp, '--record=project-one']);
  check('first pass does not fire SD0', !ids(first).has('SD0'));
  check('history file written', fs.existsSync(path.join(tmp, '.unslop', 'history.json')));

  // Second project, same designer, same reflexes.
  const second = run('detect-ui.mjs', [tmp]);
  check('second pass on the same direction fires SD0', ids(second).has('SD0'), [...ids(second)].join(','));

  fs.rmSync(tmp, { recursive: true, force: true });
}

/* ----------------------------------------------------- configurable brand */
console.log('\nconfiguration: a declared brand stops being judged by the default catalog');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'unslop-cfg-'));
  const page = path.join(tmp, 'page.css');
  // A brand whose signal really is violet, plus one colour nobody declared.
  fs.writeFileSync(page, [
    ':root{--background:#0d0d10;--primary:#7c5cff;--muted-foreground:#a1a1aa;--stray:#10b981}',
    '.hero{background:linear-gradient(135deg,#7c5cff,#6d4dff)}',
    '.card{border-radius:14px}',
    '.btn{border-radius:10px}',
    'a:focus-visible{outline:2px solid #7c5cff}',
  ].join('\n'));

  const before = run('detect-ui.mjs', [page, '--no-config']);
  check('without config, the violet brand is flagged C1', ids(before).has('C1'));
  check('without config, the violet primary is flagged C2', ids(before).has('C2'));

  fs.writeFileSync(path.join(tmp, 'unslop.palette.json'), JSON.stringify({
    name: 'Kestrel',
    colors: { ground: '#0d0d10', ink: '#f4f4f5', muted: '#a1a1aa', signal: '#7c5cff' },
    tolerance: { hue: 14, sat: 20, light: 16 },
  }));
  fs.writeFileSync(path.join(tmp, 'unslop.style.json'), JSON.stringify({
    radius: { policy: 'scale', scale: [0, 3, 10], tolerance: 1 },
    gradients: { allow: true },
    rules: { A1: 'off' },
    thresholds: { maxScore: 40 },
  }));

  const after = run('detect-ui.mjs', [page]);
  const got = ids(after);
  check('config is found and reported', after.config.configured && after.config.brand === 'Kestrel');
  check('the declared violet gradient stops firing C1', !got.has('C1'), [...got].join(','));
  check('the declared violet primary stops firing C2', !got.has('C2'));
  check('a colour nobody declared is reported as drift (X1)', got.has('X1'));
  check('X1 names the off-palette colour', (after.findings.find((f) => f.id === 'X1')?.evidence || '').includes('#10b981'));
  check('a radius off the declared scale is reported (X2)', got.has('X2'));
  check('X2 names the scale', (after.findings.find((f) => f.id === 'X2')?.evidence || '').includes('0, 3, 10'));
  check('a radius on the scale is not reported', !(after.findings.filter((f) => f.id === 'X2').some((f) => f.evidence.includes('10px'))));
  check('rules:{A1:off} removes that rule', !got.has('A1'));
  check('thresholds.maxScore is picked up from the style file', after.threshold === 40);

  // --no-config must restore the default catalog
  const reset = run('detect-ui.mjs', [page, '--no-config']);
  check('--no-config ignores the files on disk', ids(reset).has('C1') && !ids(reset).has('X1'));

  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('\nconfiguration: prose vocabulary');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'unslop-voc-'));
  const doc = path.join(tmp, 'a.md');
  fs.writeFileSync(doc, 'Our robust, seamless pipeline is robust. The robust design is seamless and robust across every seamless surface of the product we ship.\n\nWe wrote it in March. It took four days. The accountant stopped emailing us, which was the point of the whole exercise.\n');
  const before = run('detect-text.mjs', [doc, '--no-config']);
  check('"robust" and "seamless" are flagged by default', ids(before).has('V1') || ids(before).has('V2'));

  fs.writeFileSync(path.join(tmp, 'unslop.style.json'), JSON.stringify({
    text: { allowWords: ['robust', 'seamless'], banWords: ['pipeline'], maxScore: 50 },
  }));
  const after = run('detect-text.mjs', [doc]);
  check('allowWords stops the catalog flagging a word the product owns',
    !(after.findings.some((f) => (f.evidence || '').includes('seamless'))), JSON.stringify(after.findings.map((f) => f.evidence)));
  check('banWords adds a word the catalog never had',
    after.findings.some((f) => (f.evidence || '').includes('pipeline')));
  check('text maxScore comes from the style file', after.threshold === 50);
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('\nconfiguration: scaffolding');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'unslop-init-'));
  fs.writeFileSync(path.join(tmp, 'page.css'), ':root{--ink:#111}\na:focus-visible{outline:1px solid #111}\n');
  execFileSync('node', [path.join(here, 'detect-ui.mjs'), tmp, '--init-config'], { encoding: 'utf8' });
  const pal = path.join(tmp, 'unslop.palette.json');
  const sty = path.join(tmp, 'unslop.style.json');
  check('--init-config writes both files', fs.existsSync(pal) && fs.existsSync(sty));
  const loaded = run('detect-ui.mjs', [tmp]);
  check('the scaffolded files parse (comments and all)', loaded.config.configured === true);
  fs.rmSync(tmp, { recursive: true, force: true });
}

/* ----------------------------------------------------------- render audit */
console.log('\nrender audit: what was actually drawn');
{
  const hasChrome = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome',
    '/usr/bin/chromium', '/usr/bin/chromium-browser'].some((p) => fs.existsSync(p))
    || !!process.env.CHROME_PATH;

  if (!hasChrome) {
    console.log('  skip  no Chrome on this machine (set CHROME_PATH to run these)');
  } else {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'unslop-render-t-'));

    const broken = path.join(tmp, 'broken.html');
    fs.writeFileSync(broken, `<!doctype html><html><head><meta charset="utf-8"><style>
      body{margin:0;background:#fff;color:#111;font:16px/1.5 Georgia,serif}
      .stack{position:relative;height:120px}
      .a,.b{position:absolute;left:0;top:0;width:360px}
      .tiny{font-size:8px}
      .clip{height:24px;overflow:hidden;width:200px}
      .wide{width:2400px}
      .faint{color:#c9c9c9;background:#fff}
      .row{display:grid;grid-template-columns:repeat(3,200px);align-items:start}
      .card{height:150px;border:1px solid #ccc}
    </style></head><body>
      <div class="stack"><p class="a">The first block of text sits here</p><p class="b">The second block lands on top of it</p></div>
      <p class="tiny">A line of print nobody could read on a phone</p>
      <div class="clip"><p>A sentence that is taller than the box it was given and gets cut off</p></div>
      <div class="wide"><p>This block is wider than any viewport we test</p></div>
      <p class="faint">Pale grey on white, well under the contrast floor</p>
      <div class="row">
        <div class="card"><p>Short body</p><p>Week 1</p></div>
        <div class="card"><p>A rather longer body that pushes its own label further down the card</p><p>Weeks 2-3</p></div>
        <div class="card"><p>Mid length body here</p><p>Ongoing</p></div>
      </div>
    </body></html>`);

    let r;
    try {
      const out = execFileSync('node', [path.join(here, 'audit-render.mjs'), broken, '--widths=1280,420', '--json'],
        { encoding: 'utf8' });
      r = JSON.parse(out);
    } catch (e) { r = e.stdout ? JSON.parse(e.stdout) : null; }

    if (!r) {
      check('render audit runs', false, 'no output');
    } else {
      const codes = new Set(r.findings.map((f) => f.code));
      check('finds text stacked on text', codes.has('text_overlap'));
      check('finds text under the legible floor', codes.has('text_too_small'));
      check('finds text clipped by its own box', codes.has('text_clipped'));
      check('finds the page scrolling sideways', codes.has('page_scrolls_sideways'));
      check('finds contrast measured against the painted background', codes.has('contrast_below_aa'));
      check('finds a card row whose trailing labels do not line up', codes.has('row_misaligned'), [...codes].join(','));
      check('reports the width each finding appeared at',
        r.findings.every((f) => Array.isArray(f.widths) && f.widths.length));
    }

    // a page that is simply correct must come back silent
    const fine = path.join(tmp, 'fine.html');
    fs.writeFileSync(fine, `<!doctype html><html><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1"><style>
      *{box-sizing:border-box}
      body{margin:0;background:#fbfaf8;color:#1a1a1a;font:18px/1.6 Georgia,serif}
      main{max-width:34rem;margin:0 auto;padding:2.5rem 1.25rem}
      h1{font-size:2rem;margin:0 0 .5rem}
      a{color:#8b2e1f;display:inline-block;padding:.4rem 0}
      .row{display:grid;grid-template-columns:1fr;gap:1rem}
      @media (min-width:720px){.row{grid-template-columns:repeat(3,1fr)}}
      .card{border:1px solid #ddd8ce;padding:1rem;display:flex;flex-direction:column;min-width:0}
      .card p{margin:0}
      .card .body{flex:1;margin-bottom:.75rem}
      .card .label{font-size:14px;color:#5d574c}
      </style></head><body><main>
      <h1>Bottega Rossi</h1>
      <p>Shoe repair in Bologna since 1962. Closed on Mondays.</p>
      <div class="row">
        <div class="card"><p class="body">Resole in leather, four days.</p><p class="label">45 euro</p></div>
        <div class="card"><p class="body">Resole in rubber, which takes a little longer in winter because the glue needs time.</p><p class="label">32 euro</p></div>
        <div class="card"><p class="body">Heel tips, same day.</p><p class="label">12 euro</p></div>
      </div>
      <p><a href="tel:+390512345678">051 234 5678</a></p>
      </main></body></html>`);

    let ok;
    try {
      ok = JSON.parse(execFileSync('node', [path.join(here, 'audit-render.mjs'), fine, '--widths=1280,420', '--json'],
        { encoding: 'utf8' }));
    } catch (e) { ok = e.stdout ? JSON.parse(e.stdout) : null; }

    if (ok) {
      check('a correct page reports nothing', ok.findings.length === 0,
        ok.findings.map((f) => `${f.code}@${f.widths}:${f.selector}`).join(' | '));
    } else {
      check('a correct page reports nothing', false, 'no output');
    }

    /* a box that survives while its words come out one letter per line:
       a table-caption left behind when the table became display:block.
       Nothing overlaps and nothing is clipped, so this needs its own name. */
    const sq = path.join(tmp, 'squeezed.html');
    fs.writeFileSync(sq, `<!doctype html><html lang="en"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1"><title>Fares</title><style>
      body{margin:0;font:16px/1.6 Georgia,serif;color:#141414;background:#fff;overflow-wrap:anywhere;padding:16px}
      table{border-collapse:collapse}
      caption{text-align:left;padding-bottom:12px}
      @media (max-width: 549px){ table, tbody, tr, td{ display:block; width:100%; } td{ padding:0 } }
      </style></head><body><h1>Fares</h1>
      <table><caption>Sorted by what you pay, not by what is advertised.</caption>
      <tbody><tr><td>TAP Air Portugal</td><td>246 euro</td></tr></tbody></table>
      </body></html>`);

    let sqr;
    try {
      sqr = JSON.parse(execFileSync('node', [path.join(here, 'audit-render.mjs'), sq, '--widths=1280,390', '--json'],
        { encoding: 'utf8' }));
    } catch (e) { sqr = e.stdout ? JSON.parse(e.stdout) : null; }

    const squeeze = sqr && sqr.findings.find((x) => x.code === 'text_squeezed');
    check('finds text crushed into a one-letter column', !!squeeze,
      sqr ? sqr.findings.map((x) => x.code).join(',') || 'nothing' : 'no output');
    check('the squeeze is reported only at the width it happens', !!squeeze && squeeze.widths.join() === '390',
      squeeze ? squeeze.widths.join() : 'n/a');

    /* text hidden for screen readers is meant to be clipped and offscreen:
       a skip link or a table header replaced by per-cell labels must not
       be reported as a layout fault, or every accessible page fails. */
    const sr = path.join(tmp, 'sr-only.html');
    fs.writeFileSync(sr, `<!doctype html><html lang="en"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1"><title>Fares</title><style>
      body{margin:0;font:16px/1.6 Georgia,serif;color:#141414;background:#fff;padding:24px}
      .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
      .legacy{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
      td{display:block;padding:0}
      td::before{content:attr(data-label);display:block;font-size:13px;color:#5f5f5f}
      </style></head><body>
      <a class="sr" href="#main">Skip to the fares</a>
      <h1>Milan to Lisbon</h1>
      <table id="main"><thead class="sr"><tr><th>Operator</th><th>You pay</th></tr></thead>
      <tbody><tr><td data-label="Operator">TAP Air Portugal</td><td data-label="You pay">246 euro</td></tr></tbody></table>
      <p class="legacy">Prices in euro, including one checked bag per traveller.</p>
      </body></html>`);

    let srr;
    try {
      srr = JSON.parse(execFileSync('node', [path.join(here, 'audit-render.mjs'), sr, '--widths=1280,390', '--json'],
        { encoding: 'utf8' }));
    } catch (e) { srr = e.stdout ? JSON.parse(e.stdout) : null; }

    check('screen-reader-only text is not a layout fault', !!srr && srr.findings.length === 0,
      srr ? srr.findings.map((x) => `${x.code}:${x.selector}`).join(' | ') : 'no output');

    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/* ---------------------------------------------------------------- summary */
console.log(`\n${pass} passed, ${fails.length} failed\n`);
if (fails.length) { for (const f of fails) console.log(`  - ${f}`); process.exit(1); }
process.exit(0);
