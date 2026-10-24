import { defineModule } from '@core/api';
import { createHud } from './hud';
import { createPanels } from './panels';
import { createResult } from './result';
import { createTitle } from './title';
import './ui.css';

/** Owner: D. All screens are DOM over the canvas. See docs/briefs/D-meta-ui.md */
export default defineModule({
  id: 'ui',
  owner: 'D',
  setup(ctx) {
    const panels = createPanels(ctx);
    createHud(ctx, panels.open);
    createResult(ctx);
    createTitle(ctx);
  },
});
