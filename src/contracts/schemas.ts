/**
 * Shapes of everything in content/. FROZEN CONTRACT — owner A.
 * New fields must be .optional() or have a .default(). Every content file is validated at boot and in tests.
 * Convention: every `pos` is the BOTTOM CENTER of the thing, in meters (y = 0.9 sits on the counter).
 */
import { z } from 'zod';
import { MOVE_IDS } from './ids';

const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const vec2 = z.tuple([z.number(), z.number()]);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'use #RRGGBB');
const cam = z.object({ pos: vec3, target: vec3 });

export const PropSchema = z.object({
  id: z.string(),
  /** Gameplay kind that snaps and moves check: 'egg', 'pan', 'plate', 'tomato' … */
  kind: z.string(),
  /** Final asset name, e.g. 'shared_food_egg'. Loaded from public/models/<model>.glb when listed in the manifest. */
  model: z.string().optional(),
  shape: z.enum(['box', 'sphere', 'cylinder']).default('box'),
  size: vec3,
  color,
  pos: vec3,
  grabbable: z.boolean().default(true),
  /** Free-play toy: never scored. */
  toy: z.boolean().default(false),
});

/** Region pacing — A reads this on kitchen:ready (see src/core/camera.ts, world.ts). */
export const PacingSchema = z.object({
  /** Toss / beat tempo, read by C's rhythm moves. */
  bpm: z.number().positive().optional(),
  /** Camera feel: the current rig (calm), 20% nearer (close) or close + gentle sway (handheld). */
  camera: z.enum(['calm', 'close', 'handheld']).optional(),
});

/** Region ambience — fog is applied by A; music + particles are consumed by E. */
export const AmbienceSchema = z.object({
  fog: color.optional(),
  /** Music track id, e.g. 'mus_wok'. */
  music: z.string().optional(),
  /** Ambient particle preset names, e.g. ['petals']. */
  particles: z.array(z.string()).optional(),
});

/** 食材在小游戏（颠勺/撒料/摆盘）里的外观——形状 + 颜色，按食材 id 做 key（P0-1，design_fix_zh.md §2.1）。 */
export const IngredientVisualSchema = z.object({
  shape: z.enum(['cube', 'ellipsoid', 'cone', 'sphere', 'grain', 'flake', 'strip']).default('grain'),
  color: color,
  /** 相对默认米粒大小的缩放；1.3–1.5 为玩具化夸张区间（design_fix_zh.md §6.2 规则 1）。 */
  scale: z.number().positive().default(1),
});

/** 成品摆盘模型（manifest 里的模型 id）。缺省时按 ingredientVisuals 程序化拼出摆盘（P0-2）。 */
export const PlatedModelSchema = z.string();

/** 环境壳体 + 背景 + 相机限幅（P0-4，design_fix_zh.md §2.2）。整体可选；无 shell 则不画任何壳体。 */
export const EnvironmentSchema = z.object({
  shell: z.object({
    halfWidth: z.number().positive().default(4),
    halfDepth: z.number().positive().default(4),
    wallHeight: z.number().positive().default(2.6),
    wallColor: color.optional(),
    ceiling: z.boolean().default(true),
    windows: z.array(z.object({
      wall: z.enum(['north', 'south', 'east', 'west']),
      center: z.tuple([z.number(), z.number()]),
      size: z.tuple([z.number(), z.number()]),
      kind: z.enum(['rect', 'arch', 'moon']).default('rect'),
    })).default([]),
  }).optional(),
  backdrop: z.array(z.object({
    texture: z.string(),
    depth: z.number().positive(),
    parallax: z.number().min(0).max(1).default(0.3),
  })).default([]),
  cameraLimits: z.object({
    pitchMin: z.number().default(-1.35),
    pitchMax: z.number().default(0.9),
    roomLimit: z.number().positive().default(7.4),
  }).optional(),
});

