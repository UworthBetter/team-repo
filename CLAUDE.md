# CLAUDE.md

@AGENTS.md

## Claude Code specifics

- At the start of a session, if the human hasn't said which owner letter (A–E) they are, ask once, then read that brief in `docs/briefs/`.
- Use plan mode for anything that touches more than one file in your area; show the plan before editing.
- `.claude/settings.json` asks before you edit `src/contracts/**`, `src/core/api.ts` or `package.json`. If you hit that prompt and you are not owner A, stop and explain what contract change you'd need instead.
- Personal overrides go in `.claude/settings.local.json` (git-ignored), never in the shared settings file.
- Prefer `npm run check` over running tsc or vitest directly; it is what CI runs.
