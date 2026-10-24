import * as THREE from 'three';
import { defineMove, type StepStart } from '@core/api';
import { watchMeta } from './equipment';

/**
 * 爆火 — the heat move. Hold the pointer: the wok edge tips toward the burner and a
 * flame grows under it (0.6 s to a real burst). Release to flare:
 *   < 0.6 s  fizzle (tiny flame, low quality, no burst)
 *   1.0–1.6 s  the sweet spot — quality 1.0, tag 'big_flare'
 *   > 1.6 s  over the fire — quality decays
 * An installed 灶火增压器 (flame_booster) scales the flame and the quality bonus by
 * effects.flare.power (read from meta:state).
 */
const BURST_AT = 0.6; // s of holding before the flame can actually burst
const SWEET_LO = 1.0;
const SWEET_HI = 1.6;

export const flare = defineMove({
  id: 'flare',
  label: '爆火',
  start(ctx, step: StepStart) {
    const wokProp = ctx.world.prop('wok');
    const center =
      wokProp?.object.position.clone().add(new THREE.Vector3(0, -0.02, 0)) ??
      ctx.world.snapPos('wok_center') ??
      new THREE.Vector3(0, 0.9, -0.6);

    let power = 1; // flame_booster.effects.flare.power, default plain stove
    let holding = false;
    let holdT = 0;
    let done = false;
    let t = 0;
    let burst = 0; // 0→1 spike then fade after release
    let fading = false;

    const offs: (() => void)[] = [];
    const pop = (text: string, style: 'info' | 'good' | 'perfect' | 'oops') =>
      ctx.bus.emit('fx:pop', { text, style, at: [center.x, center.y + 0.35, center.z] });

    /* ---------------- flame meshes (mine, in world.root) ---------------- */

    const root = ctx.world.root;
    // A fan of cones hugging the wok's front rim, licking UP around the edge —
    // not a single spike through the wok's middle.
    const flame = new THREE.Group();
    flame.name = 'flare:flame';
    flame.position.set(center.x, center.y - 0.05, center.z + 0.2);
    root.add(flame);
    const cones: THREE.Mesh[] = [];
    const CONE_DEFS: Array<[number, number, number, string, number]> = [
      // radius, height, x-offset, color, outward tilt
      [0.09, 0.3, -0.16, '#F2782F', -0.5],
      [0.09, 0.34, -0.05, '#F2782F', -0.15],
      [0.09, 0.36, 0.06, '#F2782F', 0.2],
      [0.08, 0.28, 0.17, '#F2782F', 0.55],
      [0.05, 0.2, -0.1, '#F2B33D', -0.2],
      [0.05, 0.22, 0.03, '#F2B33D', 0.1],
      [0.05, 0.18, 0.13, '#F2B33D', 0.45],
      [0.035, 0.12, -0.03, '#FFF3D6', 0],
      [0.03, 0.1, 0.08, '#FFF3D6', 0.3],
    ];
    CONE_DEFS.forEach(([r, h, x, color, tilt]) => {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 10), new THREE.MeshBasicMaterial({ color }));
      cone.position.set(x, h / 2 - 0.03, 0);
      cone.rotation.z = tilt;
      flame.add(cone);
      cones.push(cone);
    });
    flame.scale.setScalar(0.001);
    const disposeFlame = () => {
      root.remove(flame);
      for (const c of cones) {
        c.geometry.dispose();
        (c.material as THREE.Material).dispose();
      }
    };

    /* ---------------- quality + finish ---------------- */

    const qualityFor = (held: number) => {
      let q: number;
      if (held < BURST_AT) q = 0.25 + 0.3 * (held / BURST_AT);
      else if (held < SWEET_LO) q = 0.65 + (0.3 * (held - BURST_AT)) / (SWEET_LO - BURST_AT);
      else if (held <= SWEET_HI) q = 1;
      else q = Math.max(0.6, 1 - (held - SWEET_HI) * 0.5);
      return Math.min(1, q + (power - 1) * 0.2);
    };

    const cleanup = () => {
      offs.forEach((f) => f());
      ctx.input.setGrabEnabled(true);
      ctx.world.resetProp('wok');
      disposeFlame();
    };

    const finish = (quality: number) => {
      if (done) return;
      done = true;
      cleanup();
      ctx.bus.emit('hint:clear', {});
      const tags = quality >= 0.95 ? ['big_flare'] : [];
      if (quality >= 0.95) {
        pop('轰!! 冲到顶!', 'perfect');
        ctx.bus.emit('sfx:play', { id: 'step_done' });
      } else if (quality >= 0.6) {
        pop('轰!', 'good');
        ctx.bus.emit('sfx:play', { id: 'step_done' });
      } else {
        pop('呼…', 'oops');
        ctx.bus.emit('sfx:play', { id: 'oops' });
      }
      ctx.bus.emit('step:complete', { dishId: step.dishId, stepId: step.stepId, quality, tags });
    };

    const release = () => {
      if (done || !holding) return;
      holding = false;
      const held = holdT;
      if (held >= BURST_AT) {
        burst = 1;
        fading = true;
        ctx.bus.emit('sfx:play', { id: 'flare', at: [center.x, center.y, center.z] });
        ctx.bus.emit('camera:shake', { strength: 0.6 * power, ms: 400 });
        ctx.bus.emit('fx:emit', { preset: 'flame', at: [center.x, center.y + 0.1, center.z] });
        void ctx.after(750, () => finish(qualityFor(held)));
      } else {
        ctx.bus.emit('sfx:play', { id: 'bounce' });
        void ctx.after(350, () => finish(qualityFor(held)));
      }
    };

    /* ---------------- input + wiring ---------------- */

    ctx.input.setGrabEnabled(false);
    offs.push(
      ctx.input.onPointer((kind) => {
        if (done) return;
        if (kind === 'down' && !holding) {
          holding = true;
          holdT = 0;
        } else if (kind === 'up') release();
      }),
    );
    offs.push(
      watchMeta(ctx, (m) => {
        const eq = m.installed.includes('flame_booster') ? ctx.content.equipment.get('flame_booster') : undefined;
        const eff = eq?.effects as Record<string, { power?: number } | undefined> | undefined;
        power = eff?.flare?.power ?? 1;
      }),
    );
    offs.push(ctx.input.onKey('Space', () => finish(0.6))); // demo escape hatch
    offs.push(
      ctx.input.onKey('KeyO', () => {
        if (done) return;
        holding = false;
        ctx.bus.emit('step:oops', { dishId: step.dishId, stepId: step.stepId, reason: 'forced' });
        finish(0.15);
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

        // ?auto: hold for 1.3 s (inside the sweet spot), then release.
        if (ctx.flags.auto && !done) {
          if (!holding && t >= 0.4) {
            holding = true;
            holdT = 0;
          }
          if (holding && holdT >= 1.3) release();
        }

        if (holding) holdT += dt;

        // Flame: grows while holding (× power), spikes on burst, fades after.
        const grow = Math.min(1, holdT / BURST_AT) * (0.6 + 0.4 * power);
        let scale = holding ? grow : 0.001;
        if (fading) {
          burst = Math.max(0, burst - dt * 1.6);
          scale = burst * (1.2 + 0.5 * power);
        }
        const flicker = 1 + 0.12 * Math.sin(t * 31) + 0.08 * Math.sin(t * 57);
        flame.scale.set(Math.max(0.001, scale * flicker), Math.max(0.001, scale * (2 - flicker)), Math.max(0.001, scale * flicker));
        cones.forEach((c, i) => {
          c.rotation.y = t * (3 + i);
          c.rotation.x = Math.sin(t * 9 + i) * 0.1;
        });

        // Wok tips its edge toward the burner while holding.
        const wok = wokProp?.object;
        if (wok) wok.rotation.x += ((holding ? -0.38 : 0) - wok.rotation.x) * (1 - Math.exp(-dt * 7));
      }),
    );

    ctx.bus.emit('hint:show', { text: '按住不放,让火舔到锅边 — 1 到 1.6 秒最旺!', gesture: 'hold-tilt' });
    return {
      dispose() {
        if (done) return;
        done = true;
        cleanup();
      },
    };
  },
});