export const KitchenSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Cuisine region, e.g. 'sichuan'. Cosmetic / grouping only. */
  region: z.string().optional(),
  pacing: PacingSchema.optional(),
  ambience: AmbienceSchema.optional(),
  environment: EnvironmentSchema.optional(),
  mood: z.object({
    background: color,
    floor: color,
    counter: color,
    light: color,
    lightIntensity: z.number().default(1.2),
  }),
  defaultDish: z.string(),
  overview: cam,
  counters: z.array(z.object({ pos: vec3, size: vec3 })).min(1),
  stations: z
    .array(z.object({ id: z.string(), label: z.string(), key: z.number().int().min(1).max(9), anchor: vec3, camera: cam }))
    .min(1),
  snaps: z.array(
    z.object({ id: z.string(), station: z.string(), pos: vec3, radius: z.number().positive(), accepts: z.array(z.string()) }),
  ),
  props: z.array(PropSchema),
  slots: z.array(z.object({ itemId: z.string(), pos: vec3, size: vec3 })).default([]),
  eggs: z.array(z.object({ id: z.string(), propId: z.string(), coins: z.number().int().nonnegative() })).default([]),
});

export const StepSchema = z.object({
  id: z.string(),
  move: z.enum(MOVE_IDS),
  station: z.string(),
  weight: z.number().positive().default(1),
  params: z.record(z.unknown()).default({}),
});

export const DishSchema = z.object({
  id: z.string(),
  name: z.string(),
  kitchen: z.string(),
  steps: z.array(StepSchema).min(1),
  rating: z.object({ good: z.number(), great: z.number(), perfect: z.number() }),
  coins: z.object({ oops: z.number().int(), good: z.number().int(), great: z.number().int(), perfect: z.number().int() }),
  stars: z.array(z.object({ id: z.string(), text: z.string() })).default([]),
  /** key = 食材 id（与 step.params.ingredient/item 或 prop.kind 一致）；缺省时代码内置默认表兜底。 */
  ingredientVisuals: z.record(IngredientVisualSchema).default({}),
  /** 成品摆盘模型 id（manifest 内）；缺省走程序化撒料兜底。 */
  platedModel: PlatedModelSchema.optional(),
});

export const EquipmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  kitchen: z.string(),
  price: z.number().int().nonnegative(),
  /** Key gear opens the next kitchen on the route. */
  key: z.boolean().default(false),
  unlocks: z.string().optional(),
  model: z.string().optional(),
  blurb: z.string().default(''),
  /** Shown as a "敬请期待" teaser card in the shop; not purchasable yet. */
  comingSoon: z.boolean().default(false),
  /** Free-form tuning that move owners read, e.g. { "pancake_flip": { "assist": 0.2 } }. */
  effects: z.record(z.unknown()).default({}),
});

export const RouteSchema = z.object({
  nodes: z
    .array(
      z.object({
        kitchenId: z.string(),
        name: z.string(),
        /** Equipment id that opens this node; null for the starting kitchen. */
        gate: z.string().nullable(),
        /** Shown locked on the map; no kitchen file exists yet. */
        placeholder: z.boolean().default(false),
        /** Cuisine region, e.g. 'sichuan'. */
        region: z.string().optional(),
        /** Position on the 中华美食地图 (food map), x,y in map units. */
        mapPos: vec2.optional(),
        /** Branch the node belongs to on the map, e.g. 'south' | 'east' | 'north'. */
        branch: z.string().optional(),
        /** One-line flavour text shown on a locked pin. */
        blurb: z.string().optional(),
      }),
    )
    .min(1),
});

export const SaveSchema = z.object({
  v: z.literal(1),
  coins: z.number().int(),
  owned: z.array(z.string()),
  installed: z.array(z.string()),
  unlocked: z.array(z.string()),
  stars: z.record(z.array(z.string())),
  stickers: z.array(z.string()),
  firstDishDone: z.record(z.boolean()),
});

export type Prop = z.infer<typeof PropSchema>;
export type Pacing = z.infer<typeof PacingSchema>;
export type Ambience = z.infer<typeof AmbienceSchema>;
export type Kitchen = z.infer<typeof KitchenSchema>;
export type Step = z.infer<typeof StepSchema>;
export type Dish = z.infer<typeof DishSchema>;
export type Equipment = z.infer<typeof EquipmentSchema>;
export type Route = z.infer<typeof RouteSchema>;
export type Save = z.infer<typeof SaveSchema>;
