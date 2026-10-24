# Workflow cheat sheet

## 1. Daily loop (each person)

```bash
git switch main && git pull --rebase origin main
git switch -c b/pancake-flip            # <owner letter>/<topic>
# … work with your AI inside your paths …
npm run check && npm run check:owners -- --as B
git add src/moves/home/ content/dishes/pancake_tower.json   # explicit paths only
git commit -m "B: pancake flip arc + 啪 feedback"
git pull --rebase origin main           # replay your work on today's main
npm run check
git push -u origin b/pancake-flip       # open a PR; CI green → merge (squash)
```

Branches live **under 2 hours**. Merge something at least every 90 minutes, even if it's behind a stub.

## 2. Merge rules

| Change | Who merges | Needs |
| --- | --- | --- |
| Only your own paths | you | CI green |
| `src/contracts/**`, `src/core/api.ts` | A | `contract:` PR, additive only |
| `package.json` / lockfile | A | `deps:` PR, one at a time |
| Someone else's paths | that owner | their OK in chat; better: ask them to do it |

Squash-merge; delete the branch. If `main` breaks after a merge, the merger reverts it immediately (`git revert -m 1 <sha>` or GitHub's Revert button) and fixes on a branch.

## 3. Conflicts (with or without AI)

Most conflicts can't happen here: one owner per folder, auto-discovered modules (no shared registry file), one JSON file per entity. When one does:

1. `git status` → list the conflicted files.
2. Your own file: resolve it. Prompt for your AI: *"Resolve the merge conflict in <file>. Keep both intents: main's change and mine. Don't touch any other file. Then run npm run check."*
3. Someone else's file: take main's side and tell them. During a rebase that is `git checkout --theirs <file>` (in a rebase, *theirs* = your commit, *ours* = main; when unsure, open the file and keep the `main` block).
4. Lockfile: `git checkout origin/main -- package-lock.json && npm install && git add package-lock.json`.
5. `git rebase --continue`, `npm run check`, push. Never `--force` a shared branch; `--force-with-lease` on your own branch only, by a human.

## 4. Assets

- E commits binaries; nobody else edits them, so they never conflict.
- Everyone else uses the greybox until a file appears. Need a new model? Add the name to your JSON (`"model": "wok_eq_dome_ladle"`) and ask E.
- Sources (.blend, .psd, .wav) live in the shared drive, not git.

## 5. If GitHub is slow or unreachable

**Plan B — LAN remote on A's laptop** (same Wi-Fi or a phone hotspot):

```bash
# A, once:
bash scripts/lan-remote.sh            # makes ~/sizzle-lan/sizzle.git and serves it on git://<A-ip>:9418
# everyone:
git remote add lan git://<A-ip>/sizzle.git
git push lan b/my-branch              # A merges into lan main the same way
git pull --rebase lan main
```

The `git://` daemon has no authentication: use it only on a network you trust (a phone hotspot is best). Alternatives: SSH (`ssh://user@a-laptop.local/~/sizzle-lan/sizzle.git` with Remote Login on).

When GitHub comes back, A runs `git fetch lan && git push origin lan/main:main` and everyone switches back with `git pull --rebase origin main`.

**Plan C — no shared network:** `git bundle create b.bundle origin/main..b/my-branch` → AirDrop / USB / chat → A runs `git fetch b.bundle b/my-branch:b/my-branch` and merges.

**CI down:** `npm run check && npm run build && npm run smoke` locally is the same gate. Paste the last lines into the PR or chat.

**npm registry down:** dependencies are frozen after hour 1, so `node_modules` you already have keeps working. Don't delete it. A keeps `npm pack` tarballs of the deps on the USB stick.

## 6. Demo build

```bash
npm run build          # dist/ (relative paths, works from any folder or static host)
npm run preview        # serves dist/ offline on :4173
```

Keep a copy of `dist/` on the demo laptop and a USB stick. Fonts and models are local; nothing loads from the internet.
