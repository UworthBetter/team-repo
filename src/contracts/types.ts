/**
 * Shared primitive types. FROZEN CONTRACT — owner A.
 * Additive changes only (new optional fields, new union members at the end).
 * Never rename or remove. See docs/CONTRACTS.md.
 */

/** Meters, Y up. The player camera looks toward −Z. Counter top is y = 0.9. */
export type Vec3 = [number, number, number];

export type OwnerLetter = 'A' | 'B' | 'C' | 'D' | 'E';

export type Gesture =
  | 'drag'
  | 'flick-down'
  | 'flick-up'
  | 'pull-apart'
  | 'circle'
  | 'hold-tilt'
  | 'pull-push'
  | 'scroll-rotate'
  | 'click';

/** 'oops' is a botched dish: it still pays a few coins. */
export type Rating = 'oops' | 'good' | 'great' | 'perfect';

export type FxStyle = 'info' | 'good' | 'perfect' | 'oops';

/** Snapshot the meta module (D) publishes whenever progress changes. */
export interface MetaState {
  coins: number;
  owned: string[];
  installed: string[];
  unlocked: string[];
  stars: Record<string, string[]>;
  stickers: string[];
}
