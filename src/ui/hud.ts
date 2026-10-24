import type { MetaState } from '@contracts/types';
import type { Ctx } from '@core/api';
import { h } from './dom';

/** Sketch board 4: dish card top-left, coins + shop/route top-right, hint pill bottom-center, dock bottom-left, retry bottom-right. */
export function createHud(ctx: Ctx, open: (panel: 'shop' | 'route') => void) {
  const { bus, content } = ctx;
  const root = ctx.ui.layer('hud');

  const title = h('div', { class: 'dish-title' }, '—');
  const steps = h('ol', { class: 'dish-steps' });
  const card = h('div', { class: 'card dish-card' }, title, steps);

  const coinNum = h('span', { class: 'coin-num' }, '0');
  const coins = h('div', { class: 'pill coin-pill' }, h('span', { class: 'coin-icon' }), coinNum);
  const shopBtn = h('button', { class: 'round interactive', title: '商店', onclick: () => open('shop') }, '商店');
  const routeBtn = h('button', { class: 'round interactive', title: '路线', onclick: () => open('route') }, '路线');
  const topRight = h('div', { class: 'top-right' }, coins, shopBtn, routeBtn);

  const hint = h('div', { class: 'hint-pill', hidden: true });
  const dock = h('div', { class: 'pill dock' });
  const retry = h('button', { class: 'round retry interactive', title: '重来 (R)', onclick: () => bus.emit('dish:restart', {}) }, '↺');

  root.append(card, topRight, hint, dock, retry);
  ctx.input.onKey('KeyR', () => bus.emit('dish:restart', {}));

  bus.on('dish:start', ({ dishId }) => {
    const d = content.dishes.get(dishId);
    title.textContent = d?.name ?? dishId;
    steps.replaceChildren(...(d?.steps ?? []).map((s) => h('li', { 'data-step': s.id }, ctx.moves.get(s.move).label)));
  });
  bus.on('step:start', ({ stepId }) => {
    steps.querySelectorAll('li').forEach((li) => li.classList.toggle('active', li.dataset.step === stepId));
  });
  bus.on('step:complete', ({ stepId }) => {
    const li = steps.querySelector<HTMLElement>(`li[data-step="${stepId}"]`);
    li?.classList.remove('active');
    li?.classList.add('done');
  });
  bus.on('hint:show', ({ text }) => {
    hint.textContent = text;
    hint.hidden = false;
  });
  bus.on('hint:clear', () => (hint.hidden = true));

  const setCoins = (s: Pick<MetaState, 'coins'>) => (coinNum.textContent = String(s.coins));
  bus.on('meta:state', setCoins);
  bus.on('coins:change', ({ total, delta }) => {
    setCoins({ coins: total });
    if (delta > 0) {
      coins.classList.remove('bump');
      void coins.offsetWidth;
      coins.classList.add('bump');
    }
  });

  bus.on('kitchen:ready', ({ kitchenId }) => {
    document.body.dataset.kitchen = kitchenId;
    const k = content.kitchens.get(kitchenId);
    dock.replaceChildren(
      ...(k?.stations ?? []).map((s) =>
        h('button', { class: 'dock-key interactive', 'data-station': s.id, title: s.label, onclick: () => bus.emit('station:focus', { stationId: s.id }) }, String(s.key)),
      ),
    );
  });
  bus.on('station:focus', ({ stationId }) => {
    dock.querySelectorAll<HTMLElement>('.dock-key').forEach((b) => b.classList.toggle('on', b.dataset.station === stationId));
  });
}
