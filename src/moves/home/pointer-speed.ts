import type { Ctx } from '@core/api';

/**
 * Pointer speed in CSS px/s, sampled from pointermove (screen-space flick detection for B1/B3).
 * Positive vy = downward on screen. Smoothed a little so a single jittery event can't trigger.
 */
export function createPointerSpeed(ctx: Ctx) {
  let last = { x: 0, y: 0, t: 0 };
  let vx = 0;
  let vy = 0;
  const off = ctx.input.onPointer((kind, e) => {
    if (kind !== 'move') return;
    const now = performance.now();
    const dt = (now - last.t) / 1000;
    if (dt <= 0.002) return;
    if (dt < 0.12) {
      // exponential blend: fast enough to track a flick, slow enough to ignore one noisy sample
      const locked = document.pointerLockElement !== null;
      vx = vx * 0.4 + ((locked ? e.movementX : e.clientX - last.x) / dt) * 0.6;
      vy = vy * 0.4 + ((locked ? e.movementY : e.clientY - last.y) / dt) * 0.6;
    }
    last = { x: e.clientX, y: e.clientY, t: now };
  });
  return { vx: () => vx, vy: () => vy, dispose: off };
}
