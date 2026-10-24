/**
 * THE ONLY core file feature modules may import (enforced by npm run check:boundaries).
 * FROZEN CONTRACT — owner A. Additive changes only.
 *
 *   import { defineModule, defineMove, stubMove, type Ctx } from '@core/api';
 */
import type * as THREE from 'three';
import type GUI from 'lil-gui';
import type { Events } from '@contracts/events';
import type { ModuleId, MoveId } from '@contracts/ids';
import type { OwnerLetter, Vec3 } from '@contracts/types';
import type { Bus } from './bus';
import type { Content } from './content';
import type { Flags } from './flags';

export type { Bus, Content, Flags };
export type StepStart = Events['step:start'];

/* ---------------- moves ---------------- */

export interface MoveInstance {
  update?(dt: number): void;
  /** Must be safe to call twice. Remove every listener, mesh and DOM node you created. */
  dispose(): void;
}

export interface MoveDef {
  id: MoveId;
  /** Chinese label shown in hints, e.g. '打蛋'. */
  label: string;
  /** Begin the move. The move itself emits step:complete (and optionally step:oops) when it ends. */
  start(ctx: Ctx, step: StepStart): MoveInstance;
}

export interface MoveRegistry {
  register(def: MoveDef): void;
  /** Never undefined: an unregistered move falls back to a stub, so the runner never blocks. */
  get(id: MoveId): MoveDef;
  has(id: MoveId): boolean;
  list(): MoveId[];
}

/* ---------------- world ---------------- */

export interface PropHandle {
  id: string;
  kind: string;
  object: THREE.Object3D;
  /** Size in meters (from content). */
  size: Vec3;
  home: THREE.Vector3;
  grabbable: boolean;
}

export interface World {
  readonly kitchenId: string | null;
  /** Add your own meshes here; it is emptied whenever the kitchen changes. */
  readonly root: THREE.Group;
  readonly counterTop: number;
  prop(id: string): PropHandle | undefined;
  propsOfKind(kind: string): PropHandle[];
  /** Put a prop back where the kitchen file placed it, visible. */
  resetProp(id: string): void;
  snapPos(snapId: string): THREE.Vector3 | undefined;
  stationAnchor(stationId: string): THREE.Vector3 | undefined;
  /** World position → CSS pixels on screen. */
  toScreen(p: THREE.Vector3 | Vec3): { x: number; y: number; visible: boolean };
}

/* ---------------- input ---------------- */

export interface Input {
  readonly pointer: { x: number; y: number; down: boolean };
  /** The prop in the hand right now, if any. */
  readonly held: PropHandle | null;
  /** Where the pointer ray meets the counter-top plane. */
  counterPoint(): THREE.Vector3 | null;
  /** e.code values: 'Space', 'KeyO', 'Digit1' … Returns an unsubscribe function. */
  onKey(code: string, fn: (e: KeyboardEvent) => void): () => void;
  onPointer(fn: (kind: 'down' | 'move' | 'up', e: PointerEvent) => void): () => void;
  onWheel(fn: (deltaY: number, e: WheelEvent) => void): () => void;
  /** Turn the default grab/drag off while a move drives the pointer itself (e.g. wok toss). */
  setGrabEnabled(on: boolean): void;
}

/* ---------------- context ---------------- */

export interface Ctx {
  bus: Bus;
  flags: Flags;
  content: Content;
  three: { scene: THREE.Scene; camera: THREE.PerspectiveCamera; renderer: THREE.WebGLRenderer };
  world: World;
  input: Input;
  moves: MoveRegistry;
  ui: {
    /** A full-screen DOM layer owned by you (pointer-events off; add class "interactive" to clickable nodes). */
    layer(id: string): HTMLElement;
    toast(text: string, kind?: 'info' | 'error'): void;
  };
  dev: {
    /** Register an isolated test scene, opened with ?scene=<id>. Return a cleanup function. */
    scene(id: string, opts: { kitchen: string; station?: string }, run: (ctx: Ctx) => void | (() => void)): void;
    list(): string[];
    /** lil-gui panel; null when ?debug=0. Add a folder named after your module. */
    gui: GUI | null;
  };
  /** Per-frame callback; dt in seconds (already multiplied by ?fast). */
  onFrame(fn: (dt: number) => void): () => void;
  /** setTimeout that respects ?fast and is cancelled by the returned function. */
  after(ms: number, fn: () => void): () => void;
}

export interface ModuleDef {
  id: ModuleId;
  owner: OwnerLetter;
  setup(ctx: Ctx): void;
  /** Optional minimal version used with ?stub=<id>; keep it working so others can isolate bugs. */
  stub?(ctx: Ctx): void;
}

export const defineModule = (def: ModuleDef): ModuleDef => def;
export const defineMove = (def: MoveDef): MoveDef => def;

/** A fake step for dev scenes. */
export const devStep = (move: MoveId, station: string, params: Record<string, unknown> = {}): StepStart => ({
  dishId: 'dev',
  stepId: `dev_${move}`,
  move,
  station,
  params,
});

export { stubMove } from './stub-move';
