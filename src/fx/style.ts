import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Ctx } from '@core/api';

export function usesSoftwareRenderer(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  // Chromium masks RENDERER as "WebKit WebGL" even when SwiftShader is in use.
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const names = [gl.getParameter(gl.RENDERER), debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : ''];
  return /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i.test(names.join(' '));
}

/**
 * Owner: E. 暖金实感画风（2026-10-24 参考图风格转换）：
 * filmic tone mapping + 环境光 + 太阳软阴影 + 材质柔化，让物品有参考图那种
 * 温暖、受光、落地的感觉。草图书风的描边改为可选（?outline=1），默认关闭。
 * lil-gui「Style (E)」里可实时调曝光，投影上校准用。
 */
export function setupStyle(ctx: Ctx): void {
  const renderer = ctx.three.renderer;

  // Software GL (CI smoke runs SwiftShader) can't afford shadow maps or PMREM —
  // they tank the frame rate so far the auto-play misses its beat windows.
  // Real GPUs (the projector machine) get the full treatment.
  const gl = renderer.getContext();
  const isSoftware = usesSoftwareRenderer(gl);
  if (isSoftware) {
    renderer.toneMapping = THREE.NoToneMapping;
    setupBlobShadows(ctx); // P1-5: 软渲染没有阴影贴图，用接地贴片补落地感
    return;
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  if (!isSoftware) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Soft image-based ambient so flat-colored props stop looking cardboard-flat.
    // Kept below the sun's weight so grounded shadows stay visible (reference look).
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    ctx.three.scene.environment = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();
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
      c.updateProjectionMatrix();
      s.shadow.bias = -0.0002;
      s.shadow.normalBias = 0.02;
    }
  }

  // Re-run whenever the kitchen (re)builds: core recreates meshes and toon materials per build.
  const styled = new WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const apply = () => {
    if (!isSoftware) softenScene(ctx, styled);
  };
  ctx.bus.on('kitchen:ready', () => {
    const kitchen = ctx.content.kitchens.get(ctx.world.kitchenId ?? '');
    if (!isSoftware && kitchen) {
      ctx.three.scene.traverse((object) => {
        if (object instanceof THREE.DirectionalLight) object.intensity = kitchen.mood.lightIntensity * 1.1;
      });
    }
    apply();
  });
  // Models attach asynchronously, and cooking moves create meshes after kitchen:ready.
  let elapsed = 0;
  ctx.onFrame((dt) => {
    elapsed += dt;
    if (elapsed < 0.25) return;
    elapsed = 0;
    apply();
  });

  if (ctx.dev.gui) {
    const folder = ctx.dev.gui.addFolder('Style (E)');
    folder.add(renderer, 'toneMappingExposure', 0.8, 1.6, 0.01).name('曝光');
  }
}

function softenScene(ctx: Ctx, styled: WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>): void {
  ctx.three.scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (styled.get(o) === o.material) return;
    const isHull = o.userData.outline === true;
    const isFloor = o.geometry instanceof THREE.PlaneGeometry && o.parent?.name === 'core-kitchen';
    o.castShadow = !isHull && !isFloor;
    o.receiveShadow = !isHull;
    if (isHull) return;

    // Moves retain their materials to animate doneness. Preserve those references.
    let staticKitchen = false;
    for (let parent = o.parent; parent; parent = parent.parent) {
      if (parent.name === 'core-kitchen') { staticKitchen = true; break; }
    }

    const single = o.material as THREE.Material;
    if (Array.isArray(o.material)) {
      o.material = o.material.map((material) => softenMaterial(material, staticKitchen));
    } else {
      o.material = softenMaterial(single, staticKitchen);
    }
    styled.set(o, o.material);
  });
}

// Cache by source identity: equal colors can still differ in opacity, side, or ownership.
// A global color cache would also reuse materials after kitchen disposal frees them.
const softened = new WeakMap<THREE.MeshToonMaterial, THREE.MeshStandardMaterial>();

function softenMaterial(m: THREE.Material, staticKitchen: boolean): THREE.Material {
  if (staticKitchen && m instanceof THREE.MeshToonMaterial) {
    const cached = softened.get(m);
    if (cached) return cached;
    // Core builds greyboxes in toon; match them to the GLB standard materials.
    const std = new THREE.MeshStandardMaterial({ color: m.color.clone(), roughness: 0.85, metalness: 0 });
    softened.set(m, std);
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

/**
 * P1-5 (design_fix_zh.md §4)：blob 接触阴影——仅在软件渲染（无阴影贴图）时启用。
 * 每个 prop 组下挂一张径向渐变贴片，随道具移动自动跟随；真 GPU 上有真实阴影，不加。
 */
let blobTexture: THREE.CanvasTexture | null = null;

function setupBlobShadows(ctx: Ctx): void {
  if (typeof document === 'undefined') return; // vitest node 环境：无 DOM 也无画面，贴片无意义
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(30,20,12,0.5)');
  grad.addColorStop(0.7, 'rgba(30,20,12,0.22)');
  grad.addColorStop(1, 'rgba(30,20,12,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  blobTexture = new THREE.CanvasTexture(canvas);

  const addBlobs = () => {
    ctx.three.scene.traverse((o) => {
      if (!(o instanceof THREE.Group) || !o.name.startsWith('prop:') || o.userData.blob) return;
      o.userData.blob = true;
      const box = new THREE.Box3().setFromObject(o);
      const size = box.getSize(new THREE.Vector3());
      const w = Math.min(1.2, Math.max(0.14, size.x * 1.18));
      const d = Math.min(1.2, Math.max(0.14, size.z * 1.18));
      const blob = new THREE.Mesh(
        new THREE.PlaneGeometry(w, d),
        new THREE.MeshBasicMaterial({ map: blobTexture!, transparent: true, depthWrite: false, opacity: 0.55 }),
      );
      blob.rotation.x = -Math.PI / 2;
      blob.position.y = 0.005;
      blob.renderOrder = 1;
      blob.name = 'blob-shadow';
      o.add(blob);
    });
  };
  ctx.bus.on('kitchen:ready', addBlobs);
  let acc = 0;
  ctx.onFrame((dt) => {
    acc += dt;
    if (acc < 0.25) return;
    acc = 0;
    addBlobs(); // GLB/道具异步后挂，低频补扫
  });
}
