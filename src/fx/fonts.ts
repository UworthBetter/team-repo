/**
 * Owner: E. Loads the self-hosted font stylesheet from public/fonts/fonts.css at runtime.
 *
 * Why a <link> here and not @font-face in src/style.css: vite.config.ts sets base:'./' so the
 * built game runs from any subfolder, a USB stick or file:// (A9). CSS url() in bundled
 * stylesheets cannot point at public/ assets under a relative base — but a link href resolved
 * against BASE_URL works in dev, static hosting and file:// alike, fully offline.
 */
const base = import.meta.env.BASE_URL ?? '/';

export function loadFonts(): void {
  if (document.querySelector('link[data-sizzle-fonts]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `${base}fonts/fonts.css`;
  link.dataset.sizzleFonts = '';
  document.head.append(link);
}
