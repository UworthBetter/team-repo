import type { MetaState } from '@contracts/types';
import type { Ctx } from '@core/api';
import { h } from './dom';
import { createRouteMap } from './route-map';
import { renderStickerBook } from './stickers';

/**
 * Card D3 — the shop as a pinned catalog (board 6): every card has a pushpin, key gear
 * wears the red 关键 badge and says what it unlocks, unaffordable prices grey out with
 * a "还差 N" note, comingSoon gear shows 敬请期待 and no button.
 * Also hosts the food map (D4/D8, see route-map.ts) and the sticker book (D5).
 */
export function createPanels(ctx: Ctx) {
  const { bus, content } = ctx;
  const root = ctx.ui.layer('panels');
  root.classList.add('dim');
  root.hidden = true;
  const routeMap = createRouteMap(ctx);
  let state: MetaState = { coins: 0, owned: [], installed: [], unlocked: ['home'], stars: {}, stickers: [] };
  let kitchenId = '';
  let current: 'shop' | 'route' | 'stickers' | null = null;
  /** Kitchen id to celebrate on the next route render (card D8). */
  let celebrate: string | undefined;

  const hide = () => {
    current = null;
    root.hidden = true;
  };
  const routeNodeName = (k: string | undefined) => (k ? (content.route.nodes.find((n) => n.kitchenId === k)?.name ?? k) : '');

  function renderShop() {
    const items = [...content.equipment.values()].filter((e) => e.kitchen === kitchenId);
    return h(
      'div',
      { class: 'card panel interactive shop-panel' },
      h('div', { class: 'panel-head' }, h('h2', {}, '装备商店'), h('div', { class: 'pill coin-pill' }, h('span', { class: 'coin-icon' }), String(state.coins))),
      h(
        'div',
        { class: 'shop-grid' },
        ...items.map((e) => {
          const owned = state.owned.includes(e.id);
          const afford = state.coins >= e.price;
          const unlockName = e.unlocks ? routeNodeName(e.unlocks) : '';
          return h(
            'div',
            { class: `shop-item${e.key ? ' key' : ''}${e.comingSoon ? ' soon' : ''}` },
            e.key ? h('span', { class: 'badge' }, e.comingSoon ? '敬请期待' : '关键') : null,
            e.comingSoon ? h('span', { class: 'badge soon-badge' }, '即将推出') : null,
            h('b', {}, e.name),
            h('small', {}, e.blurb || (unlockName ? `解锁 → ${unlockName}` : '')),
            unlockName && !e.comingSoon ? h('small', { class: 'unlock-line' }, `解锁 → ${unlockName}`) : null,
            e.comingSoon
              ? h('span', { class: 'owned muted-line' }, '黑客松之后开放')
              : owned
                ? h('span', { class: 'owned' }, state.installed.includes(e.id) ? '已安装 ✓' : '安装中…')
                : h(
                    'button',
                    { class: `btn${e.key ? ' primary' : ''}${afford ? '' : ' poor'}`, onclick: () => bus.emit('shop:purchase', { itemId: e.id }) },
                    afford ? `购买 ${e.price}` : `还差 ${e.price - state.coins}`,
                  ),
          );
        }),
      ),
      h('button', { class: 'btn', onclick: hide }, '关闭'),
    );
  }

  function renderRoute() {
    const card = routeMap.card(state, kitchenId, {
      celebrate,
      onEnter: (k) => {
        hide();
        bus.emit('kitchen:enter', { kitchenId: k });
      },
    });
    celebrate = undefined;
    return h(
      'div',
      { class: 'card panel interactive route-panel' },
      h('div', { class: 'panel-head' }, h('h2', {}, '中华美食地图'), h('small', { class: 'muted' }, '红图钉可进入 · 雾中的厨房等装备')),
      card,
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: hide }, '关闭')),
    );
  }

  function renderStickers() {
    return h('div', { class: 'card panel interactive' }, renderStickerBook(ctx, state), h('div', { class: 'row' }, h('button', { class: 'btn', onclick: hide }, '关闭')));
  }

  function render() {
    if (!current) return;
    root.replaceChildren(current === 'shop' ? renderShop() : current === 'route' ? renderRoute() : renderStickers());
    root.hidden = false;
  }

  bus.on('meta:state', (s) => {
    state = s;
    render();
  });
  bus.on('kitchen:ready', (e) => {
    kitchenId = e.kitchenId;
    hide();
  });
  bus.on('equipment:purchased', () => hide()); // close so the crate ceremony (D2) is not hidden behind the panel
  bus.on('result:closed', ({ next }) => {
    if (next === 'shop' || next === 'route') open(next);
  });
  bus.on('kitchen:unlocked', ({ kitchenId: k }) => {
    const name = content.route.nodes.find((n) => n.kitchenId === k)?.name ?? k;
    ctx.ui.toast(`新厨房解锁：${name}`);
    // Card D8: open the map and run the unlock ceremony (path draws, lock cracks, pin pulses).
    if (!ctx.flags.auto) ctx.after(800, () => ((celebrate = k), open('route')));
  });
  ctx.input.onKey('Escape', hide);

  function open(p: 'shop' | 'route' | 'stickers') {
    current = p;
    render();
  }
  return { open };
}
