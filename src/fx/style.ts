import * as THREE from 'three';
import type { Ctx } from '@core/api';

export function usesSoftwareRenderer(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  // Chromium masks RENDERER as "WebKit WebGL" even when SwiftShader is in use.
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const names = [gl.getParameter(gl.RENDERER), debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : ''];
  return /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i.test(names.join(' '));
}

/** 风格 A 的两档平涂渐变（与 core/world.ts 的 twoTone 同规则，供动作模块自建的 toon 材质共享）。 */
const TWO_TONE = new THREE.DataTexture(new Uint8Array([150, 255]), 2, 1, THREE.RedFormat);
TWO_TONE.minFilter = THREE.NearestFilter;
TWO_TONE.magFilter = THREE.NearestFilter;
TWO_TONE.needsUpdate = true;

/**
 * Owner: E. 风格 A · 纸感平涂（2026-10-24 用户在风格稿 A/B/C 中确认 A）：
 * 线性色调映射让平涂颜色与 CSS 色板直出一致；不再用环境反射/金属感（那是上一版
 * 暖金实感的手法），保留太阳软阴影作为"落地"层次；所有 toon 材质统一套两档
 * gradientMap，GLB 的 standard 材质去金属、提高粗糙度，让整体读作同一套纸片。
 * 软件渲染（CI SwiftShader）依旧跳过阴影，保住自动播放的节拍窗口。
 */
export function setupStyle(ctx: Ctx): void {
  const renderer = ctx.three.renderer;
  renderer.toneMapping = THREE.LinearToneMapping;
  renderer.toneMappingExposure = 1.0;

  const gl = renderer.getContext();
  const isSoftware = usesSoftwareRenderer(gl);
  if (isSoftware) setupBlobShadows(ctx); // P1-5: 软渲染没有阴影贴图，blob 贴片补落地感

  if (!isSoftware) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    let sun: THREE.DirectionalLight | null = null;
    ctx.three.scene.traverse((o) => {
      if (o instanceof THREE.DirectionalLight && !sun) sun = o;
    });
    if (sun) {
      const s = sun as THREE.DirectionalLight;
      s.castShadow = true;
      s.shadow.mapSize.set(1024, 1024); // 2048 cost ~13 fps on the projector target; 1024 reads softer anyway
      const c = s.shadow.camera;
      c.left = -7; c.right = 7; c.top = 7; c.bottom = -7; c.near = 0.5; c.far = 25;
      c.updateProjectionMatrix();
      s.shadow.bias = -0.0002;
      s.shadow.normalBias = 0.02;
    }
  }

  // Re-run whenever the kitchen (re)builds: core recreates meshes and materials per build.
  const styled = new WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const apply = () => flattenScene(ctx, styled);
  ctx.bus.on('kitchen:ready', apply);
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

function flattenScene(ctx: Ctx, styled: WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>): void {
  ctx.three.scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (styled.get(o) === o.material) return;
    const isHull = o.userData.outline === true;
    const isFloor = o.geometry instanceof THREE.PlaneGeometry && o.parent?.name === 'core-kitchen';
    o.castShadow = !isHull && !isFloor;
    o.receiveShadow = !isHull;
    if (isHull) return;

    if (Array.isArray(o.material)) {
      o.material = o.material.map((m) => flattenMaterial(m));
    } else {
      o.material = flattenMaterial(o.material);
    }
    styled.set(o, o.material);
  });
}

function flattenMaterial(m: THREE.Material): THREE.Material {
  // 动作模块自建的 toon（蛋黄、蛋壳、圆顶…）与 core 灰盒统一两档平涂。
  if (m instanceof THREE.MeshToonMaterial) {
    m.gradientMap = TWO_TONE;
    return m;
  }
  // GLB 的 standard 材质：去金属、高粗糙，颜色贴图保留但不再反光——纸片感。
  if (m instanceof THREE.MeshStandardMaterial) {
    m.roughness = 0.95;
    m.metalness = 0;
    m.envMapIntensity = 0;
  }
  return m;
}

/**
 * P1-5 (design_fix_zh.md §4)：blob 接触阴影——仅在软件渲染（无阴影贴图）时启用。
 * 每个 prop 组下挂一张径向渐变贴片，随道具移动自动跟随；真 GPU 上有真实阴影，不加。
 * 贴片是 MeshBasicMaterial，不参与风格 A 的两档平涂（unlit 才能保持渐变贴片的观感）。
 */
let blobTexture: THREE.CanvasTexture | null = null;

function setupBlobShadows(ctx: Ctx): void {
  if (typeof document === 'undefined') return; // vitest node 环境：无 DOM 也无画面
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
        new THREE.MeshBasicMaterial({ map: blobTexture!, transparent: true, depthWrite: false, opacity: 0.5 }),
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
