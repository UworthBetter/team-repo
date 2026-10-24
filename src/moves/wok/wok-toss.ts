import * as THREE from 'three';
import { watchMeta } from './equipment';
import { defineMove, type StepStart } from '@core/api';
import './wok-toss.css';

/**
 * 颠勺 — the rhythm move. Pull the pointer toward you, then push it away inside the
 * beat window (4 dots, top of screen). Quality = hits / params.beats.
 * Beats come from params.bpm (+ beatOffsetMs for speaker latency); an installed
 * 碳钢炒锅 (carbon_wok) widens the window via effects.wok_toss.window.
 * Rice is ONE InstancedMesh on scripted parabolas — guided motion, never physics.
 * A miss (mistimed toss, or a beat window that closes empty) spills grains onto the
 * counter; clicking a spilled grain flicks it back into the wok. Fun fail, never a block.
 */
const GRAINS = 200;
const WAVE = 46; // grains launched per good toss
const SPILL = 5; // grains that land on the counter per miss
const BASE_WINDOW = 0.16; // ± seconds around a beat
const LEAD = 1.6; // seconds before the first beat — find the pulse first
const PULL_MIN = 14; // px of downward drag needed to prime a toss
const PUSH_MIN = 14; // px of upward drag to release it
const TILT = 0.5; // rad — how far the wok tips during the pull
const G = -4.1; // floatier than earth gravity so the arcs read on a projector

/** 'fly' lands back in the wok, 'out' lands on the counter and becomes 'spilled', 'back' is a fished-out grain. */
type Grain = { s: 'in' | 'fly' | 'out' | 'spilled' | 'back'; home: THREE.Vector3; p0: THREE.Vector3; v: THREE.Vector3; t: number; dur: number; rest: THREE.Vector3 };

