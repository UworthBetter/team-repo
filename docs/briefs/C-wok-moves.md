# Brief C — Wok Station moves

**Mission:** the second kitchen must feel instantly different: hot, fast, on the beat. 蛋炒饭 is the payoff of the demo.

## You own (merge without review)
`src/moves/wok/` · `content/kitchens/wok.json` · `content/dishes/fried_rice.json` (+ later `kung_pao.json`) · this brief

## You consume
`step:start` (B's runner — unchanged), `ctx.input.onPointer` / `onWheel` / `setGrabEnabled(false)`, `ctx.world.prop('wok')`, `ctx.world.root`, `ctx.onFrame`.

## You emit
`step:complete`, `step:oops`, `hint:show/clear`, `sfx:play`, `fx:pop`.

## Design direction (sketch board 3, panels C and D; board 2)
| Move | Gesture | Feedback | Funny fail |
| --- | --- | --- | --- |
| `wok_toss` | pull back / push forward on the beat (`params.beats`) | rice arcs (InstancedMesh, scripted parabolas) · beat dots light · 滋啦 | off-beat → grains hop onto the counter, grab them back |
| `flare` | hold to tilt the wok edge toward the flame | flame burst · camera shake (ask A for `camera:shake`) | — |
| `dome_scoop` | draw circles to pack → drag to plate center → wheel to flip → lift | pack ring fills · center snap · dome + steam + sparkle | not packed → dome slumps 噗, still served |

Equipment effects to read later: `carbon_wok.effects.wok_toss.window`, `flame_booster.effects.flare.power`, `dome_ladle.effects.dome_scoop.snapRadius`.

## Milestones
- [ ] **M1:** `wok_toss` real in `?scene=wok_toss` (start here — it's the riskiest feel).
- [ ] **M2:** `flare` + `dome_scoop` crude; fried rice plays end to end with real moves.
- [ ] **M3:** beat feel tuned on the demo laptop speakers; if toss feel is still off at D2 0h, switch to fully scripted arcs triggered by the gesture.
- [ ] **Stretch:** 宫保鸡丁.

## Test alone
`?scene=wok_toss` · `?scene=dome_scoop` · `?kitchen=wok&unlock=all&fresh` · `?only=dishes,moves-wok` (no UI noise).

## Starter prompt for your AI
> I am owner C. Read AGENTS.md and docs/briefs/C-wok-moves.md and src/moves/home/egg-crack.ts for the move pattern. Task: replace the stub in src/moves/wok/wok-toss.ts with the real move per the TODO block. Rice is an InstancedMesh on scripted arcs, not physics. Only edit my paths. Finish with npm run check and npm run check:owners -- --as C.
