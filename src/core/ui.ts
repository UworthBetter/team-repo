export function createUi(root: HTMLElement) {
  const layers = new Map<string, HTMLElement>();
  const toasts = document.createElement('div');
  toasts.className = 'toasts';
  root.append(toasts);
  return {
    layer(id: string): HTMLElement {
      let el = layers.get(id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'layer';
        el.dataset.layer = id;
        root.insertBefore(el, toasts);
        layers.set(id, el);
      }
      return el;
    },
    toast(text: string, kind: 'info' | 'error' = 'info') {
      const t = document.createElement('div');
      t.className = `toast toast-${kind}`;
      t.textContent = text;
      toasts.append(t);
      setTimeout(() => t.remove(), kind === 'error' ? 8000 : 2600);
    },
  };
}

/** Big red box for problems that stop the game (bad content, unknown dev scene). */
export function showFatal(title: string, detail: string) {
  const box = document.createElement('div');
  box.className = 'fatal';
  const h = document.createElement('h1');
  h.textContent = title;
  const pre = document.createElement('pre');
  pre.textContent = detail;
  box.append(h, pre);
  document.body.append(box);
  console.error(`[fatal] ${title}\n${detail}`);
}
