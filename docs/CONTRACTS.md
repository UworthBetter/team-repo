# Contracts

Five things are shared. Everything else is private to its owner.

| Contract | File | Changed by |
| --- | --- | --- |
| Events | `src/contracts/events.ts` | A, via `contract:` PR |
| Ids (moves, modules) | `src/contracts/ids.ts` | A, via `contract:` PR |
| Content shapes | `src/contracts/schemas.ts` | A, via `contract:` PR |
| Module API (`ctx`) | `src/core/api.ts` | A, via `contract:` PR |
| Asset names | this file, `scripts/asset-manifest.mjs` | A |

## Rules for changing a contract

1. **Additive only during the hackathon.** Add an optional field, a field with a `.default()`, a new event at the end of its group, a new id at the end of a list. Never rename, remove or change the meaning of something.
2. One contract change per PR, titled `contract: add camera:shake event`, touching only contract files (plus the smallest core change that implements it).
3. A merges it, posts in team chat: *"contract merged: camera:shake {strength} — pull main"*. Everyone pulls before their next AI task.
4. Need it before it's merged? Emit or listen to it anyway inside your module behind a `// TODO(contract)` and keep working; your PR waits for the contract PR.

## Events at a glance

See `src/contracts/events.ts` for payloads; `EVENT_EMITTERS` says who emits each.

```
kitchen:enter → kitchen:ready → dish:start → (step:start → move → step:complete)×N → dish:complete
→ result:shown → result:closed → shop:purchase → equipment:purchased → equipment:installed
→ kitchen:unlocked → kitchen:enter (next kitchen) …
side channels: grab:* snap:* station:focus hint:* fx:pop sfx:play coins:change meta:state easter:found step:oops dish:restart
```

## Content conventions

- One JSON file per entity under `content/`; the file name equals the `id`.
- All positions are the **bottom center** in meters; Y up; camera looks toward −Z; counter top y = 0.9.
- Props are modeled ~1.5× real size so they read on a projector.
- Validated at boot (red error box with the file name) and by `npm test`.

## Asset names

- Models `public/models/{home|wok|shared}_{room|prop|food|tool|eq}_<name>.glb`, ≤ 3 MB each.
- Sounds `public/sfx/sfx_<id>.ogg` (the id used in `sfx:play`), music `mus_<kitchen>.ogg`.
- Nodes inside a GLB (optional): `snap_<id>`, `col_<name>` (hidden collider), `fx_<name>` (emitter anchor).
- After adding files: `npm run assets:manifest` and commit the manifest. CI fails if it's stale.
- Total assets ≤ 80 MB. No Git LFS.
