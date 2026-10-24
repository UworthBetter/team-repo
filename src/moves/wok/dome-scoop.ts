import * as THREE from 'three';
import { defineMove, type StepStart } from '@core/api';
import './dome-scoop.css';

/**
 * 扣圆顶 — the unmold move, in four guided beats:
 *   ① circle the pointer around the rice bowl to pack it (ring fills, quality = pack),
 *   ② drag the bowl over the plate's pass_center snap (dome_ladle widens the tolerance
 *      via effects.dome_scoop.snapRadius),
 *   ③ scroll the wheel to flip the bowl upside down,
 *   ④ drag up to lift the bowl and reveal the dome — its height comes from the pack
 *      percentage; under 50% the dome slumps 噗 (step:oops) but is still served.
 * Tag 'centered_dome' when the bowl landed dead-center with a standing dome.
 */
const CIRCLE_YIELD = 0.34; // one full pointer circle around the bowl adds this much pack
const FLIP_WHEEL = 500; // |deltaY| needed to fully flip the bowl
const LIFT_PX = 60; // upward drag that lifts the bowl
const SNAP_RADIUS = 0.2; // pass_center's radius in content; equipment widens it

export const domeScoop = defineMove({
  id: 'dome_scoop',
  label: '扣圆顶',
  start(ctx, step: StepStart) {
    const bowl = ctx.world.prop('bowl_mold');
    const plate = ctx.world.snapPos('pass_center');
    const home = bowl?.home.clone() ?? new THREE.Vector3(2.62, 0.9, 0.4);
    const plateAt = plate ?? new THREE.Vector3(2.9, 0.925, 0.4);

    let ladleMult = 1;
    let phase: 'pack' | 'placed' | 'flipped' | 'reveal' = 'pack';
    let pack = 0;
    let centered = false;
    let flipAcc = 0;
    let liftAcc = 0;
    let slump = 0; // 0→1 while a too-loose dome collapses
    let done = false;
    let t = 0;

    // Pointer-circle tracking (pack phase).
    let circling = false;
    let angPrev = 0;
    let arc = 0;
    let wind = 0;
    let lastY = 0;

    const offs: (() => void)[] = [];
    const pop = (text: string, style: 'info' | 'good' | 'perfect' | 'oops') =>
      ctx.bus.emit('fx:pop', { text, style, at: [plateAt.x, plateAt.y + 0.25, plateAt.z] });
    const hint = (text: string, gesture: 'circle' | 'drag' | 'scroll-rotate' | 'flick-up') =>
      ctx.bus.emit('hint:show', { text, gesture });

    /* ---------------- meshes (mine, in world.root) ---------------- */

    const root = ctx.world.root;
    const rice = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1, 24), new THREE.MeshToonMaterial({ color: '#F7F3E8' }));
    rice.name = 'dome:rice';
    root.add(rice);
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshToonMaterial({ color: '#F7F3E8' }),
    );
    dome.name = 'dome:dome';
    dome.visible = false;
    root.add(dome);
    const disposeMeshes = () => {
      for (const m of [rice, dome]) {
        root.remove(m);
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    };

    /* ---------------- pack ring (DOM) ---------------- */

    const layer = ctx.ui.layer('dome_scoop');
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ring.setAttribute('class', 'ds-ring');
    ring.setAttribute('viewBox', '0 0 48 48');
    ring.innerHTML =
      '<circle class="ds-ring-bg" cx="24" cy="24" r="20"></circle>' +
      '<circle class="ds-ring-fg" cx="24" cy="24" r="20"></circle>';
    layer.append(ring);
    const fg = ring.querySelector('.ds-ring-fg') as SVGCircleElement;
    const RING_LEN = 2 * Math.PI * 20;
    fg.style.strokeDasharray = `${RING_LEN}`;

    /* ---------------- phases ---------------- */

    const cleanup = () => {
      offs.forEach((f) => f());
      ring.remove();
      disposeMeshes();
      ctx.world.resetProp('bowl_mold');
    };

    const finish = () => {
      if (done) return;
      done = true;
      cleanup();
      const quality = Math.max(0.05, Math.min(1, pack * (centered ? 1 : 0.8) * (slump > 0 ? 0.6 : 1)));
      const tags = pack >= 0.5 && centered ? ['centered_dome'] : [];
      ctx.bus.emit('hint:clear', {});
      if (pack < 0.5) {
        pop('噗…', 'oops');
        ctx.bus.emit('sfx:play', { id: 'oops' });
      } else {
        pop(centered ? '热气腾腾!' : '好了!', centered ? 'perfect' : 'good');
        ctx.bus.emit('sfx:play', { id: 'step_done' });
      }
      ctx.bus.emit('step:complete', { dishId: step.dishId, stepId: step.stepId, quality, tags });
    };

    /** Bowl reached the plate (snapped, or dropped close enough — ladle widens the tolerance). */
    const place = (exact: boolean) => {
      if (phase !== 'pack') return;
      phase = 'placed';
      centered = exact;
      bowl?.object.position.set(plateAt.x, plateAt.y + 0.02, plateAt.z);
      bowl?.object.rotation.set(0, 0, 0);
      ctx.bus.emit('sfx:play', { id: 'bounce' });
      pop('咚!', 'good');
      ring.style.display = 'none';
      hint('滚动滚轮,把碗翻过来!', 'scroll-rotate');
    };

    const reveal = () => {
      if (phase !== 'flipped') return;
      phase = 'reveal';
      dome.visible = true;
      dome.position.set(plateAt.x, plateAt.y - 0.01, plateAt.z);
      dome.scale.set(1, 0.001, 1);
      if (pack < 0.5) {
        ctx.bus.emit('step:oops', { dishId: step.dishId, stepId: step.stepId, reason: 'loose' });
      }
      ctx.bus.emit('sfx:play', { id: 'snap' });
      void ctx.after(900, finish);
    };

    /* ---------------- input ---------------- */

    /** Bank one completed loop: pack += CIRCLE_YIELD, reset the arc trackers. */
    function creditCircle() {
      arc = 0;
      wind = 0;
      pack = Math.min(1, pack + CIRCLE_YIELD);
      ctx.bus.emit('sfx:play', { id: 'snap_hover' });
      if (pack >= 1) hint('压实了!把碗拖到盘子上', 'drag');
    }

    function onPointer(kind: 'down' | 'move' | 'up', e: PointerEvent) {
      if (done) return;
      if (kind === 'down') {
        circling = false;
        liftAcc = 0;
        lastY = e.clientY;
        return;
      }
      if (kind === 'up') {
        // A released circle that is ~85% closed still counts — hand-drawn loops rarely
        // end exactly where they started, and browsers skip zero-distance moves.
        if (circling && Math.abs(arc) > Math.PI * 1.7 && phase === 'pack' && bowl && bowl.object.position.distanceTo(home) < 0.06) creditCircle();
        circling = false;
        return;
      }
      if (phase === 'pack' && bowl && bowl.object.position.distanceTo(home) < 0.06 && !ctx.input.held) {
        // Accumulate pointer angle around the bowl on screen; each full turn packs rice.
        const c = ctx.world.toScreen(bowl.home);
        const a = Math.atan2(e.clientY - c.y, e.clientX - c.x);
        if (!circling) {
          circling = true;
          arc = 0;
          wind = 0;
        } else {
          let d = a - angPrev;
          if (d > Math.PI) d -= Math.PI * 2;
          if (d < -Math.PI) d += Math.PI * 2;
          if (Math.sign(d) !== 0 && Math.sign(d) !== wind && Math.abs(arc) < Math.PI * 1.5) wind = Math.sign(d);
          if (wind === 0 || Math.sign(d) === wind) arc += d;
        }
        angPrev = a;
        // 2π minus slack: the arc is summed from float angles and the last few pixels
        // of a loop are often coalesced away, so an exact 2π never lands.
        if (Math.abs(arc) >= Math.PI * 2 - 0.4) creditCircle();
        return;
      }
      // Lift gesture: drag straight up during 'flipped' (holding the bowl counts too).
      if (phase === 'flipped' && !ctx.input.held) {
        liftAcc = Math.max(0, liftAcc + (lastY - e.clientY));
        lastY = e.clientY;
        if (liftAcc >= LIFT_PX) reveal();
      }
    }

    offs.push(ctx.input.onPointer(onPointer));
    offs.push(
      ctx.input.onWheel((deltaY) => {
        if (done || phase !== 'placed') return;
        flipAcc += Math.abs(deltaY);
        const p = Math.min(1, flipAcc / FLIP_WHEEL);
        bowl?.object.rotation.set(-Math.PI * p, 0, 0);
        if (p >= 1) {
          phase = 'flipped';
          ctx.bus.emit('sfx:play', { id: 'snap' });
          hint('向上拖,抬起碗!', 'flick-up');
        }
      }),
    );
    offs.push(
      ctx.bus.on('grab:end', (e) => {
        if (done || phase !== 'pack' || e.objectId !== 'bowl_mold') return;
        const b = ctx.world.prop('bowl_mold');
        if (!b) return;
        const d = Math.hypot(b.object.position.x - plateAt.x, b.object.position.z - plateAt.z);
        if (e.snappedTo === 'pass_center') place(true);
        else if (d <= SNAP_RADIUS * ladleMult) place(d < 0.05);
      }),
    );
    offs.push(ctx.bus.on('grab:start', (e) => {
      if (!done && phase === 'flipped' && e.objectId === 'bowl_mold') reveal(); // grabbing the flipped bowl = lifting it
    }));
    offs.push(
      ctx.bus.on('meta:state', (m) => {
        const eq = m.installed.includes('dome_ladle') ? ctx.content.equipment.get('dome_ladle') : undefined;
        const eff = eq?.effects as Record<string, { snapRadius?: number } | undefined> | undefined;
        ladleMult = eff?.dome_scoop?.snapRadius ?? 1;
      }),
    );
    offs.push(ctx.input.onKey('Space', () => finish())); // demo escape hatch
    offs.push(
      ctx.bus.on('kitchen:enter', () => {
        if (done) return;
        done = true;
        cleanup();
      }),
    );

    /* ---------------- frame ---------------- */

    offs.push(
      ctx.onFrame((dt: number) => {
        t += dt;

        // ?auto drives the whole sequence on a timeline.
        if (ctx.flags.auto && !done) {
          if (phase === 'pack') {
            pack = Math.min(0.95, Math.max(pack, (t - 0.4) * 0.8));
            if (t > 1.7) place(true);
          } else if (phase === 'placed') {
            flipAcc = Math.min(FLIP_WHEEL, flipAcc + dt * 700);
            const p = flipAcc / FLIP_WHEEL;
            bowl?.object.rotation.set(-Math.PI * p, 0, 0);
            if (p >= 1 && t > 2.5) {
              phase = 'flipped';
              ctx.bus.emit('sfx:play', { id: 'snap' });
            }
          } else if (phase === 'flipped' && t > 3.0) reveal();
        }

        // Rice disc rides in the bowl until the dome is revealed.
        if (phase !== 'reveal' && bowl) {
          const p = bowl.object.position;
          rice.visible = true;
          rice.position.set(p.x, p.y + 0.045 + (pack * 0.03 - 0.02), p.z);
          rice.scale.set(1, 0.02 + pack * 0.05, 1);
          rice.rotation.copy(bowl.object.rotation);
        } else {
          rice.visible = false;
        }

        // Bowl lifts away from the revealed dome.
        if (phase === 'reveal' && bowl) bowl.object.position.y += dt * 1.2;

        // Dome grows in, or slumps when the pack was too loose.
        if (phase === 'reveal') {
          const standH = 0.06 + pack * 0.16;
          const target = pack >= 0.5 ? standH : Math.max(0.02, standH * (1 - slump));
          if (pack < 0.5) slump = Math.min(0.85, slump + dt * 1.4);
          dome.scale.y += (Math.max(0.001, target) - dome.scale.y) * (1 - Math.exp(-dt * 10));
        }

        // Pack ring UI follows the bowl's screen position.
        if (phase === 'pack') {
          const c = ctx.world.toScreen(bowl?.home ?? home);
          ring.style.left = `${c.x - 24}px`;
          ring.style.top = `${c.y - 56}px`;
          fg.style.strokeDashoffset = `${RING_LEN * (1 - pack)}`;
        }
      }),
    );

    hint('围着饭碗画圈,把米饭压实!', 'circle');
    return {
      dispose() {
        if (done) return;
        done = true;
        cleanup();
      },
    };
  },
});
