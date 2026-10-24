# 滋啦厨房 · Sizzle Kitchen

Browser 3D cooking toy box (hackathon build). Two kitchens — 家庭厨房 and 炒锅灶台 — signature hand moves, coins, gear that unlocks the next kitchen.

```bash
npm install
npm run dev            # http://localhost:5173  (debug panel on the right)
```

The starter already plays the whole demo path in greybox: pancake tower → result → shop → 猛火灶 → Wok Station → fried rice. Every move except 打蛋 is a stub (Space = done, O = funny fail). Try `http://localhost:5173/?auto&fast=4&fresh&coins=600` to watch it play itself.

## Who owns what

| Owner | Area | Brief |
| --- | --- | --- |
| A | runtime, contracts, CI, integration | [docs/briefs/A-runtime.md](docs/briefs/A-runtime.md) |
| B | Home Kitchen moves, dish runner | [docs/briefs/B-home-moves.md](docs/briefs/B-home-moves.md) |
| C | Wok Station moves | [docs/briefs/C-wok-moves.md](docs/briefs/C-wok-moves.md) |
| D | coins, save, shop, unlock, all UI | [docs/briefs/D-meta-ui.md](docs/briefs/D-meta-ui.md) |
| E | art, FX, audio, demo | [docs/briefs/E-art-audio.md](docs/briefs/E-art-audio.md) |

Rules for AI agents and humans: **[AGENTS.md](AGENTS.md)**. Contracts: [docs/CONTRACTS.md](docs/CONTRACTS.md). Git and fallbacks: [docs/WORKFLOW.md](docs/WORKFLOW.md).

## Scripts

| Command | What |
| --- | --- |
| `npm run dev` | dev server, LAN-visible (`--host`) so teammates can open your build |
| `npm run check` | typecheck + import boundaries + asset manifest + unit tests (what CI runs) |
| `npm run check:owners -- --as B` | files your branch touched, flags anything outside your area |
| `npm run build` / `npm run preview` | production build in `dist/` / serve it offline |
| `npm run smoke` | headless: auto-plays the full loop and opens every dev scene (needs Playwright, see below) |
| `npm run assets:manifest` | refresh `public/*/manifest.json` after adding models or sounds |

Smoke test setup, once: `npm i --no-save playwright@1.48.2 && npx playwright install chromium`.

## URL flags

`?scene=egg_crack` one isolated dev scene · `?kitchen=wok` · `?dish=fried_rice` · `?coins=999` · `?unlock=all` · `?fresh` ignore save · `?stub=meta,ui` / `?stub=all` · `?only=dishes,moves-home` · `?auto&fast=4` auto-play · `?log` · `?debug=0` · `?mute` · `?skipResult` · `?fps` FPS/draw-call counter · `?firstperson` walk the kitchen in first person

Keys: `1–9` stations, `0` overview, `F` first-person walk (click to capture the mouse,
move the mouse to look, WASD to walk, Shift to jog, Esc to release the mouse),
`Space` / `O` on stub steps, `R` restart dish, `Esc` close panel,
`Backspace` restart a dev scene.
Console: `__sizzle.log`, `__sizzle.bus.emit('fx:pop', { text: '咔!' })`, `__sizzle.ctx`.

## First-hour setup (owner A)

1. Unzip, then `git init -b main && git add -A && git commit -m "starter"`. Create a private GitHub repo, `git remote add origin <url> && git push -u origin main`, and add the four others as collaborators.
2. `npm install` and **commit `package-lock.json`** (CI uses `npm ci` once it exists).
3. Settings → Branches → protect `main`: require a PR, require the `check` status, require Code Owner review (CODEOWNERS covers only shared files), no force pushes.
4. Replace the placeholder handles in `.github/CODEOWNERS`.
5. Everyone: clone, `npm install`, `npm run dev`, open `?scene=egg_crack`.
