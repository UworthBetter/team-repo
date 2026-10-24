import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Assets } from '@core/assets';
import { Bus } from '@core/bus';
import { loadContent } from '@core/content';
import { createWorld } from '@core/world';

function fixture() {
  const pending: ((model: THREE.Object3D) => void)[] = [];
  const assets: Assets = {
    hasModel: () => true,
    loadModel: () => new Promise((resolve) => pending.push(resolve)),
  };
  const scene = new THREE.Scene();
  const content = loadContent();
  const bus = new Bus();
  const world = createWorld(scene, new THREE.PerspectiveCamera(), {} as THREE.WebGLRenderer, bus, assets, content);
  const kitchen = structuredClone(content.kitchens.get('home')!);
  kitchen.props = [kitchen.props.find((p) => p.kind === 'egg')!];
  kitchen.props[0]!.model = 'shared_food_egg';
  world.build(kitchen);
  const model = () => {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    return group;
  };
  return { world, scene, bus, pending, model, kitchen };
}

describe('world asset lifecycle', () => {
  it('picks the loaded model rather than its hidden greybox, and ignores consumed props', async () => {
    const f = fixture();
    const loaded = f.model();
    f.pending[0]!(loaded);
    await Promise.resolve();
    expect(f.world.pickables()).toEqual(loaded.children);
    f.world.prop(f.kitchen.props[0]!.id)!.object.visible = false;
    expect(f.world.pickables()).toEqual([]);
  });

  it('disposes late assets from a kitchen that is no longer active', async () => {
    const f = fixture();
    const stale = f.model();
    let disposals = 0;
    (stale.children[0] as THREE.Mesh).geometry.addEventListener('dispose', () => disposals++);
    f.world.build(f.kitchen);
    f.pending[0]!(stale);
    await Promise.resolve();
    expect(stale.parent).toBeNull();
    expect(disposals).toBe(1);
  });

  it('does not duplicate equipment when its install event repeats during model loading', async () => {
    const f = fixture();
    f.bus.emit('equipment:installed', { itemId: 'wok_burner', kitchenId: 'home' });
    const oldLoad = f.pending.at(-1)!;
    f.bus.emit('equipment:installed', { itemId: 'wok_burner', kitchenId: 'home' });
    const currentLoad = f.pending.at(-1)!;
    const stale = f.model();
    const current = f.model();
    oldLoad(stale);
    currentLoad(current);
    await Promise.resolve();
    expect(stale.parent).toBeNull();
    expect(current.parent).not.toBeNull();
  });
});
