import * as THREE from 'three';
import type { Ctx } from '@core/api';

/**
 * 川菜馆子的玩具反应 (C8), wired from the wok module's setup:
 *   麻将 mahjong   — every grab pops 「胡了!」 (the coin reward itself is D's, paid on easter:found)
 *   熊猫 panda     — waves while held
 *   辣椒串 strings — sway on a spring when a held prop bumps them
 *   盖碗 gaiwan    — a lid mesh rattles + clicks while it is held
 * All handlers look props up lazily, so they survive kitchen rebuilds.
 */

export function attachWokProps(ctx: Ctx) {
  const { bus, world } = ctx;

  /* ---------- 麻将:胡了! ---------- */
  bus.on('grab:start', ({ objectId }) => {
    if (objectId !== 'mahjong') return;
    const p = world.prop('mahjong')?.object.position;
    if (!p) return;
    bus.emit('fx:pop', { text: '胡了!', style: 'perfect', at: [p.x, p.y + 0.25, p.z] });
    bus.emit('sfx:play', { id: 'sticker' });
  });

  /* ---------- 熊猫:挥手 ---------- */
  let pandaWave = 0; // seconds of waving left
  bus.on('grab:start', ({ objectId }) => {
    if (objectId !== 'panda') return;
    pandaWave = 1.4;
    const p = world.prop('panda')?.object.position;
    if (p) bus.emit('fx:pop', { text: '嗨~', style: 'info', at: [p.x, p.y + 0.3, p.z] });
  });
  bus.on('grab:end', ({ objectId }) => {
    if (objectId === 'panda') world.resetProp('panda');
  });

  /* ---------- 盖碗:盖子咔哒 ---------- */
  let lid: THREE.Mesh | null = null;
  let lidRattle = 0;
  let lidBase = new THREE.Vector3();
  bus.on('grab:start', ({ objectId }) => {
    if (objectId !== 'gaiwan') return;
    const g = world.prop('gaiwan')?.object;
    if (!g) return;
    lid = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.02, 16), new THREE.MeshToonMaterial({ color: '#D9D2C2' }));
    lid.name = 'wok:gaiwan-lid';
    lidBase.set(0, 0.055, 0);
    lid.position.copy(lidBase);
    g.add(lid);
    lidRattle = 1;
    bus.emit('sfx:play', { id: 'snap_hover' });
  });
  bus.on('grab:end', ({ objectId }) => {
    if (objectId !== 'gaiwan') return;
    world.resetProp('gaiwan');
    if (lid) {
      lid.removeFromParent();
      lid.geometry.dispose();
      (lid.material as THREE.Material).dispose();
      lid = null;
    }
    lidRattle = 0;
  });

  /* ---------- 辣椒串:被碰到会晃 (spring sway) ---------- */
  const swaying = [1, 2, 3].map((n) => ({ id: `chili_string_${n}`, a: 0, v: 0 }));
  let lastHeldX: number | null = null;

  const offFrame = ctx.onFrame((dt: number) => {
    // panda wave: rock side to side, fading out
    const panda = world.prop('panda');
    if (panda && pandaWave > 0) {
      pandaWave = Math.max(0, pandaWave - dt);
      panda.object.rotation.z = Math.sin(pandaWave * 14) * 0.5 * pandaWave;
    }

    // gaiwan lid rattle: jitter while held
    if (lid && lidRattle > 0) {
      lid.rotation.z = Math.sin(performance.now() * 0.09) * 0.25;
      lid.position.x = lidBase.x + Math.sin(performance.now() * 0.05) * 0.008;
    }

    // chili strings: damped spring toward rest; a held prop passing close kicks them
    const held = ctx.input.held;
    const hx = held?.object.position.x ?? null;
    const prevX = lastHeldX;
    for (const s of swaying) {
      const p = world.prop(s.id);
      if (!p) continue;
      if (held && hx !== null && prevX !== null) {
        const d = Math.hypot(held.object.position.x - p.object.position.x, held.object.position.z - p.object.position.z);
        // 0.45 m: the strings hang above the counter, so anything passing under them stirs the air.
        const moving = Math.abs(hx - prevX) > 0.002;
        if (d < 0.45 && moving) s.v += (hx > prevX ? 1 : -1) * 2.6 * dt * 10;
      }
      s.v += (-s.a * 42 - s.v * 2.2) * dt;
      s.a += s.v * dt;
      p.object.rotation.z = s.a;
    }
    lastHeldX = hx;
  });

  return () => {
    offFrame();
    lid?.removeFromParent();
  };
}
