import * as THREE from 'three';
import type { Input, PropHandle } from './api';

export interface InputInternal extends Input {
  readonly ndc: THREE.Vector2;
  readonly grabEnabled: boolean;
  /** Key codes currently held down (e.g. 'KeyW'). Cleared on window blur. */
  readonly keys: ReadonlySet<string>;
  /** Pointer-locked mouse look stays separate from gameplay pointer handlers. */
  readonly lookActive: boolean;
  setLookEnabled(on: boolean): void;
  onLook(fn: (dx: number, dy: number) => void): () => void;
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
  const keys = new Set<string>();
  const lookHandlers = new Set<(dx: number, dy: number) => void>();
  let lookEnabled = false;
  let gamePointer: number | null = null;
  let lastPointer: PointerEvent | null = null;
  let held: PropHandle | null = null;
  let grabEnabled = true;
  const looking = () => lookEnabled && document.pointerLockElement === canvas;
  const center = () => {
    const r = canvas.getBoundingClientRect();
    pointer.x = r.left + r.width / 2;
    pointer.y = r.top + r.height / 2;
    ndc.set(0, 0);
  };
  const requestLook = () => {
    // Browsers require a click/key gesture. Rejection leaves the canvas clickable to retry.
    try {
      const request = canvas.requestPointerLock();
      void request?.catch(() => {});
    } catch {
      /* pointer lock is unavailable in some embedded previews */
    }
  };

  const update = (e: PointerEvent) => {
    if (looking()) {
      center();
      return;
    }
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
    if (gamePointer !== null || e.button !== 0) return;
    if (lookEnabled && !looking()) {
      requestLook();
      e.preventDefault();
      return;
    }
    gamePointer = e.pointerId;
    lastPointer = e;
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
    if (lookEnabled) {
      if (!looking()) return;
      lookHandlers.forEach((fn) => fn(e.movementX, e.movementY));
    }
    if (gamePointer !== null && e.pointerId !== gamePointer) return;
    lastPointer = e;
    update(e);
    fire('move', e);
  });
  const up = (e: PointerEvent) => {
    if (gamePointer !== e.pointerId) return;
    gamePointer = null;
    update(e);
    pointer.down = false;
    fire('up', e);
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('lostpointercapture', up);
  canvas.addEventListener('contextmenu', (e) => {
    if (lookEnabled) e.preventDefault();
  });
  canvas.addEventListener('wheel', (e) => wheelHandlers.forEach((fn) => fn(e.deltaY, e)), { passive: true });

  window.addEventListener('keydown', (e) => {
    if (e.repeat || isTyping(e.target)) return;
    if (e.code === 'Escape' && looking()) document.exitPointerLock();
    keys.add(e.code);
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
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  // Focus loss (alt-tab, opening devtools) must not leave phantom held keys.
  const cancel = () => {
    keys.clear();
    if (gamePointer !== null && lastPointer) up(lastPointer);
  };
  window.addEventListener('blur', cancel);
  document.addEventListener('pointerlockchange', () => {
    cancel();
    if (looking()) center();
  });
  window.addEventListener('focusin', (e) => {
    if (isTyping(e.target)) keys.clear();
  });

  return {
    pointer,
    ndc,
    keys,
    get lookActive() {
      return looking();
    },
    setLookEnabled(on) {
      lookEnabled = on;
      cancel();
      if (on) {
        center();
        if (navigator.userActivation?.isActive) requestLook();
      } else if (document.pointerLockElement === canvas) document.exitPointerLock();
    },
    onLook(fn) {
      lookHandlers.add(fn);
      return () => lookHandlers.delete(fn);
    },
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
