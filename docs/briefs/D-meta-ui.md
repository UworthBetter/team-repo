# Brief D — Meta loop & UI

**Mission:** everything between dishes: rating → coins → shop → crate unbox → install → unlock → route. Plus every screen.

## You own (merge without review)
`src/meta/` · `src/ui/` · `content/equipment/*.json` · this brief

`meta` and `ui` are two modules: they talk only through events (`meta:state`, `result:shown`, `shop:purchase` …), so either can run as a stub.

## You consume
`dish:complete`, `easter:found`, `kitchen:ready`, `step:*`, `hint:*`, `station:focus`.

## You emit
`meta:state`, `result:shown`, `result:closed`, `coins:change`, `shop:purchase`, `equipment:purchased`, `equipment:installed`, `kitchen:unlocked`, `kitchen:enter` (route), `dish:restart`.

## Design direction (sketch boards 4–7)
- **HUD:** corners only, type ≥ 20 px at 1080p, teal only for actionable things; hint pill appears only during a step.
- **Result (~2 s, any click skips):** camera push-in → stamp slams (良好 / 优秀 / 完美, 哎呀 for a botch) → coins fly into the counter one by one → stars light up → buttons.
- **Shop:** pinned-catalog look; key gear has a red 关键 badge and says what it unlocks.
- **Crate unbox:** crate drops into the kitchen (咚) → drag along the tape → burst (light beams, confetti) → gear snaps into its slot → new kitchen door glows. Mesh in `ctx.world.root`; model `shared_prop_crate` from E.
- **Route map:** board-game path, gates show the key gear, locked kitchens stay in fog and unnamed.

## Milestones
- [ ] **M1:** result screen + coins correct (`score.test.ts` green); HUD bound to events.
- [ ] **M2:** crate unbox sequence replaces the 700 ms placeholder in `meta/index.ts`; route map panel.
- [ ] **M3:** result timing per board 5; real star checks from step `tags`.
- [ ] **M4:** unlock ceremony; sticker book (stretch).

## Test alone
`?stub=moves-home,moves-wok` (Space completes every step) · `?coins=999` · `?unlock=all` · `?fresh` · debug panel → Meta (D) → coins +500 / buy 猛火灶 / reset save · `__sizzle.bus.emit('dish:complete', { dishId: 'pancake_tower', kitchenId: 'home', quality: 0.95, steps: [] })`.

## Starter prompt for your AI
> I am owner D. Read AGENTS.md and docs/briefs/D-meta-ui.md. Task: replace the 700 ms install placeholder in src/meta/index.ts with the crate unbox sequence from the brief; UI parts go in src/ui/. Keep ?auto working (crate opens itself). Only edit my paths. Finish with npm run check, npm run check:owners -- --as D, npm run build && npm run smoke.
