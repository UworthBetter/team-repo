import type { Route } from '@contracts/schemas';
import type { MetaState } from '@contracts/types';
import type { Ctx } from '@core/api';
import { h } from './dom';

/**
 * Card D4 — the 中华美食地图 (food map): an SVG landscape with 11 pins placed by
 * route.nodes[].mapPos on stylized hills, a river and a coast. NO political borders —
 * it is a food map, not an administrative one (design doc is explicit about this).
 * Card D8 — the unlock ceremony: the path draws itself to the new pin, the gate lock
 * cracks and the pin pulses. Both live here so the map and its animations share state.
 */

type RouteNode = Route['nodes'][number];

const W = 1000;
const H = 640;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const wrapZh = (s: string, n: number) => (s.length <= n ? [s] : [s.slice(0, n), s.slice(n, n * 2)].filter(Boolean));

/** Stylized scenery: hills, a river and a coast. Purely decorative, no borders. */
function scenerySvg(): string {
  return `
  <rect x="0" y="0" width="${W}" height="${H}" fill="#F6ECD9"/>
  <path d="M0 118 C150 66 290 96 420 74 C560 50 700 92 830 60 L1000 84 L1000 0 L0 0 Z" fill="#E7DDBF" opacity=".7"/>
  <path d="M-20 200 C140 148 300 190 460 158 C620 128 780 180 1020 132 L1020 96 C760 140 600 96 440 128 C280 160 130 116 -20 164 Z" fill="#CFE0C2" opacity=".8"/>
  <path d="M-20 330 C160 282 320 330 480 296 C640 262 800 316 1020 268 L1020 236 C790 282 640 236 480 268 C320 300 160 258 -20 300 Z" fill="#BBD4A9" opacity=".75"/>
  <path d="M-20 470 C180 428 340 476 520 442 C700 408 860 458 1020 420 L1020 396 C850 434 700 388 520 420 C340 452 180 406 -20 446 Z" fill="#A9C995" opacity=".6"/>
  <path d="M620 660 C700 560 840 560 1040 600 L1040 700 L560 700 Z" fill="#BFDDE4" opacity=".55"/>
  <path d="M60 120 C180 200 200 320 140 420 C100 490 120 560 200 620" fill="none" stroke="#A8CDD8" stroke-width="26" stroke-linecap="round" opacity=".6"/>
  <path d="M200 620 C300 590 360 620 420 600" fill="none" stroke="#A8CDD8" stroke-width="20" stroke-linecap="round" opacity=".5"/>
  <text x="150" y="70" class="map-title">中华美食地图</text>`;
}

function posOf(n: RouteNode, i: number): { x: number; y: number } {
  if (n.mapPos) return { x: n.mapPos[0], y: n.mapPos[1] };
  // Defensive fallback: a lazy spiral, so a node without mapPos never stacks at 0,0.
  const a = i * 0.9;
  return { x: W / 2 + Math.cos(a) * (120 + i * 26), y: H / 2 + Math.sin(a) * (90 + i * 18) };
}

/** A hand-drawn-ish connector: a quadratic bump perpendicular to each segment. */
function pathThrough(points: { x: number; y: number }[]): string {
  if (points.length < 2) return '';
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2 - 16;
    d += ` Q ${mx} ${my} ${b.x} ${b.y}`;
  }
  return d;
}

export interface RouteMapCardOpts {
  /** Kitchen id just unlocked — triggers the D8 ceremony on this render. */
  celebrate?: string;
  onEnter?: (kitchenId: string) => void;
}

