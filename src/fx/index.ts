import { defineModule, type Ctx } from '@core/api';
import './fx.css';
import { setupParticles } from './particles';

/**
 * Owner: E. Onomatopoeia pops (咔! 啪! 滋啦!), screen shake on funny fails, pooled particles.
 * See docs/briefs/E-art-audio.md
 */
function setupFx(ctx: Ctx) {
  const layer = ctx.ui.layer('fx');
  const canvas = ctx.three.renderer.domElement;

  ctx.bus.on('fx:pop', ({ text, at, style = 'info' }) => {
    const el = document.createElement('div');
    el.className = `pop pop-${style}`;
    el.textContent = text;
    const pos = at ? ctx.world.toScreen(at) : { x: window.innerWidth / 2, y: window.innerHeight * 0.3, visible: true };
    if (!pos.visible) return;
    el.style.left = `${pos.x}px`;
    el.style.top = `${pos.y}px`;
    layer.append(el);
    window.setTimeout(() => el.remove(), 950);
  });

  ctx.bus.on('step:oops', () => {
    canvas.classList.remove('shake');
    void canvas.offsetWidth;
    canvas.classList.add('shake');
  });

  setupParticles(ctx);
}

export default defineModule({ id: 'fx', owner: 'E', setup: setupFx });
