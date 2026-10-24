import { defineModule } from '@core/api';
import { createRunner } from './runner';

/** Owner: B. See docs/briefs/B-home-moves.md */
export default defineModule({
  id: 'dishes',
  owner: 'B',
  setup(ctx) {
    const runner = createRunner(ctx);
    if (ctx.dev.gui) {
      const f = ctx.dev.gui.addFolder('Dishes (B)');
      for (const id of ctx.content.dishes.keys()) f.add({ go: () => runner.start(id) }, 'go').name(`start ${id}`);
      f.close();
    }
  },
});
