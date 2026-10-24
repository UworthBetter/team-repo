import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { Bus } from '@core/bus';
import { createCameraRig } from '@core/camera';
import { loadContent } from '@core/content';
import type { InputInternal } from '@core/input';
import type { WorldInternal } from '@core/world';

function fixture(kitchenId = 'home', startFirstPerson = true) {
  const content = loadContent();
  const world = { kitchen: content.kitchens.get(kitchenId)!, counterTop: 0.9 };
  const keys = new Set<string>();
  const keyHandlers = new Map<string, (e: KeyboardEvent) => void>();
  let look: (dx: number, dy: number) => void = () => {};
  let active = true;
  let grabEnabled = true;
  const input: InputInternal = {
    pointer: { x: 0, y: 0, down: false }, ndc: new THREE.Vector2(), keys,
    held: null,
    get grabEnabled() { return grabEnabled; },
    get lookActive() { return active; },
    setLookEnabled: vi.fn(),
    onLook(fn) { look = fn; return () => {}; },
    setGrabEnabled(on) { grabEnabled = on; },
    setHeld() {}, counterPoint: () => null,
    onKey(code, fn) { keyHandlers.set(code, fn); return () => {}; },
    onPointer: () => () => {}, onWheel: () => () => {},
  };
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 60);
  const bus = new Bus();
  const changed = vi.fn();
  const rig = createCameraRig(camera, bus, world as WorldInternal, input, { startFirstPerson, onFirstPersonChange: changed });
  const ready = () => bus.emit('kitchen:ready', { kitchenId: world.kitchen.id });
  ready();
  return {
    camera, bus, world, content, input, rig, keys, ready, changed,
    key: (code: string) => keyHandlers.get(code)!({} as KeyboardEvent),
    look: (dx: number, dy: number) => look(dx, dy),
    pause: () => { active = false; },
  };
}

function expectOutsideCounters(f: ReturnType<typeof fixture>) {
  for (const c of f.world.kitchen.counters) {
    const inside = Math.abs(f.camera.position.x - c.pos[0]) < c.size[0] / 2 + 0.28
      && Math.abs(f.camera.position.z - c.pos[2]) < c.size[2] / 2 + 0.28;
    expect(inside).toBe(false);
  }
}

describe('first-person camera', () => {
  it('mouse motion turns without a button and keeps the horizon level', () => {
    const f = fixture();
    const before = f.camera.quaternion.clone();
    f.look(100, -80);
    expect(f.camera.quaternion.angleTo(before)).toBeGreaterThan(0.1);
    f.look(0, 100000);
    const angles = new THREE.Euler().setFromQuaternion(f.camera.quaternion, 'YXZ');
    expect(angles.x).toBeCloseTo(-1.1); // home.json cameraLimits.pitchMin
    expect(angles.z).toBeCloseTo(0);
    expect(f.input.grabEnabled).toBe(true);
  });

  it('station shortcuts place an eye-height camera outside overlapping counters in every kitchen', () => {
    for (const kitchen of loadContent().kitchens.values()) {
      const f = fixture(kitchen.id);
      for (const s of kitchen.stations) {
        f.bus.emit('station:focus', { stationId: s.id });
        expect(f.camera.position.y).toBe(1.6);
        expectOutsideCounters(f);
      }
    }
  });

  it('cannot tunnel through a counter on a large fast-forward frame', () => {
    const f = fixture();
    f.keys.add('KeyW');
    f.keys.add('ShiftLeft');
    f.rig.update(4);
    expect(f.camera.position.z).toBeGreaterThanOrEqual(1.33);
    expectOutsideCounters(f);
    f.keys.clear();
    f.keys.add('KeyD');
    f.rig.update(20);
    expect(Math.abs(f.camera.position.x)).toBeLessThanOrEqual(7.4);
    expectOutsideCounters(f);
  });

  it('normalizes diagonal movement and stops when the mouse is released', () => {
    const f = fixture();
    const before = f.camera.position.clone();
    f.keys.add('KeyS');
    f.keys.add('KeyD');
    f.rig.update(0.1);
    const moved = f.camera.position.distanceTo(before);
    expect(moved).toBeGreaterThan(0.05);   // moved, direction normalized
    expect(moved).toBeLessThan(0.17);      // 0.16 * dt, possibly room-clamped
    f.pause();
    const paused = f.camera.position.clone();
    f.rig.update(1);
    expect(f.camera.position.equals(paused)).toBe(true);
  });

  it('preserves move-owned grab state through repeated kitchen switches and exit', () => {
    const f = fixture();
    f.input.setGrabEnabled(false);
    f.world.kitchen = f.content.kitchens.get('wok')!;
    f.ready();
    f.ready();
    expect(f.changed).toHaveBeenCalledTimes(1);
    f.key('KeyF');
    expect(f.input.grabEnabled).toBe(false);
    f.input.setGrabEnabled(true);
    f.key('KeyF');
    f.ready();
    f.key('KeyF');
    expect(f.input.grabEnabled).toBe(true);
  });

  it('returns from the actual player pose and ignores stale push/shake', () => {
    const f = fixture();
    f.keys.add('KeyD');
    f.rig.update(0.4);
    f.look(100, 30);
    const pos = f.camera.position.clone();
    const rotation = f.camera.quaternion.clone();
    f.bus.emit('camera:push', { at: [0, 0, 0], zoom: 2, ms: 200 });
    f.bus.emit('camera:shake', { strength: 1, ms: 1000 });
    f.key('KeyF');
    f.rig.update(0);
    expect(f.camera.position.distanceTo(pos)).toBeLessThan(1e-8);
    expect(f.camera.quaternion.angleTo(rotation)).toBeLessThan(1e-7);
    f.rig.update(1);
    expect(f.camera.position.distanceTo(new THREE.Vector3(...f.world.kitchen.overview.pos))).toBeLessThan(1e-8);
  });

  it('retains fixed station cameras when first-person is off', () => {
    const f = fixture('home', false);
    const station = f.world.kitchen.stations[0]!;
    f.bus.emit('station:focus', { stationId: station.id });
    f.rig.update(1);
    expect(f.camera.position.distanceTo(new THREE.Vector3(...station.camera.pos))).toBeLessThan(1e-8);
  });
});
