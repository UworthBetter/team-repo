# 项目进度 · Project Progress

> 同步于 2026-10-24。每张卡 = 一个分支 = 一个 PR；本文件随集成更新。Owner 分工见 `scripts/owners.json`。

## 里程碑

- [x] **M0** 仓库 / CI（A）：CI 三检查（check / check windows / smoke）+ 分支保护已启用
- [x] **M0–M3** A：A0–A9 全部（脚手架、节奏氛围运行时、Rapier 玩具物理、切厨房转场、发布构建）+ C 原型契约
- [x] **M1–M3** E：E1 描边+字体 · E2/E3/E6 51 个模型（13 个采用 Kenney CC0，来源见 CREDITS.md）· E4 粒子 9 预设 · E5 音效+音乐 · 暖金实感画风（`?outline=1` 可回草图书风）
- [x] **M3** B：B1–B7 动作 + B8 文思豆腐（wensi_tofu 已设为淮扬 defaultDish）
- [x] **M1–M4** D：结算/拆箱/商店/HUD/路线（部分经 #15 集成）
- [x] **M3** C：C1–C6 + C7 节拍校准手册（beatOffsetMs 误差仪表）
- [ ] **M4–M5** 淮扬手感打磨、演示排练 ×3 + 备用视频（docs/DEMO.md）

## 进行中的 PR

| PR | 内容 | 状态 |
| --- | --- | --- |
| #1 | B 家庭厨房动作 | open（等 review） |
| #3 | D meta & UI 里程碑 | open（等 review） |
| #17 | E 暖金实感画风 | open（CI 跑完 + 等 1 个 approve） |
| #18 | E 打蛋器/茶壶重制 + 菜板吸附对齐 + PROGRESS | open（等 review） |

## 已知事项

- `npm run check` 在 Windows 已可运行（#2 的 fileURLToPath 修复经 #15 入库）
- 合并顺序约束：E 链（#17→#18）在 B/D 之前或之后皆可，注意 route.json 冲突取双方
- 模型再生成：`tools/model-generator.mjs`（程序化）与 `tools/kenney-pack-glb.py`（Kenney 管线）互不覆盖（生成器有 KENNEY 跳过名单）