export const wokToss = defineMove({
  id: 'wok_toss',
  label: '颠勺',
  start(ctx, step: StepStart) {
    const num = (v: unknown, dflt: number) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : dflt;
    };
    const beats = Math.max(1, Math.round(num(step.params.beats, 8)));
    const bpm = Math.min(180, Math.max(60, num(step.params.bpm, 110)));
    const beatOffset = Math.max(0, Number(step.params.beatOffsetMs) || 0) / 1000;
    const beatDur = 60 / bpm;
    const beatTime = (i: number) => LEAD + beatOffset + i * beatDur;

    let windowMult = 1;
    let t = 0;
    let nextBeat = 0;
    let hits = 0;
    let done = false;
    let ending = false;
    let kick = 0; // spring kick on the wok after a hit
    let kickVel = 0;

    // Drag state machine: pull (down) primes, push (up) releases.
    let dragging = false;
    let lastY = 0;
    let dirLast = 0;
    let downAcc = 0;
    let upAcc = 0;

    const offs: (() => void)[] = [];
    const wokProp = ctx.world.prop('wok');
    const center =
      wokProp?.object.position.clone().add(new THREE.Vector3(0, 0.08, 0)) ??
      ctx.world.snapPos('wok_center') ??
      new THREE.Vector3(0, 0.98, -0.6);
    const pop = (text: string, style: 'info' | 'good' | 'perfect' | 'oops') =>
      ctx.bus.emit('fx:pop', { text, style, at: [center.x, center.y + 0.3, center.z] });

    /* ---------------- rice: one InstancedMesh ---------------- */

    const INGREDIENT_COLORS: Record<string, string> = {
      egg_liquid: '#F6CF4A',
      chicken: '#E9C394',
      peanut: '#C68A4E',
      chili: '#D63A2E',
      rice: '#F7F3E8',
    };
    const grainColor = INGREDIENT_COLORS[String(step.params.ingredient)] ?? '#F7F3E8';
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.02, 0.009, 0.032), new THREE.MeshToonMaterial({ color: grainColor }), GRAINS);
    mesh.frustumCulled = false;
    ctx.world.root.add(mesh);
    const dummy = new THREE.Object3D();
    const inWok = (out: THREE.Vector3) => {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 0.24;
      return out.set(center.x + Math.cos(a) * r, center.y + 0.02, center.z + Math.sin(a) * r);
    };
    const grains: Grain[] = Array.from({ length: GRAINS }, () => {
      const home = inWok(new THREE.Vector3());
      return { s: 'in', home, p0: home.clone(), v: new THREE.Vector3(), t: 0, dur: 0, rest: home.clone() };
    });
    const launch = (g: Grain, to: THREE.Vector3, dur: number, s: Grain['s']) => {
      g.p0.copy(g.s === 'spilled' ? g.rest : g.home);
      g.v.copy(to).sub(g.p0).divideScalar(dur);
      g.v.y -= 0.5 * G * dur; // ballistic: lands exactly on `to` at t = dur
      g.t = 0;
      g.dur = dur;
      g.s = s;
    };
    const onCounter = (out: THREE.Vector3) => {
      const a = Math.random() * Math.PI - Math.PI / 2;
      const r = 0.35 + Math.random() * 0.45;
      return out.set(center.x + Math.sin(a) * r, ctx.world.counterTop + 0.006, center.z + Math.cos(a) * r + 0.2);
    };

    /* ---------------- beat dots (DOM) ---------------- */

    const layer = ctx.ui.layer('wok_toss');
    const bar = document.createElement('div');
    bar.className = 'wt-dots';
    const dots = Array.from({ length: 4 }, () => {
      const d = document.createElement('div');
      d.className = 'wt-dot';
      bar.append(d);
      return d;
    });
    layer.append(bar);
    const flash = (i: number, cls: 'wt-hit' | 'wt-miss') => {
      const d = dots[((i % 4) + 4) % 4]!;
      d.classList.add(cls);
      void ctx.after(300, () => d.classList.remove(cls));
    };

    /* ---------------- judging ---------------- */

    const hint = () =>
      ctx.bus.emit('hint:show', { text: `跟着拍子：拉 — 推！· ${Math.min(nextBeat, beats)}/${beats}`, gesture: 'pull-push' });

    const spill = () => {
      let n = SPILL;
      for (const g of grains) {
        if (n <= 0) break;
        if (g.s !== 'in') continue;
        onCounter(g.rest);
        launch(g, g.rest, 0.45 + Math.random() * 0.15, 'out');
        n--;
      }
    };

    // C7 calibration instrument: signed beat error of every real (non-auto) toss, ms.
    // Read the summary in the console at step end; beatOffsetMs ≈ −mean(delta).
    const beatDeltas: number[] = [];
    const noteDelta = (i: number, ms: number) => {
      if (ctx.flags.auto) return;
      beatDeltas.push(ms);
      console.debug(`[wok_toss] beat ${i + 1}/${beats} delta ${ms >= 0 ? '+' : ''}${ms.toFixed(0)}ms`);
    };

    const hit = (i: number) => {
      nextBeat = i + 1;
      hits++;
      kickVel = -3.5;
      noteDelta(i, (t - beatTime(i)) * 1000);
      ctx.bus.emit('sfx:play', { id: 'wok_toss', at: [center.x, center.y, center.z] });
      pop(hits === beats ? '滋啦!!' : '滋啦!', 'good');
      flash(i, 'wt-hit');
      let n = WAVE;
      const to = new THREE.Vector3();
      for (const g of grains) {
        if (n <= 0) break;
        if (g.s !== 'in') continue;
        inWok(to);
        launch(g, to, 0.45 + Math.random() * 0.2, 'fly');
        n--;
      }
      if (!ctx.flags.auto) hint();
    };

    const miss = (i: number, why: string) => {
      nextBeat = i + 1;
      if (why === 'early' || why === 'late') noteDelta(i, (t - beatTime(i)) * 1000);
      ctx.bus.emit('step:oops', { dishId: step.dishId, stepId: step.stepId, reason: why });
      ctx.bus.emit('sfx:play', { id: 'bounce' });
      pop('洒了!', 'oops');
      flash(i, 'wt-miss');
      spill();
      if (!ctx.flags.auto) hint();
    };

    const toss = () => {
      if (done || nextBeat >= beats) return;
      const bt = beatTime(nextBeat);
      if (t >= bt - BASE_WINDOW * windowMult && t <= bt + BASE_WINDOW * windowMult) hit(nextBeat);
      else miss(nextBeat, t < bt ? 'early' : 'late');
    };

    /* ---------------- finish / dispose ---------------- */

    const cleanup = () => {
      offs.forEach((f) => f());
      ctx.input.setGrabEnabled(true);
      ctx.world.resetProp('wok');
      bar.remove();
      ctx.world.root.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    };

    const finish = (quality: number, tags: string[] = []) => {
      if (done) return;
      done = true;
      cleanup();
      if (beatDeltas.length) {
        const sorted = [...beatDeltas].sort((a, b) => a - b);
        const mean = beatDeltas.reduce((a, b) => a + b, 0) / beatDeltas.length;
        const median = sorted[Math.floor(sorted.length / 2)]!;
        console.info(
          `[wok_toss] 校准: n=${beatDeltas.length} mean=${mean.toFixed(0)}ms median=${median.toFixed(0)}ms → 建议 beatOffsetMs ≈ ${(-median).toFixed(0)}`,
        );
      }
      ctx.bus.emit('hint:clear', {});
      if (quality >= 0.9) {
        pop('完美!', 'perfect');
        ctx.bus.emit('sfx:play', { id: 'step_done' });
      } else if (quality >= 0.5) {
        pop('好!', 'good');
        ctx.bus.emit('sfx:play', { id: 'step_done' });
      } else {
        pop('哎呀…', 'oops');
        ctx.bus.emit('sfx:play', { id: 'oops' });
      }
      ctx.bus.emit('step:complete', { dishId: step.dishId, stepId: step.stepId, quality, tags });
    };

    /* ---------------- input ---------------- */

    function onPointer(kind: 'down' | 'move' | 'up', e: PointerEvent) {
      if (done) return;
      if (kind === 'down') {
        if (pickSpilled(e.clientX, e.clientY)) return; // click a spilled grain → flick it back
        dragging = true;
        lastY = e.clientY;
        downAcc = 0;
        upAcc = 0;
        return;
      }
      if (!dragging) return;
      if (kind === 'up') {
        if (upAcc >= PUSH_MIN * 0.6) toss(); // releasing mid-push still throws
        dragging = false;
        downAcc = 0;
        upAcc = 0;
        return;
      }
      const dy = e.clientY - lastY;
      lastY = e.clientY;
      if (dy > 1) dirLast = 1;
      else if (dy < -1) dirLast = -1;
      if (dy > 0) {
        downAcc += dy;
        upAcc = 0; // a pull interrupts a half-finished push
      } else if (dy < 0) {
        if (downAcc >= PULL_MIN) upAcc += -dy;
        else if (dirLast < 0) downAcc = 0; // pushing without a real pull — restart
      }
      if (downAcc >= PULL_MIN && upAcc >= PUSH_MIN) {
        toss();
        downAcc = 0;
        upAcc = 0;
      }
    }

    function pickSpilled(x: number, y: number): boolean {
      let best: Grain | null = null;
      let bd = 28 * 28;
      for (const g of grains) {
        if (g.s !== 'spilled') continue;
        const p = ctx.world.toScreen(g.rest);
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < bd) {
          bd = d;
          best = g;
        }
      }
      if (!best) return false;
      const to = inWok(new THREE.Vector3());
      const from = best;
      launch(from, to, 0.32, 'back');
      ctx.bus.emit('sfx:play', { id: 'snap' });
      ctx.bus.emit('fx:pop', { text: '捡!', style: 'info', at: [from.rest.x, from.rest.y + 0.1, from.rest.z] });
      return true;
    }

    /* ---------------- wiring ---------------- */

    ctx.input.setGrabEnabled(false);
    offs.push(ctx.input.onPointer(onPointer));
    offs.push(
      watchMeta(ctx, (m) => {
        if (!m.installed.includes('carbon_wok')) {
          windowMult = 1;
          return;
        }
        const eff = ctx.content.equipment.get('carbon_wok')?.effects as Record<string, { window?: number } | undefined> | undefined;
        windowMult = eff?.wok_toss?.window ?? 1;
      }),
    );
    offs.push(ctx.input.onKey('Space', () => finish(0.6))); // demo escape hatch
    offs.push(
      ctx.input.onKey('KeyO', () => {
        if (done) return;
        spill();
        ctx.bus.emit('step:oops', { dishId: step.dishId, stepId: step.stepId, reason: 'forced' });
        finish(0.15);
      }),
    );
    offs.push(
      ctx.bus.on('kitchen:enter', () => {
        if (done) return;
        done = true;
        cleanup(); // the kitchen is being rebuilt — drop everything quietly
      }),
    );

    const offFrame = ctx.onFrame((dt: number) => {
      t += dt;
      while (nextBeat < beats && t > beatTime(nextBeat) + BASE_WINDOW * windowMult) miss(nextBeat, 'missed');
      if (ctx.flags.auto && nextBeat < beats && t >= beatTime(nextBeat)) hit(nextBeat);

      const active = dots[nextBeat % 4]!;
      for (const d of dots) {
        const live = d === active && nextBeat < beats && Math.abs(t - beatTime(nextBeat)) < beatDur;
        d.classList.toggle('wt-live', live);
        if (d === active && nextBeat < beats) {
          const p = Math.max(0, Math.min(1, 1 - (beatTime(nextBeat) - t) / beatDur));
          d.style.transform = `scale(${0.75 + p * 0.55})`;
        } else d.style.transform = '';
      }

      for (let i = 0; i < grains.length; i++) {
        const g = grains[i]!;
        if (g.s === 'fly' || g.s === 'out' || g.s === 'back') {
          g.t += dt;
          dummy.position.set(g.p0.x + g.v.x * g.t, g.p0.y + g.v.y * g.t + 0.5 * G * g.t * g.t, g.p0.z + g.v.z * g.t);
          dummy.rotation.set(g.t * 9, g.t * 7, 0);
          if (g.t >= g.dur) {
            g.s = g.s === 'out' ? 'spilled' : 'in';
            dummy.position.copy(g.s === 'spilled' ? g.rest : g.home);
            dummy.rotation.set(0, Math.random() * Math.PI, 0);
          }
        } else {
          dummy.position.copy(g.s === 'spilled' ? g.rest : g.home);
          dummy.rotation.set(0, 0, 0);
        }
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;

      const tilt = dragging ? (dirLast < 0 ? -TILT * 0.8 : TILT * Math.min(1, downAcc / PULL_MIN)) : 0;
      const wok = wokProp?.object;
      if (wok) {
        wok.rotation.x += (tilt - wok.rotation.x) * (1 - Math.exp(-dt * 16));
        kickVel += (-kick * 80 - kickVel * 7) * dt;
        kick += kickVel * dt;
        wok.rotation.x = Math.max(-0.9, Math.min(0.9, wok.rotation.x + kick * 0.09));
      }

      if (nextBeat >= beats && !ending) {
        ending = true;
        const q = Math.min(1, hits / beats);
        void ctx.after(650, () => finish(q, hits === beats ? ['on_beat'] : []));
      }
    });
    offs.push(offFrame);

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
