#!/usr/bin/env node
/**
 * Headless smoke test: build output must (1) auto-play the whole demo path —
 * pancake tower → buy 猛火灶 → unlock → enter Wok Station → fried rice result — and
 * (2) open every dev scene without a page error.
 *   npm run build && npm run smoke
 * Needs Playwright:  npm i --no-save playwright@1.48.2 && npx playwright install chromium
 */
import { preview } from 'vite';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Playwright is not installed. Run:\n  npm i --no-save playwright@1.48.2 && npx playwright install chromium');
  process.exit(2);
}

const server = await preview({ preview: { port: 4179, strictPort: false }, logLevel: 'error' });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const failures = [];

async function open(path, label) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console.error: ${m.text()}`);
  });
  await page.goto(url + path);
  return { page, errors, label };
}

// 1. Full loop on auto-play
{
  const { page, errors } = await open('?auto&fast=4&fresh&coins=600&debug=0&mute', 'full loop');
  try {
    await page.waitForFunction(
      () => window.__sizzle?.log.some((e) => e.name === 'result:shown' && e.payload.kitchenId === 'wok'),
      null,
      { timeout: 45000 },
    );
    const names = await page.evaluate(() => [...new Set(window.__sizzle.log.map((e) => e.name))]);
    for (const must of ['dish:complete', 'equipment:installed', 'kitchen:unlocked', 'kitchen:ready'])
      if (!names.includes(must)) failures.push(`full loop: never saw "${must}"`);
    console.log('✓ full loop reached the Wok Station result');
  } catch {
    const tail = await page.evaluate(() => window.__sizzle?.log.slice(-12).map((e) => e.name).join(' → ') ?? 'no __sizzle');
    failures.push(`full loop did not reach the wok result in 45 s. Last events: ${tail}`);
  }
  failures.push(...errors.map((e) => `full loop: ${e}`));
  await page.close();
}

// 2. Every dev scene boots
{
  const { page } = await open('?debug=0&mute', 'scene list');
  await page.waitForFunction(() => window.__sizzle?.ctx, null, { timeout: 15000 });
  const scenes = await page.evaluate(() => window.__sizzle.ctx.dev.list());
  await page.close();
  for (const id of scenes) {
    const { page: p, errors } = await open(`?scene=${id}&auto&fast=4&debug=0&mute`, id);
    await p.waitForTimeout(1500);
    const fatal = await p.$('.fatal');
    if (fatal) failures.push(`scene ${id}: fatal overlay — ${await fatal.innerText()}`);
    failures.push(...errors.map((e) => `scene ${id}: ${e}`));
    await p.close();
  }
  console.log(`✓ opened ${scenes.length} dev scene(s): ${scenes.join(', ')}`);
}

await browser.close();
server.httpServer.close();
if (failures.length) {
  console.error(`\n✗ smoke failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('✓ smoke passed');
