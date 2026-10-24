import * as THREE from 'three';
import { defineMove, type StepStart } from '@core/api';

/**
 * 双剁 — rhythm_chop prototype (C-S2), the 湘菜 double-cleaver beat.
 *
 * Registered by the additive C prototype contract; available in its isolated dev scene.
 *
 * A board with two zones. Click LEFT / RIGHT alternately in time with the beat
 * (4 beat dots, same judge as 颠勺). Wrong side or off-beat = a miss (刀钝了);
 * quality = clean hits / beats. The cleaver mirrors the pointer side.
 */
const BOARD = { x: 0.58, z: -0.6, w: 0.5, d: 0.34 }; // beside the wok, on the counter
const BASE_WINDOW = 0.15;
const LEAD = 1.4;
const HITS = 8;

export const rhythmChop = defineMove({
  id: 'rhythm_chop',
  label: '双剁',
  start(ctx, step: StepStart) {
    const num = (v: unknown, dflt: number) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : dflt;
    };
    const bpm = Math.min(160, Math.max(70, num(step.params.bpm, 100)));
    const beatDur = 60 / bpm;
    const beatTime = (i: number) => LEAD + i * beatDur;

    let nextBeat = 0;
    let hits = 0;
    let done = false;
    let ending = false;
    let t = 0;
    let expectRight = false; // alternation state

    const center = new THREE.Vector3(BOARD.x, ctx.world.counterTop, BOARD.z);
    const offs: (() => void)[] = [];
    const pop = (text: string, style: 'info' | 'good' | 'perfect' | 'oops') =>
      ctx.bus.emit('fx:pop', { text, style, at: [center.x, center.y + 0.25, center.z] });

    /* ---------------- board + cleaver (mine, in world.root) ---------------- */

    const root = ctx.world.root;
    const board = new THREE.Mesh(new THREE.BoxGeometry(BOARD.w, 0.04, BOARD.d), new THREE.MeshToonMaterial({ color: '#B08A5A' }));
    board.position.set(BOARD.x, center.y + 0.02, BOARD.z);
    board.name = 'chop:board';
    root.add(board);
    const cleaver = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.015, 0.11), new THREE.MeshToonMaterial({ color: '#c9cdd1' }));
    cleaver.position.set(BOARD.x - 0.12, center.y + 0.1, BOARD.z + 0.1);
    cleaver.rotation.x = -0.5;
    cleaver.name = 'chop:cleaver';
    root.add(cleaver);
    let chopDrop = 0; // cleaver slam animation 0..1

    const disposeMeshes = () => {
      for (const m of [board, cleaver]) {
        root.remove(m);
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    };

    /* ---------------- beat dots (DOM, same shape as 颠勺) ---------------- */

    const layer = ctx.ui.layer('rhythm_chop');
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

    const hit = (i: number) => {
      nextBeat = i + 1;
      hits++;
      chopDrop = 1;
      expectRight = !expectRight;
      ctx.bus.emit('sfx:play', { id: 'slice' });
      pop(i + 1 === HITS ? '剁好!' : '咚!', 'good');
      flash(i, 'wt-hit');
    };
    const miss = (i: number, why: string) => {
      nextBeat = i + 1;
      ctx.bus.emit('step:oops', { dishId: step.dishId, stepId: step.stepId, reason: why });
      ctx.bus.emit('sfx:play', { id: 'bounce' });
      pop('刀钝了!', 'oops');
      flash(i, 'wt-miss');
    };

    const finish = () => {
      if (done) return;
      done = true;
      offs.forEach((f) => f());
      bar.remove();
      disposeMeshes();
      ctx.bus.emit('hint:clear', {});
      const quality = Math.max(0.15, hits / HITS);
      if (quality >= 0.9) {
        pop('刀工了得!', 'perfect');
        ctx.bus.emit('sfx:play', { id: 'step_done' });
      } else if (quality >= 0.5) {
        pop('还行!', 'good');
        ctx.bus.emit('sfx:play', { id: 'step_done' });
      } else {
        pop('手忙脚乱…', 'oops');
        ctx.bus.emit('sfx:play', { id: 'oops' });
      }
      ctx.bus.emit('step:complete', { dishId: step.dishId, stepId: step.stepId, quality, tags: [] });
    };

    /* ---------------- input ---------------- */

    function onPointer(kind: 'down' | 'move' | 'up', e: PointerEvent) {
      if (done || kind !== 'down') return;
      const cp = ctx.input.counterPoint();
      if (!cp) return;
      const inBoard =
        Math.abs(cp.x - BOARD.x) < BOARD.w / 2 + 0.05 && Math.abs(cp.z - BOARD.z) < BOARD.d / 2 + 0.05;
      if (!inBoard) return;
      const right = cp.x > BOARD.x;
      chopDrop = 1;
      if (nextBeat >= HITS) return;
      if (right !== expectRight) return miss(nextBeat, 'wrong-side'); // 双刀要左右交替
      const bt = beatTime(nextBeat);
      if (t >= bt - BASE_WINDOW && t <= bt + BASE_WINDOW) hit(nextBeat);
      else miss(nextBeat, t < bt ? 'early' : 'late');
    }

    offs.push(ctx.input.onPointer(onPointer));
    offs.push(
      ctx.bus.on('kitchen:enter', () => {
        if (done) return;
        done = true;
        offs.forEach((f) => f());
        bar.remove();
        disposeMeshes();
      }),
    );

    offs.push(
      ctx.onFrame((dt: number) => {
        t += dt;
        while (nextBeat < HITS && t > beatTime(nextBeat) + BASE_WINDOW) miss(nextBeat, 'missed');
        if (ctx.flags.auto && nextBeat < HITS && t >= beatTime(nextBeat)) hit(nextBeat);

        const active = dots[nextBeat % 4]!;
        for (const d of dots) {
          const live = d === active && nextBeat < HITS && Math.abs(t - beatTime(nextBeat)) < beatDur;
          d.classList.toggle('wt-live', live);
          if (d === active && nextBeat < HITS) {
            const p = Math.max(0, Math.min(1, 1 - (beatTime(nextBeat) - t) / beatDur));
            d.style.transform = `scale(${0.75 + p * 0.55})`;
          } else d.style.transform = '';
        }

        // cleaver hovers over the expected side, slams on every hit/click
        chopDrop = Math.max(0, chopDrop - dt * 5);
        const sideX = BOARD.x + (expectRight ? 0.11 : -0.11);
        cleaver.position.x += (sideX - cleaver.position.x) * (1 - Math.exp(-dt * 14));
        cleaver.position.y = center.y + 0.1 - chopDrop * 0.06;
        cleaver.rotation.x = -0.5 + chopDrop * 0.4;

        if (nextBeat >= HITS && !ending) {
          ending = true;
          void ctx.after(500, finish);
        }
      }),
    );

    ctx.bus.emit('hint:show', { text: '左右交替,跟着拍子剁!', gesture: 'click' });
    return {
      dispose() {
        if (done) return;
        done = true;
        offs.forEach((f) => f());
        bar.remove();
        disposeMeshes();
      },
    };
  },
});
