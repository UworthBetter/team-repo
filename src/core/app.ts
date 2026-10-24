import * as THREE from 'three';
import type { Ctx } from './api';
import { loadAssets } from './assets';
import { Bus } from './bus';
import { createCameraRig } from './camera';
import type { Content } from './content';
import { createDebug, createFpsMeter } from './debug';
import { createDev } from './dev';
import type { Flags } from './flags';
import { createGrab } from './grab';
import { createInput } from './input';
import { createMoveRegistry } from './moves';
import { createPhysics } from './physics';
import { createUi } from './ui';
import { COUNTER_TOP, createWorld } from './world';

declare global {
  interface Window {
    __sizzle?: { ctx: Ctx; bus: Bus; log: Bus['log']; flags: Flags };
  }
}

export async function createCore(flags: Flags, content: Content, canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 60);
  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const bus = new Bus();
  if (flags.logEvents) bus.onAny((e) => console.debug(`[bus] ${e.name}`, e.payload));

  const assets = await loadAssets();
  const world = createWorld(scene, camera, renderer, bus, assets, content);
  const input = createInput(canvas, camera, COUNTER_TOP);
  const hand = document.createElement('div');
  hand.className = 'hand';
  document.body.append(hand);
  const debug = createDebug(flags, bus, content);
  const physics = createPhysics({ world, bus });
  const grab = createGrab({ input, world, bus, camera, hand, gui: debug.gui, physics });
  const rig = createCameraRig(camera, bus, world, input);
  const moves = createMoveRegistry();
  const ui = createUi(uiRoot);
  const dev = createDev();
  const fpsMeter = flags.fps ? createFpsMeter(renderer) : null;

  const frameFns = new Set<(dt: number) => void>();
  const frameErrors = new Map<(dt: number) => void, number>();

  const ctx: Ctx = {
    bus,
    flags,
    content,
    three: { scene, camera, renderer },
    world,
    input,
    moves,
    ui,
    dev: { scene: dev.register, list: dev.list, gui: debug.gui },
    onFrame(fn) {
      frameFns.add(fn);
      return () => frameFns.delete(fn);
    },
    after(ms, fn) {
      const id = window.setTimeout(() => {
        try {
          fn();
        } catch (err) {
          console.error('[after] callback threw', err);
        }
      }, ms / flags.fast);
      return () => window.clearTimeout(id);
    },
  };

  // 0.4 s whoosh: a full-screen overlay fades in, the kitchen is swapped at the opaque midpoint,
  // then it fades back out, hiding the rebuild (A8). The first boot fades in from black too.
  const whoosh = document.createElement('div');
  whoosh.className = 'kitchen-whoosh';
  const halfMs = 200 / flags.fast;
  whoosh.style.cssText =
    `position:fixed;inset:0;z-index:40;background:#17110f;opacity:0;pointer-events:none;transition:opacity ${halfMs}ms ease;`;
  document.body.append(whoosh);

  bus.on('kitchen:enter', ({ kitchenId }) => {
    const k = content.kitchens.get(kitchenId);
    if (!k) {
      ui.toast(`厨房 "${kitchenId}" 还没做好 (no content/kitchens/${kitchenId}.json)`, 'error');
      return;
    }
    whoosh.style.opacity = '1';
    ctx.after(200, () => {
      world.build(k);
      bus.emit('kitchen:ready', { kitchenId });
      whoosh.style.opacity = '0';
    });
  });
  bus.on('dish:start', () => world.resetAll());

  window.__sizzle = { ctx, bus, log: bus.log, flags };

  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000) * flags.fast;
    last = now;
    rig.update(dt);
    grab.update(dt);
    physics.update(dt);
    for (const fn of frameFns) {
      try {
        fn(dt);
      } catch (err) {
        const n = (frameErrors.get(fn) ?? 0) + 1;
        frameErrors.set(fn, n);
        if (n === 1) console.error('[frame] an onFrame callback threw', err);
        if (n >= 30) {
          frameFns.delete(fn);
          ui.toast('一个 onFrame 回调反复出错，已停用 — see console', 'error');
        }
      }
    }
    renderer.render(scene, camera);
    fpsMeter?.update();
    requestAnimationFrame(frame);
  };

  return {
    ctx,
    /** Call after every module's setup ran. */
    finishSetup() {
      debug.addScenes(dev.list());
    },
    runScene(id: string) {
      return dev.start(id, ctx);
    },
    start() {
      requestAnimationFrame(frame);
    },
  };
}
