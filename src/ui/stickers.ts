import type { MetaState } from '@contracts/types';
import type { Ctx } from '@core/api';
import { h } from './dom';

/**
 * Card D5 — the sticker book: every discovered easter egg becomes a stamp, grouped by
 * kitchen. Reads meta:state.stickers (egg ids); undiscovered eggs show as mystery slots
 * so players can see there is something to find in each kitchen.
 */
export function renderStickerBook(ctx: Ctx, state: MetaState): HTMLElement {
  const found = new Set(state.stickers);
  const groups = [...ctx.content.kitchens.values()]
    .filter((k) => k.eggs.length > 0)
    .map((k) => {
      const eggs = k.eggs.map((e) =>
        found.has(e.id)
          ? h('span', { class: 'sticker on', title: e.id }, e.id.split('_').pop() ?? e.id)
          : h('span', { class: 'sticker', title: '还没发现' }, '?'),
      );
      const got = k.eggs.filter((e) => found.has(e.id)).length;
      return h(
        'section',
        { class: 'sticker-group' },
        h('h3', {}, k.name, h('small', {}, ` ${got}/${k.eggs.length}`)),
        h('div', { class: 'sticker-grid' }, ...eggs),
      );
    });

  const totalEggs = [...ctx.content.kitchens.values()].reduce((a, k) => a + k.eggs.length, 0);
  const totalStars = Object.values(state.stars).reduce((a, list) => a + list.length, 0);
  return h(
    'div',
    { class: 'card panel interactive' },
    h('div', { class: 'panel-head' }, h('h2', {}, '贴纸册'), h('small', { class: 'muted' }, `已收集 ${state.stickers.length}/${totalEggs} · 找到彩蛋自动贴上`)),
    h('div', { class: 'sticker-summary' }, h('span', {}, `⭐ 星级 ×${totalStars}`), h('span', {}, `🥚 贴纸 ${state.stickers.length}/${totalEggs}`), h('span', {}, `🪙 金币 ${state.coins}`)),
    groups.length ? h('div', { class: 'sticker-groups' }, ...groups) : h('p', { class: 'muted' }, '还没有彩蛋 —— 去厨房里戳一戳那些看起来不对劲的小东西。'),
    h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => ctx.bus.emit('hint:show', { text: '提示：水槽里好像有只小黄鸭', gesture: 'click' }) }, '给个提示')),
  );
}
