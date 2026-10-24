import * as THREE from 'three';
import type GUI from 'lil-gui';
import type { PropHandle } from './api';
import type { Bus } from './bus';
import type { InputInternal } from './input';
import type { WorldInternal } from './world';

/**
 * Toy-box grab: the held prop trails the hand along the counter with ~70 ms of lag and
 * tilts with its velocity. Released near a snap that accepts its kind → snaps in.
 * Otherwise it drops and bounces (fake physics; Rapier for toy props comes later, owner A).
 *
 * Feel constants live in `params` so the "Grab (A)" lil-gui folder can tune them live (A2).
 * These defaults are the committed values; change them here once B signs off on the feel.
 */
export interface GrabParams {
  /** Vertical lift of a held prop above the counter, in meters. */
  LIFT: number;
  /** Follow stiffness — higher = less lag (about 70 ms at 14). */
  FOLLOW: number;
  /** How strongly velocity tilts the held prop. */
  TILT: number;
  /** Global multiplier on every snap radius (forgiveness). */
  snapScale: number;
}

export interface GrabPhysics {
  readonly ready: boolean;
  toss(handle: PropHandle, velocity: THREE.Vector3): boolean;
  drop(handle: PropHandle): void;
}

export function createGrab(o: {
  input: InputInternal;
  world: WorldInternal;
  bus: Bus;
  camera: THREE.Camera;
  hand: HTMLElement;
  gui?: GUI | null;
  physics?: GrabPhysics;
}) {
  const { input, world, bus, camera, hand } = o;
  const params: GrabParams = { LIFT: 0.14, FOLLOW: 14, TILT: 0.18, snapScale: 1 };
  if (o.gui) {
    const f = o.gui.addFolder('Grab (A)');
    f.add(params, 'FOLLOW', 4, 30, 0.5).name('follow (less lag →)');
    f.add(params, 'TILT', 0, 0.5, 0.01).name('tilt');
    f.add(params, 'LIFT', 0, 0.4, 0.01).name('lift');
    f.add(params, 'snapScale', 0.5, 2, 0.05).name('snap radius ×');
    f.close();
  }
  const ray = new THREE.Raycaster();
  const target = new THREE.Vector3();
  const last = new THREE.Vector3();
  const vel = new THREE.Vector3();
  const falling = new Map<PropHandle, { vy: number; ground: number }>();
  const eggsFound = new Set<string>();
  let held: PropHandle | null = null;
  let hoverSnap: string | null = null;

  const clamp = (v: number, a: number) => Math.max(-a, Math.min(a, v));

  function pick(): PropHandle | undefined {
    ray.setFromCamera(input.ndc, camera);
    for (const hit of ray.intersectObjects(world.pickables(), true)) {
      const p = world.handleOf(hit.object);
      if (p && p.object.visible) return p;
    }
    return undefined;
  }

  function onDown() {
    if (!input.grabEnabled) return;
    const p = pick();
    if (p) {
      const egg = world.kitchen?.eggs.find((e) => e.propId === p.id);
      if (egg && !eggsFound.has(egg.id)) {
        eggsFound.add(egg.id);
        bus.emit('easter:found', { eggId: egg.id });
      }
      if (!p.grabbable) return;
      o.physics?.drop(p); // reclaim it if it was still tumbling in physics
      held = p;
      falling.delete(p);
      target.copy(p.object.position);
      last.copy(p.object.position);
      input.setHeld(p);
      hand.classList.add('holding');
      bus.emit('grab:start', { objectId: p.id, kind: p.kind });
      bus.emit('sfx:play', { id: 'grab' });
      return;
    }
    // In walk mode a click acts on the aimed prop; empty space must not teleport the player.
    if (input.lookActive) return;
    const cp = input.counterPoint();
    const k = world.kitchen;
    if (!cp || !k) return;
    let best: string | null = null;
    let bd = 0.9;
    for (const s of k.stations) {
      const d = Math.hypot(s.anchor[0] - cp.x, s.anchor[2] - cp.z);
      if (d < bd) {
        bd = d;
        best = s.id;
      }
    }
    if (best) bus.emit('station:focus', { stationId: best });
  }

  function onUp() {
    if (!held) return;
    const p = held;
    held = null;
    input.setHeld(null);
    hand.classList.remove('holding');
    world.highlightSnap(null);
    if (hoverSnap) {
      const snapId = hoverSnap;
      hoverSnap = null;
      p.object.position.copy(world.snapPos(snapId)!);
      p.object.rotation.set(0, 0, 0);
      bus.emit('snap:exit', { snapId, objectId: p.id });
      bus.emit('grab:end', { objectId: p.id, kind: p.kind, snappedTo: snapId });
      bus.emit('sfx:play', { id: 'snap' });
    } else {
      // Toy props roll/topple/bounce in Rapier; scored props keep the scripted fake bounce.
      const isToy = world.kitchen?.props.find((pp) => pp.id === p.id)?.toy ?? false;
      if (isToy && o.physics?.ready && o.physics.toss(p, vel.clone())) {
        bus.emit('grab:end', { objectId: p.id, kind: p.kind });
      } else {
        falling.set(p, { vy: 0, ground: world.groundAt(p.object.position.x, p.object.position.z) });
        bus.emit('grab:end', { objectId: p.id, kind: p.kind });
      }
    }
  }

  input.onPointer((kind) => {
    if (kind === 'down') onDown();
    else if (kind === 'up') onUp();
  });

  bus.on('kitchen:ready', () => {
    held = null;
    hoverSnap = null;
    falling.clear();
    input.setHeld(null);
    hand.classList.remove('holding');
  });

  function update(dt: number) {
    hand.style.transform = `translate(${input.pointer.x}px, ${input.pointer.y}px)`;
    hand.style.opacity = input.pointer.x || input.pointer.y ? '1' : '0';
    if (held) {
      const obj = held.object;
      const cp = input.counterPoint();
      if (cp) target.set(cp.x, world.counterTop + params.LIFT, cp.z);
      const k = 1 - Math.exp(-dt * params.FOLLOW);
      obj.position.lerp(target, k);
      vel.subVectors(obj.position, last).divideScalar(Math.max(dt, 1e-3));
      last.copy(obj.position);
      obj.rotation.z += (clamp(-vel.x * params.TILT, 0.45) - obj.rotation.z) * k;
      obj.rotation.x += (clamp(vel.z * params.TILT, 0.45) - obj.rotation.x) * k;

      let best: string | null = null;
      let bd = Infinity;
      for (const s of world.snaps()) {
        if (!s.accepts.includes(held.kind) && !s.accepts.includes('*')) continue;
        const d = Math.hypot(s.pos[0] - obj.position.x, s.pos[2] - obj.position.z);
        if (d < s.radius * params.snapScale && d < bd) {
          bd = d;
          best = s.id;
        }
      }
      if (best !== hoverSnap) {
        if (hoverSnap) bus.emit('snap:exit', { snapId: hoverSnap, objectId: held.id });
        if (best) {
          bus.emit('snap:enter', { snapId: best, objectId: held.id });
          bus.emit('sfx:play', { id: 'snap_hover' });
        }
        hoverSnap = best;
        world.highlightSnap(best);
      }
    }
    for (const [p, f] of falling) {
      const obj = p.object;
      f.vy -= 9.8 * dt;
      obj.position.y += f.vy * dt;
      obj.rotation.x *= 0.9;
      obj.rotation.z *= 0.9;
      if (obj.position.y <= f.ground) {
        obj.position.y = f.ground;
        if (Math.abs(f.vy) > 0.9) {
          f.vy = -f.vy * 0.38;
          bus.emit('sfx:play', { id: 'bounce' });
        } else {
          obj.rotation.set(0, 0, 0);
          falling.delete(p);
        }
      }
    }
  }

  return { update };
}
