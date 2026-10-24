import * as THREE from 'three';
import type { Vec3 } from '@contracts/types';
import type { Bus } from './bus';
import type { InputInternal } from './input';
import type { WorldInternal } from './world';

/** Station camera: click a station or press 1–9 to glide there, 0 for the overview. */
export function createCameraRig(camera: THREE.PerspectiveCamera, bus: Bus, world: WorldInternal, input: InputInternal) {
  const from = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  const to = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  const look = new THREE.Vector3();
  let t = 1;
  let dur = 0.45;

  const ease = (a: number) => (a < 0.5 ? 2 * a * a : 1 - Math.pow(-2 * a + 2, 2) / 2);
  function apply(a: number) {
    const e = ease(a);
    camera.position.lerpVectors(from.pos, to.pos, e);
    look.lerpVectors(from.target, to.target, e);
    camera.lookAt(look);
  }
  function goTo(c: { pos: Vec3; target: Vec3 }, d = 0.45) {
    from.pos.copy(camera.position);
    from.target.copy(look);
    to.pos.set(c.pos[0], c.pos[1], c.pos[2]);
    to.target.set(c.target[0], c.target[1], c.target[2]);
    dur = d;
    if (d <= 0) {
      t = 1;
      from.pos.copy(to.pos);
      from.target.copy(to.target);
      apply(1);
    } else t = 0;
  }

  bus.on('station:focus', ({ stationId }) => {
    const s = world.kitchen?.stations.find((x) => x.id === stationId);
    if (s) goTo(s.camera);
  });
  bus.on('kitchen:ready', () => {
    if (world.kitchen) goTo(world.kitchen.overview, 0);
  });
  for (let d = 1; d <= 9; d++) {
    input.onKey(`Digit${d}`, () => {
      const s = world.kitchen?.stations.find((x) => x.key === d);
      if (s) bus.emit('station:focus', { stationId: s.id });
    });
  }
  input.onKey('Digit0', () => world.kitchen && goTo(world.kitchen.overview));

  return {
    goTo,
    update(dt: number) {
      if (t < 1) {
        t = Math.min(1, t + dt / dur);
        apply(t);
      }
    },
  };
}
