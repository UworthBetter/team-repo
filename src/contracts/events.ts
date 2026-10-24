/**
 * The event bus contract. FROZEN CONTRACT — owner A.
 * Modules never import each other; they talk ONLY through these events.
 * Rules: add new events at the end of their group; add optional fields only; never rename or remove.
 */
import type { MoveId } from './ids';
import type { FxStyle, Gesture, MetaState, Rating, Vec3 } from './types';

export interface Events {
  /* ---------- core · A ---------- */
  /** Request: build this kitchen. Anyone may emit (route map, debug panel, auto-play). */
  'kitchen:enter': { kitchenId: string };
  /** Core finished building the kitchen; props, snaps and stations exist. */
  'kitchen:ready': { kitchenId: string };
  'station:focus': { stationId: string };
  'grab:start': { objectId: string; kind: string };
  'grab:end': { objectId: string; kind: string; snappedTo?: string };
  'snap:enter': { snapId: string; objectId: string };
  'snap:exit': { snapId: string; objectId: string };
  /** A hidden interaction was triggered (first time per session; D dedupes across sessions). */
  'easter:found': { eggId: string };

  /* ---------- dishes · B ---------- */
  'dish:start': { dishId: string; kitchenId: string };
  /** The runner asks a move to begin. The move instance comes from ctx.moves.get(move). */
  'step:start': { dishId: string; stepId: string; move: MoveId; station: string; params: Record<string, unknown> };
  'dish:complete': { dishId: string; kitchenId: string; quality: number; steps: { stepId: string; quality: number }[] };
  /** Request: restart the current dish from step 1 (R key / retry button). */
  'dish:restart': Record<string, never>;

  /* ---------- moves · B (home) and C (wok) ---------- */
  /** quality 0..1, judged on the RESULT of the move, never on raw physics. */
  'step:complete': { dishId: string; stepId: string; quality: number; tags: string[] };
  /** A funny failure happened. The move still ends with step:complete (low quality). */
  'step:oops': { dishId: string; stepId: string; reason: string };
  'hint:show': { text: string; gesture?: Gesture };
  'hint:clear': Record<string, never>;

  /* ---------- meta + ui · D ---------- */
  'meta:state': MetaState;
  'result:shown': { dishId: string; kitchenId: string; rating: Rating; quality: number; stars: string[]; coins: { reason: string; amount: number }[] };
  'result:closed': { next: 'again' | 'shop' | 'route' };
  'coins:change': { delta: number; total: number; reason: string };
  /** Request from UI; meta validates price and ownership. */
  'shop:purchase': { itemId: string };
  'equipment:purchased': { itemId: string };
  'equipment:installed': { itemId: string; kitchenId: string };
  'kitchen:unlocked': { kitchenId: string };

  /* ---------- fx + audio · E ---------- */
  /** Onomatopoeia / result text pop. `at` in world space; omitted = screen center-top. */
  'fx:pop': { text: string; at?: Vec3; style?: FxStyle };
  /** Plays public/sfx/sfx_<id>.ogg if listed in the manifest, else a placeholder blip. */
  'sfx:play': { id: string; at?: Vec3 };
  /** Camera kick: decaying noise shake. `strength` ~0..1 meters of jitter, `ms` to decay to zero. Core (A) implements. */
  'camera:shake': { strength: number; ms: number };
  /** Temporary dolly toward a world point. `zoom` >= 1 (1 = no move, 2 = halfway in); holds until camera:release. Core (A) implements. */
  'camera:push': { at: Vec3; zoom: number; ms: number };
  /** Release any active camera:push, gliding back to the base rig. Core (A) implements. */
  'camera:release': Record<string, never>;
  /** Spawn a named particle preset at `at` (world space; omitted = screen center). E implements the presets. */
  'fx:emit': { preset: string; at?: Vec3 };
}

export type EventName = keyof Events;

/** Who is expected to EMIT each event. Used by the debug panel and docs; enforced socially, not by code. */
export const EVENT_EMITTERS: Record<EventName, string> = {
  'kitchen:enter': 'any',
  'kitchen:ready': 'A',
  'station:focus': 'A, B',
  'grab:start': 'A',
  'grab:end': 'A',
  'snap:enter': 'A',
  'snap:exit': 'A',
  'easter:found': 'A',
  'dish:start': 'B',
  'step:start': 'B',
  'dish:complete': 'B',
  'dish:restart': 'D',
  'step:complete': 'B, C',
  'step:oops': 'B, C',
  'hint:show': 'B, C',
  'hint:clear': 'B, C',
  'meta:state': 'D',
  'result:shown': 'D',
  'result:closed': 'D',
  'coins:change': 'D',
  'shop:purchase': 'D',
  'equipment:purchased': 'D',
  'equipment:installed': 'D',
  'kitchen:unlocked': 'D',
  'fx:pop': 'any',
  'sfx:play': 'any',
  'camera:shake': 'A, C',
  'camera:push': 'A, B, D',
  'camera:release': 'A, D',
  'fx:emit': 'any',
};
