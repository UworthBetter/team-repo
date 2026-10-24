import { describe, expect, it } from 'vitest';
import { DishSchema } from '@contracts/schemas';
import { payout, rate, starsEarned } from './score';

const dish = DishSchema.parse({
  id: 'd',
  name: 'd',
  kitchen: 'home',
  steps: [{ id: 's', move: 'egg_crack', station: 'bowl' }],
  rating: { good: 0.4, great: 0.7, perfect: 0.9 },
  coins: { oops: 5, good: 20, great: 50, perfect: 80 },
  stars: [
    { id: 'a', text: 'a' },
    { id: 'b', text: 'b' },
  ],
});

describe('rate', () => {
  it('maps quality to the doc rating tiers', () => {
    expect(rate(dish, 0.1)).toBe('oops');
    expect(rate(dish, 0.4)).toBe('good');
    expect(rate(dish, 0.75)).toBe('great');
    expect(rate(dish, 0.95)).toBe('perfect');
    expect(rate(dish, 7)).toBe('perfect');
  });
});

describe('payout', () => {
  it('a botched dish still pays a few coins', () => {
    expect(payout(dish, 'oops', { newStars: 0, firstDishInNewKitchen: false })).toEqual([{ reason: '哎呀评级', amount: 5 }]);
  });
  it('adds first-star and new-kitchen bonuses', () => {
    const total = payout(dish, 'perfect', { newStars: 2, firstDishInNewKitchen: true }).reduce((a, l) => a + l.amount, 0);
    expect(total).toBe(80 + 20 + 50);
  });
  it('perfect earns every star', () => {
    expect(starsEarned(dish, 'perfect')).toEqual(['a', 'b']);
  });
});
