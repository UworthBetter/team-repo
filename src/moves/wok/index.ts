import { defineModule, devStep, stubMove } from '@core/api';
import { wokToss } from './wok-toss';

/**
 * Owner: C. Wok Station moves. One file per move; replace stubs as you go.
 * See docs/briefs/C-wok-moves.md
 */
const flare = stubMove('flare', '爆火');
const domeScoop = stubMove('dome_scoop', '扣圆顶');

export default defineModule({
  id: 'moves-wok',
  owner: 'C',
  setup(ctx) {
    [wokToss, flare, domeScoop].forEach((m) => ctx.moves.register(m));

    ctx.dev.scene('wok_toss', { kitchen: 'wok', station: 'wok' }, (c) => {
      const inst = wokToss.start(c, devStep('wok_toss', 'wok', { beats: 8, ingredient: 'rice' }));
      return () => inst.dispose();
    });
    ctx.dev.scene('dome_scoop', { kitchen: 'wok', station: 'pass' }, (c) => {
      const inst = domeScoop.start(c, devStep('dome_scoop', 'pass'));
      return () => inst.dispose();
    });
  },
  stub(ctx) {
    [stubMove('wok_toss', '颠锅'), flare, domeScoop].forEach((m) => ctx.moves.register(m));
  },
});
