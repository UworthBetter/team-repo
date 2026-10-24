# Brief A — Runtime, contracts & integration

**Mission:** keep `main` green and the loop playable; own the shared surface; make grabbing things feel like a toy box.

## You own (merge without review)
`src/contracts/` · `src/core/` · `src/main.ts` · `tests/` · `scripts/` · `.github/` · `.claude/` · `.cursor/` · `AGENTS.md` · `CLAUDE.md` · `README.md` · `docs/CONTRACTS.md` · `docs/WORKFLOW.md` · `package.json` + lockfile · `tsconfig.json` · `vite.config.ts` · `index.html` · `content/route.json`

## You are also the integrator
- Merge every `contract:` PR (additive only), announce it in team chat, ask everyone to pull.
- Only you add npm dependencies (one `deps:` PR at a time; lockfile conflicts vanish).
- Run the 2-hour sync on the demo laptop: pull `main`, `npm run build && npm run smoke`, play the loop.
- When `main` breaks: revert the offending merge first (`git revert -m 1 <sha>`), then help fix.
- Host the LAN fallback remote if GitHub is slow (docs/WORKFLOW.md §5).

## Emits / provides
`kitchen:ready`, `station:focus`, `grab:*`, `snap:*`, `easter:found`; `ctx.world`, `ctx.input`, `ctx.moves`, `ctx.dev`, `ctx.onFrame`, `ctx.after`.

## Design direction (sketch boards 1, 2, 4)
- Grab: ~70–100 ms follow lag, tilt from velocity, drops bounce (`src/core/grab.ts` constants).
- Click a station or press 1–9 → camera glides in 0.45 s; 0 = overview.
- Wok Station camera sits closer and shakes on flare; Home is calm.

## Milestones
- [ ] **M0 (0–2h):** repo on GitHub, branch protection + CI, lockfile committed, everyone runs `npm run dev`.
- [ ] **M1:** Rapier (`@dimforge/rapier3d-compat`) for `toy: true` props only; snap feel tuned with B.
- [ ] **M2:** `camera:shake` event (contract PR) for C; equipment models placed into slots on `equipment:installed`; kitchen switch transition.
- [ ] **M3:** outline/toon pass with E; perf ≥ 50 fps on the demo laptop at projector resolution.
- [ ] **M5:** build + deploy (static host) + offline copy on the demo laptop and a USB stick.

## Regional contract (A4, landed)
Additive only. Kitchens gained optional `region`, `pacing {bpm, camera: calm|close|handheld}` and
`ambience {fog, music, particles}`. Route nodes gained `region`, `mapPos [x,y]`, `branch`, `blurb`.
Equipment gained `comingSoon`. `MOVE_IDS` appends `sprinkle` (C) and `slice_lines` (B); `MODULE_IDS`
appends `moves-knife` (B, `src/moves/knife/`). Asset-name regex widened to
`^<kitchen>_(room|prop|food|tool|eq|ui)_<name>$`. Ownership moved in `scripts/owners.json`:
`content/route.json → D`, `content/kitchens/huaiyang.json → E`, `content/dishes/kung_pao.json → C`,
`content/dishes/wensi_tofu.json → B`. Owners B–E: please mirror these new paths/ids into your own briefs.

## Starter prompt for your AI
> I am owner A (runtime + integration). Read AGENTS.md and docs/briefs/A-runtime.md. Task: <…>. Keep src/core/api.ts and src/contracts/** backward compatible. Finish with npm run check and npm run smoke.
