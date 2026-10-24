import * as THREE from 'three';
import type { Ctx } from '@core/api';

/**
 * Owner: E. Inverted-hull toon outline (sketchbook art note: warm-brown outline on chunky props).
 * Every mesh gets a back-face clone scaled 1.03 with an unlit ink material, parented to its
 * source so it follows grabs, physics and resets for free; core's disposeTree frees the clones
 * on the next build. A low-frequency rescan picks up meshes that attach after kitchen:ready —
 * async GLB loads, installed gear, toy props — without per-frame cost.
 */
const INK = 0x3b2a20;
const SCALE = 1.03;
const RESCAN_S = 0.25;

let material: THREE.MeshBasicMaterial | null = null;

function outlineable(mesh: THREE.Mesh): boolean {
  // userData.outlined: already hull'd · userData.outline: is a hull (never hull a hull).
  if (mesh.userData.outlined || mesh.userData.outline) return false;
  if (!mesh.visible || mesh instanceof THREE.InstancedMesh || mesh instanceof THREE.SkinnedMesh) return false;
  // Core-kitchen's own floor plane and snap rings are scenery/UI, not props.
  if (mesh.parent?.name === 'core-kitchen') {
    if (mesh.geometry instanceof THREE.PlaneGeometry || mesh.geometry instanceof THREE.RingGeometry) return false;
  }
  return true;
}

function scan(obj: THREE.Object3D): void {
  const mat = material;
  if (!mat) return;
  obj.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !outlineable(o)) return;
    const hull = new THREE.Mesh(o.geometry, mat);
    hull.name = 'outline';
    hull.scale.setScalar(SCALE);
    hull.userData.outline = true;
    hull.raycast = () => {}; // outlines never answer picks — the source mesh does
    o.add(hull);
    o.userData.outlined = true;
  });
}

export function setupOutline(ctx: Ctx): void {
  // 2026-10-24 画风转向暖金实感（src/fx/style.ts），描边默认关闭；
  // ?outline=1 恢复草图书的 toon 风格（卡 E1 的能力保留）。
  if (!new URLSearchParams(location.search).has('outline')) return;
  ctx.bus.on('kitchen:ready', () => {
    material?.dispose();
    // One shared material per kitchen; a fresh one each build because disposeTree
    // has just disposed the previous kitchen's clones' materials.
    material = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide, fog: false, toneMapped: false });
    scan(ctx.three.scene);
  });
  let acc = 0;
  ctx.onFrame((dt) => {
    acc += dt;
    if (acc < RESCAN_S) return;
    acc = 0;
    scan(ctx.three.scene);
  });
}
