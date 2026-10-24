import type { MetaState } from '@contracts/types';
import type { Ctx } from '@core/api';
import { h } from './dom';

/** Shop (board 6) and route map (board 7) as simple DOM panels. TODO(D): the catalog and paper-map art. */
export function createPanels(ctx: Ctx) {
  const { bus, content } = ctx;
  const root = ctx.ui.layer('panels');
  root.classList.add('dim');
  root.hidden = true;
  let state: MetaState = { coins: 0, owned: [], installed: [], unlocked: ['home'], stars: {}, stickers: [] };
  let kitchenId = '';
  let current: 'shop' | 'route' | null = null;

  const hide = () => {
    current = null;
    root.hidden = true;
  };

  function renderShop() {
    const items = [...content.equipment.values()].filter((e) => e.kitchen === kitchenId);
    return h(
      'div',
      { class: 'card panel interactive' },
      h('div', { class: 'panel-head' }, h('h2', {}, '装备商店'), h('div', { class: 'pill coin-pill' }, h('span', { class: 'coin-icon' }), String(state.coins))),
      h(
        'div',
        { class: 'shop-grid' },
        ...items.map((e) => {
          const owned = state.owned.includes(e.id);
          return h(
            'div',
            { class: `shop-item${e.key ? ' key' : ''}` },
            e.key ? h('span', { class: 'badge' }, '关键') : null,
            h('b', {}, e.name),
            h('small', {}, e.blurb),
            owned
              ? h('span', { class: 'owned' }, state.installed.includes(e.id) ? '已安装 ✓' : '安装中…')
              : h('button', { class: e.key ? 'btn primary' : 'btn', onclick: () => bus.emit('shop:purchase', { itemId: e.id }) }, `购买 ${e.price}`),
          );
        }),
      ),
      h('button', { class: 'btn', onclick: hide }, '关闭'),
    );
  }

  function renderRoute() {
    return h(
      'div',
      { class: 'card panel interactive' },
      h('h2', {}, '滋啦路线'),
      h(
        'ol',
        { class: 'route' },
        ...content.route.nodes.map((n) => {
          const open = state.unlocked.includes(n.kitchenId) && !n.placeholder && content.kitchens.has(n.kitchenId);
          const gate = n.gate ? content.equipment.get(n.gate)?.name ?? n.gate : null;
          return h(
            'li',
            { class: open ? 'open' : 'locked' },
            h('b', {}, n.name),
            h('small', {}, open ? (n.kitchenId === kitchenId ? '你在这里' : '已解锁') : gate ? `需要 ${gate}` : '敬请期待'),
            open && n.kitchenId !== kitchenId
              ? h('button', { class: 'btn primary', onclick: () => (hide(), bus.emit('kitchen:enter', { kitchenId: n.kitchenId })) }, '进入')
              : null,
          );
        }),
      ),
      h('button', { class: 'btn', onclick: hide }, '关闭'),
    );
  }

  function render() {
    if (!current) return;
    root.replaceChildren(current === 'shop' ? renderShop() : renderRoute());
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
  bus.on('result:closed', ({ next }) => {
    if (next === 'shop' || next === 'route') open(next);
  });
  bus.on('kitchen:unlocked', ({ kitchenId: k }) => {
    const name = content.route.nodes.find((n) => n.kitchenId === k)?.name ?? k;
    ctx.ui.toast(`新厨房解锁：${name}`);
    if (!ctx.flags.auto) ctx.after(800, () => open('route'));
  });
  ctx.input.onKey('Escape', hide);

  function open(p: 'shop' | 'route') {
    current = p;
    render();
  }
  return { open };
}
