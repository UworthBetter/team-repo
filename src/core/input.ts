import * as THREE from 'three';
import type { Input, PropHandle } from './api';

export interface InputInternal extends Input {
  readonly ndc: THREE.Vector2;
  readonly grabEnabled: boolean;
  setHeld(p: PropHandle | null): void;
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable);

export function createInput(canvas: HTMLCanvasElement, camera: THREE.Camera, counterTop: number): InputInternal {
  const pointer = { x: 0, y: 0, down: false };
  const ndc = new THREE.Vector2();
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -counterTop);
  const keyHandlers = new Map<string, Set<(e: KeyboardEvent) => void>>();
  const pointerHandlers = new Set<(kind: 'down' | 'move' | 'up', e: PointerEvent) => void>();
  const wheelHandlers = new Set<(d: number, e: WheelEvent) => void>();
  let held: PropHandle | null = null;
  let grabEnabled = true;

  const update = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  };
  const fire = (kind: 'down' | 'move' | 'up', e: PointerEvent) => {
    for (const fn of [...pointerHandlers]) {
      try {
        fn(kind, e);
      } catch (err) {
        console.error('[input] pointer handler threw', err);
      }
    }
  };

  canvas.addEventListener('pointerdown', (e) => {
    update(e);
    pointer.down = true;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events in tests */
    }
    fire('down', e);
  });
  canvas.addEventListener('pointermove', (e) => {
    update(e);
    fire('move', e);
  });
  const up = (e: PointerEvent) => {
    update(e);
    pointer.down = false;
    fire('up', e);
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => wheelHandlers.forEach((fn) => fn(e.deltaY, e)), { passive: true });

  window.addEventListener('keydown', (e) => {
    if (e.repeat || isTyping(e.target)) return;
    const set = keyHandlers.get(e.code);
    if (!set?.size) return;
    e.preventDefault();
    for (const fn of [...set]) {
      try {
        fn(e);
      } catch (err) {
        console.error(`[input] key handler for ${e.code} threw`, err);
      }
    }
  });

  return {
    pointer,
    ndc,
    get held() {
      return held;
    },
    get grabEnabled() {
      return grabEnabled;
    },
    setHeld(p) {
      held = p;
    },
    counterPoint() {
      ray.setFromCamera(ndc, camera);
      const p = new THREE.Vector3();
      return ray.ray.intersectPlane(plane, p) ? p : null;
    },
    onKey(code, fn) {
      let set = keyHandlers.get(code);
      if (!set) keyHandlers.set(code, (set = new Set()));
      set.add(fn);
      return () => set!.delete(fn);
    },
    onPointer(fn) {
      pointerHandlers.add(fn);
      return () => pointerHandlers.delete(fn);
    },
    onWheel(fn) {
      wheelHandlers.add(fn);
      return () => wheelHandlers.delete(fn);
    },
    setGrabEnabled(on) {
      grabEnabled = on;
    },
  };
}
