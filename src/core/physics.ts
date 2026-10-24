import * as THREE from 'three';
import type { RigidBody, World as RapierWorld } from '@dimforge/rapier3d-compat';
import type { PropHandle } from './api';
import type { Bus } from './bus';
import type { WorldInternal } from './world';

/**
 * Rapier physics for free-play TOY props only (owner A, card A7).
 *
 * Counters and a ground plane are static colliders. A `toy: true` prop gets a dynamic body ONLY
 * when it is tossed — i.e. released (grab:end) away from any snap — so it rolls, topples and
 * bounces instead of the old scripted fake-bounce. Once a body falls asleep we drop it and leave
 * the mesh at rest, so idle toys cost nothing. Scored (non-toy) props never touch physics and
 * stay on the guided snap/bounce path.
 *
 * Rapier (wasm) is dynamic-imported so it code-splits out of the main bundle and never blocks
 * first paint. Everything is defensive: if the wasm fails to load/init, `ready` stays false and
 * grab falls back to the fake bounce, so the loop (and `npm run smoke`) is never blocked.
 */
export interface Physics {
  readonly ready: boolean;
  /** Hand a tossed toy to physics with an initial velocity. Returns false if physics isn't ready. */
  toss(handle: PropHandle, velocity: THREE.Vector3): boolean;
  /** Reclaim a prop from physics (it was grabbed again); safe if it wasn't simulated. */
  drop(handle: PropHandle): void;
  /** Step the world and sync meshes. Call once per frame. */
  update(dt: number): void;
}

type RapierApi = typeof import('@dimforge/rapier3d-compat');

export function createPhysics(o: { world: WorldInternal; bus: Bus }): Physics {
  const { world, bus } = o;
  let R: RapierApi | null = null;
  let sim: RapierWorld | null = null;
  let ready = false;
  const active = new Map<PropHandle, RigidBody>();
  const statics: RigidBody[] = [];
  const quat = new THREE.Quaternion();
  const offset = new THREE.Vector3();

  import('@dimforge/rapier3d-compat')
    .then((mod) => mod.init().then(() => mod))
    .then((mod) => {
      R = mod;
      sim = new mod.World({ x: 0, y: -9.81, z: 0 });
      ready = true;
      if (world.kitchen) buildStatics();
    })
    .catch((err) => console.warn('[physics] rapier unavailable — using fake bounce', err));

  function buildStatics() {
    if (!R || !sim || !world.kitchen) return;
    for (const b of statics) sim.removeRigidBody(b);
    statics.length = 0;
    for (const [, body] of active) sim.removeRigidBody(body);
    active.clear();

    // Ground plane just under y = 0.
    const ground = sim.createRigidBody(R.RigidBodyDesc.fixed());
    sim.createCollider(R.ColliderDesc.cuboid(10, 0.05, 10).setTranslation(0, -0.05, 0), ground);
    statics.push(ground);

    for (const c of world.kitchen.counters) {
      const body = sim.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(c.pos[0], c.pos[1] + c.size[1] / 2, c.pos[2]));
      sim.createCollider(R.ColliderDesc.cuboid(c.size[0] / 2, c.size[1] / 2, c.size[2] / 2), body);
      statics.push(body);
    }
  }

  bus.on('kitchen:ready', () => {
    if (ready) buildStatics();
  });
  bus.on('dish:start', () => {
    // A dish reset repositions props; let go of any toys still tumbling so physics doesn't fight it.
    if (!sim) return;
    for (const [, body] of active) sim.removeRigidBody(body);
    active.clear();
  });

  function sync(handle: PropHandle, body: RigidBody) {
    const t = body.translation();
    const r = body.rotation();
    quat.set(r.x, r.y, r.z, r.w);
    // The prop group's origin is its bottom-center; the body is centred, so subtract the
    // rotated half-height so the visible mesh sits exactly on the body.
    offset.set(0, handle.size[1] / 2, 0).applyQuaternion(quat);
    handle.object.position.set(t.x - offset.x, t.y - offset.y, t.z - offset.z);
    handle.object.quaternion.copy(quat);
  }

  return {
    get ready() {
      return ready;
    },
    toss(handle, velocity) {
      if (!R || !sim) return false;
      const prev = active.get(handle);
      if (prev) sim.removeRigidBody(prev);
      const p = handle.object.position;
      const [sx, sy, sz] = handle.size;
      const desc = R.RigidBodyDesc.dynamic()
        .setTranslation(p.x, p.y + sy / 2, p.z)
        .setLinvel(velocity.x, velocity.y, velocity.z)
        .setAngvel({ x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 6, z: (Math.random() - 0.5) * 6 });
      const body = sim.createRigidBody(desc);
      sim.createCollider(R.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2).setRestitution(0.4).setFriction(0.8), body);
      active.set(handle, body);
      return true;
    },
    drop(handle) {
      if (!sim) return;
      const body = active.get(handle);
      if (body) {
        sim.removeRigidBody(body);
        active.delete(handle);
      }
    },
    update(dt) {
      if (!sim || active.size === 0) return;
      sim.timestep = Math.min(Math.max(dt, 1 / 240), 1 / 30);
      sim.step();
      for (const [handle, body] of active) {
        sync(handle, body);
        if (body.isSleeping()) {
          sim.removeRigidBody(body);
          active.delete(handle);
        }
      }
    },
  };
}
