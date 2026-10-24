import * as THREE from 'three';
import { defineMove, type StepStart } from '@core/api';

/**
 * 拉丝 — pull_stretch prototype (C-S3), the 拔丝/biangbiang gesture.
 *
 * TODO(contract): append 'pull_stretch' to MOVE_IDS (owner A) before any dish JSON
 * can reference it; until then this prototype only runs from its dev scene.
 *
 * Press near the candy blob to grab the strand, drag away slowly to stretch it —
 * a glowing thread spans anchor → pointer. Pull faster than SNAP_SPEED and it snaps
 * (啪断!); release at PULL_NEED or more = one good pull. GOOD_PULLS pulls finish;
 * quality = good pulls / attempted releases, snaps count against you.
 */
const ANCHOR = new THREE.Vector3(1.35, 0.9, -0.45); // on the sauce counter
const GRAB_R = 0.14; // reach to grab the strand
const PULL_NEED = 0.28; // meters of strand for a good pull
const SNAP_SPEED = 1.4; // m/s of pointer travel that snaps the strand
const GOOD_PULLS = 3;

export const pullStretch = defineMove({
  id: 'pull_stretch' as never, // TODO(contract): MoveId once A appends pull_stretch
  label: '拉丝',
  start(ctx, step: StepStart) {
    let good = 0;
    let snaps = 0;
    let releases = 0;
    let done = false;
    let holding = false;
    let lastT = 0;
    let speedSm = 0;

    const offs: (() => void)[] = [];
    const root = ctx.world.root;
    const blob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), new THREE.MeshToonMaterial({ color: '#D98A1E' }));
    blob.position.copy(ANCHOR).setY(ANCHOR.y + 0.03);
    blob.name = 'pull:blob';
    root.add(blob);
    const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 6), new THREE.MeshBasicMaterial({ color: '#F2B33D' }));
    strand.name = 'pull:strand';
    strand.visible = false;
    root.add(strand);
    const disposeMeshes = () => {
      for (const m of [blob, strand]) {
        root.remove(m);
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    };

    const at = () => [ANCHOR.x, ANCHOR.y + 0.3, ANCHOR.z] as [number, number, number];
    const hint = () =>
      ctx.bus.emit('hint:show', { text: `按住糖稀慢慢拉开 · ${good}/${GOOD_PULLS}`, gesture: 'drag' });

    let t = 0;
    let autoPulls = 0;

    const cleanup = () => {
      offs.forEach((f) => f());
      disposeMeshes();
    };

    const finish = () => {
      if (done) return;
      done = true;
      cleanup();
      const quality = Math.max(0.2, Math.min(1, (good / GOOD_PULLS) * (snaps > 1 ? 0.7 : 1)));
      ctx.bus.emit('hint:clear', {});
      if (quality >= 0.9) {
        ctx.bus.emit('fx:pop', { text: '金丝不断!', style: 'perfect', at: at() });
        ctx.bus.emit('sfx:play', { id: 'step_done' });
      } else if (quality >= 0.5) {
        ctx.bus.emit('fx:pop', { text: '拔得不错', style: 'good', at: at() });
        ctx.bus.emit('sfx:play', { id: 'step_done' });
      } else {
        ctx.bus.emit('fx:pop', { text: '全断了…', style: 'oops', at: at() });
        ctx.bus.emit('sfx:play', { id: 'oops' });
      }
      ctx.bus.emit('step:complete', { dishId: step.dishId, stepId: step.stepId, quality, tags: [] });
    };

    function onPointer(kind: 'down' | 'move' | 'up', e: PointerEvent) {
      if (done) return;
      const cp = ctx.input.counterPoint();
      if (!cp) return;
      if (kind === 'down') {
        if (Math.hypot(cp.x - ANCHOR.x, cp.z - ANCHOR.z) < GRAB_R + 0.08) {
          holding = true;
          strand.visible = true;
          strand.userData.tip = undefined; // stale tip from a previous pull would read as a yank
          strand.userData.len = 0;
          lastT = performance.now();
          speedSm = 0;
          ctx.bus.emit('sfx:play', { id: 'grab' });
        }
        return;
      }
      if (kind === 'up') {
        if (!holding) return;
        holding = false;
        strand.visible = false;
        releases++;
        const len = strand.userData.len ?? 0;
        if (len >= PULL_NEED) {
          good++;
          ctx.bus.emit('sfx:play', { id: 'snap' });
          ctx.bus.emit('fx:pop', { text: `拉!${good}/${GOOD_PULLS}`, style: 'good', at: at() });
        } else {
          ctx.bus.emit('sfx:play', { id: 'bounce' });
        }
        if (good >= GOOD_PULLS) finish();
        else hint();
        return;
      }
      if (!holding) return;
      const now = performance.now();
      // dt floor + smoothing: the first event after grab has a tiny dt and would
      // otherwise read as a violent yank.
      const dt = Math.max(40, now - lastT) / 1000;
      lastT = now;
      const prev = (strand.userData.tip as THREE.Vector3 | undefined) ?? ANCHOR.clone();
      speedSm += (Math.hypot(cp.x - prev.x, cp.z - prev.z) / dt - speedSm) * 0.5;
      if (speedSm > SNAP_SPEED) {
        // Too fast — the strand snaps.
        holding = false;
        strand.visible = false;
        snaps++;
        releases++;
        ctx.bus.emit('sfx:play', { id: 'oops' });
        ctx.bus.emit('fx:pop', { text: '啪断!', style: 'oops', at: at() });
        ctx.bus.emit('step:oops', { dishId: step.dishId, stepId: step.stepId, reason: 'snapped' });
        hint();
        return;
      }
      const len = Math.hypot(cp.x - ANCHOR.x, cp.z - ANCHOR.z);
      strand.userData.len = len;
      strand.userData.tip = cp.clone();
      // Stretch the cylinder from the anchor to the pointer, hugging the counter.
      const mid = new THREE.Vector3((ANCHOR.x + cp.x) / 2, ANCHOR.y + 0.03, (ANCHOR.z + cp.z) / 2);
      strand.position.copy(mid);
      strand.scale.set(1, Math.max(0.01, len), 1);
      strand.rotation.set(Math.PI / 2, 0, 0);
      strand.rotation.z = -Math.atan2(cp.z - ANCHOR.z, cp.x - ANCHOR.x);
      if (len > PULL_NEED * 0.7 && Math.random() < 0.2) ctx.bus.emit('sfx:play', { id: 'snap_hover' });
    }

    offs.push(ctx.input.onPointer(onPointer));
    offs.push(ctx.input.onKey('Space', () => finish())); // demo escape hatch
    offs.push(
      ctx.bus.on('kitchen:enter', () => {
        if (done) return;
        done = true;
        cleanup();
      }),
    );
    offs.push(
      ctx.onFrame((dt: number) => {
        // ?auto: three slow pulls on a timer.
        if (ctx.flags.auto && !done) {
          const cycle = t % 2.2;
          const phase = cycle / 2.2;
          if (cycle < dt * 2 && autoPulls < GOOD_PULLS) {
            autoPulls++;
            good = autoPulls;
            ctx.bus.emit('sfx:play', { id: 'snap' });
            ctx.bus.emit('fx:pop', { text: `拉!${good}/${GOOD_PULLS}`, style: 'good', at: at() });
            if (good >= GOOD_PULLS) {
              strand.visible = false;
              finish();
            }
          }
          strand.visible = autoPulls < GOOD_PULLS;
          const len = 0.05 + Math.sin(phase * Math.PI) * (PULL_NEED + 0.06);
          strand.userData.len = len;
          const dir = autoPulls % 2 === 0 ? 1 : -1;
          const tip = new THREE.Vector3(ANCHOR.x + dir * len, ANCHOR.y, ANCHOR.z);
          strand.userData.tip = tip;
          strand.position.set((ANCHOR.x + tip.x) / 2, ANCHOR.y + 0.03, ANCHOR.z);
          strand.scale.set(1, Math.max(0.01, len), 1);
          strand.rotation.set(Math.PI / 2, 0, 0);
          strand.rotation.z = -Math.atan2(0, tip.x - ANCHOR.x);
          blob.scale.setScalar(1 + Math.sin(t * 5) * 0.06);
        }
        t += dt;
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
