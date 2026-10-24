import type { Rating } from '@contracts/types';
import type { Ctx } from '@core/api';
import { h } from './dom';

/**
 * Card D1 — the result ceremony as a timed sequence (sketch board 5), ≤ 2.2 s, any click skips:
 *   0.0 s  camera:push toward the plate
 *   0.4 s  stamp slams (CSS scale 2.2 → 1 with overshoot) + sfx stamp
 *   0.9 s  coins fly from the plate's screen position to the coin pill, one per 40 ms, counting up
 *   1.4 s  stars light one by one
 *   2.0 s  buttons appear
 * camera:release goes out on close. ctx.after timers respect ?fast so ?auto stays fast.
 */

const STAMP: Record<Rating, string> = { oops: '哎呀!', good: '良好', great: '优秀', perfect: '完美' };
const T = { stamp: 400, coins: 900, stars: 1400, buttons: 2000, coinGap: 40, coinFly: 460 };

/** Where the finished dish sits: the plate/pass station, else the first snap that accepts anything. */
function plateWorldPos(ctx: Ctx): [number, number, number] {
  const w = ctx.world;
  const firstStation = ctx.content.kitchens.get(w.kitchenId ?? '')?.stations[0]?.id ?? '';
  const v = w.stationAnchor('plate') ?? w.stationAnchor('pass') ?? w.snapPos('plate_center') ?? w.snapPos('pass_center') ?? w.stationAnchor(firstStation);
  return v ? [v.x, v.y, v.z] : [0, 1.0, -0.5];
}

