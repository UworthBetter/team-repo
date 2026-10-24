# Brief B — Home Kitchen moves + dish runner

**Mission:** the first dish the audience sees — 煎饼塔 — feels cozy, slow and forgiving, with five distinct hand moves.

## You own (merge without review)
`src/moves/home/` · `src/dishes/` · `content/kitchens/home.json` · `content/dishes/pancake_tower.json` (+ later `tomato_egg.json`) · this brief

## You consume
`step:start` (from your own runner), `grab:start/end`, `snap:enter/exit`, `kitchen:ready`; `ctx.world.prop(id)`, `ctx.world.snapPos(id)`, `ctx.input.*`, `ctx.world.root` for meshes you spawn (pancakes, yolk, shell halves).

## You emit
`dish:start`, `step:start`, `dish:complete` (runner) · `step:complete`, `step:oops`, `hint:show/clear`, `sfx:play`, `fx:pop` (moves).

## Design direction (sketch board 3, panels A and B)
| Move | Gesture | Feedback | Funny fail |
| --- | --- | --- | --- |
| `egg_crack` | grab egg → flick down on bowl rim → drag halves apart | rim snap glows · crack line + 咔 · yolk drops | flick too hard → whole egg 噗通 into bowl, fish it out |
| `whisk` | draw circles in the bowl (`params.circles`) | batter swirls, ring fills | — |
| `pancake_flip` | hold pan handle → flick up | bubbles + color = ready · arc + 啪 | too high → sticks to ceiling, falls back, bounces |
| `stack` | drag pancake onto plate, align to ghost | snap ghost · wobble if off-center | tower leans, still counts |
| `syrup_drizzle` | hold-drag a line over the stack | amber line follows pointer | — |

Heat/doneness is a visual cue only (bubbles, color, steam). No meters.

## Milestones
- [ ] **M1:** all five moves exist as real files (crude is fine) and each has a dev scene.
- [ ] **M2:** runner unchanged for C; pancakes persist from flip → stack (spawn on `dish:start`, clear on next `dish:start`).
- [ ] **M3:** feel pass with the team on the projector; equipment effects read from `ctx.content.equipment.get('nonstick_pan')?.effects` once `equipment:installed` fired.
- [ ] **Stretch:** 番茄炒蛋 — needs new move ids (`cut`, `stir_fry`) → ask A for a contract PR first.

## Test alone
`?scene=egg_crack` · `?scene=pancake_flip` (add one per move) · `?stub=meta,ui` to rule out D · Backspace restarts a dev scene.

## Starter prompt for your AI
> I am owner B. Read AGENTS.md and docs/briefs/B-home-moves.md, then src/moves/home/egg-crack.ts as the pattern. Task: implement `pancake_flip` in src/moves/home/pancake-flip.ts per the table, with a dev scene. Only edit my paths. Finish with npm run check and npm run check:owners -- --as B.
