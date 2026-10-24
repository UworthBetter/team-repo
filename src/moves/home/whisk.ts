import * as THREE from 'three';
import { defineMove } from '@core/api';
import { effectOf, watchInstalled } from './equipment';

/**
 * 搅拌 (B2). Count full pointer circles around the bowl-rim snap (summing angle deltas in
 * screen space), spin the batter swirl decal with the drawn angle, complete at
 * params.circles. Quality comes from circle regularity: how tightly the pointer hugged the
 * bowl radius while drawing. The whisk prop follows the stirring pointer.
 */
export const whisk = defineMove({
  id: 'whisk',
  label: '搅拌',
  start(ctx, step) {
    const target = Math.max(1, Number(step.params.circles ?? 3));
    let done = false;
    const offs: (() => void)[] = [];
    const installed = watchInstalled(ctx, offs);
    const tolerance = Number(effectOf(ctx, installed, 'clay_pot', 'whisk')?.tolerance ?? 1);

    const rim = ctx.world.snapPos(typeof step.params.snapId === 'string' ? step.params.snapId : 'bowl_rim');
    const bowlProp = ctx.world.prop(typeof step.params.bowlProp === 'string' ? step.params.bowlProp : 'bowl');
    const bowlCx = rim?.x ?? bowlProp?.home.x ?? 0;
    const bowlCz = rim?.z ?? bowlProp?.home.z ?? 0;
    const batterY = bowlProp ? bowlProp.home.y + bowlProp.size[1] * 0.5 : 0.97;

    // Batter + swirl decal inside the bowl; both removed on dispose (step end or restart).
    const batter = new THREE.Mesh(
      new THREE.CircleGeometry(0.16, 28),
      new THREE.MeshToonMaterial({ color: typeof step.params.color === 'string' ? step.params.color : '#F7E8C9' }),
    );
    batter.rotation.x = -Math.PI / 2;
    batter.position.set(bowlCx, batterY, bowlCz);
    const swirl = new THREE.Mesh(
      new THREE.TorusGeometry(0.085, 0.008, 8, 26, Math.PI * 1.25),
      new THREE.MeshToonMaterial({ color: '#D9A05B' }),
    );
    swirl.rotation.x = -Math.PI / 2;
    swirl.position.copy(batter.position);
    swirl.position.y += 0.004;
    ctx.world.root.add(batter, swirl);

    // Angle accumulation in screen space; regularity = mean radial deviation from the bowl radius.
    let lastAngle: number | null = null;
    let signed = 0;
    let abs = 0;
    let devSum = 0;
    let devCount = 0;
    let announced = 0;

    const circles = () => abs / (Math.PI * 2);

    const finish = (quality: number) => {
      if (done) return;
      done = true;
      offs.forEach((f) => f());
      ctx.bus.emit('hint:clear', {});
      ctx.bus.emit('fx:pop', { text: quality >= 0.9 ? '搅匀了!' : '拌好了!', style: quality >= 0.9 ? 'perfect' : 'good' });
      ctx.bus.emit('sfx:play', { id: 'step_done' });
      const tags = quality >= 0.9 && Array.isArray(step.params.successTags)
        ? step.params.successTags.filter((tag): tag is string => typeof tag === 'string') : [];
      ctx.bus.emit('step:complete', { dishId: step.dishId, stepId: step.stepId, quality, tags });
    };

    offs.push(
      ctx.input.onPointer((kind) => {
        if (done) return;
        if (kind === 'down') lastAngle = null;
        if (kind !== 'move' || !ctx.input.pointer.down) return;
        // Camera glides and first-person movement change the projected bowl position.
        const center = ctx.world.toScreen([bowlCx, rim?.y ?? 1.04, bowlCz]);
        const edge = ctx.world.toScreen([bowlCx + 0.19, rim?.y ?? 1.04, bowlCz]);
        const screenR = Math.max(30, Math.hypot(edge.x - center.x, edge.y - center.y));
        const dx = ctx.input.pointer.x - center.x;
        const dy = ctx.input.pointer.y - center.y;
        const dist = Math.hypot(dx, dy);
        if (dist < screenR * 0.3 || dist > screenR * 2.8) return; // flailing far from the bowl stirs nothing
        const ang = Math.atan2(dy, dx);
        if (lastAngle !== null) {
          let d = ang - lastAngle;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          signed += d;
          abs += Math.abs(d);
          devSum += Math.abs(dist - screenR) / screenR;
          devCount++;
          const full = Math.floor(circles());
          if (full > announced) {
            announced = full;
            ctx.bus.emit('sfx:play', { id: 'snap_hover' });
          }
          const pct = Math.min(100, Math.round((circles() / target) * 100));
          ctx.bus.emit('hint:show', { text: `绕碗画圈搅拌 · ${pct}%`, gesture: 'circle' });
          if (circles() >= target) {
            const meanDev = devSum / Math.max(1, devCount);
            finish(Math.max(0.3, Math.min(1, 0.55 + 0.45 * (1 - meanDev / (0.5 * tolerance)))));
          }
        }
        lastAngle = ang;
      }),
    );
    if (ctx.flags.auto) {
      offs.push(ctx.after(900, () => finish(0.92)));
      offs.push(
        ctx.onFrame((dt) => {
          signed += dt * 7;
          abs += dt * 7;
        }),
      );
    }
    offs.push(ctx.onFrame(() => (swirl.rotation.z = -signed)));

    // The whisk follows the stirring pointer and returns home when the step ends.
    const whiskProp = ctx.world.prop('whisk');
    const home = whiskProp?.home.clone();
    if (whiskProp && home) {
      offs.push(
        ctx.onFrame((dt) => {
          if (done) return;
          const k = 1 - Math.exp(-dt * 10);
          const want = ctx.input.pointer.down && !ctx.input.held ? ctx.input.counterPoint() : null;
          const tx = want ? want.x : home.x;
          const tz = want ? want.z : home.z;
          whiskProp.object.position.x += (tx - whiskProp.object.position.x) * k;
          whiskProp.object.position.z += (tz - whiskProp.object.position.z) * k;
          whiskProp.object.position.y += (home.y + 0.16 - whiskProp.object.position.y) * k;
          whiskProp.object.rotation.z += (0.4 - whiskProp.object.rotation.z) * k;
        }),
      );
    }

    return {
      dispose() {
        if (!done) ctx.bus.emit('hint:clear', {});
        done = true;
        batter.removeFromParent();
        swirl.removeFromParent();
        batter.geometry.dispose();
        swirl.geometry.dispose();
        (batter.material as THREE.Material).dispose();
        (swirl.material as THREE.Material).dispose();
        if (whiskProp && home) {
          whiskProp.object.position.copy(home);
          whiskProp.object.rotation.set(0, 0, 0);
        }
        offs.forEach((f) => f());
      },
    };
  },
});
