# Decisions (append-only)

Add one line per decision at the bottom: `D-xxx · date · who · decision — why`. Never edit an old line; supersede it with a new one. AI agents: read this before proposing architecture changes.

- D-001 · D1 · all · Vite + TypeScript + Three.js, DOM overlay for UI — fastest path for 5 people with AI tools; no engine lock-in.
- D-002 · D1 · all · Dish moves are guided (snaps, paths, scripted motion); physics only for toy props — stable feel, scoring on results (design doc).
- D-003 · D1 · all · Modules talk only through typed bus events; imports across modules fail CI — lets five agents work in parallel.
- D-004 · D1 · all · One JSON file per entity under content/, validated by zod — tuning without merge conflicts.
- D-005 · D1 · all · Contracts additive-only; A merges contract and dependency PRs — no surprise breakage mid-hackathon.
- D-006 · D1 · all · No Git LFS; assets ≤ 3 MB each, ≤ 80 MB total, manifest-driven loading — keeps clones fast on venue Wi-Fi.
- D-007 · D1 · all · Prices, coin values and star rules are placeholders until the D2 tuning pass.
