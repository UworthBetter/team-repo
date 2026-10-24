import { defineModule, devStep, stubMove } from '@core/api';
import { domeScoop } from './dome-scoop';
import { flare } from './flare';
import { sprinkle } from './sprinkle';
import { wokToss } from './wok-toss';

/**
 * Owner: C. Wok Station moves. One file per move; replace stubs as you go.
 * See docs/briefs/C-wok-moves.md
 */

export default defineModule({
  id: 'moves-wok',
  owner: 'C',
  setup(ctx) {
    [wokToss, flare, domeScoop, sprinkle].forEach((m) => ctx.moves.register(m));

    ctx.dev.scene('wok_toss', { kitchen: 'wok', station: 'wok' }, (c) => {
      const inst = wokToss.start(c, devStep('wok_toss', 'wok', { beats: 8, bpm: 110, ingredient: 'rice' }));
      return () => inst.dispose();
    });
    ctx.dev.scene('dome_scoop', { kitchen: 'wok', station: 'pass' }, (c) => {
      const inst = domeScoop.start(c, devStep('dome_scoop', 'pass'));
      return () => inst.dispose();
    });
    ctx.dev.scene('flare', { kitchen: 'wok', station: 'wok' }, (c) => {
      const inst = flare.start(c, devStep('flare', 'wok'));
      return () => inst.dispose();
    });
    ctx.dev.scene('sprinkle', { kitchen: 'wok', station: 'wok' }, (c) => {
      const inst = sprinkle.start(c, devStep('sprinkle', 'wok', { item: 'huajiao', amount: 8 }));
      return () => inst.dispose();
    });
  },
  stub(ctx) {
    [stubMove('wok_toss', '颠勺'), stubMove('flare', '爆火'), stubMove('dome_scoop', '扣圆顶')].forEach((m) => ctx.moves.register(m));
  },
});
