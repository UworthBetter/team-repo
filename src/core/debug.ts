import GUI from 'lil-gui';
import { EVENT_EMITTERS, type EventName, type Events } from '@contracts/events';
import type { Bus } from './bus';
import type { Content } from './content';
import { FLAG_HELP, type Flags } from './flags';

/** lil-gui debug panel. Modules add their own folder through ctx.dev.gui. */
export function createDebug(flags: Flags, bus: Bus, content: Content): { gui: GUI | null; addScenes(ids: string[]): void } {
  if (!flags.debug) return { gui: null, addScenes() {} };
  const gui = new GUI({ title: '滋啦 debug  (?debug=0 hides)' });
  gui.domElement.style.zIndex = '50';

  const k = gui.addFolder('Kitchens (A)');
  for (const id of content.kitchens.keys()) k.add({ go: () => bus.emit('kitchen:enter', { kitchenId: id }) }, 'go').name(`enter ${id}`);

  const emit = gui.addFolder('Emit any event');
  const state = { event: 'fx:pop' as EventName, payload: '{"text":"咔!","style":"good"}', emit: () => {} };
  state.emit = () => {
    try {
      bus.emit(state.event, JSON.parse(state.payload || '{}') as Events[EventName]);
    } catch (err) {
      console.error('[debug] payload is not valid JSON', err);
    }
  };
  emit.add(state, 'event', Object.keys(EVENT_EMITTERS));
  emit.add(state, 'payload');
  emit.add(state, 'emit');
  emit.close();

  const log = gui.addFolder('Event log');
  log.add({ print: () => console.table(bus.log.slice(-25).map((e) => ({ t: e.t, event: e.name, payload: JSON.stringify(e.payload) }))) }, 'print').name('print last 25 events');
  log.close();

  const f = gui.addFolder('Reload with flags');
  const reload = (q: string) => () => (location.search = q);
  f.add({ r: reload('?auto&fast=4&fresh&coins=600') }, 'r').name('auto-play whole loop');
  f.add({ r: reload('?kitchen=wok&unlock=all&fresh') }, 'r').name('start in wok');
  f.add({ r: reload('?stub=all') }, 'r').name('all modules as stubs');
  f.add({ r: reload('?fresh') }, 'r').name('fresh save');
  f.add({ help: () => console.table(Object.fromEntries(FLAG_HELP)) }, 'help').name('print all flags');
  f.close();

  return {
    gui,
    addScenes(ids) {
      const s = gui.addFolder('Dev scenes');
      for (const id of ids) s.add({ go: reload(`?scene=${id}`) }, 'go').name(id);
      if (!ids.length) s.add({ none: () => {} }, 'none').name('(none registered)');
      s.close();
    },
  };
}
