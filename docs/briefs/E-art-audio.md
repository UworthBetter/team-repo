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

## Kenney CC0 素材对照表（E 维护，2026-10-24）

来源：kenney.nl Food Kit + Furniture Kit（CC0），镜像 github.com/shorepine/kenney（3d/food、3d/furniture，直接 .glb）。
注意：食物 GLB 引用外部 `Textures/colormap.png`，直接用会丢贴图——用 `tools/kenney-pack-glb.py` 在 Blender 里重导出为自包含再入库。

**已采用（13）**：egg→shared_food_egg · tomato→shared_food_tomato · frying-pan→home_tool_pan · bowl→home_tool_bowl · cutting-board→home_tool_board · bag→home_prop_flour · kitchenFridge→home_room_fridge · bottle-oil→wok_food_oil · pot-stew→wok_prop_stock_pot · cooking-knife-chopping→huaiyang_tool_knife · knife-block→wok_eq_pro_knives · cardboardBoxClosed→shared_prop_crate · honey→home_eq_syrup_pot。

**确认不采用**：plate-dinner（带食物）、soy（是蘸碟非瓶）、whisk（扁线看不清）、kitchenBlender（无品牌色）、kitchenStoveElectric（无 ember 语义）、cutting-board-japanese（不如自建案）、pot（灰钢色）、mortar-pestle（形不对）、tajine、wallWindow（月洞窗是设计符号）、plate（保青瓷沿色码）。

**未来厨房采购单**（做新厨房时先来这里找）：
- 粤·茶楼：**steamer.glb**（竹蒸笼，已验证渲染）· cup-tea / cup-saucer / cup.glb（茶杯）· dim-sum.glb（点心）· chopstick.glb
- 闽·佛跳墙：无坛；pot-stew 可复用，坛子需自制
- 浙·西湖：cup-tea（龙井）· fish.glb（龙井虾仁/鱼）· pan-stew.glb（炖锅）
- 徽·臭鳜鱼：fish.glb · fish-bones.glb（鱼骨彩蛋）
- 湘：shaker-pepper / pepper-mill（剁椒坛需自制）
- 鲁·糖醋鲤鱼：fish.glb · honey（熬糖色）
- 西安·肉夹馍：loaf-round.glb（白吉馍）· bread.glb · meat-cooked.glb（腊汁肉）· rollingPin.glb（擀面杖）
- 东北·铁锅炖：pot.glb（需做黑色铁锅变体）· cabbage / leek（酸菜料）
- 家庭拓展：kitchenSink.glb（小黄鸭水槽彩蛋场景）· toaster / kitchenMicrowave / kitchenCoffeeMachine · pottedPlant1-3 · pancakes.glb（煎饼展示）
