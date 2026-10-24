import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { Ctx } from '@core/api';
import { Bus } from '@core/bus';
import { loadContent } from '@core/content';
import { setupStyle, usesSoftwareRenderer } from '../src/fx/style';

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  return {
    ...actual,
    PMREMGenerator: class {
      fromScene() { return { texture: new actual.Texture() }; }
      dispose() {}
    },
  };
});

function context(masked: string, unmasked?: string) {
  return {
    RENDERER: 0x1f01,
    getExtension: () => unmasked ? { UNMASKED_RENDERER_WEBGL: 0x9246 } : null,
    getParameter: (parameter: number) => parameter === 0x9246 ? unmasked : masked,
  } as unknown as WebGLRenderingContext;
}

describe('style renderer selection', () => {
  it('recognizes SwiftShader even when the standard renderer name is masked', () => {
    expect(usesSoftwareRenderer(context('WebKit WebGL', 'ANGLE (Google, Vulkan SwiftShader Device)'))).toBe(true);
  });

  it('keeps full warm lighting on hardware GPUs', () => {
    expect(usesSoftwareRenderer(context('WebKit WebGL', 'ANGLE (NVIDIA GeForce, D3D11)'))).toBe(false);
  });

  it('handles browsers without the optional debug extension', () => {
    expect(usesSoftwareRenderer(context('Mesa llvmpipe'))).toBe(true);
    expect(usesSoftwareRenderer(context('WebKit WebGL'))).toBe(false);
  });

  it('styles late-loaded models without replacing cooking materials or losing kitchen lighting', () => {
    const scene = new THREE.Scene();
    const base = new THREE.Group();
    base.name = 'core-kitchen';
    const root = new THREE.Group();
    const sun = new THREE.DirectionalLight();
    scene.add(base, root, sun, new THREE.HemisphereLight());
    const staticMesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshToonMaterial());
    base.add(staticMesh);
    const cookingMaterial = new THREE.MeshToonMaterial();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), cookingMaterial));
    const bus = new Bus();
    const content = loadContent();
    const frames: ((dt: number) => void)[] = [];
    const renderer = {
      getContext: () => context('WebKit WebGL', 'ANGLE (NVIDIA GeForce, D3D11)'),
      shadowMap: { enabled: false, type: THREE.BasicShadowMap },
    };
    const ctx = {
      bus, content, three: { scene, renderer }, world: { kitchenId: 'home' }, dev: { gui: null },
      onFrame(fn: (dt: number) => void) { frames.push(fn); return () => {}; },
    } as unknown as Ctx;
    setupStyle(ctx);
    bus.emit('kitchen:ready', { kitchenId: 'home' });
    expect(renderer.shadowMap.enabled).toBe(true);
    expect(scene.environment).not.toBeNull();
    expect(staticMesh.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect((root.children[0] as THREE.Mesh).material).toBe(cookingMaterial);
    const lateModel = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ roughness: 1 }));
    base.add(lateModel);
    frames.forEach((frame) => frame(0.3));
    expect(lateModel.castShadow).toBe(true);
    expect(lateModel.material.roughness).toBe(0.72);
    sun.intensity = content.kitchens.get('home')!.mood.lightIntensity;
    bus.emit('kitchen:ready', { kitchenId: 'home' });
    expect(sun.intensity).toBeCloseTo(content.kitchens.get('home')!.mood.lightIntensity * 1.1);
  });
});
