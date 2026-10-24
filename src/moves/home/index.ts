import { defineModule, devStep, stubMove } from '@core/api';
import { eggCrack } from './egg-crack';

/**
 * Owner: B. Home Kitchen moves. Replace each stubMove with a real move file, one file per move.
 * See docs/briefs/B-home-moves.md
 */
const stubs = [stubMove('whisk', '搅拌'), stubMove('pancake_flip', '翻面'), stubMove('stack', '叠放'), stubMove('syrup_drizzle', '淋酱')];

export default defineModule({
  id: 'moves-home',
  owner: 'B',
  setup(ctx) {
    ctx.moves.register(eggCrack);
    stubs.forEach((m) => ctx.moves.register(m));

    ctx.dev.scene('egg_crack', { kitchen: 'home', station: 'bowl' }, (c) => {
      const inst = eggCrack.start(c, devStep('egg_crack', 'bowl', { eggs: 2 }));
      return () => inst.dispose();
    });
    ctx.dev.scene('pancake_flip', { kitchen: 'home', station: 'stove' }, (c) => {
      const inst = c.moves.get('pancake_flip').start(c, devStep('pancake_flip', 'stove', { count: 3 }));
      return () => inst.dispose();
    });
  },
  stub(ctx) {
    [stubMove('egg_crack', '打蛋'), ...stubs].forEach((m) => ctx.moves.register(m));
  },
});
