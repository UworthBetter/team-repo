import type { Gesture, MetaState } from '@contracts/types';
import type { Ctx } from '@core/api';
import { h } from './dom';

/**
 * Sketch board 4: dish card top-left, coins + shop/route top-right, hint pill bottom-center,
 * dock bottom-left, retry bottom-right. Card D6 adds: a gesture SVG icon in every hint, a
 * ×N counter for steps with count params, a "2/3" step counter on the dish card, station
 * labels in the dock and the sticker-book entry point (card D5).
 */

/** One small inline icon per Gesture — stroke follows the pill text colour. */
const GESTURE_SVG: Record<Gesture, string> = {
  drag: '<svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="2.4"/><path d="M10 12h9m0 0-3.4-3.4M19 12l-3.4 3.4"/></svg>',
  'flick-down': '<svg viewBox="0 0 24 24"><path d="M12 4v13m0 0-4-4m4 4 4-4"/><path d="M6.5 5.5C8 4 10 3.2 12 3.2s4 .8 5.5 2.3" opacity=".45"/></svg>',
  'flick-up': '<svg viewBox="0 0 24 24"><path d="M12 20V7m0 0-4 4m4-4 4 4"/><path d="M6.5 18.5C8 20 10 20.8 12 20.8s4-.8 5.5-2.3" opacity=".45"/></svg>',
  'pull-apart': '<svg viewBox="0 0 24 24"><path d="M9.5 12H2.8m0 0 3-3m-3 3 3 3"/><path d="M14.5 12h6.7m0 0-3-3m3 3-3 3"/><circle cx="12" cy="12" r="1.6"/></svg>',
  circle: '<svg viewBox="0 0 24 24"><path d="M19.5 12a7.5 7.5 0 1 1-2.6-5.7"/><path d="M17.5 2.8v3.8h-3.8" transform="translate(0.5 -0.3)"/></svg>',
  'hold-tilt': '<svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="2.6"/><path d="M7.8 12.2 4.6 15.9M16.2 12.2l3.2 3.7M12 12.4V19"/><path d="M8.6 19h6.8" opacity=".45"/></svg>',
  'pull-push': '<svg viewBox="0 0 24 24"><path d="M3.5 8h13m0 0-3.2-3.2M16.5 8l-3.2 3.2"/><path d="M20.5 16h-13m0 0 3.2-3.2M7.5 16l3.2 3.2"/></svg>',
  'scroll-rotate': '<svg viewBox="0 0 24 24"><rect x="9" y="3.4" width="6" height="11" rx="3"/><path d="M12 6.6v1.6"/><path d="M4.8 17.4a8 8 0 0 0 14.4 0"/></svg>',
  click: '<svg viewBox="0 0 24 24"><path d="M7.5 3.8 18 13.2l-5 .6 2.6 5.4-2.8 1.3-2.6-5.4-3.7 3.4z"/></svg>',
};

const svgEl = (svg: string) => {
  const t = document.createElement('template');
  t.innerHTML = svg.trim();
  return t.content.firstChild as SVGElement;
};

const countOf = (params: Record<string, unknown>): number | null => {
  for (const k of ['count', 'beats', 'layers', 'circles']) {
    const v = Number(params[k]);
    if (Number.isFinite(v) && v > 0) return v;
  }
  return null;
};

