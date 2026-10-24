import * as THREE from 'three';
import type { Vec3 } from '@contracts/types';
import type { Bus } from './bus';
import type { InputInternal } from './input';
import type { WorldInternal } from './world';

/**
 * Station camera: click a station or press 1–9 to glide there, 0 for the overview.
 * On top of the base glide the rig layers two effects for FX and result ceremonies (owner A):
 *   camera:shake  — a decaying positional jitter (C flares, B slice impacts).
 *   camera:push   — a temporary dolly toward a world point, held until camera:release (D result).
 * Both are additive offsets so the underlying station glide keeps running underneath.
 */
export function createCameraRig(camera: THREE.PerspectiveCamera, bus: Bus, world: WorldInternal, input: InputInternal) {
  const from = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  const to = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  /** Base (pre-shake, pre-push) transform the glide produces each frame. */
  const basePos = new THREE.Vector3();
  const baseLook = new THREE.Vector3();
  const finalPos = new THREE.Vector3();
  const finalLook = new THREE.Vector3();
  let t = 1;
  let dur = 0.45;

  // --- camera:push state (dolly toward a point) ---
  const pushAt = new THREE.Vector3();
  let pushZoom = 1;
  let pushLevel = 0; // 0 = at base, 1 = fully dollied in
  let pushTarget = 0;
  let pushDur = 0.4; // seconds for the current level transition

  // --- camera:shake state (decaying noise) ---
  let shakeAmp = 0;
  let shakeDur = 0.0001;
  let shakeT = 0;

  const ease = (a: number) => (a < 0.5 ? 2 * a * a : 1 - Math.pow(-2 * a + 2, 2) / 2);

  /** Write the glide result into basePos/baseLook (no shake/push). */
  function computeBase(a: number) {
    const e = ease(a);
    basePos.lerpVectors(from.pos, to.pos, e);
    baseLook.lerpVectors(from.target, to.target, e);
  }

  /** Layer push + shake on top of the base transform and apply to the camera. */
  function applyFinal(dt: number) {
    finalPos.copy(basePos);
    finalLook.copy(baseLook);
    if (pushLevel > 0.0001) {
      const dolly = (1 - 1 / pushZoom) * pushLevel;
      finalPos.lerp(pushAt, dolly);
      finalLook.lerp(pushAt, 0.6 * pushLevel);
    }
    if (shakeT < shakeDur) {
      const amp = shakeAmp * (1 - shakeT / shakeDur) * 0.09;
      finalPos.x += (Math.random() * 2 - 1) * amp;
      finalPos.y += (Math.random() * 2 - 1) * amp;
      finalLook.x += (Math.random() * 2 - 1) * amp * 0.5;
      finalLook.y += (Math.random() * 2 - 1) * amp * 0.5;
      shakeT += dt;
    }
    camera.position.copy(finalPos);
    camera.lookAt(finalLook);
  }

  function goTo(c: { pos: Vec3; target: Vec3 }, d = 0.45) {
    from.pos.copy(basePos);
    from.target.copy(baseLook);
    to.pos.set(c.pos[0], c.pos[1], c.pos[2]);
    to.target.set(c.target[0], c.target[1], c.target[2]);
    dur = d;
    if (d <= 0) {
      t = 1;
      from.pos.copy(to.pos);
      from.target.copy(to.target);
      computeBase(1);
      applyFinal(0);
    } else t = 0;
  }

  bus.on('station:focus', ({ stationId }) => {
    const s = world.kitchen?.stations.find((x) => x.id === stationId);
    if (s) goTo(s.camera);
  });
  bus.on('kitchen:ready', () => {
    // A fresh kitchen cancels any lingering push/shake from the previous one.
    pushLevel = pushTarget = 0;
    shakeT = shakeDur;
    if (world.kitchen) goTo(world.kitchen.overview, 0);
  });
  for (let d = 1; d <= 9; d++) {
    input.onKey(`Digit${d}`, () => {
      const s = world.kitchen?.stations.find((x) => x.key === d);
      if (s) bus.emit('station:focus', { stationId: s.id });
    });
  }
  input.onKey('Digit0', () => world.kitchen && goTo(world.kitchen.overview));

  bus.on('camera:shake', ({ strength, ms }) => {
    shakeAmp = Math.max(shakeT < shakeDur ? shakeAmp * (1 - shakeT / shakeDur) : 0, strength);
    shakeDur = Math.max(1, ms) / 1000;
    shakeT = 0;
  });
  bus.on('camera:push', ({ at, zoom, ms }) => {
    pushAt.set(at[0], at[1], at[2]);
    pushZoom = Math.max(1, zoom || 1);
    pushTarget = 1;
    pushDur = Math.max(1, ms) / 1000;
  });
  bus.on('camera:release', () => {
    pushTarget = 0;
    pushDur = 0.3;
  });

  return {
    goTo,
    update(dt: number) {
      if (t < 1) t = Math.min(1, t + dt / dur);
      if (pushLevel !== pushTarget) {
        const step = dt / Math.max(0.0001, pushDur);
        if (pushLevel < pushTarget) pushLevel = Math.min(pushTarget, pushLevel + step);
        else pushLevel = Math.max(pushTarget, pushLevel - step);
      }
      // Recompute every frame: shake/push must animate even when the glide is idle.
      computeBase(t);
      applyFinal(dt);
    },
  };
}
