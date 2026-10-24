import type { Ctx } from '@core/api';

/**
 * Card: start screen (方案 C — left/right playful confrontation, energy converging on 开始游戏).
 * Composition: variant B's symmetric skeleton (utensil banner = iconic scene, equal-weight
 * Home vs Sichuan camps, one central lightning) with A/C's out-of-frame accents (chili string
 * breaks the top-right, pancake stack the bottom-left). All art is hand-drawn SVG in the game's
 * toon language: paper bg, 4px ink outlines, tomato/teal/gold/ember flats, ZCOOL KuaiLe.
 *
 * The kitchen already builds behind this opaque layer (main.ts emits kitchen:enter at boot);
 * 开始游戏 only lifts the curtain. ?auto / ?scene / ?kitchen / ?firstperson skip the curtain
 * entirely so smoke tests and dev deep-links are untouched.
 */
export function createTitle(ctx: Ctx) {
  if (ctx.flags.auto || ctx.flags.scene || ctx.flags.kitchen || ctx.flags.firstperson) return;
  const root = ctx.ui.layer('title');
  root.classList.add('title-layer');

  const SCENE = `
  <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <rect width="1600" height="900" fill="var(--paper)"/>
    <rect y="842" width="1600" height="58" fill="#F0E3C8"/>
    <!-- iconic scene: hanging utensil banner -->
    <path d="M170 74 Q800 22 1430 74 L1430 100 Q800 50 170 100 Z" fill="var(--paper)" class="tk"/>
    <g class="tk" fill="var(--ink)">
      <path d="M250 96 v70 m-14 0 h28 l-7 56 h-14 Z"/>
      <circle cx="345" cy="136" r="34" fill="#3E3A3A"/><path d="M379 136 h72" stroke="var(--ink)" stroke-width="10"/>
      <path d="M495 96 v116 m-30 26 l60 -26" fill="none" stroke="var(--ink)" stroke-width="8"/>
      <path d="M1105 96 v116 m30 26 l-60 -26" fill="none" stroke="var(--ink)" stroke-width="8"/>
      <path d="M1350 96 v70 m14 0 h-28 l7 56 h14 Z"/>
    </g>
    <!-- steam curls off the banner -->
    <g class="steam" stroke="var(--muted)" stroke-width="5" fill="none" opacity=".55" stroke-linecap="round">
      <path d="M600 70 q14 -22 0 -44 q-13 -20 2 -40"/>
      <path d="M1000 66 q14 -22 0 -44 q-13 -20 2 -40"/>
    </g>
    <!-- title -->
    <text x="800" y="238" text-anchor="middle" class="title-t">滋啦厨房</text>
    <text x="800" y="286" text-anchor="middle" class="title-en">SIZZLE KITCHEN</text>
    <!-- LEFT camp: Home (pancakes + flying egg + whisk) -->
    <g class="tk">
      <ellipse cx="268" cy="562" rx="122" ry="31" fill="var(--gold)"/>
      <ellipse cx="280" cy="522" rx="104" ry="26" fill="var(--gold)"/>
      <ellipse cx="292" cy="488" rx="86" ry="22" fill="var(--gold)"/>
      <ellipse cx="470" cy="556" rx="44" ry="54" fill="var(--paper)" transform="rotate(22 470 556)"/>
      <circle cx="484" cy="570" r="18" fill="var(--gold)"/>
      <path d="M236 644 l12 -72 M264 644 l0 -78 M292 644 l-12 -72" fill="none" stroke="var(--ink)" stroke-width="6" stroke-linecap="round"/>
      <circle cx="418" cy="668" r="30" fill="#F4C842"/><path d="M444 674 l24 8 -24 12 Z" fill="var(--tomato)"/>
    </g>
    <!-- RIGHT camp: Sichuan (wok + flames + chili string breaking the frame + peppercorns) -->
    <g class="tk">
      <path d="M1148 548 a132 76 0 0 0 332 4 l-24 76 a132 35 0 0 1 -284 0 Z" fill="#3E3A3A"/>
      <path d="M1244 542 l20 -58 20 50 24 -56 20 66 24 -46 18 52 Z" fill="var(--ember)"/>
      <path d="M1262 496 l15 -42 14 36" fill="var(--gold)"/>
      <path d="M1540 300 q62 92 -6 172 M1540 300 q-66 86 -2 164" fill="none" stroke="var(--ink)" stroke-width="5" stroke-linecap="round"/>
      <g fill="var(--red)" stroke="var(--ink)" stroke-width="3.5">
        <path d="M1508 356 q22 20 4 46 q-16 22 -34 6 q-14 -14 2 -30 q14 -14 28 -22 Z"/>
        <path d="M1568 420 q24 16 10 44 q-13 24 -33 10 q-15 -12 -1 -28 q13 -14 24 -26 Z"/>
      </g>
      <circle cx="1392" cy="600" r="9" fill="var(--sage)"/><circle cx="1422" cy="618" r="9" fill="var(--sage)"/><circle cx="1366" cy="622" r="9" fill="var(--sage)"/>
    </g>
    <!-- central lightning + speed lines + pops -->
    <path d="M812 330 L768 474 L818 474 L776 622 L876 442 L818 442 L860 330 Z" fill="var(--gold)" class="tk bolt"/>
    <g stroke="var(--ink)" stroke-width="4" opacity=".5" fill="none" stroke-linecap="round">
      <path d="M560 424 q140 50 212 122"/><path d="M1040 424 q-140 50 -212 122"/>
      <path d="M600 524 q122 40 182 92"/><path d="M1000 524 q-122 40 -182 92"/>
    </g>
    <g class="tk" fill="var(--paper)">
      <ellipse cx="636" cy="418" rx="88" ry="41"/><text x="636" y="433" text-anchor="middle" class="pop-t" fill="var(--tomato)">滋啦!</text>
      <ellipse cx="978" cy="470" rx="72" ry="34"/><text x="978" y="483" text-anchor="middle" class="pop-t" fill="var(--ember)" style="font-size:30px">咔!</text>
    </g>
    <g fill="var(--gold)" stroke="var(--ink)" stroke-width="3" class="spark">
      <circle cx="702" cy="524" r="8"/><circle cx="922" cy="564" r="7"/><circle cx="764" cy="594" r="6"/>
    </g>
    <text x="800" y="876" text-anchor="middle" class="title-foot">两个厨房 · 一张美食地图 · 拖拽做菜</text>
  </svg>`;

  root.innerHTML = `<div class="title-stage interactive">${SCENE}<button class="title-start" type="button" aria-label="开始游戏">开 始 游 戏</button></div>`;

  let dismissed = false;
  const start = () => {
    if (dismissed) return;
    dismissed = true;
    ctx.bus.emit('sfx:play', { id: 'step_done' });
    root.classList.add('bye');
    ctx.after(460, () => root.remove());
  };
  root.querySelector('.title-start')!.addEventListener('click', start);
  ctx.input.onKey('Enter', start);
}
