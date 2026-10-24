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
 *
 * First-person walk mode (?firstperson, or F any time): the player stands in the room at eye
 * height and walks on the floor — WASD parallel to the ground, mouse to look, Shift to jog.
 * Left click and wheel remain available to cooking moves. Counters are solid (axis-separated slide, you never clip
 * through a worktop) and the room edge stops you. While walking, the station rig, push and
 * shake stand down; F glides back to the overview. Purely a camera — no gameplay state.
 */
export interface RigOptions {
  /** Enter walk mode as soon as the first kitchen is ready (?firstperson). */
  startFirstPerson?: boolean;
  /** Fires on every mode change, so app.ts can toast the controls. */
  onFirstPersonChange?(on: boolean): void;
}

const EYE = 1.6; // walking eye height; counters are 0.9 so worktops sit mid-view
const PLAYER_RADIUS = 0.28;
const ROOM_LIMIT = 7.4; // the floor slab is 16×16

export function createCameraRig(
  camera: THREE.PerspectiveCamera,
  bus: Bus,
  world: WorldInternal,
  input: InputInternal,
  o: RigOptions = {},
) {
  const from = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  const to = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  /** Base (pre-shake, pre-push) transform the glide produces each frame. */
  const basePos = new THREE.Vector3();
  const baseLook = new THREE.Vector3();
  const finalPos = new THREE.Vector3();
  const finalLook = new THREE.Vector3();
  let t = 1;
  let dur = 0.45;

  // --- pacing (A5): set from kitchen.pacing.camera on kitchen:ready ---
  let baseGlide = 0.45; // default station glide duration
  let zoomNear = 0; // fraction to dolly the rig toward its target (close/handheld = 0.2)
  let swayAmp = 0; // handheld hand-held sway amplitude in meters
  let swayClock = 0;

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

  // --- first-person walk state ---
  let fp = false;
  let fpYaw = 0;
  let fpPitch = -0.22;
  const fpSpeed = 1.6;
  let fpStartedOnce = false;
  const fpPos = new THREE.Vector3();
  const fpEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  const fwdFlat = new THREE.Vector3();
  const rightFlat = new THREE.Vector3();
  const wish = new THREE.Vector3();

  let obstacles: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [];
  const roomClamp = (v: number) => Math.max(-ROOM_LIMIT, Math.min(ROOM_LIMIT, v));

  function buildObstacles() {
    const kitchen = world.kitchen;
    const solids = [
      ...(kitchen?.counters ?? []),
      // Floor-standing fixtures such as the fridge are solid too; utensils are not.
      ...(kitchen?.props.filter((p) => p.grabbable === false && p.pos[1] < world.counterTop && p.size[1] >= world.counterTop) ?? []),
    ];
    obstacles = solids.map((c) => ({
      minX: c.pos[0] - c.size[0] / 2 - PLAYER_RADIUS,
      maxX: c.pos[0] + c.size[0] / 2 + PLAYER_RADIUS,
      minZ: c.pos[2] - c.size[2] / 2 - PLAYER_RADIUS,
      maxZ: c.pos[2] + c.size[2] / 2 + PLAYER_RADIUS,
    }));
  }

  /** A solid footprint (grown by the player radius) contains this standing point? */
  function blockedAt(x: number, z: number): boolean {
    return obstacles.some((c) => x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ);
  }

  function placeFirstPerson(x: number, z: number) {
    x = roomClamp(x);
    z = roomClamp(z);
    fpPos.set(x, EYE, z);
    if (!blockedAt(x, z)) return;
    // Test every rectangle edge combination: a single nudge can land in a neighbouring counter.
    const xs = [x, -ROOM_LIMIT, ROOM_LIMIT, ...obstacles.flatMap((c) => [c.minX, c.maxX]).map(roomClamp)];
    const zs = [z, -ROOM_LIMIT, ROOM_LIMIT, ...obstacles.flatMap((c) => [c.minZ, c.maxZ]).map(roomClamp)];
    let best = Infinity;
    for (const px of xs) for (const pz of zs) {
      const distance = (px - x) ** 2 + (pz - z) ** 2;
      if (distance < best && !blockedAt(px, pz)) {
        fpPos.set(px, EYE, pz);
        best = distance;
      }
    }
  }

  function faceFirstPerson(target: THREE.Vector3) {
    const dir = target.clone().sub(fpPos).normalize();
    fpYaw = Math.atan2(-dir.x, -dir.z);
    fpPitch = Math.max(-1.35, Math.min(0.9, Math.asin(dir.y)));
  }

  function enterFirstPerson(spawn?: { pos: Vec3; target: Vec3 }) {
    if (!world.kitchen) return;
    const changed = !fp;
    fp = true;
    if (spawn) {
      placeFirstPerson(spawn.pos[0], spawn.pos[2]);
      faceFirstPerson(new THREE.Vector3(...spawn.target));
    } else {
      placeFirstPerson(camera.position.x, camera.position.z);
      faceFirstPerson(baseLook);
    }
    if (changed) input.setLookEnabled(true);
    stepFirstPerson(0);
    if (changed) o.onFirstPersonChange?.(true);
  }

  function exitFirstPerson() {
    if (!fp) return;
    fp = false;
    input.setLookEnabled(false);
    pushLevel = pushTarget = 0; // any push/shake requested while walking is stale
    shakeT = shakeDur;
    // The return glide must begin at the player's actual pose, not the old station pose.
    basePos.copy(camera.position);
    camera.getWorldDirection(baseLook).add(basePos);
    if (world.kitchen) goTo(world.kitchen.overview, 0.45);
    o.onFirstPersonChange?.(false);
  }

  function stepFirstPerson(dt: number) {
    fwdFlat.set(-Math.sin(fpYaw), 0, -Math.cos(fpYaw));
    rightFlat.set(-fwdFlat.z, 0, fwdFlat.x);
    wish.set(0, 0, 0);
    if (input.lookActive) {
      if (input.keys.has('KeyW')) wish.add(fwdFlat);
      if (input.keys.has('KeyS')) wish.sub(fwdFlat);
      if (input.keys.has('KeyD')) wish.add(rightFlat);
      if (input.keys.has('KeyA')) wish.sub(rightFlat);
    }
    if (wish.lengthSq() > 1) wish.normalize();
    const speed = fpSpeed * (input.keys.has('ShiftLeft') || input.keys.has('ShiftRight') ? 2 : 1);
    // Axis-separated so sliding along a counter works: each axis only reverts if it collides.
    // Substeps prevent ?fast or a long frame from tunnelling through a thin counter.
    const distance = speed * Math.max(0, dt);
    const steps = Math.max(1, Math.ceil(distance / (PLAYER_RADIUS / 2)));
    for (let i = 0; i < steps; i++) {
      const nx = roomClamp(fpPos.x + wish.x * distance / steps);
      if (!blockedAt(nx, fpPos.z)) fpPos.x = nx;
      const nz = roomClamp(fpPos.z + wish.z * distance / steps);
      if (!blockedAt(fpPos.x, nz)) fpPos.z = nz;
    }
    fpPos.y = EYE;
    camera.position.copy(fpPos);
    camera.quaternion.setFromEuler(fpEuler.set(fpPitch, fpYaw, 0));
  }

  input.onKey('KeyF', () => (fp ? exitFirstPerson() : enterFirstPerson()));
  input.onLook((dx, dy) => {
    if (!fp) return;
    fpYaw -= dx * 0.005;
    fpPitch = Math.max(-1.35, Math.min(0.9, fpPitch - dy * 0.005));
    // Keep ray picking in sync even if a click arrives before the next rendered frame.
    camera.quaternion.setFromEuler(fpEuler.set(fpPitch, fpYaw, 0));
    camera.updateMatrixWorld();
  });

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
    if (swayAmp > 0) {
      // Gentle ~0.6 Hz handheld sway (A5), Lissajous so it never feels like a loop.
      const w = swayClock * Math.PI * 2 * 0.6;
      finalPos.x += Math.sin(w) * swayAmp;
      finalPos.y += Math.cos(w * 0.9) * swayAmp * 0.7;
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

  function goTo(c: { pos: Vec3; target: Vec3 }, d = baseGlide) {
    from.pos.copy(basePos);
    from.target.copy(baseLook);
    to.pos.set(c.pos[0], c.pos[1], c.pos[2]);
    to.target.set(c.target[0], c.target[1], c.target[2]);
    // Pacing 'close'/'handheld' dollies the whole rig toward its look point.
    if (zoomNear > 0) to.pos.lerp(to.target, zoomNear);
    dur = d;
    if (d <= 0) {
      t = 1;
      from.pos.copy(to.pos);
      from.target.copy(to.target);
      computeBase(1);
      if (!fp) applyFinal(0); // while walking, the rig must not snap the camera back
    } else t = 0;
  }

  bus.on('station:focus', ({ stationId }) => {
    const s = world.kitchen?.stations.find((x) => x.id === stationId);
    if (s) {
      if (fp) enterFirstPerson(s.camera);
      else goTo(s.camera);
    }
  });
  bus.on('kitchen:ready', () => {
    buildObstacles();
    // A fresh kitchen cancels any lingering push/shake from the previous one.
    pushLevel = pushTarget = 0;
    shakeT = shakeDur;
    // Pacing (A5): calm = current rig; close = 20% nearer + slower glide; handheld = close + sway.
    const mode = world.kitchen?.pacing?.camera ?? 'calm';
    zoomNear = mode === 'calm' ? 0 : 0.2;
    baseGlide = mode === 'calm' ? 0.45 : 0.6;
    swayAmp = mode === 'handheld' ? 0.012 : 0;
    if (world.kitchen) goTo(world.kitchen.overview, 0);
    // Walk mode survives a kitchen switch (stand in the new room at its overview spot).
    if (world.kitchen && fp) enterFirstPerson(world.kitchen.overview);
    else if (world.kitchen && o.startFirstPerson && !fpStartedOnce) {
      fpStartedOnce = true;
      enterFirstPerson(world.kitchen.overview);
    }
  });
  for (let d = 1; d <= 9; d++) {
    input.onKey(`Digit${d}`, () => {
      const s = world.kitchen?.stations.find((x) => x.key === d);
      if (s) bus.emit('station:focus', { stationId: s.id });
    });
  }
  input.onKey('Digit0', () => {
    if (!world.kitchen) return;
    if (fp) enterFirstPerson(world.kitchen.overview);
    else goTo(world.kitchen.overview);
  });

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
    setFirstPerson(on: boolean) {
      if (on && !fp) enterFirstPerson();
      else if (!on) exitFirstPerson();
    },
    update(dt: number) {
      swayClock += dt;
      if (fp) {
        stepFirstPerson(dt);
        return;
      }
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
