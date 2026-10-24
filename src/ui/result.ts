import type { Ctx } from '@core/api';
import { h } from './dom';

const STAMP: Record<string, string> = { oops: '哎呀!', good: '良好', great: '优秀', perfect: '完美' };

/** Sketch board 5. TODO(D): camera push-in, stamp slam, coins flying into the counter one by one (~2 s, skippable). */
export function createResult(ctx: Ctx) {
  const { bus, content } = ctx;
  const root = ctx.ui.layer('result');
  root.classList.add('dim');
  root.hidden = true;

  const close = (next: 'again' | 'shop' | 'route') => bus.emit('result:closed', { next });

  bus.on('result:shown', (r) => {
    if (ctx.flags.skipResult) return close('again');
    const dish = content.dishes.get(r.dishId);
    const total = r.coins.reduce((a, l) => a + l.amount, 0);
    root.replaceChildren(
      h(
        'div',
        { class: 'card result-card interactive' },
        h('div', { class: 'result-dish' }, dish?.name ?? r.dishId),
        h('div', { class: `stamp stamp-${r.rating}` }, STAMP[r.rating] ?? r.rating),
        h('div', { class: 'stars' }, ...(dish?.stars ?? []).map((s) => h('span', { class: r.stars.includes(s.id) ? 'star on' : 'star', title: s.text }, '★'))),
        h('ul', { class: 'coin-lines' }, ...r.coins.map((l) => h('li', {}, h('span', {}, l.reason), h('b', {}, `+${l.amount}`)))),
        h('div', { class: 'coin-total' }, `合计 +${total}`),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn', onclick: () => close('again') }, '再做一道'),
          h('button', { class: 'btn primary', onclick: () => close('shop') }, '去商店 →'),
        ),
      ),
    );
    root.hidden = false;
  });
  bus.on('result:closed', () => (root.hidden = true));
  ctx.input.onKey('Enter', () => !root.hidden && close('again'));
}