export function createResult(ctx: Ctx) {
  const { bus, content } = ctx;
  const root = ctx.ui.layer('result');
  root.classList.add('dim');
  root.hidden = true;

  let active = false;
  let offs: (() => void)[] = [];
  /** Stars per dish from the last meta:state — meta publishes AFTER result:shown, so at
   * result time this still holds the pre-run set: diffing it marks first-time stars. */
  let prevStars: Record<string, string[]> = {};
  bus.on('meta:state', (s) => (prevStars = s.stars));
  const clearTimers = () => {
    offs.forEach((f) => f());
    offs = [];
  };
  let shown = 0; // coins counted up so far (for the skip jump)

  const close = (next: 'again' | 'shop' | 'route') => {
    if (!active) return;
    active = false;
    clearTimers();
    bus.emit('camera:release', {});
    root.replaceChildren();
    root.hidden = true;
    bus.emit('result:closed', { next });
  };

  bus.on('result:shown', (r) => {
    if (ctx.flags.skipResult) return close('again');
    if (active) close('again');
    active = true;
    shown = 0;

    const dish = content.dishes.get(r.dishId);
    const total = Math.max(0, r.coins.reduce((a, l) => a + l.amount, 0));
    const had = new Set(prevStars[r.dishId] ?? []);
    const plate = plateWorldPos(ctx);
    bus.emit('camera:push', { at: plate, zoom: 1.7, ms: 500 });

    const stampEl = h('div', { class: `stamp stamp-${r.rating}` }, STAMP[r.rating]);
    const counter = h('b', {}, '+0');
    const coinTotal = h('div', { class: 'coin-total' }, '合计 ', counter);
    const starEls = (dish?.stars ?? []).map((s) => {
      // P1-1 (design_fix_zh.md §9.1): 只有本局获得的星星会点亮，其余保持灰描边。
      const el = h('span', { class: `star${r.stars.includes(s.id) ? '' : ' off'}`, title: s.text }, '★');
      // First-time stars wear a 新! badge — the classic "new unlock" dopamine marker.
      if (r.stars.includes(s.id) && !had.has(s.id)) el.append(h('i', { class: 'star-new' }, '新!'));
      return el;
    });
    const stars = h('div', { class: 'stars' }, ...starEls);
    const buttons = h(
      'div',
      { class: 'row result-buttons' },
      h('button', { class: 'btn', onclick: () => close('again') }, '再做一道'),
      h('button', { class: 'btn primary', onclick: () => close('shop') }, '去商店 →'),
    );
    const seq = h(
      'div',
      { class: 'result-seq' },
      h('div', { class: 'result-dish' }, dish?.name ?? r.dishId),
      stampEl,
      h('div', { class: 'result-quality' }, `完成度 ${Math.round(r.quality * 100)}%`),
      coinTotal,
      h('ul', { class: 'coin-lines' }, ...r.coins.map((l) => h('li', {}, h('span', {}, l.reason), h('b', {}, `+${l.amount}`)))),
      stars,
      buttons,
      h('div', { class: 'result-skip' }, '点击任意处跳过'),
    );
    // The full-area catcher eats clicks (skip) and keeps them off the kitchen underneath.
    const catcher = h('div', { class: 'result-catcher interactive' }, seq);
    root.replaceChildren(catcher);
    root.hidden = false;

    const at = (ms: number, fn: () => void) => offs.push(ctx.after(ms, fn));
    const skipToEnd = () => {
      if (!active) return;
      clearTimers();
      stampEl.classList.add('slam');
      shown = total;
      counter.textContent = `+${total}`;
      starEls.forEach((s) => {
        if (!s.classList.contains('off')) s.classList.add('on');
      });
      buttons.classList.add('show');
    };
    catcher.addEventListener('click', skipToEnd);

    stampEl.classList.add('pre');
    at(T.stamp, () => {
      stampEl.classList.remove('pre');
      stampEl.classList.add('slam');
      bus.emit('sfx:play', { id: 'stamp' });
    });

    // Coin flights: capped count of dots, each worth an even slice, landing ticks the counter.
    const flights = Math.min(total > 0 ? Math.max(1, Math.round(total / 10)) : 0, 12);
    const per = flights > 0 ? total / flights : 0;
    const bumpPill = () => {
      const pill = document.querySelector('.coin-pill');
      if (!pill) return;
      pill.classList.remove('bump');
      void (pill as HTMLElement).offsetWidth;
      pill.classList.add('bump');
    };
    const flyCoin = (i: number) => {
      const from = ctx.world.toScreen([plate[0], plate[1] + 0.15, plate[2]]);
      const pill = document.querySelector('.coin-pill');
      const pillRect = pill?.getBoundingClientRect();
      const dot = document.createElement('div');
      dot.className = 'coin-fly';
      const x0 = from.x;
      const y0 = from.y;
      const x1 = pillRect ? pillRect.left + pillRect.width / 2 : window.innerWidth - 140;
      const y1 = pillRect ? pillRect.top + pillRect.height / 2 : 40;
      dot.style.transform = `translate(${x0}px, ${y0}px)`;
      root.append(dot);
      const anim = dot.animate(
        [
          { transform: `translate(${x0}px, ${y0}px) scale(1)`, opacity: 1 },
          { transform: `translate(${(x0 + x1) / 2}px, ${(y0 + y1) / 2 - 60}px) scale(1.25)`, opacity: 1, offset: 0.5 },
          { transform: `translate(${x1}px, ${y1}px) scale(0.7)`, opacity: 0.9 },
        ],
        { duration: T.coinFly / Math.max(0.25, ctx.flags.fast), easing: 'cubic-bezier(.45,-0.25,.6,1)' },
      );
      anim.onfinish = () => {
        dot.remove();
        shown = Math.min(total, Math.round(shown + per));
        counter.textContent = `+${shown}`;
        bumpPill();
      };
    };
    for (let i = 0; i < flights; i++) at(T.coins + i * T.coinGap, () => flyCoin(i));

    at(T.stars, () => {
      starEls.forEach((s, i) =>
        at(i * 180, () => {
          if (s.classList.contains('off')) return; // 未获得的星不点亮、不响
          s.classList.add('on');
          bus.emit('sfx:play', { id: 'star' });
        }),
      );
    });
    at(T.buttons, () => buttons.classList.add('show'));
  });

  bus.on('result:closed', () => {
    active = false;
    clearTimers();
    root.replaceChildren();
    root.hidden = true;
  });
  ctx.input.onKey('Enter', () => active && close('again'));
}