export function createRouteMap(ctx: Ctx) {
  const nodes = ctx.content.route.nodes;
  const gateName = (gate: string | null | undefined) => (gate ? (ctx.content.equipment.get(gate)?.name ?? gate) : null);
  const chain = (branch: string) => nodes.filter((n) => (n.branch ?? 'main') === branch);
  const mainChain = chain('main');

  /** Segment is walkable when both ends are unlocked AND the target kitchen exists. */
  const openPair = (state: MetaState, a: RouteNode, b: RouteNode) =>
    state.unlocked.includes(a.kitchenId) && state.unlocked.includes(b.kitchenId) && !b.placeholder && ctx.content.kitchens.has(b.kitchenId);

  return {
    card(state: MetaState, currentKitchenId: string, opts: RouteMapCardOpts = {}): HTMLElement {
      const pts = new Map(nodes.map((n, i) => [n.kitchenId, posOf(n, i)]));
      const celebrateIdx = opts.celebrate ? nodes.findIndex((n) => n.kitchenId === opts.celebrate) : -1;

      const pathsSvg: string[] = [];
      const drawChain = (list: RouteNode[], branchId: string) => {
        const p = list.map((n) => pts.get(n.kitchenId)!);
        // One <path> per segment so the D8 stroke-draw can target a single segment.
        for (let i = 1; i < list.length; i++) {
          const a = list[i - 1]!;
          const b = list[i]!;
          const open = openPair(state, a, b);
          const isCelebrated = celebrateIdx === nodes.indexOf(b);
          pathsSvg.push(
            `<path data-seg="${a.kitchenId}→${b.kitchenId}" d="${pathThrough([pts.get(a.kitchenId)!, pts.get(b.kitchenId)!])}" ` +
              `fill="none" pathLength="1" class="map-path ${open ? 'open' : 'locked'}${isCelebrated ? ' draw' : ''}"${branchId !== 'main' ? ` data-branch="${branchId}"` : ''}/>`,
          );
        }
      };
      drawChain(mainChain, 'main');
      for (const b of ['south', 'east', 'north']) {
        const trunk = mainChain[mainChain.length - 1];
        drawChain(trunk ? [trunk, ...chain(b)] : chain(b), b);
      }

      const pinsSvg = nodes
        .map((n) => {
          const { x, y } = pts.get(n.kitchenId)!;
          const unlocked = state.unlocked.includes(n.kitchenId) && !n.placeholder && ctx.content.kitchens.has(n.kitchenId);
          const here = unlocked && n.kitchenId === currentKitchenId;
          const gate = gateName(n.gate);
          const blurb = wrapZh(n.blurb ?? '', 11);
          const celebrating = opts.celebrate === n.kitchenId;
          if (unlocked) {
            return (
              `<g class="pin open${here ? ' here' : ''}${celebrating ? ' pulse' : ''}" data-kitchen="${esc(n.kitchenId)}" transform="translate(${x},${y})" role="button" tabindex="0">` +
              (here ? `<text y="-30" class="map-here">你在这里</text>` : '') +
              `<path d="M0 4 C-11 -6 -12 -20 0 -24 C12 -20 11 -6 0 4 Z" class="pin-body"/>` +
              `<circle cy="-14" r="4.6" class="pin-dot"/>` +
              `<text y="24" class="pin-name">${esc(n.name)}</text></g>`
            );
          }
          return (
            `<g class="pin locked${celebrating ? ' pulse' : ''}" transform="translate(${x},${y})">` +
            `<ellipse rx="52" ry="24" class="map-fog"/>` +
            `<path d="M0 4 C-11 -6 -12 -20 0 -24 C12 -20 11 -6 0 4 Z" class="pin-body"/>` +
            `<circle cy="-14" r="4.6" class="pin-dot"/>` +
            (gate || celebrating ? `<text y="-32" class="map-lock${celebrating ? ' crack' : ''}">🔒</text>` : '') +
            `<text y="24" class="pin-name">${esc(n.name)}</text>` +
            (gate ? `<text y="41" class="map-gate">需要 ${esc(gate)}</text>` : '') +
            blurb.map((l, li) => `<text y="${56 + li * 15}" class="map-blurb">${esc(l)}</text>`).join('') +
            `</g>`
          );
        })
        .join('');

      const wrap = h('div', { class: 'route-map' });
      wrap.innerHTML =
        `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${scenerySvg()}${pathsSvg.join('')}${pinsSvg}</svg>`;
      const svg = wrap.querySelector('svg')!;

      // Clickable unlocked pins → kitchen:enter (anyone may emit; core builds it).
      svg.querySelectorAll<SVGGElement>('.pin.open').forEach((g) => {
        const enter = () => opts.onEnter?.(g.dataset.kitchen!);
        g.addEventListener('click', enter);
        g.addEventListener('keydown', (e) => (e as KeyboardEvent).key === 'Enter' && enter());
      });

      // D8: kick off the CSS stroke-draw one frame after mount (auto skips straight to the end state).
      if (opts.celebrate && !ctx.flags.auto) {
        requestAnimationFrame(() => svg.querySelectorAll('.map-path.draw, .pin.pulse, .map-lock.crack').forEach((el) => el.classList.add('go')));
      }
      return wrap;
    },
  };
}
