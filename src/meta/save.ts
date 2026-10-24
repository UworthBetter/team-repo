import { SaveSchema, type Save } from '@contracts/schemas';
import type { Content, Flags } from '@core/api';

export const SAVE_KEY = 'sizzle.save.v1';

export const emptySave = (): Save => ({
  v: 1,
  coins: 0,
  owned: [],
  installed: [],
  unlocked: ['home'],
  stars: {},
  stickers: [],
  firstDishDone: {},
});

/** localStorage can be missing or throw (private mode); the game must still run. */
export function loadSave(flags: Flags, content: Content): Save {
  let s = emptySave();
  if (!flags.fresh) {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const r = SaveSchema.safeParse(JSON.parse(raw));
        if (r.success) s = r.data;
        else console.warn('[save] stored save did not match SaveSchema — starting fresh', r.error.issues);
      }
    } catch (err) {
      console.warn('[save] could not read localStorage', err);
    }
  }
  if (flags.coins !== null) s.coins = Math.round(flags.coins);
  if (flags.unlockAll) s.unlocked = content.route.nodes.filter((n) => !n.placeholder).map((n) => n.kitchenId);
  return s;
}

export function writeSave(s: Save) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    /* ignore: private mode / quota */
  }
}
