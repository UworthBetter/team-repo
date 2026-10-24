import { stubMove } from '@core/api';

/**
 * 颠锅 — currently a stub so the fried-rice flow runs end to end.
 *
 * TODO(C), from sketch board 3 (panel C):
 *  - ctx.input.setGrabEnabled(false) while active; restore in dispose().
 *  - Pull/push = vertical pointer drag while the pointer is down; tilt the 'wok' prop (ctx.world.prop('wok')).
 *  - Beat: params.beats hits; window widened by equipment effect wok_toss.window (carbon_wok).
 *  - Rice: InstancedMesh of ~200 grains on scripted parabolic arcs (NOT rigid bodies), added to ctx.world.root.
 *  - Feedback per hit: sfx:play 'wok_toss', fx:pop '滋啦!'; off-beat → grains spill onto the counter (funny fail).
 *  - quality = hits on beat / beats.
 */
export const wokToss = stubMove('wok_toss', '颠锅');
