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
    await page.waitForFunction(() => window.__sizzle?.ctx);
    const destination = await page.evaluate(() => window.__sizzle.ctx.content.kitchens.has('huaiyang') ? 'huaiyang' : 'wok');
    await page.waitForFunction(
      (kitchen) => window.__sizzle?.log.some((e) => e.name === 'result:shown' && e.payload.kitchenId === kitchen),
      destination,
      { timeout: 90000 },
    );
    const names = await page.evaluate(() => [...new Set(window.__sizzle.log.map((e) => e.name))]);
    for (const must of ['dish:complete', 'equipment:installed', 'kitchen:unlocked', 'kitchen:ready'])
      if (!names.includes(must)) failures.push(`full loop: never saw "${must}"`);
    console.log(`✓ full purchase/unlock loop reached the ${destination} result`);
  } catch {
    const tail = await page.evaluate(() => window.__sizzle?.log.slice(-12).map((e) => e.name).join(' → ') ?? 'no __sizzle');
    failures.push(`full loop did not reach the final kitchen result in 90 s. Last events: ${tail}`);
  }
  failures.push(...errors.map((e) => `full loop: ${e}`));
  await page.close();
}

// 2. Isolate input from gesture timing; real moves are exercised by the auto-play checks.
{
  const { page, errors } = await open('?firstperson&fresh&debug=0&mute&stub=moves-home', 'first-person');
  let stage = 'capture mouse';
  try {
    page.setDefaultTimeout(8000);
    await page.waitForFunction(() => document.querySelector('.dish-steps .active')?.getAttribute('data-step') === 'crack');
    if (await page.locator('.dish-title').innerText() !== '煎饼塔') throw new Error('real dish title missing from HUD');
    await page.locator('canvas').click();
    await page.waitForFunction(() => document.pointerLockElement?.tagName === 'CANVAS', null, { timeout: 5000 });
    const before = await page.evaluate(() => window.__sizzle.ctx.three.camera.quaternion.toArray());
    stage = 'look without holding a button';
    // Explicit relative motion is stable on both desktop and headless pointer-lock drivers.
    await page.locator('canvas').dispatchEvent('pointermove', { pointerId: 1, movementX: 40, movementY: 20 });
    await page.waitForFunction((previous) => window.__sizzle.ctx.three.camera.quaternion.toArray().some((n, i) => Math.abs(n - previous[i]) > 0.01), before);

    // Aim by relative mouse motion; the camera is never assigned by the test.
    async function aimAt(point) {
      const delta = await page.evaluate((target) => {
        const camera = window.__sizzle.ctx.three.camera;
        const direction = camera.getWorldDirection(camera.position.clone());
        const yaw = Math.atan2(-direction.x, -direction.z);
        const pitch = Math.asin(direction.y);
        const dx = target[0] - camera.position.x;
        const dy = target[1] - camera.position.y;
        const dz = target[2] - camera.position.z;
        const targetYaw = Math.atan2(-dx, -dz);
        const yawDelta = Math.atan2(Math.sin(targetYaw - yaw), Math.cos(targetYaw - yaw));
        return { movementX: -yawDelta / 0.005, movementY: (pitch - Math.atan2(dy, Math.hypot(dx, dz))) / 0.005 };
      }, point);
      await page.locator('canvas').dispatchEvent('pointermove', { pointerId: 1, ...delta });
    }
    const rim = await page.evaluate(() => {
      const ctx = window.__sizzle.ctx;
      const p = ctx.world.snapPos('bowl_rim');
      return [p.x, ctx.world.counterTop, p.z];
    });
    for (const objectId of ['egg_1', 'egg_2']) {
      const egg = await page.evaluate((id) => {
        const p = window.__sizzle.ctx.world.prop(id);
        return [p.object.position.x, p.object.position.y + p.size[1] / 2, p.object.position.z];
      }, objectId);
      await aimAt(egg);
      stage = `grab ${objectId}`;
      await page.mouse.down();
      await page.waitForFunction((id) => window.__sizzle.ctx.input.held?.id === id, objectId);
      await aimAt(rim);
      stage = `carry ${objectId} to rim`;
      await page.waitForFunction((id) => window.__sizzle.log.some((e) => e.name === 'snap:enter' && e.payload.objectId === id), objectId);
      await page.mouse.up();
      stage = `release ${objectId}`;
      await page.waitForFunction((id) => window.__sizzle.log.some((e) => e.name === 'grab:end' && e.payload.objectId === id && e.payload.snappedTo === 'bowl_rim'), objectId);
    }
    await page.keyboard.press('Space');
    stage = 'advance dish and HUD after cracking both eggs';
    await page.waitForFunction(() => document.querySelector('.dish-steps .active')?.getAttribute('data-step') === 'whisk');
    if (!await page.locator('[data-step="crack"]').evaluate((el) => el.classList.contains('done')))
      throw new Error('crack step not marked done in HUD');
    await page.keyboard.press('Escape');
    stage = 'release mouse';
    await page.waitForFunction(() => document.pointerLockElement === null);
    await page.keyboard.press('f');
    stage = 'return to overview';
    await page.waitForFunction(() => window.__sizzle.ctx.three.camera.position.y > 2.5);
    await page.keyboard.press('f');
    stage = 'preserve progress across view switches';
    await page.waitForFunction(() => window.__sizzle.ctx.three.camera.position.y === 1.6);
    const progress = await page.evaluate(() => ({
      active: document.querySelector('.dish-steps .active')?.getAttribute('data-step'),
      done: document.querySelector('[data-step="crack"]')?.classList.contains('done'),
      starts: window.__sizzle.log.filter((e) => e.name === 'dish:start').length,
    }));
    if (progress.active !== 'whisk' || !progress.done || progress.starts !== 1)
      throw new Error(`view switch reset dish progress: ${JSON.stringify(progress)}`);
    // Stub mode makes this an input/runner test even after B's gesture moves are merged.
    for (const stepId of ['whisk', 'flip', 'stack', 'drizzle']) {
      stage = `finish ${stepId} in first-person`;
      await page.waitForFunction((id) => document.querySelector('.dish-steps .active')?.getAttribute('data-step') === id, stepId);
      await page.keyboard.press('Space');
    }
    stage = 'show real dish result';
    await page.waitForFunction(() => window.__sizzle.log.some((e) => e.name === 'result:shown' && e.payload.dishId === 'pancake_tower'));
    console.log('✓ first-person: free look, real grab/snap, HUD progress, view switches, and dish result');
  } catch (err) {
    failures.push(`first-person (${stage}): ${err.message}`);
  }
  failures.push(...errors.map((e) => `first-person: ${e}`));
  await page.close();
}

