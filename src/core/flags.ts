/**
 * URL debug flags, e.g. http://localhost:5173/?kitchen=wok&coins=999&debug
 * Keep FLAG_HELP in sync — it is printed in the debug panel and README.
 */
export interface Flags {
  kitchen: string | null;
  dish: string | null;
  scene: string | null;
  coins: number | null;
  unlockAll: boolean;
  fresh: boolean;
  stub: Set<string>;
  only: Set<string> | null;
  auto: boolean;
  fast: number;
  debug: boolean;
  logEvents: boolean;
  mute: boolean;
  skipResult: boolean;
  fps: boolean;
}

export const FLAG_HELP: [string, string][] = [
  ['kitchen=wok', 'start in this kitchen'],
  ['dish=fried_rice', 'start this dish instead of the kitchen default'],
  ['scene=egg_crack', 'run one module dev scene in isolation (see debug panel for the list)'],
  ['coins=999', 'override the coin balance'],
  ['unlock=all', 'unlock every kitchen on the route'],
  ['fresh', 'ignore the saved game (start from zero)'],
  ['stub=meta,ui', 'use the stub version of these modules (or stub=all)'],
  ['only=dishes,moves-home', 'load ONLY these feature modules'],
  ['auto', 'auto-play: stub moves complete themselves, meta buys key gear (used by npm run smoke)'],
  ['fast=4', 'speed up timers and animations'],
  ['debug / debug=0', 'show or hide the lil-gui panel (on by default in npm run dev)'],
  ['log', 'print every bus event to the console'],
  ['mute', 'no sound'],
  ['skipResult', 'close the result screen immediately'],
  ['fps', 'show an FPS / draw-call / triangle counter in the corner (works with ?debug=0)'],
];

export function readFlags(search: string): Flags {
  const q = new URLSearchParams(search);
  const list = (k: string) =>
    new Set(
      (q.get(k) ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
  const bool = (k: string, dflt = false) => (q.has(k) ? !['0', 'false', 'no'].includes(q.get(k) ?? '') : dflt);
  const num = (k: string) => {
    const v = q.get(k);
    if (v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    kitchen: q.get('kitchen'),
    dish: q.get('dish'),
    scene: q.get('scene'),
    coins: num('coins'),
    unlockAll: q.get('unlock') === 'all',
    fresh: bool('fresh'),
    stub: list('stub'),
    only: q.has('only') ? list('only') : null,
    auto: bool('auto'),
    fast: Math.max(0.25, num('fast') ?? 1),
    debug: bool('debug', Boolean(import.meta.env?.DEV)),
    logEvents: bool('log'),
    mute: bool('mute'),
    skipResult: bool('skipResult'),
    fps: bool('fps'),
  };
}
