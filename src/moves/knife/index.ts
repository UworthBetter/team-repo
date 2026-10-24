import { defineModule, devStep, stubMove } from '@core/api';
import { sliceLines } from './slice-lines';

/**
 * Owner: B. 精细动作类 — knife work, shared by the regional kitchens (B7). The demo target is
 * the huaiyang kitchen (文思豆腐, B8); until E6 lands there, the dev scene runs on the home
 * board. Auto-discovered by src/main.ts like any other module.
 */
export default defineModule({
  id: 'moves-knife',
  owner: 'B',
  setup(ctx) {
    ctx.moves.register(sliceLines);
    ctx.dev.scene('slice_lines', { kitchen: 'home', station: 'board' }, (c) => {
      const inst = sliceLines.start(
        c,
        devStep('slice_lines', 'board', {
          strokes: 4,
          axis: 'x',
          target: 'tomato_2',
          sheetColor: '#E2553F',
        }),
      );
      return () => inst.dispose();
    });
  },
  stub(ctx) {
    ctx.moves.register(stubMove('slice_lines', '刀工'));
  },
});