// 3. Every recipe auto-plays, including non-default recipes and newly added kitchens.
{
  const { page } = await open('?debug=0&mute', 'recipe list');
  await page.waitForFunction(() => window.__sizzle?.ctx, null, { timeout: 15000 });
  const dishes = await page.evaluate(() => [...window.__sizzle.ctx.content.dishes.values()].map((d) => ({ id: d.id, kitchen: d.kitchen })));
  await page.close();
  for (const dish of dishes) {
    const { page: p, errors } = await open(`?kitchen=${encodeURIComponent(dish.kitchen)}&dish=${encodeURIComponent(dish.id)}&auto&fast=4&fresh&debug=0&mute`, dish.id);
    try {
      await p.waitForFunction((id) => window.__sizzle?.log.some((e) => e.name === 'result:shown' && e.payload.dishId === id), dish.id, { timeout: 45000 });
      const crashed = await p.evaluate(() => window.__sizzle.log.some((e) => e.name === 'step:complete' && e.payload.tags.includes('crashed')));
      if (crashed) failures.push(`dish ${dish.id}: runner skipped a crashed move`);
      const problem = await p.evaluate((id) => {
        const ctx = window.__sizzle.ctx;
        const recipe = ctx.content.dishes.get(id);
        const result = window.__sizzle.log.find((e) => e.name === 'dish:complete' && e.payload.dishId === id)?.payload;
        if (!result || result.steps.length !== recipe.steps.length) return 'wrong number of completed steps';
        if (result.steps.some((s, i) => s.stepId !== recipe.steps[i].id || s.quality < 0.3)) return 'skipped or empty step';
        if (window.__sizzle.log.some((e) => e.name === 'step:complete' && e.payload.dishId === id && e.payload.tags.includes('stub'))) return 'unregistered move fell back to a stub';
        return null;
      }, dish.id);
      if (problem) failures.push(`dish ${dish.id}: ${problem}`);
      console.log(`✓ recipe ${dish.id} reached its result`);
    } catch {
      const tail = await p.evaluate(() => window.__sizzle?.log.slice(-8) ?? []);
      failures.push(`dish ${dish.id}: no result in 45 s; ${JSON.stringify(tail)}`);
    }
    failures.push(...errors.map((e) => `dish ${dish.id}: ${e}`));
    await p.close();
  }
}

// 4. Rapid navigation should build only the last requested kitchen.
{
  const { page, errors } = await open('?fresh&debug=0&mute', 'rapid navigation');
  try {
    await page.waitForFunction(() => window.__sizzle?.ctx.world.kitchenId === 'home');
    await page.evaluate(() => {
      const bus = window.__sizzle.bus;
      bus.emit('kitchen:enter', { kitchenId: 'wok' });
      bus.emit('kitchen:enter', { kitchenId: 'home' });
    });
    await page.waitForTimeout(600);
    const ready = await page.evaluate(() => window.__sizzle.log.filter((e) => e.name === 'kitchen:ready').map((e) => e.payload.kitchenId));
    if (ready.includes('wok') || ready.at(-1) !== 'home') failures.push(`rapid navigation built stale kitchens: ${ready}`);
  } catch (err) {
    failures.push(`rapid navigation: ${err.message}`);
  }
  failures.push(...errors.map((e) => `rapid navigation: ${e}`));
  await page.close();
}

// 5. Every dev scene boots
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
