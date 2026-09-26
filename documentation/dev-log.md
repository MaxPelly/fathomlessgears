# v13/v14 Migration Dev Log

Tracks implementation progress against `foundry-v13-v14-migration-plan.md`. Entries are
added as work lands, grouped by the plan's chunks (see plan §11 "Suggested implementation
order").

**Testing note:** this environment has no Foundry install, no `npm`/`npx`, and no installed
`node_modules` (network access to the npm registry works, but there is no npm binary to
install packages with). Verification in this environment is therefore limited to:
`node --check` syntax validation, manual code review, and JSON validation. Every chunk
still needs a real in-Foundry smoke test (§12 test matrix) before merging - this log flags
what to verify by hand.

## Chunk 1: §1 manifest/deps + §3 hard breakages + §4 deprecated globals

### §1 Manifest, packaging and build

- `system.json`: bumped `compatibility` to `{"minimum": "13.351", "verified": "14.368"}`,
  updated `relationships.requires` versions for `token-action-hud-core` (2.1.0/2.1.1),
  `socketlib` (1.1.3/1.1.4 - now with an explicit compatibility block), and `statuscounter`
  (3.0.3/3.1.2, `maximum` dropped). Left `token-action-hud-FG`'s requirement at 0.6.0 for
  now - §9 (separate repo) bumps this once a v13/v14-compatible release exists.
  Replaced `gridDistance: 1` with `grid: {distance: 1, units: ""}` and added `"type": "system"`.
- Pack paths: dropped the (already-incorrect) `.db` suffix from every pack path so they
  point at the real LevelDB folders under `packs/`, e.g. `./packs/core_macros.db` →
  `./packs/core_macros`. `grid_type`'s path (`./packs/grid_types`) intentionally still
  differs from its pack `name` (`grid_type`) - this is referenced by
  `COMPENDIUMS.grid_type` / `fathomlessgears.grid_type` in code and must stay that way.
- Did **not** touch `documentTypes` or delete `template.json` yet - that's plan §2, which
  is chunk 3 in the suggested order (needs world-data backup testing on its own).
- `.github/workflows/main.yml`: `actions/checkout@v3` → `@v4`. Kept `template.json` and
  `LICENSE` in the release zip step for now (still needed until §2 removes
  `template.json`); fixed the `LICENSE` entry to `LICENSE.txt` to match the actual
  filename (previously silently omitted from every release archive).
- `package.json`: bumped `@foundryvtt/foundryvtt-cli` to `^3.0.4` (latest, supports v13/14
  LevelDB packs).
- `eslint.config.mjs`: added a `globals` block for common Foundry globals
  (`foundry`, `game`, `CONFIG`, `CONST`, `canvas`, `ui`, `Hooks`, `JSZip`) plus browser
  globals from the `globals` package, and a `no-restricted-globals` rule flagging the bare
  `renderTemplate`/`loadTemplates` globals so they can't silently creep back in.
  **Could not run `eslint`/`prettier` in this environment** (no npm) - please run
  `npm run lint` before merging.

### §3 Hard breakages

_(pending)_

### §4 Deprecated globals

_(pending)_
