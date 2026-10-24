import { describe, expect, it } from 'vitest';
import { MOVE_IDS } from '@contracts/ids';
import { ContentError, loadContent } from '@core/content';

/** Owner: A. Fails CI when any content/ JSON breaks its schema or points at something missing. */
describe('content/', () => {
  it('every file matches its schema and every reference resolves', () => {
    try {
      loadContent();
    } catch (err) {
      if (err instanceof ContentError) throw new Error(err.problems.join('\n'));
      throw err;
    }
  });

  it('the demo path exists: a key item in the first kitchen unlocks a playable kitchen', () => {
    const c = loadContent();
    const first = c.route.nodes[0]!.kitchenId;
    const key = [...c.equipment.values()].find((e) => e.kitchen === first && e.key);
    expect(key, `no key equipment in ${first}`).toBeTruthy();
    expect(c.kitchens.has(key!.unlocks ?? '')).toBe(true);
  });

  it('every move id used by a dish is a known MoveId', () => {
    const c = loadContent();
    for (const d of c.dishes.values()) for (const s of d.steps) expect(MOVE_IDS).toContain(s.move);
  });
});
