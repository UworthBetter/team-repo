import * as THREE from 'three';
import type { Equipment } from '@contracts/schemas';
import type { Ctx } from '@core/api';

/**
 * Card D2 — the crate unbox sequence (sketch board 6), replacing the old 700 ms placeholder:
 * drop (咚) → drag along the tape → burst (confetti) → the gear rises and snaps into its slot.
 * meta/index.ts keeps the save state; this file only runs the ceremony and calls onInstalled
 * at the moment the gear lands. With ?auto every stage runs on timers (npm run smoke).
 */

type Phase = 'drop' | 'tape' | 'burst' | 'rise' | 'done';

const CARD = '#C89B62'; // cardboard
const TAPE = '#D9C08A';
const BRASS = '#D9A441'; // same brass as core's slot greybox, so the riser reads as "installed"

export interface CrateOpts {
  itemId: string;
  eq: Equipment;
  /** Called when the gear has visibly landed in its slot — meta persists + emits from here. */
  onInstalled: () => void;
}

export function runCrate(ctx: Ctx, opts: CrateOpts): () => void {
  const { bus } = ctx;
  const kitchen = ctx.content.kitchens.get(ctx.world.kitchenId ?? '');
  const slot = kitchen?.slots.find((s) => s.itemId === opts.itemId);
  const fallback = kitchen?.stations[0]?.anchor ?? [0, 0.9, 0];
  const restPos = new THREE.Vector3(...(slot?.pos ?? fallback));
  const slotSize = new THREE.Vector3(...(slot?.size ?? [0.35, 0.3, 0.35]));

  // The crate is a parcel, not the appliance: cap it so even the tall 猛火灶 slot reads as a box.
  const crateScale = Math.min(1, 0.55 / Math.max(slotSize.x, slotSize.y, slotSize.z, 0.001));
  const size = slotSize.clone().multiplyScalar(crateScale).clampScalar(0.001, 0.6);

  let phase: Phase = 'drop';
  let disposed = false;
  let installed = false;
  const offs: (() => void)[] = [];
  const group = new THREE.Group();
  group.name = `crate:${opts.itemId}`;
  ctx.world.root.add(group);

  const mat = (c: string, transparent = false) => new THREE.MeshToonMaterial({ color: c, transparent, opacity: 1 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), mat(CARD));
  body.position.y = size.y / 2;
  group.add(body);
  // Two tape halves along X; tearing pulls the right half off the left one.
  const tapeMat = mat(TAPE, true);
  const tapeY = size.y + 0.012;
  const tapeL = new THREE.Mesh(new THREE.BoxGeometry(size.x / 2, 0.016, Math.min(0.09, size.z * 0.28)), tapeMat);
  const tapeR = tapeL.clone();
  tapeR.material = tapeMat.clone(); // a clone shares material — the left half must not fade with the right
  tapeL.position.set(-size.x / 4, tapeY, 0);
  tapeR.position.set(size.x / 4, tapeY, 0);
  group.add(tapeL, tapeR);

  // Progress pill floating over the crate (DOM, pointer-events off).
  const label = document.createElement('div');
  label.className = 'crate-progress';
  label.hidden = true;
  ctx.ui.layer('crate').append(label);

  let vy = 0;
  let bounces = 0;
  let squash = 0;
  let tape = 0;
  let tearing = false;
  let lastPt: { x: number; y: number } | null = null;
  let halves: THREE.Mesh[] = [];
  let riser: THREE.Mesh | null = null;
  let riseT = 0;
  let fadeT = -1;
  /** Slots can sit outside the overview frame (e.g. home's wok_burner at x=2): dolly in so the drop is on screen. */
  let camPushed = true;
  bus.emit('camera:push', { at: [restPos.x, restPos.y + size.y, restPos.z], zoom: 1.5, ms: 650 });
  const releaseCam = () => {
    if (!camPushed) return;
    camPushed = false;
    bus.emit('camera:release', {});
  };

  const at = (): [number, number, number] => [restPos.x, restPos.y + size.y, restPos.z];

  function setPhase(p: Phase) {
    phase = p;
    if (p === 'tape') {
      label.hidden = false;
      if (!ctx.flags.auto) bus.emit('hint:show', { text: '按住快递箱，沿胶带线拖开', gesture: 'drag' });
      else ctx.after(500, () => (tearing = true)); // ?auto tears by itself
    }
    if (p === 'burst') {
      label.hidden = true;
      bus.emit('hint:clear', {});
      bus.emit('sfx:play', { id: 'crate_open', at: at() });
      bus.emit('fx:emit', { preset: 'confetti', at: at() });
      bus.emit('fx:pop', { text: '开箱!', at: at(), style: 'perfect' });
      burstVisuals();
      ctx.after(650, startRise);
    }
  }

  function burstVisuals() {
    body.visible = false;
    tapeL.visible = tapeR.visible = false;
    const halfGeo = new THREE.BoxGeometry(size.x / 2 - 0.01, size.y, size.z);
    halves = [-1, 1].map((s) => {
      const m = new THREE.Mesh(halfGeo, mat(CARD, true));
      m.position.set((s * size.x) / 4, size.y / 2, 0);
      m.userData.v = new THREE.Vector3(s * 1.6, 2.1, (Math.random() - 0.5) * 0.8);
      m.userData.w = new THREE.Vector3((Math.random() - 0.5) * 9, s * 5, (Math.random() - 0.5) * 9);
      group.add(m);
      return m;
    });
  }

  function startRise() {
    if (disposed || phase === 'done') return;
    phase = 'rise';
    riser = new THREE.Mesh(new THREE.BoxGeometry(slotSize.x, slotSize.y, slotSize.z), mat(BRASS, true));
    riser.position.set(restPos.x, restPos.y + size.y / 2, restPos.z);
    group.add(riser);
  }

  function finish() {
    if (phase === 'done') return;
    phase = 'done';
    releaseCam();
    if (!installed) {
      installed = true;
      // Core swaps in its own slot greybox/model on this event; our riser fades out right after.
      opts.onInstalled();
      fadeT = 0;
    }
  }

  offs.push(
    ctx.onFrame((dt) => {
      if (disposed) return;
      if (phase === 'drop') {
        vy -= 14 * dt;
        group.position.y = Math.max(restPos.y, group.position.y + vy * dt);
        if (group.position.y <= restPos.y + 0.0005) {
          group.position.y = restPos.y;
          if (Math.abs(vy) > 1.1 && bounces < 3) {
            vy = -vy * 0.36;
            bounces++;
            squash = 0.09;
            if (bounces === 1) {
              bus.emit('sfx:play', { id: 'crate_drop', at: at() });
              bus.emit('fx:emit', { preset: 'dust', at: at() });
              bus.emit('camera:shake', { strength: 0.18, ms: 200 });
            }
          } else {
            vy = 0;
            setPhase('tape');
          }
        }
        if (squash > 0) {
          squash = Math.max(0, squash - dt * 0.5);
          body.scale.set(1 + squash * 0.6, 1 - squash, 1 + squash * 0.6);
        }
      } else if (phase === 'tape') {
        if (ctx.flags.auto && tearing) tape = Math.min(1, tape + dt * 1.4);
        tapeR.position.x = size.x / 4 + tape * size.x * 0.55;
        (tapeR.material as THREE.MeshToonMaterial).opacity = 1 - tape * 0.7;
        if (label) {
          label.textContent = `撕开 ${Math.round(tape * 100)}%`;
          const s = ctx.world.toScreen(new THREE.Vector3(restPos.x, restPos.y + size.y + 0.25, restPos.z));
          label.style.transform = `translate(-50%,0) translate(${Math.round(s.x)}px, ${Math.round(s.y - 18)}px)`;
        }
        // Round the label to whole percent but don't require an exact 1.0 — float accumulation
        // can end a full-length tear at 0.995 and a torn crate that never opens is a dead end.
        if (tape >= 0.97) {
          tape = 1;
          setPhase('burst');
        }
      } else if (phase === 'burst') {
        stepDebris(dt);
      } else if (phase === 'rise') {
        stepDebris(dt);
        if (riser) {
          riseT = Math.min(1, riseT + dt / 0.45);
          const e = easeOutBack(riseT);
          riser.position.y = THREE.MathUtils.lerp(restPos.y + size.y / 2, restPos.y + slotSize.y / 2, e);
          if (riseT >= 1) finish();
        }
      } else if (phase === 'done' && fadeT >= 0) {
        stepDebris(dt);
        fadeT = Math.min(1, fadeT + dt / 0.3);
        const op = 1 - fadeT;
        if (riser) (riser.material as THREE.MeshToonMaterial).opacity = op;
        if (fadeT >= 1) {
          if (riser) riser.visible = false;
          fadeT = -1;
        }
      }
    }),
  );

  function stepDebris(dt: number) {
    for (const m of halves) {
      if (!m.visible) continue;
      m.userData.v.y -= 9 * dt;
      m.position.addScaledVector(m.userData.v as THREE.Vector3, dt);
      m.rotation.x += m.userData.w.x * dt;
      m.rotation.y += m.userData.w.y * dt;
      m.rotation.z += m.userData.w.z * dt;
      (m.material as THREE.MeshToonMaterial).opacity -= dt * 1.6;
      if ((m.material as THREE.MeshToonMaterial).opacity <= 0) m.visible = false;
    }
  }

  // Tape tearing: track the pointer along the tape's on-screen direction while held nearby.
  offs.push(
    ctx.input.onPointer((kind, e) => {
      if (disposed || phase !== 'tape' || ctx.flags.auto) return;
      if (kind === 'down') {
        lastPt = { x: e.clientX, y: e.clientY };
        return;
      }
      if (kind !== 'move' || !lastPt || tape >= 1) return;
      const a = ctx.world.toScreen(new THREE.Vector3(restPos.x - size.x / 2, restPos.y + size.y, restPos.z));
      const b = ctx.world.toScreen(new THREE.Vector3(restPos.x + size.x / 2, restPos.y + size.y, restPos.z));
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.max(40, Math.hypot(dx, dy));
      const mx = e.clientX - lastPt.x;
      const my = e.clientY - lastPt.y;
      const along = (mx * dx + my * dy) / len;
      // Ignore drags that are far from the tape line entirely.
      const distToLine = Math.abs(mx * (dy / len) - my * (dx / len));
      if (distToLine < 110) tape = Math.min(1, tape + Math.max(0, along) / len);
      lastPt = { x: e.clientX, y: e.clientY };
      if (tape >= 1) setPhase('burst');
    }),
  );

  // A kitchen switch mid-crate must never eat the purchase: grant the install immediately.
  offs.push(
    bus.on('kitchen:enter', () => {
      if (!disposed && phase !== 'done') finish();
    }),
  );

  return () => {
    if (disposed) return;
    disposed = true;
    if (phase !== 'done') finish(); // same guarantee when meta disposes us
    offs.forEach((f) => f());
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      }
    });
    group.removeFromParent();
    label.remove();
    bus.emit('hint:clear', {});
  };
}

const easeOutBack = (t: number) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
