import * as THREE from 'three';
import type { Vec3 } from '@contracts/types';
import type { Bus } from './bus';
import type { InputInternal } from './input';
import type { WorldInternal } from './world';

/**
 * First-person camera — the game's only view. The player stands in the room at eye
 * height and walks on the floor: WASD parallel to the ground, mouse to look, Shift to
 * jog. Left click and wheel remain available to cooking moves. Counters are solid
 * (axis-separated slide, you never clip through a worktop) and the room edge stops
 * you. Clicking a station or pressing 1–9 places the player at that station's camera
 * spot facing it; 0 does the same at the kitchen overview spot. The camera:push /
 * camera:shake / camera:release events some moves still emit no longer have a listener
 * here — they belonged to the retired fixed-station rig and are ignored while walking.
 */
export interface RigOptions {
  /** Fires once when the first kitchen is entered, so app.ts can show the walk HUD. */
  onEnter?(): void;
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
  let entered = false;
  let yaw = 0;
  let pitch = -0.22;
  const fpSpeed = 1.6;
  const pos = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
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

  function place(x: number, z: number) {
    x = roomClamp(x);
    z = roomClamp(z);
    pos.set(x, EYE, z);
    if (!blockedAt(x, z)) return;
    // Test every rectangle edge combination: a single nudge can land in a neighbouring counter.
    const xs = [x, -ROOM_LIMIT, ROOM_LIMIT, ...obstacles.flatMap((c) => [c.minX, c.maxX]).map(roomClamp)];
    const zs = [z, -ROOM_LIMIT, ROOM_LIMIT, ...obstacles.flatMap((c) => [c.minZ, c.maxZ]).map(roomClamp)];
    let best = Infinity;
    for (const px of xs) for (const pz of zs) {
      const distance = (px - x) ** 2 + (pz - z) ** 2;
      if (distance < best && !blockedAt(px, pz)) {
        pos.set(px, EYE, pz);
        best = distance;
      }
    }
  }

  function face(target: THREE.Vector3) {
    const dir = target.clone().sub(pos).normalize();
    yaw = Math.atan2(-dir.x, -dir.z);
    pitch = Math.max(-1.35, Math.min(0.9, Math.asin(dir.y)));
  }

  /** Stand at a camera spot (station or kitchen overview), nudged out of any counter. */
  function enter(spawn: { pos: Vec3; target: Vec3 }) {
    if (!world.kitchen) return;
    place(spawn.pos[0], spawn.pos[2]);
    face(new THREE.Vector3(...spawn.target));
    const first = !entered;
    entered = true;
    if (first) {
      input.setLookEnabled(true);
      step(0);
      o.onEnter?.();
    }
  }

  function step(dt: number) {
    fwdFlat.set(-Math.sin(yaw), 0, -Math.cos(yaw));
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
      const nx = roomClamp(pos.x + wish.x * distance / steps);
      if (!blockedAt(nx, pos.z)) pos.x = nx;
      const nz = roomClamp(pos.z + wish.z * distance / steps);
      if (!blockedAt(pos.x, nz)) pos.z = nz;
    }
    pos.y = EYE;
    camera.position.copy(pos);
    camera.quaternion.setFromEuler(euler.set(pitch, yaw, 0));
  }

  input.onLook((dx, dy) => {
    if (!entered) return;
    yaw -= dx * 0.005;
    pitch = Math.max(-1.35, Math.min(0.9, pitch - dy * 0.005));
    // Keep ray picking in sync even if a click arrives before the next rendered frame.
    camera.quaternion.setFromEuler(euler.set(pitch, yaw, 0));
    camera.updateMatrixWorld();
  });

  bus.on('station:focus', ({ stationId }) => {
    const s = world.kitchen?.stations.find((x) => x.id === stationId);
    if (s) enter(s.camera);
  });
  bus.on('kitchen:ready', () => {
    buildObstacles();
    // Stand in the new room at its overview spot; the pose carries over between kitchens.
    if (world.kitchen) enter(world.kitchen.overview);
  });
  for (let d = 1; d <= 9; d++) {
    input.onKey(`Digit${d}`, () => {
      const s = world.kitchen?.stations.find((x) => x.key === d);
      if (s) bus.emit('station:focus', { stationId: s.id });
    });
  }
  input.onKey('Digit0', () => {
    if (world.kitchen) enter(world.kitchen.overview);
  });

  return {
    update(dt: number) {
      if (entered) step(dt);
    },
  };
}
