import type { Ctx } from './api';
import { showFatal } from './ui';

interface Scene {
  opts: { kitchen: string; station?: string };
  run: (ctx: Ctx) => void | (() => void);
}

/** Isolated dev scenes: ?scene=<id> builds the scene's kitchen and runs ONLY that scene (no dish runner). */
export function createDev() {
  const scenes = new Map<string, Scene>();
  return {
    register(id: string, opts: Scene['opts'], run: Scene['run']) {
      if (scenes.has(id)) console.warn(`[dev] scene "${id}" registered twice — last one wins`);
      scenes.set(id, { opts, run });
    },
    list: () => [...scenes.keys()].sort(),
    start(id: string, ctx: Ctx): boolean {
      const s = scenes.get(id);
      if (!s) {
        const names = [...scenes.keys()].sort().map((k) => `  ?scene=${k}`);
        showFatal(`Unknown dev scene "${id}"`, `Registered scenes:\n${names.join('\n') || '  (none yet — call ctx.dev.scene in your module)'}`);
        return false;
      }
      let cleanup: void | (() => void);
      const run = () => {
        try {
          cleanup = s.run(ctx);
        } catch (err) {
          console.error(`[dev] scene "${id}" threw`, err);
          ctx.ui.toast(`dev scene ${id} threw — see console`, 'error');
        }
      };
      ctx.bus.once('kitchen:ready', () => {
        if (s.opts.station) ctx.bus.emit('station:focus', { stationId: s.opts.station });
        run();
        ctx.ui.toast(`dev scene · ${id} · Backspace = restart`);
      });
      ctx.input.onKey('Backspace', () => {
        if (typeof cleanup === 'function') cleanup();
        for (const p of ctx.content.kitchens.get(s.opts.kitchen)?.props ?? []) ctx.world.resetProp(p.id);
        run();
      });
      ctx.bus.emit('kitchen:enter', { kitchenId: s.opts.kitchen });
      return true;
    },
  };
}
