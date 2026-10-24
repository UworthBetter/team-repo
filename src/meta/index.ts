import type { MetaState } from '@contracts/types';
import { defineModule, type Ctx } from '@core/api';
import { runCrate } from './crate';
import { loadSave, SAVE_KEY, writeSave } from './save';
import { payout, rate, starsEarned } from './score';

/**
 * Owner: D. Coins, ratings, save, shop purchases, install + unlock, and the ?auto driver.
 * Talks to ui/ only through events (meta:state, result:shown …). See docs/briefs/D-meta-ui.md
 */
function setupMeta(ctx: Ctx) {
  const { bus, content } = ctx;
  const save = loadSave(ctx.flags, content);
  let kitchenId = '';
  let disposeCrate: (() => void) | null = null;
  /** Tags collected from step:complete during the current dish run (card D5 star checks). */
  let runTags: string[] = [];

  const snapshot = (): MetaState => ({
    coins: save.coins,
    owned: [...save.owned],
    installed: [...save.installed],
    unlocked: [...save.unlocked],
    stars: structuredClone(save.stars),
    stickers: [...save.stickers],
  });
  const publish = () => {
    writeSave(save);
    bus.emit('meta:state', snapshot());
  };
  const addCoins = (delta: number, reason: string) => {
    save.coins += delta;
    bus.emit('coins:change', { delta, total: save.coins, reason });
  };

  bus.on('kitchen:ready', (e) => {
    kitchenId = e.kitchenId;
    for (const id of save.installed) {
      const eq = content.equipment.get(id);
      if (eq?.kitchen === kitchenId) bus.emit('equipment:installed', { itemId: id, kitchenId });
    }
    publish();
  });

  bus.on('dish:start', () => (runTags = []));
  bus.on('step:complete', ({ tags }) => {
    for (const t of tags) if (!runTags.includes(t)) runTags.push(t);
  });

  bus.on('dish:complete', (e) => {
    const dish = content.dishes.get(e.dishId);
    if (!dish) return;
    const rating = rate(dish, e.quality);
    const stars = starsEarned(dish, rating, runTags);
    const had = new Set(save.stars[dish.id] ?? []);
    const newStars = stars.filter((s) => !had.has(s)).length;
    save.stars[dish.id] = [...new Set([...had, ...stars])];
    const firstHere = !save.firstDishDone[e.kitchenId];
    save.firstDishDone[e.kitchenId] = true;
    const coins = payout(dish, rating, { newStars, firstDishInNewKitchen: firstHere && e.kitchenId !== content.route.nodes[0]!.kitchenId });
    bus.emit('result:shown', { dishId: dish.id, kitchenId: e.kitchenId, rating, quality: e.quality, stars, coins });
    addCoins(
      coins.reduce((a, l) => a + l.amount, 0),
      `dish:${dish.id}`,
    );
    publish();
  });

  bus.on('easter:found', ({ eggId }) => {
    if (save.stickers.includes(eggId)) return;
    const egg = [...content.kitchens.values()].flatMap((k) => k.eggs).find((x) => x.id === eggId);
    save.stickers.push(eggId);
    addCoins(egg?.coins ?? 0, `easter:${eggId}`);
    bus.emit('fx:pop', { text: `彩蛋! +${egg?.coins ?? 0}`, style: 'perfect' });
    bus.emit('sfx:play', { id: 'sticker' });
    publish();
  });

  bus.on('shop:purchase', ({ itemId }) => {
    const eq = content.equipment.get(itemId);
    if (!eq) return;
    if (eq.comingSoon) {
      bus.emit('sfx:play', { id: 'deny' });
      return ctx.ui.toast(`${eq.name} 敬请期待 · 黑客松之后开放`);
    }
    if (save.owned.includes(itemId)) return ctx.ui.toast(`${eq.name} 已经有了`);
    if (save.coins < eq.price) {
      bus.emit('sfx:play', { id: 'deny' });
      return ctx.ui.toast(`金币不够：还差 ${eq.price - save.coins}`);
    }
    save.owned.push(itemId);
    addCoins(-eq.price, `buy:${itemId}`);
    bus.emit('equipment:purchased', { itemId });
    publish();
    // Card D2: the crate ceremony carries purchase → install; onInstalled fires when the gear lands.
    disposeCrate?.();
    disposeCrate = runCrate(ctx, {
      itemId,
      eq,
      onInstalled: () => {
        if (save.installed.includes(itemId)) return;
        save.installed.push(itemId);
        bus.emit('equipment:installed', { itemId, kitchenId: eq.kitchen });
        bus.emit('fx:pop', { text: `${eq.name} 已安装!`, style: 'perfect' });
        if (eq.unlocks && !save.unlocked.includes(eq.unlocks)) {
          save.unlocked.push(eq.unlocks);
          bus.emit('kitchen:unlocked', { kitchenId: eq.unlocks });
        }
        publish();
      },
    });
  });

  // ?auto — plays the whole demo path by itself (npm run smoke relies on this).
  if (ctx.flags.auto) {
    bus.on('result:shown', () => {
      ctx.after(700, () => {
        const key = [...content.equipment.values()].find((q) => q.kitchen === kitchenId && q.key && !save.owned.includes(q.id));
        if (key && save.coins >= key.price) {
          bus.emit('result:closed', { next: 'shop' });
          ctx.after(300, () => bus.emit('shop:purchase', { itemId: key.id }));
        } else bus.emit('result:closed', { next: 'again' });
      });
    });
    bus.on('kitchen:unlocked', ({ kitchenId: k }) => {
      if (content.kitchens.has(k)) ctx.after(900, () => bus.emit('kitchen:enter', { kitchenId: k }));
    });
  }

  if (ctx.dev.gui) {
    const f = ctx.dev.gui.addFolder('Meta (D)');
    f.add({ c: () => (addCoins(500, 'debug'), publish()) }, 'c').name('coins +500');
    f.add({ u: () => bus.emit('shop:purchase', { itemId: 'wok_burner' }) }, 'u').name('buy 猛火灶');
    f.add({ s: () => bus.emit('easter:found', { eggId: 'home_duck' }) }, 's').name('find 彩蛋 (duck)');
    f.add({ r: () => (localStorage.removeItem(SAVE_KEY), location.reload()) }, 'r').name('reset save');
    f.close();
  }

  // Front menu reads coins / unlocked before any kitchen exists. ui mounts after
  // meta, so it picks this up from the bus log rather than a live subscription.
  publish();
}

export default defineModule({ id: 'meta', owner: 'D', setup: setupMeta });
