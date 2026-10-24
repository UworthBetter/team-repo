import * as THREE from 'three';
import type { Ctx } from '@core/api';

export function usesSoftwareRenderer(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  // Chromium masks RENDERER as "WebKit WebGL" even when SwiftShader is in use.
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const names = [gl.getParameter(gl.RENDERER), debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : ''];
  return /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i.test(names.join(' '));
}

/** 风格 A 的两档平涂渐变（与 core/world.ts 的 twoTone 同规则，供动作模块自建的 toon 材质共享）。 */
const TWO_TONE = new THREE.DataTexture(new Uint8Array([138, 255]), 2, 1, THREE.RedFormat);
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
  renderer.toneMappingExposure = 1.08; // 上色 pass：轻微提亮让平涂色更接近 CSS 色板的饱和度

  const gl = renderer.getContext();
  const isSoftware = usesSoftwareRenderer(gl);

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
