**Owner:** A / B / C / D / E   ·   **Type:** feature / fix / `contract:` / `deps:` / assets

**What a teammate should try** (URL + what to do):
`http://localhost:5173/?scene=…`

- [ ] Only my paths changed (`npm run check:owners -- --as <X>` shows nothing flagged)
- [ ] `npm run check` passes
- [ ] Played it in the browser; stub path (`?stub=<module>`) still works
- [ ] If I changed flow/timing: `npm run build && npm run smoke` passes
- [ ] Contract change? It's additive and in its own PR
