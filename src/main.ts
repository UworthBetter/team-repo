/**
 * Boot. Feature modules are AUTO-DISCOVERED: any src/<name>/index.ts or src/moves/<kitchen>/index.ts
 * whose default export is defineModule(...) is loaded. Adding a module never edits this file.
 * Owner: A.
 */
import './style.css';
import type { ModuleDef } from '@core/api';
import { createCore } from '@core/app';
import { ContentError, loadContent, type Content } from '@core/content';
import { readFlags } from '@core/flags';
import { showFatal } from '@core/ui';

const found = import.meta.glob<{ default?: ModuleDef }>(['./*/index.ts', './moves/*/index.ts', '!./core/**', '!./contracts/**'], {
  eager: true,
});

async function boot() {
  const flags = readFlags(location.search);

  let content: Content;
  try {
    content = loadContent();
  } catch (err) {
    showFatal('content/ 数据有误 · fix the JSON below', err instanceof ContentError ? err.problems.join('\n') : String(err));
    return;
  }

  const core = await createCore(flags, content, document.getElementById('stage') as HTMLCanvasElement, document.getElementById('ui')!);

  const loaded: string[] = [];
  for (const [path, mod] of Object.entries(found).sort(([a], [b]) => a.localeCompare(b))) {
    const def = mod.default;
    if (!def) {
      console.warn(`[modules] ${path} has no default export — wrap it in defineModule()`);
      continue;
    }
    if (flags.only && !flags.only.has(def.id)) continue;
    const useStub = (flags.stub.has('all') || flags.stub.has(def.id)) && !!def.stub;
    try {
      (useStub ? def.stub! : def.setup)(core.ctx);
      loaded.push(`${def.id}(${def.owner}${useStub ? ' stub' : ''})`);
    } catch (err) {
      console.error(`[modules] ${def.id} setup failed`, err);
      core.ctx.ui.toast(`模块 ${def.id} 启动失败 — see console`, 'error');
    }
  }
  console.info(`[modules] ${loaded.join(' · ')}`);
  core.finishSetup();

  // Bare boot stays on the front menu (ui). A kitchen/dish/auto URL still drops
  // straight into the stove so demo links and smoke do not grow an extra click.
  if (flags.scene) core.runScene(flags.scene);
  else if (flags.auto || flags.kitchen || flags.dish) {
    core.ctx.bus.emit('kitchen:enter', { kitchenId: flags.kitchen ?? content.route.nodes[0]!.kitchenId });
  }
  core.start();
}

void boot();
