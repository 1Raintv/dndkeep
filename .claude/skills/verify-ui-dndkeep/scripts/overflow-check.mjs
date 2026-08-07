#!/usr/bin/env node
// overflow-check for DNDKeep — the layout half of the pass/fail checklist,
// which ui-shot deliberately does not cover (its VERDICT is console-only).
// Run from the dndkeep repo root so it resolves the repo's pinned Playwright.
//
//   node overflow-check.mjs <url> [--viewport desktop|mobile|WxH] [--json]
//
// Reports BOTH ways horizontal overflow hides, because one probe misses one:
//   1. page scrolls sideways   — documentElement.scrollWidth > screen width
//   2. element silently clipped — an ancestor hides the overflow, so the page
//      scrollWidth looks perfectly normal while content is cut off unseen
//
// Exits 0 = clean, 1 = overflow found, 2 = bad usage,
//       3 = Playwright not resolvable here, 4 = page unreachable.
import path from 'node:path';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const pos = [];
const opt = { viewport: 'mobile', timeout: 30_000 };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--viewport') opt.viewport = args[++i];
  else if (a === '--timeout') opt.timeout = Number(args[++i]);
  else if (a === '--json') opt.json = true;
  else pos.push(a);
}
const [url] = pos;
if (!url) {
  console.error('usage: overflow-check.mjs <url> [--viewport desktop|mobile|WxH] [--json] [--timeout <ms>]');
  process.exit(2);
}

let chromium, devices;
try {
  ({ chromium, devices } = createRequire(path.join(process.cwd(), 'package.json'))('@playwright/test'));
} catch {
  console.error(`FAIL: @playwright/test not resolvable from ${process.cwd()} — run from the dndkeep repo root.`);
  process.exit(3);
}

// Mirror playwright.config.ts projects exactly. 'mobile' uses full Pixel 5
// emulation rather than a bare 393px viewport ON PURPOSE: isMobile changes how
// the layout viewport responds to overflow (see the innerWidth note below), so
// a plain viewport would not reproduce what the mobile e2e project sees.
let context;
if (opt.viewport === 'mobile') context = { ...devices['Pixel 5'] };
else if (opt.viewport === 'desktop') context = { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } };
else {
  const m = /^(\d+)x(\d+)$/.exec(opt.viewport);
  if (!m) { console.error(`unknown viewport: ${opt.viewport}`); process.exit(2); }
  context = { viewport: { width: +m[1], height: +m[2] } };
}

const browser = await chromium.launch();
let report;
try {
  const ctx = await browser.newContext(context);
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: opt.timeout });

  report = await page.evaluate(() => {
    // visualViewport.width, NOT innerWidth. Under isMobile emulation Chromium
    // honours <meta viewport> by WIDENING the layout viewport to fit overflowing
    // content — innerWidth grows to equal scrollWidth and `scrollWidth <=
    // innerWidth` silently becomes `x <= x`, passing on a page that visibly
    // scrolls sideways. visualViewport stays at the true screen width.
    const screenW = Math.round(window.visualViewport?.width ?? window.innerWidth);
    const docScrollW = document.documentElement.scrollWidth;

    const describe = (el) => {
      // getAttribute, not .className — on SVG elements className is an
      // SVGAnimatedString and stringifies to "[object SVGAnimatedString]".
      const cls = (el.getAttribute('class') || '').trim().replace(/\s+/g, '.').slice(0, 32);
      const txt = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${txt ? ` "${txt}"` : ''}`;
    };

    // Two kinds of element are excluded as designed-to-overhang:
    //   - blurred radial-gradient decor (position:absolute + filter) that the
    //     landing page layers behind the hero on purpose
    //   - anything inside a position:fixed bar. The bottom tab bar spans the
    //     LAYOUT viewport, so when the page overflows, the bar widens with it
    //     and every icon inside reports past-the-edge. Checking the element's
    //     own position isn't enough — its children are statically positioned.
    const skip = (el, cs) =>
      cs.filter !== 'none' ||
      el.closest('*') && (() => { for (let n = el; n; n = n.parentElement) if (getComputedStyle(n).position === 'fixed') return true; return false; })();

    const clipped = [];
    const pastEdge = [];
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (skip(el, cs)) continue;
      if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) {
        // An ancestor is hiding real content — invisible to the page-level check.
        // Skip entries that merely restate a page-wide sideways scroll: when the
        // document overflows, every ancestor from <html> down reports the same
        // scrollWidth, which buries the one element actually at fault.
        const echoesPageOverflow = el.scrollWidth === document.documentElement.scrollWidth
          && document.documentElement.scrollWidth > screenW;
        if (cs.overflowX !== 'auto' && cs.overflowX !== 'scroll' && !echoesPageOverflow) {
          clipped.push({ el: describe(el), scrollW: el.scrollWidth, clientW: el.clientWidth });
        }
      }
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && Math.round(r.right) > screenW + 1) {
        pastEdge.push({ el: describe(el), right: Math.round(r.right) });
      }
    }
    return {
      screenW, innerW: window.innerWidth, docScrollW,
      sideways: docScrollW > screenW,
      clipped: clipped.slice(0, 6),
      pastEdge: pastEdge.sort((a, b) => b.right - a.right).slice(0, 6),
    };
  });
} catch (e) {
  console.error(`FAIL: ${String(e.message ?? e).split('\n')[0]}`);
  await browser.close();
  process.exit(4);
} finally {
  await browser.close();
}

if (opt.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`${url} @ ${opt.viewport} — screen ${report.screenW}px (innerWidth ${report.innerW}), page scrollWidth ${report.docScrollW}`);
  if (report.sideways) console.log(`SIDEWAYS SCROLL: page is ${report.docScrollW - report.screenW}px wider than the screen`);
  if (report.clipped.length) {
    console.log('CLIPPED (ancestor hides the overflow — page scrollWidth looks fine):');
    for (const c of report.clipped) console.log(`  ${c.el} — scrollW ${c.scrollW} vs clientW ${c.clientW}`);
  }
  if (report.pastEdge.length) {
    console.log('PAST THE SCREEN EDGE:');
    for (const p of report.pastEdge) console.log(`  ${p.el} — right edge at ${p.right}`);
  }
}

const dirty = report.sideways || report.clipped.length > 0 || report.pastEdge.length > 0;
console.log(dirty ? 'VERDICT: FAIL (layout)' : 'VERDICT: PASS (no horizontal overflow)');
process.exit(dirty ? 1 : 0);
