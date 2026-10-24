# Brief E — Art, FX, audio & the demo

**Mission:** make two kitchens that read from the back of a room, make every action answer with sound and a pop, and own the demo itself.

## You own (merge without review)
`src/fx/` · `src/audio/` · `src/style.css` · `public/` (models, sfx, fonts, manifests) · `CREDITS.md` · this brief

## You consume
`fx:pop`, `sfx:play`, `step:oops`, `coins:change`, `result:shown`, `kitchen:ready`; `ctx.three.scene` (outline/particle passes), `ctx.world.toScreen`.

## How assets flow (no code changes needed)
1. Kitchen files already reference final names, e.g. `"model": "shared_food_egg"`.
2. Drop `public/models/shared_food_egg.glb` (≤ 3 MB, Y up, meters, bottom at y = 0 — core rescales to the prop size anyway).
3. `npm run assets:manifest` → commit the GLB **and** the updated `manifest.json`. The greybox swaps itself out.
4. Same for sound: `public/sfx/sfx_egg_crack.ogg` → manifest → the placeholder blip is replaced.
Names: `{home|wok|shared}_{room|prop|food|tool|eq}_<name>.glb`, `sfx_<id>.ogg`, `mus_<kitchen>.ogg`. Sources (.blend, .psd) stay OUT of git — shared drive.

## Design direction (sketchbook art notes)
- Chunky rounded props, toon shading, 3 px warm-brown outline (inverted hull).
- Color roles: teal = actionable only · gold = reward · pink = easter egg · red = key gear/stamps · ember = heat.
- Home = window daylight, cream/sage/tomato. Wok = charcoal, ember, blue-and-white porcelain.
- Onomatopoeia pops (咔! 啪! 滋啦! 咚!) with every sound, within 100 ms.
- Self-host fonts (ZCOOL KuaiLe, Nunito, Noto Sans SC subset) in `public/fonts`: venue Wi-Fi is not reliable.

## Milestones
- [ ] **M1:** Home Kitchen greybox → first real props (egg, pan, bowl, plate, pancake); 10 sounds.
- [ ] **M2:** Wok Station props; `shared_prop_crate` for D; steam/bubble/flame particles.
- [ ] **M3:** outline pass; FX on every step; music loop per kitchen (`mus_home`, `mus_wok`).
- [ ] **M5:** demo script (doc's 4 steps), 3 rehearsals on the projector, backup video.

## Test alone
`?only=fx,audio` + console: `__sizzle.bus.emit('fx:pop', { text: '滋啦!', style: 'perfect' })` · `__sizzle.bus.emit('sfx:play', { id: 'egg_crack' })` (click the page once first — browsers block audio until a gesture).

## Starter prompt for your AI
> I am owner E. Read AGENTS.md and docs/briefs/E-art-audio.md. Task: add an inverted-hull toon outline to every mesh built on kitchen:ready, in src/fx/outline.ts, registered from src/fx/index.ts. Only edit my paths. Finish with npm run check and npm run check:owners -- --as E.