export function createHud(ctx: Ctx, open: (panel: 'shop' | 'route' | 'stickers') => void) {
  const { bus, content } = ctx;
  const root = ctx.ui.layer('hud');

  const title = h('div', { class: 'dish-title' }, '—');
  const stepCounter = h('span', { class: 'step-counter' });
  const steps = h('ol', { class: 'dish-steps' });
  const card = h('div', { class: 'card dish-card' }, h('div', { class: 'dish-head' }, title, stepCounter), steps);

  const coinNum = h('span', { class: 'coin-num' }, '0');
  const coins = h('div', { class: 'pill coin-pill' }, h('span', { class: 'coin-icon' }), coinNum);
  const shopBtn = h('button', { class: 'round interactive', title: '商店', onclick: () => open('shop') }, '商店');
  const routeBtn = h('button', { class: 'round interactive', title: '路线', onclick: () => open('route') }, '路线');
  const stickerBtn = h('button', { class: 'round interactive', title: '贴纸册', onclick: () => open('stickers') }, '贴纸');
  const topRight = h('div', { class: 'top-right' }, coins, shopBtn, routeBtn, stickerBtn);

  const hintText = h('span', { class: 'hint-text' });
  const hintCount = h('span', { class: 'hint-count' });
  const hint = h('div', { class: 'hint-pill', hidden: true });
  const dock = h('div', { class: 'pill dock' });
  const retry = h('button', { class: 'round retry interactive', title: '重来 (R)', onclick: () => bus.emit('dish:restart', {}) }, '↺');

  // Progress counters ("绕碗画圈搅拌 · 47%") re-emit hint:show on every pointer move.
  // Rebuilding the pill and re-triggering the pop each time left it stuck mid-scale —
  // blurry, unreadable text. So: swap the icon only when the gesture changes, update the
  // text silently, and pop at most once per 600 ms (a genuinely NEW instruction).
  let hintGesture: Gesture | null | undefined;
  let hintShownAt = 0;

  root.append(card, topRight, hint, dock, retry);
  ctx.input.onKey('KeyR', () => bus.emit('dish:restart', {}));

  let currentParams: Record<string, unknown> = {};
  let dishStepIds: string[] = [];

  bus.on('dish:start', ({ dishId }) => {
    const d = content.dishes.get(dishId);
    title.textContent = d?.name ?? dishId;
    dishStepIds = (d?.steps ?? []).map((s) => s.id);
    stepCounter.textContent = `0/${dishStepIds.length}`;
    steps.replaceChildren(...(d?.steps ?? []).map((s) => h('li', { 'data-step': s.id }, ctx.moves.get(s.move).label)));
  });
  bus.on('step:start', ({ stepId, params }) => {
    currentParams = params;
    const i = dishStepIds.indexOf(stepId);
    if (i >= 0) stepCounter.textContent = `${i + 1}/${dishStepIds.length}`;
    steps.querySelectorAll('li').forEach((li) => li.classList.toggle('active', li.dataset.step === stepId));
    const n = countOf(params);
    hintCount.textContent = n ? `×${n}` : '';
  });
  bus.on('step:complete', ({ stepId }) => {
    const li = steps.querySelector<HTMLElement>(`li[data-step="${stepId}"]`);
    li?.classList.remove('active');
    li?.classList.add('done');
  });
  bus.on('hint:show', ({ text, gesture }) => {
    const g = gesture ?? null;
    if (g !== hintGesture) {
      hintGesture = g;
      hint.replaceChildren(g ? svgEl(GESTURE_SVG[g]) : '', hintText, hintCount);
    }
    hintText.textContent = text;
    hint.hidden = false;
    const fresh = hintShownAt === 0;
    if (fresh || performance.now() - hintShownAt >= 600) {
      hintShownAt = performance.now();
      // Re-trigger the pop so every NEW instruction physically announces itself.
      hint.classList.remove('pop');
      void hint.offsetWidth;
      hint.classList.add('pop');
    }
  });
  bus.on('hint:clear', () => {
    hint.hidden = true;
    hintShownAt = 0;
  });
  // 风格 A 四态之一：失误后的 2.5 秒里提示转警告红，让"哎呀"有颜色回应。
  // 不在 hint:show 里清除——进度计数会高频重发 hint:show，会把警告瞬间洗掉。
  bus.on('step:oops', () => {
    if (hint.hidden) return;
    hint.classList.add('warn');
    ctx.after(2500, () => hint.classList.remove('warn'));
  });

  const setCoins = (s: Pick<MetaState, 'coins'>) => (coinNum.textContent = String(s.coins));
  bus.on('meta:state', setCoins);
  bus.on('coins:change', ({ total, delta }) => {
    setCoins({ coins: total });
    if (delta > 0) {
      coins.classList.remove('bump');
      void coins.offsetWidth;
      coins.classList.add('bump');
      // Floating +N: the reward number itself flies up next to the pill (juice pattern:
      // every gain gets its own visible cause, not just a silent counter change).
      const gain = h('span', { class: 'coin-delta' }, `+${delta}`);
      gain.style.right = `${window.innerWidth - coins.getBoundingClientRect().right}px`;
      gain.style.top = `${coins.getBoundingClientRect().bottom + 4}px`;
      root.append(gain);
      window.setTimeout(() => gain.remove(), 1000);
    }
  });

  bus.on('kitchen:ready', ({ kitchenId }) => {
    document.body.dataset.kitchen = kitchenId;
    const k = content.kitchens.get(kitchenId);
    dock.replaceChildren(
      ...(k?.stations ?? []).map((s) =>
        h(
          'button',
          { class: 'dock-key interactive', 'data-station': s.id, title: s.label, onclick: () => bus.emit('station:focus', { stationId: s.id }) },
          h('b', {}, String(s.key)),
          h('span', {}, s.label),
        ),
      ),
    );
  });
  bus.on('station:focus', ({ stationId }) => {
    dock.querySelectorAll<HTMLElement>('.dock-key').forEach((b) => b.classList.toggle('on', b.dataset.station === stationId));
  });
}
