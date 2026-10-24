import type { Dish } from '@contracts/schemas';
import type { Rating } from '@contracts/types';

/** Pure functions — no ctx, no DOM. Unit-tested in score.test.ts. Owner: D. */

export const RATING_LABEL: Record<Rating, string> = { oops: '哎呀', good: '良好', great: '优秀', perfect: '完美' };

export function rate(dish: Dish, quality: number): Rating {
  const q = Math.max(0, Math.min(1, quality));
  if (q >= dish.rating.perfect) return 'perfect';
  if (q >= dish.rating.great) return 'great';
  if (q >= dish.rating.good) return 'good';
  return 'oops';
}

/**
 * Tag-based star checks (card D5): a star is earned when its id appears as a tag on some
 * step:complete in the run (e.g. 'no_shell' from a clean egg crack). Runs whose only tags
 * are 'stub' (placeholder moves emit it) keep the tier fallback, so the demo never shows
 * an empty result just because a move is still a stub.
 */
export function starsEarned(dish: Dish, rating: Rating, runTags: string[] = []): string[] {
  if (dish.stars.length === 0) return [];
  const meaningful = runTags.filter((t) => t !== 'stub');
  if (meaningful.length === 0) return tierFallback(dish, rating);
  return dish.stars.filter((s) => meaningful.includes(s.id)).map((s) => s.id);
}

/** Old behaviour, kept as the fallback: perfect = every star, great = the first star. */
function tierFallback(dish: Dish, rating: Rating): string[] {
  if (rating === 'perfect') return dish.stars.map((s) => s.id);
  if (rating === 'great') return dish.stars.slice(0, 1).map((s) => s.id);
  return [];
}

export interface CoinLine {
  reason: string;
  amount: number;
}

/** Coin sources from the design doc: rating, first-time stars, first dish in a new kitchen (eggs are paid on discovery). */
export function payout(dish: Dish, rating: Rating, o: { newStars: number; firstDishInNewKitchen: boolean }): CoinLine[] {
  const lines: CoinLine[] = [{ reason: `${RATING_LABEL[rating]}评级`, amount: dish.coins[rating] }];
  if (o.newStars > 0) lines.push({ reason: `首次星级 ×${o.newStars}`, amount: 10 * o.newStars });
  if (o.firstDishInNewKitchen) lines.push({ reason: '新厨房首道菜', amount: 50 });
  return lines;
}
