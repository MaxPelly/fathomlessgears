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

**3.1 Sidebar integrations**
- `fathomlessgears.js`: split the single `renderSidebarTab` hook into
  `renderCompendiumDirectory` → `addFshManager(html)` and `renderActorDirectory` →
  `addGridHudToSidebar(html)`. Both callbacks now receive the specific directory's
  `HTMLElement` directly, so the old "is this html the one I want, or do I need to look at
  its siblings" jQuery logic in both functions is gone.
- `fsh-manager.js` `addFshManager`: rewritten as native DOM with an idempotent guard
  (`querySelector(".fsh-content-manager")`) and inserted after `.header-actions`.
  `ui.sidebar.activateTab("compendium")` → `ui.sidebar.changeTab("compendium", "primary")`.
- `grid-hover.js` `addGridHudToSidebar`: rewritten to attach a single delegated
  `mouseover`/`mouseleave` listener pair on the sidebar root (guarded by a
  `dataset.gridHudBound` flag) instead of one `mouseenter` listener per actor row, so
  partial directory re-renders (folder expand/collapse) don't duplicate or lose
  listeners. Reads `li.directory-item.entry.actor` / `dataset.entryId` per the plan's v13
  DOM shape - **needs confirming against an actual v13/v14 client**, since the actors
  sidebar's row markup wasn't something this environment could inspect directly.
- `grid-hover.js:171`: `canvas.activeLayer.name == "TokenLayer"` → `canvas.tokens.active`.
- Deferred: `closeActorSheet`/`closeApplication` hooks (grid-hover.js) stay as-is for
  now - they're correct while sheets are still AppV1 (this chunk). They become
  `closeActorSheetV2`/`closeApplicationV2` in the §7 AppV2 chunk.

**3.2 Roll tables**
- `roll-table.js`: `result.text` → `result.name`; item link now built from `item.uuid`
  (`@UUID[${item.uuid}]{...}`) instead of `Compendium.${result.documentCollection}...`;
  `canvas.tokens.controlled.size` → `.length` (it's an array, not a Set); replaced the
  in-memory `table.formula = ...` mutation (which permanently patched the compendium
  document for every subsequent roll) with `createRollTableResult(..., {roll: new
  Roll(...)})`, threaded through to `table.roll(rollOptions)`.
- **Not done - needs a live v13 world:** the source pack JSON under
  `src/packs/fg_roll_tables/*.json` still uses the old `text`/`documentCollection`/
  `documentId` result fields. Foundry's own document migration shims these into
  `name`/`documentUuid` in memory at load time, so the code above works against the
  existing packs as-is, but per the plan the source should still be re-exported
  (`npm run pull-packs`) after opening a v13 world once, and committed, so the shim isn't
  relied on permanently. Left for the maintainer since this environment has no Foundry
  install.

**3.3 Chat**
- Added `src/utilities/compat.js` with `applyMessageMode(messageData)` - feature-detects
  `ChatMessage.applyMode` (v14) vs `ChatMessage.applyRollMode` (v13, shimmed on v14 until
  V16) per plan §0.3. All three `message-handler.js` call sites now use it.
- `message-handler.js`: `renderChatMessage` → `renderChatMessageHTML`; `addListeners` now
  takes a `root` element (defaulting to `document` for the initial full-page scan) and is
  called with the message's own `html` from the hook instead of re-scanning the whole
  document after a 50 ms timeout.
- `collapsible-roll.js`: replaced the regex-based formula-relocation (which threw if
  Foundry's roll-tooltip markup ever changed shape) with `DOMParser` +
  `querySelector(".dice-formula")` / `querySelector("section.tooltip-part")`, falling
  back to the unmodified HTML if either selector doesn't match. This made
  `Utils.insertIntoString` dead code, so it was removed.

**3.4 Token drop and hover**
- `token.js` `getTokenAtPosition`: now filters `canvas.tokens.placeables` by `t.visible`
  (so v14 tokens on other scene levels aren't matched) and uses each placeable's
  `bounds.contains(x, y)` instead of the hand-rolled centre/width bounds maths.

### §4 Deprecated globals

_(pending)_
