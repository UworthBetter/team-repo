import * as THREE from 'three';
import type { Ctx } from '@core/api';

/**
 * Owner: E. P1-6 (design_fix_zh.md §4)：可抓取物的悬停描边。
 * 全局描边保持关闭（那是旧画风）；指针悬停在可抓取 prop 上时，只给它加一圈
 * 金色反向外壳（gold = 可交互的色语义）。每 ~3 帧一次射线，成本可忽略。
 */
const HOVER_COLOR = 0xf2b33d;
const SCALE = 1.035;

export function setupHover(ctx: Ctx): void {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let dirty = false;
  let hulls: THREE.Mesh[] = [];
  let targetId: string | null = null;

  const clear = () => {
    for (const h of hulls) {
      h.parent?.remove(h);
      (h.material as THREE.Material).dispose();
    }
    hulls = [];
    targetId = null;
  };

  const build = (group: THREE.Object3D) => {
    const mat = new THREE.MeshBasicMaterial({ color: HOVER_COLOR, side: THREE.BackSide, transparent: true, opacity: 0.9, fog: false, toneMapped: false });
    group.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || o.userData.outline || o.userData.hoverHull || o.userData.blob) return;
      const hull = new THREE.Mesh(o.geometry, mat);
      hull.scale.setScalar(SCALE);
      hull.userData.hoverHull = true;
      hull.raycast = () => {};
      o.add(hull);
      hulls.push(hull);
    });
  };

  const pick = () => {
    raycaster.setFromCamera(ndc, ctx.three.camera);
    const hits = raycaster.intersectObjects(ctx.three.scene.children, true);
    for (const hit of hits) {
      if (hit.object.userData.hoverHull || hit.object.userData.outline || hit.object.userData.blob) continue;
      if (!hit.object.visible) continue;
      let o: THREE.Object3D | null = hit.object;
      while (o && !o.name.startsWith('prop:')) o = o.parent;
      if (!o) continue; // 地面/壳体/装饰组不响应
      const propId = o.name.slice(5);
      const kitchen = ctx.content.kitchens.get(ctx.world.kitchenId ?? '');
      const def = kitchen?.props.find((p) => p.id === propId);
      if (!def || def.grabbable === false) continue;
      return propId;
    }
    return null;
  };

  ctx.input.onPointer((_kind: 'down' | 'move' | 'up', e: PointerEvent) => {
    const r = ctx.three.renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    dirty = true;
  });

  let acc = 0;
  ctx.onFrame((dt) => {
    acc += dt;
    if (acc < 0.09) return;
    acc = 0;
    if (!dirty && hulls.length) return;
    dirty = false;
    const id = pick();
    if (id === targetId) return;
    clear();
    targetId = id;
    if (!id) return;
    const group = ctx.three.scene.getObjectByName(`prop:${id}`);
    if (group) build(group);
  });

  ctx.bus.on('kitchen:ready', clear);
}
