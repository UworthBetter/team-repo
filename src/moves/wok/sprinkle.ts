import * as THREE from 'three';
import { defineMove, type StepStart } from '@core/api';
import './sprinkle.css';

/**
 * 撒料 — grab the container named in params.item (matched by prop kind), hold it over
 * the wok and shake the pointer side-to-side. Each direction reversal (≥ SHAKE_PX of
 * travel) is one shake and emits particles via fx:emit {preset: item} — E4's presets
 * render them once landed. Release to commit:
 *   total inside amount ± 20% → quality peaks (0.9–1.0), tag 'perfect_spice' at ≥ 0.95
 *   total > 150% of amount → 手麻了: screen tingle, 「麻!」, step:oops, still completes
 */
const SHAKE_PX = 16; // travel needed between direction flips to count a shake
const OVER_WOK = 0.48; // meters — horizontal reach of "holding it over the wok"
const SPILL_MIN = 1; // releasing with fewer shakes than this just re-hints

export const sprinkle = defineMove({
  id: 'sprinkle',
  label: '撒料',
  start(ctx, step: StepStart) {
    const item = String(step.params.item ?? 'huajiao');
    const amount = Math.max(1, Math.round(Number(step.params.amount) || 8));

    const wokCenter = ctx.world.prop('wok')?.object.position ?? ctx.world.snapPos('wok_center') ?? new THREE.Vector3(0, 0.9, -0.6);
    const container = ctx.world.propsOfKind(item)[0];
    let shakes = 0;
    let done = false;
    let t = 0;
    let autoShakes = 0;

    // Shake tracking: signed travel accumulator; a flip with enough travel = one shake.
    let travel = 0;
    let dir = 0;
    let lastX: number | null = null;

    const offs: (() => void)[] = [];
    const at = [wokCenter.x, wokCenter.y + 0.25, wokCenter.z] as [number, number, number];
    const pop = (text: string, style: 'info' | 'good' | 'perfect' | 'oops') => ctx.bus.emit('fx:pop', { text, style, at });

    const hint = () =>
      ctx.bus.emit('hint:show', {
        text: `拿着${item === 'huajiao' ? '花椒' : '料'}在锅上抖 · ${shakes}/${amount}`,
        gesture: 'drag',
      });

    const tingling = ctx.ui.layer('sprinkle');

    function tingle() {
      // Screen goes numb: a short wobble+desaturate pulse on my own DOM layer.
      pop('麻!', 'oops');
      ctx.bus.emit('sfx:play', { id: 'oops' });
      tingling.classList.add('sp-tingle');
      void ctx.after(1100, () => tingling.classList.remove('sp-tingle'));
    }

    function qualityFor(total: number): { q: number; oops: boolean } {
      const ratio = total / amount;
      if (ratio > 1.5) return { q: 0.2, oops: true };
      const band = amount * 0.2;
      const off = Math.abs(total - amount);
      if (off <= band) return { q: 1 - (off / band) * 0.1, oops: false };
      return { q: Math.max(0.2, 0.9 - ((off - band) / amount) * 1.2), oops: false };
    }

    const cleanup = () => {
      offs.forEach((f) => f());
      tingling.classList.remove('sp-tingle');
      ctx.world.resetProp(container?.id ?? `bowl_${item}`);
    };

    const finish = (q: number, oops: boolean) => {
      if (done) return;
      done = true;
      cleanup();
      ctx.bus.emit('hint:clear', {});
      if (oops) {
        ctx.bus.emit('step:oops', { dishId: step.dishId, stepId: step.stepId, reason: 'overdue' });
        pop('麻麻麻!!', 'oops');
      } else if (q >= 0.95) {
        pop('恰到好处!', 'perfect');
        ctx.bus.emit('sfx:play', { id: 'step_done' });
      } else if (q >= 0.6) {
        pop('香!', 'good');
        ctx.bus.emit('sfx:play', { id: 'step_done' });
      } else {
        pop('手抖多了…', 'oops');
        ctx.bus.emit('sfx:play', { id: 'oops' });
      }
      const tags = q >= 0.95 ? ['perfect_spice'] : [];
      ctx.bus.emit('step:complete', { dishId: step.dishId, stepId: step.stepId, quality: q, tags });
    };

    function onPointer(kind: 'down' | 'move' | 'up', e: PointerEvent) {
      if (done) return;
      if (kind === 'down') {
        travel = 0;
        dir = 0;
        lastX = null;
        return;
      }
      if (kind === 'up') {
        // The commit happens in the grab:end handler below — core clears input.held
        // before my pointer handler runs, so "was holding" is unknowable here.
        travel = 0;
        dir = 0;
        lastX = null;
        return;
      }
      const held = ctx.input.held;
      if (!held || !container || held.id !== container.id) return;
      const p = held.object.position;
      const overWok = Math.hypot(p.x - wokCenter.x, p.z - wokCenter.z) < OVER_WOK;
      if (!overWok) {
        lastX = null;
        return;
      }
      if (lastX === null) {
        lastX = e.clientX;
        return;
      }
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      const d = Math.sign(dx);
      if (d === 0) return;
      if (d !== dir && Math.abs(travel) >= SHAKE_PX) {
        // Direction reversed after a real swing: one shake.
        shakes++;
        travel = 0;
        dir = d;
        ctx.bus.emit('fx:emit', { preset: item, at });
        ctx.bus.emit('sfx:play', { id: 'snap_hover' });
        if (shakes === amount) pop('够了!', 'good');
        else if (shakes === Math.ceil(amount * 1.5)) tingle();
        if (!ctx.flags.auto) hint();
      } else if (d !== dir) {
        dir = d;
        travel = 0;
      } else {
        travel += dx;
      }
    }

    offs.push(ctx.input.onPointer(onPointer));
    // Releasing the container commits the seasoning (grab:end fires after core's own
    // up-handler, but the objectId still tells us whose grip ended).
    offs.push(
      ctx.bus.on('grab:end', ({ objectId }) => {
        if (done || !container || objectId !== container.id) return;
        if (shakes >= SPILL_MIN) {
          const { q, oops } = qualityFor(shakes);
          finish(q, oops);
        } else {
          hint(); // picked it up and put it right back — show the hint again
        }
      }),
    );
    offs.push(
      ctx.input.onKey('KeyO', () => {
        if (done) return;
        ctx.bus.emit('step:oops', { dishId: step.dishId, stepId: step.stepId, reason: 'forced' });
        finish(0.15, false);
      }),
    );
    offs.push(
      ctx.bus.on('kitchen:enter', () => {
        if (done) return;
        done = true;
        cleanup();
      }),
    );

    offs.push(
      ctx.onFrame((dt: number) => {
        t += dt;
        // ?auto shakes exactly `amount` times, then commits.
        if (ctx.flags.auto && !done && container) {
          const target = 0.5 + autoShakes * 0.13;
          if (t >= target && autoShakes < amount) {
            autoShakes++;
            shakes = autoShakes;
            ctx.bus.emit('fx:emit', { preset: item, at });
            ctx.bus.emit('sfx:play', { id: 'snap_hover' });
          }
          if (autoShakes >= amount && t >= target + 0.35) {
            const { q } = qualityFor(shakes);
            finish(q, false);
          }
        }
        // The container lifts and tilts a little once grabbed, reading as "shaking it out".
        const held = ctx.input.held;
        if (held && container && held.id === container.id) {
          held.object.rotation.z += (Math.sin(t * 30) * 0.18 - held.object.rotation.z) * 0.4;
        }
      }),
    );

    if (!ctx.flags.auto) hint();
    return {
      dispose() {
        if (done) return;
        done = true;
        cleanup();
      },
    };
  },
});
