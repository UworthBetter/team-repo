import { defineModule, devStep, stubMove } from '@core/api';
import { domeScoop } from './dome-scoop';
import { flare } from './flare';
import { attachWokProps } from './props';
import { pullStretch } from './pull-stretch';
import { pushStir } from './push-stir';
import { rhythmChop } from './rhythm-chop';
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
    [wokToss, flare, domeScoop, sprinkle, pushStir, rhythmChop, pullStretch].forEach((m) => ctx.moves.register(m));
    attachWokProps(ctx);

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
    ctx.dev.scene('push_stir', { kitchen: 'wok', station: 'wok' }, (c) => {
      const inst = pushStir.start(c, devStep('push_stir', 'wok', {}));
      return () => inst.dispose();
    });
    ctx.dev.scene('rhythm_chop', { kitchen: 'wok', station: 'wok' }, (c) => {
      const inst = rhythmChop.start(c, devStep('rhythm_chop', 'wok', { bpm: 100 }));
      return () => inst.dispose();
    });
    ctx.dev.scene('pull_stretch', { kitchen: 'wok', station: 'sauce' }, (c) => {
      const inst = pullStretch.start(c, devStep('pull_stretch', 'sauce', {}));
      return () => inst.dispose();
    });

    // Debug panel: switch the wok kitchen's dish (runner reads flags.dish on kitchen:ready).
    if (ctx.dev.gui) {
      const f = ctx.dev.gui.addFolder('Wok (C)');
      const play = (dishId: string) => {
        ctx.flags.dish = dishId;
        ctx.bus.emit('kitchen:enter', { kitchenId: 'wok' });
      };
      f.add({ k: () => play('kung_pao') }, 'k').name('宫保鸡丁 (主打)');
      f.add({ d: () => play('fried_rice') }, 'd').name('蛋炒饭 (热身)');
      f.close();
    }
  },
  stub(ctx) {
    [stubMove('wok_toss', '颠勺'), stubMove('flare', '爆火'), stubMove('dome_scoop', '扣圆顶')].forEach((m) => ctx.moves.register(m));
  },
});
