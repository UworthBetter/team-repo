# AGENTS.md — rules for every AI coding agent in this repo

Read by Claude Code (via CLAUDE.md), Cursor, Codex, Copilot and others. Humans: this is also the short version of how we work.

**滋啦厨房 Sizzle Kitchen** is a browser 3D cooking toy box for a hackathon demo on a projector. Vite + TypeScript + Three.js, DOM overlay for UI, zod-validated JSON content. Five people, five AI agents, one `main` that must always run.

## 0. Before you write code

1. Ask (or infer from the branch name `a/…` `b/…` … `e/…`) **which owner letter you are working for**, then read `docs/briefs/<letter>-*.md`. It lists the only paths you may edit.
2. Skim `src/contracts/events.ts` and `src/core/api.ts`. They are everything you may rely on from other people.
3. Pull first: `git pull --rebase origin main`.

## 1. Boundaries (CI enforces these)

- **Edit only your owner's paths** (`scripts/owners.json`). If the task seems to need a change anywhere else, STOP and say what you need and from whom. Do not "just fix" another module.
- **Modules never import each other.** A feature module may import only `@contracts/*`, `@core/api`, files in its own folder, and npm packages already in `package.json`. Cross-module communication = `ctx.bus.emit(...)` / `ctx.bus.on(...)` with events from `src/contracts/events.ts`.
- **Contracts are frozen** (`src/contracts/**`, `src/core/api.ts`). Only owner A changes them, in a separate PR titled `contract: …`, and only additively: new optional fields, new events or ids appended at the end. Never rename or remove.
- **No new dependencies.** Don't run `npm install <pkg>` and never edit `package.json` / `package-lock.json`. Ask owner A.
- **Tuning lives in `content/*.json`**, not in code. One file per entity, file name = id.

## 2. How a feature is shaped

- A feature module is `src/<module>/index.ts` exporting `export default defineModule({ id, owner, setup(ctx), stub?(ctx) })`. It is auto-discovered; never edit `src/main.ts` to add one.
- A move is `defineMove({ id, label, start(ctx, step) → { update?, dispose } })`, one file per move, registered in its module's `index.ts`. The move itself emits `step:complete` (quality 0..1, judged on the result) and optionally `step:oops`.
- `dispose()` must remove every listener (`ctx.bus.on`, `ctx.input.onKey` … all return an unsubscribe), every mesh you added to `ctx.world.root`, and every DOM node you created. It must be safe to call twice.
- **Guided beats physics.** Dish moves use snap points, paths and scripted motion. Physics is only for free-play toy props.
- **Feedback within 100 ms**: every player action emits `sfx:play` and/or `fx:pop`.
- **Fun failure, never a dead end**: a botched move ends with low quality, never blocks the dish.
- **Keep it testable alone**: register a dev scene (`ctx.dev.scene('<id>', { kitchen, station }, run)`) and keep the `stub` path working. Respect `ctx.flags.auto` (finish by yourself) so `npm run smoke` can play the loop.
- Use `ctx.after(ms, fn)` instead of `setTimeout`, and `ctx.onFrame(dt => …)` instead of your own `requestAnimationFrame`.

## 3. Definition of done (before you say "done")

```bash
npm run check                       # typecheck + boundaries + assets + unit tests
npm run check:owners -- --as <X>    # lists every file you touched; anything flagged = revert it
npm run build && npm run smoke      # when you changed flow, timing or anything in the loop
```

Then run `npm run dev`, open your dev scene (`?scene=<id>`), and describe in one or two sentences what the human should try. The human plays it; feel is their call, not yours.

## 4. Git rules for agents

- Small commits on the owner's branch (`b/egg-crack`). Stage explicit paths (`git add src/moves/home/`), never `git add -A` or `git add .`.
- Never `git push --force`, `git reset --hard`, `git clean`, rebase `main`, or delete branches. Never commit to `main` directly.
- Don't reformat, rename or "tidy" files you weren't asked to touch. Diffs should be about the task.
- Merge conflict: resolve only inside your owner's paths. For any other file take `main`'s version (`git checkout --theirs <file>` during a rebase) and tell the human. Then re-run `npm run check`.

## 5. Map

| Path | Owner | What |
| --- | --- | --- |
| `src/contracts/` | A | events, ids, zod schemas — frozen |
| `src/core/` | A | loop, world, grab/snap, camera, input, debug, dev scenes; `api.ts` is the public surface |
| `src/moves/home/`, `src/dishes/` | B | Home Kitchen moves, dish runner |
| `src/moves/wok/` | C | Wok Station moves |
| `src/meta/`, `src/ui/` | D | coins, save, shop, unlock, HUD, result, panels |
| `src/fx/`, `src/audio/`, `src/style.css`, `public/` | E | pops, particles, shaders, sound, models, tokens |
| `content/` | per file | see `scripts/owners.json` |

## 6. Useful URL flags

`?scene=<id>` one dev scene · `?kitchen=wok` · `?dish=fried_rice` · `?coins=999` · `?unlock=all` · `?fresh` · `?stub=meta,ui` or `?stub=all` · `?only=dishes,moves-home` · `?auto&fast=4` auto-play · `?log` print events · `?debug=0` hide panel · `?mute` · `?skipResult`.
In the browser console: `__sizzle.log` (last 400 events), `__sizzle.bus.emit('fx:pop', { text: '咔!' })`, `__sizzle.ctx`.

## 7. Style

TypeScript strict; no `any` across a contract boundary; no `@ts-ignore`. Kebab-case file names, snake_case ids, Chinese player-facing text. Comments explain *why*. Colors come from CSS tokens in `src/style.css` (teal = actionable only, gold = reward, pink = easter egg, red = key gear/stamps, ember = heat).
