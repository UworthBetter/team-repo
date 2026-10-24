import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Ctx } from '@core/api';

/**
 * Owner: E. 暖金实感画风（2026-10-24 参考图风格转换）：
 * filmic tone mapping + 环境光 + 太阳软阴影 + 材质柔化，让物品有参考图那种
 * 温暖、受光、落地的感觉。草图书风的描边改为可选（?outline=1），默认关闭。
 * lil-gui「Style (E)」里可实时调曝光，投影上校准用。
 */
export function setupStyle(ctx: Ctx): void {
  const renderer = ctx.three.renderer;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Soft image-based ambient so flat-colored props stop looking cardboard-flat.
  // Kept below the sun's weight so grounded shadows stay visible (reference look).
  const pmrem = new THREE.PMREMGenerator(renderer);
  ctx.three.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  ctx.three.scene.environmentIntensity = 0.5;

  let sun: THREE.DirectionalLight | null = null;
  let hemi: THREE.HemisphereLight | null = null;
  ctx.three.scene.traverse((o) => {
    if (o instanceof THREE.DirectionalLight && !sun) sun = o;
    if (o instanceof THREE.HemisphereLight && !hemi) hemi = o;
  });
  if (hemi) (hemi as THREE.HemisphereLight).intensity *= 0.72;
  if (sun) {
    const s = sun as THREE.DirectionalLight;
    s.intensity *= 1.1; // golden-key weighting, reference look
    s.castShadow = true;
    s.shadow.mapSize.set(1024, 1024); // 2048 cost ~13 fps on the projector target; 1024 reads softer anyway
    const c = s.shadow.camera;
    c.left = -7; c.right = 7; c.top = 7; c.bottom = -7; c.near = 0.5; c.far = 25;
    s.shadow.bias = -0.0002;
    s.shadow.normalBias = 0.02;
  }

  // Re-run whenever the kitchen (re)builds: core recreates meshes and toon materials per build.
  ctx.bus.on('kitchen:ready', () => softenScene(ctx));

  if (ctx.dev.gui) {
    const folder = ctx.dev.gui.addFolder('Style (E)');
    folder.add(renderer, 'toneMappingExposure', 0.8, 1.6, 0.01).name('曝光');
  }
}

function softenScene(ctx: Ctx): void {
  ctx.three.scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const isHull = o.userData.outline === true;
    const isFloor = o.geometry instanceof THREE.PlaneGeometry && o.parent?.name === 'core-kitchen';
    o.castShadow = !isHull && !isFloor;
    o.receiveShadow = !isHull;
    if (isHull) return;

    const single = o.material as THREE.Material;
    if (Array.isArray(o.material)) {
      o.material = o.material.map(softenMaterial);
    } else {
      o.material = softenMaterial(single);
    }
  });
}

function softenMaterial(m: THREE.Material): THREE.Material {
  if (m instanceof THREE.MeshToonMaterial) {
    // Core builds greyboxes in toon; match them to the GLB standard materials.
    const std = new THREE.MeshStandardMaterial({ color: m.color.clone(), roughness: 0.85, metalness: 0 });
    m.dispose();
    return std;
  }
  if (m instanceof THREE.MeshStandardMaterial) {
    m.roughness = Math.min(m.roughness, 0.72);
    m.metalness = Math.min(m.metalness, 0.55);
    m.envMapIntensity = 0.7;
  }
  return m;
}
