#!/usr/bin/env node
// ui-shot for DNDKeep — screenshot + console/pageerror/network diagnostics
// in one run, using the repo's own pinned Playwright (run from the dndkeep
// repo root so it resolves; doubles as the "is Playwright working?" probe).
//
//   node ui-shot.mjs <url> <out.png> [--wait <css>] [--viewport desktop|mobile|WxH] [--full] [--timeout <ms>]
//
// Exits 0 + "VERDICT: PASS" only if the page produced zero console errors.
// Exit 1 = page errors, 2 = bad usage, 3 = Playwright not resolvable here,
// 4 = page unreachable or --wait never appeared.
import path from 'node:path';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const pos = [];
const opt = { viewport: 'desktop', timeout: 30_000 };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--wait') opt.wait = args[++i];
  else if (a === '--viewport') opt.viewport = args[++i];
  else if (a === '--full') opt.full = true;
  else if (a === '--timeout') opt.timeout = Number(args[++i]);
  else pos.push(a);
}
const [url, out] = pos;
if (!url || !out) {
  console.error('usage: ui-shot.mjs <url> <out.png> [--wait <css>] [--viewport desktop|mobile|WxH] [--full] [--timeout <ms>]');
  process.exit(2);
}

// Sizes mirror playwright.config.ts projects (Desktop Chrome / Pixel 5) so
// loop shots frame the same as the committed baselines. Viewport only — no
// full device emulation (touch, DPR, UA).
const VIEWPORTS = { desktop: { width: 1280, height: 720 }, mobile: { width: 393, height: 851 } };
let vp = VIEWPORTS[opt.viewport];
if (!vp) {
  const m = /^(\d+)x(\d+)$/.exec(opt.viewport);
  if (m) vp = { width: +m[1], height: +m[2] };
}
if (!vp) { console.error(`unknown viewport: ${opt.viewport}`); process.exit(2); }

// Resolve the REPO's Playwright (pinned 1.49 for Node 18), not a global one.
let chromium;
try {
  ({ chromium } = createRequire(path.join(process.cwd(), 'package.json'))('@playwright/test'));
} catch {
  console.error(`FAIL: @playwright/test not resolvable from ${process.cwd()} — run from the dndkeep repo root (npm install if node_modules is missing).`);
  process.exit(3);
}

const errors = [];
const netFails = [];
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: vp });
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('requestfailed', r => netFails.push(`${r.failure()?.errorText ?? 'failed'} ${r.url()}`));
  page.on('response', r => { if (r.status() >= 400) netFails.push(`${r.status()} ${r.url()}`); });
  await page.goto(url, { waitUntil: 'networkidle', timeout: opt.timeout });
  if (opt.wait) await page.waitForSelector(opt.wait, { timeout: opt.timeout });
  await page.screenshot({ path: out, fullPage: !!opt.full, animations: 'disabled' });
} catch (e) {
  // Navigation/wait failures get a clean one-liner, not an uncaught stack —
  // exit 4 distinguishes "page unreachable/never ready" from "console dirty".
  console.error(`FAIL: ${String(e.message ?? e).split('\n')[0]}`);
  await browser.close();
  process.exit(4);
} finally {
  await browser.close();
}

console.log(`shot: ${out} @ ${vp.width}x${vp.height}${opt.full ? ' (full page)' : ''}`);
if (netFails.length) console.log(`network (>=400 or failed):\n  ${netFails.join('\n  ')}`);
if (errors.length) {
  console.log(`CONSOLE ERRORS:\n  ${errors.join('\n  ')}`);
  console.log('VERDICT: FAIL');
  process.exit(1);
}
console.log('VERDICT: PASS (console clean)');
