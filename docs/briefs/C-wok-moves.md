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

## C7 校准手册 — 颠勺拍点 × mus_wok(演示音箱上做)

### 原理:拍点从哪来

`wok-toss.ts` 的拍格与音乐**各自独立计时**,BPM 相同、相位不同:

```
拍点时刻 beatTime(i) = 1.6s(LEAD)+ beatOffsetMs/1000 + i × (60 / params.bpm)
判定窗口 = ±0.16s × windowMult(装碳钢炒锅后 ×1.3 → ±0.208s)
```

- 音乐:`mus_wok.ogg` 在 `kitchen:ready` 时起播(E5 交叉淡入 0.8s),BPM 来自 `public/sfx/music.json`
- 拍格:从 `step:start` 的 t=0 起算;两者相位差 = 固定管线延迟(起播→菜品启动的间隔),这就是 `beatOffsetMs` 要吸收的量
- **BPM 已核对一致(110 = 110)**,所以只需校相位,不会越打越偏

### 校准仪表(已内置)

真实投掷(非 `?auto`)时,每次命中/早晚失误都会在控制台打点:

```
[wok_toss] beat 3/8 delta +42ms     ← 正数 = 你投早了(拍点还没到)
[wok_toss] 校准: n=8 mean=+38ms median=+40ms → 建议 beatOffsetMs ≈ -40
```

步骤结束时输出统计,**建议值 = −median**。

### 步骤(在演示电脑 + 实际音箱/投影链路上做,别用耳机代替)

1. **前置**:A 已合并 E5(有真音乐和 `sfx_wok_toss` 音效)、C 组已合并。打开控制台(F12)。
2. 打开 `http://localhost:5173/?kitchen=wok&unlock=all&fresh`(宫保鸡丁,第一步就是颠勺)。**必须先点一下页面**(浏览器节流,见 README)。
3. **听感粗校**:跟着节拍点拉推打完 8 拍。看控制台统计:
   - `mean` 为正(普遍投早)→ 拍点实际落后于你的手感 → **加** `beatOffsetMs`
   - `mean` 为负 → **减**
4. **改参数**:`content/dishes/kung_pao.json` 的 `toss_chicken` 与 `toss_peanut` 两步、`content/dishes/fried_rice.json` 的 `toss_egg` 与 `toss_rice` 两步,把 `beatOffsetMs` 改成建议值(四处同步改,步长 30–50ms)。
5. **复测**:刷新重打一遍,目标是 `|median| ≤ 50ms` 且无连续 miss。重复 3–4 直到收敛(通常 2–3 轮)。
6. **音箱链路复核**:接投影仪音频输出再测一轮——HDMI/外置音箱普遍加 50–200ms 延迟,**以最终演示链路的读数为准**,别用开发时的数值。
7. **手感微调**(可选):如果读数已收敛但"感觉"仍不对,优先调 `BASE_WINDOW`(wok-toss.ts 顶部常量,±0.16s)而不是再动 offset——offset 管相位,窗口管宽容度。
8. **记录**:最终数值追加到 `docs/DECISIONS.md`(shared,追加一行 `D-00x · date · C · beatOffsetMs=… ms @<设备> — why`),并同步四处 JSON。

### 循环漂移检查(一次性)

`mus_wok` 循环长度若不是 110 BPM 整数拍,音乐相位会随时间漂移。验证:进厨房挂着听完 3 分钟,期间进炒锅打几把,若后段 median 稳定变差 → 有漂移。对策(按代价排序):
1. 请 E 裁剪音乐为整拍循环(最优,改一个文件)
2. 菜品开始时重同步音乐相位(需 E 在 audio 模块响应 `dish:start`——跨组协作项)
3. 接受漂移:演示每道菜 60–75s,前两把不受影响

### 决策门(第 2 天 0 点)

若两轮校准后演示链路上 `|median| > 80ms` 或手感仍差,按 brief 的既定预案退回:**节拍点保留(视觉引导),音乐降级为氛围**(不作为节奏来源),或改为纯脚本化抛物弧线。拍格本身由 move 时钟驱动、不依赖音乐,所以**退回零代码成本**——只是音乐不再是判分依据。把决定追加到 DECISIONS.md。

### 预校准实测记录(2026-10-24,本地集成:C 全栈 + E5,开发机无头测量)

- `mus_wok` 从**第 0 个样本即拍点对齐**(onset 间隔精确 0.545s),循环长 8.732s ≈ 16.0075 拍,每圈漂移 5ms——**无漂移问题** ✓
- 管线延迟(实测):`kitchen:ready` → 音乐起播 +170ms(首次解码),→ `step:start` +433ms(runner 固定 400ms + ε)
- **预校准值:`beatOffsetMs = 227`,已写入 kung_pao / fried_rice 四处**——按"页面加载后立刻点一下"的演示流程测得
- ⚠️ 相位抖动源:音乐起播 = 首次用户手势(或 kitchen:ready,取先到者)+ 解码耗时。若点击晚于 kitchen:ready,相位随点击漂移
- **给 E 的建议(一行改动)**:boot 时预解码全部音乐,起播就变成 ready+~5ms,相位确定且 offset 收敛到 ~154ms
- 现场流程不变:接演示音箱后看仪表统计微调(预计只需 ±30ms)
