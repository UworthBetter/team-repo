# Decisions (append-only)

Add one line per decision at the bottom: `D-xxx · date · who · decision — why`. Never edit an old line; supersede it with a new one. AI agents: read this before proposing architecture changes.

- D-001 · D1 · all · Vite + TypeScript + Three.js, DOM overlay for UI — fastest path for 5 people with AI tools; no engine lock-in.
- D-002 · D1 · all · Dish moves are guided (snaps, paths, scripted motion); physics only for toy props — stable feel, scoring on results (design doc).
- D-003 · D1 · all · Modules talk only through typed bus events; imports across modules fail CI — lets five agents work in parallel.
- D-004 · D1 · all · One JSON file per entity under content/, validated by zod — tuning without merge conflicts.
- D-005 · D1 · all · Contracts additive-only; A merges contract and dependency PRs — no surprise breakage mid-hackathon.
- D-006 · D1 · all · No Git LFS; assets ≤ 3 MB each, ≤ 80 MB total, manifest-driven loading — keeps clones fast on venue Wi-Fi.
- D-007 · D1 · all · Prices, coin values and star rules are placeholders until the D2 tuning pass.

## D-008 · 卡 D7 · 经济调参表（2026-10-24 · D）

演示路线（?fresh + 演示金币 600，即 smoke 的 `?coins=600`）：

| 环节 | 收入 | 累计 | 目标购买 | 价格 | 结果 |
| --- | --- | --- | --- | --- | --- |
| 起点（演示金币） | 600 | 600 | — | — | — |
| 煎饼塔 · 完美（80 + 首次三星 30） | 110 | 710 | 猛火灶 | 700 | 刚好买下，剩 10 |
| 煎饼塔 · 优秀（50 + 首星 10） | 60 | 660 | 猛火灶 | 700 | 买不起 → 重做一道冲完美 |
| 蛋炒饭 #1 · 完美（100 + 新厨房首道 50 + 三星 30） | 180 | 190 | — | — | — |
| 蛋炒饭 #2 · 完美（100 + 三星 30） | 130 | 320 | 专业刀具 | 320 | 两道炒锅菜刚好解锁淮扬 |

- 猛火灶 600 → **700**；专业刀具 800 → **320**（unlocks kitchen_3 → **huaiyang**，配合 11 节点新路线）。
- 宫保鸡丁（C6 合并后 defaultDish）完美 160+30：第二道菜收入 190 > 130，路线更宽裕，不改价。
- 首次星级奖励保持 10 金币/颗（payout 不变）；星级改为标签判定（卡 D5），占位动作（tag='stub'）回退档位判定。

## D-009 · 卡 D7 · 「敬请期待」中转关键装备（2026-10-24 · D）

- 新增 `bamboo_steamer`（竹蒸笼塔 400 → cantonese）、`purple_clay_pot`（紫砂砂锅 450 → zhejiang）、`copper_syrup_pot`（铜熬糖锅 500 → shandong），均 `comingSoon: true`，meta 拒绝购买并提示「敬请期待」。
- 三件的 `kitchen` 暂填 `wok`（当前路线最后一个可玩厨房，商店里能看到支线预告）；**E6 淮扬厨房合并后改回 `huaiyang`**（按设计文档它们属于淮扬商店）。
- 闽/徽/湘/西安/东北的 gate 暂为 null（在雾中只显示 blurb）；后续为每条支线补第二跳 gate（佛跳墙酒坛、腌鱼木桶、双剁刀、大面案、大铁锅）。

## D-010 · 卡 D4 · 路线数据（2026-10-24 · D）

- `content/route.json` 扩到 11 节点（文档「地方菜系厨房」全表），每节点带 `region`/`mapPos`/`branch`/`blurb`；`wok` 节点名改为「川 · 成都苍蝇馆子」配合 C4。
- `huaiyang` 节点暂为 `placeholder: true`（crossCheck 要求非占位节点必须有厨房文件）。**E6 合并 content/kitchens/huaiyang.json 后由 D 翻成 false 并把三件淮扬装备落进商店**：磨刀石 200（slice_lines 引导更宽容）、砂锅 250（汤步骤更容易）、青瓷碗 150（装盘加分）——价格已定，文件待 E6。
- 地图是风格化山水（丘陵、河流、海岸），**刻意不画任何行政边界**（设计文档明确要求）。

## D-011 · October 24, 2026 · A integration (authorized)

The merged route keeps D's 11 nodes and activates its single huaiyang node after E's
scene lands. The generated huaiyang recipe/key placeholders are replaced by B8's
five-step wensi_tofu and the three planned regional upgrades. Branch teaser cards
now belong to huaiyang. Slice, stack, and whisk share dish meshes and accept the
regional snap points through recipe parameters.

Professional knives cost 290, superseding D-008's 320. With demo coins 600, a first
perfect pancake pays 110; buying the 700 burner leaves 10. A first perfect fried
rice pays 180, and a second pays 100, leaving exactly 290. Repeat stars never pay a
second first-time bonus. Kung pao's higher payout keeps the two-dish route affordable.
