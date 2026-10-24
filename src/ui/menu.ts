import type { MetaState } from '@contracts/types';
import type { Ctx } from '@core/api';
import { h } from './dom';
import { createRouteMap } from './route-map';

/**
 * Boot screen. Shown only when nothing asked to enter a kitchen yet.
 * Picking a pin or the button emits kitchen:enter; the stove stays unloaded until then.
 */

const EMPTY: MetaState = { coins: 0, owned: [], installed: [], unlocked: ['home'], stars: {}, stickers: [] };

export function createMenu(ctx: Ctx, options: { initiallyHidden?: boolean } = {}) {
  const { bus, content } = ctx;
  const root = ctx.ui.layer('menu');
  root.classList.add('menu-layer', 'interactive');
  const routeMap = createRouteMap(ctx);

  let state = readState();
  let gone = false;
  let open = !options.initiallyHidden;
  root.hidden = !open;
  const offs: (() => void)[] = [];

  const playable = (s: MetaState) =>
    content.route.nodes.filter((n) => s.unlocked.includes(n.kitchenId) && !n.placeholder && content.kitchens.has(n.kitchenId));

  /** Furthest unlocked kitchen on the main branch. New saves land on home. */
  const furthestMain = (s: MetaState) => {
    let pick: string | null = null;
    for (const n of content.route.nodes) {
      if ((n.branch ?? 'main') !== 'main') continue;
      if (s.unlocked.includes(n.kitchenId) && !n.placeholder && content.kitchens.has(n.kitchenId)) pick = n.kitchenId;
    }
    return pick;
  };

  function readState(): MetaState {
    const hit = [...bus.log].reverse().find((e) => e.name === 'meta:state');
    return hit ? (hit.payload as MetaState) : EMPTY;
  }

  /** HUD is already mounted underneath. Keep it out of tab order until this screen is gone. */
  function parkHud(on: boolean) {
    const parent = root.parentElement;
    if (!parent) return;
    for (const el of parent.querySelectorAll<HTMLElement>(':scope > .layer')) {
      if (el !== root) el.inert = on;
    }
  }

  function close() {
    if (gone) return;
    gone = true;
    open = false;
    for (const off of offs) off();
    offs.length = 0;
    parkHud(false);
    root.replaceChildren();
    root.hidden = true;
    root.classList.remove('interactive');
  }

  function enter(kitchenId: string) {
    close();
    bus.emit('kitchen:enter', { kitchenId });
  }

  function render() {
    if (gone || !open) return;
    const next = furthestMain(state);
    const openCount = playable(state).length;
    const map = routeMap.card(state, '', { onEnter: enter });
    root.replaceChildren(
      h(
        'div',
        { class: 'menu-sheet' },
        h('h1', { class: 'menu-title' }, '滋啦厨房'),
        h('p', { class: 'menu-sub' }, '一个厨房，一种菜系'),
        h('div', { class: 'card menu-card' }, map, h('p', { class: 'menu-hint' }, '红图钉可以进 · 雾里的还没开门')),
        next ? h('button', { class: 'btn primary menu-go', onclick: () => enter(next) }, '开始做饭') : null,
        h('p', { class: 'menu-foot' }, `金币 ${state.coins} · 已开 ${openCount} 个厨房`),
      ),
    );
    root.hidden = false;
  }

  offs.push(
    bus.on('meta:state', (s) => {
      state = s;
      render();
    }),
  );
  // Debug panel (and anything else) can enter a kitchen without using this screen.
  offs.push(bus.on('kitchen:enter', () => close()));
  offs.push(
    ctx.input.onKey('Enter', (e) => {
      if (gone || !open) return;
      const t = e.target;
      if (t instanceof Element && t.closest('.pin')) return;
      const id = furthestMain(state);
      if (id) enter(id);
    }),
  );

  if (open) {
    parkHud(true);
    render();
  }
  return {
    show() {
      if (gone) return;
      open = true;
      parkHud(true);
      render();
    },
    continue() {
      if (gone) return;
      const id = furthestMain(state);
      if (id) enter(id);
    },
  };
}
