# v13/v14 Migration Dev Log

Tracks implementation progress against `foundry-v13-v14-migration-plan.md`. Entries are
added as work lands, grouped by the plan's chunks (see plan §11 "Suggested implementation
order").

**Testing note:** this environment has no Foundry install. `npm`/`npx`/`node_modules`
**are now available** (as of the "npm now available" session below) - `npm install`,
`npm run lint`, and `npm run pull-packs`/`push-packs` all work. Verification is therefore
now: `eslint`/`prettier` (real, not simulated), full-tree syntax validation, JSON
validation, and manual code review - still no substitute for a real in-Foundry smoke test
(§12 test matrix), since there's still no Foundry client/server to actually load the
system and exercise runtime behaviour, hooks, or template rendering.

**Syntax-check gotcha:** plain `node --check some-file.js` on this repo is **not**
reliable, because `package.json` has no `"type": "module"` and Node's module-type
detection for ambiguous `.js` files can silently accept broken syntax (a real example: a
script-inserted `import` statement landed *inside* another multi-line `import { ... }`
block across 3 files in this chunk, and `node --check` reported success on all of them).
The reliable check is to copy the file to a `.mjs` path first (forces ESM parsing; import
targets aren't resolved by `--check`, so the copy's new location doesn't matter) and check
that instead. Every commit in this log has been verified this way.

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

- `renderTemplate` (24 call sites across `message-handler.js`, `roll-handler.js`,
  `attack.js`, `roll-table.js`, `reel.js`, `item.js`, `hud-actions.js`, `actor.js`,
  `grid-base.js`) → `foundry.applications.handlebars.renderTemplate`.
- `loadTemplates` (`utilities/templates.js`) →
  `foundry.applications.handlebars.loadTemplates`.
- `TextEditor.enrichHTML` (`actor-sheet.js`) →
  `foundry.applications.ux.TextEditor.implementation.enrichHTML`; dropped `async: true`
  (no longer a valid option), added `relativeTo: this.actor` so relative UUID links in
  the biography resolve correctly.
- Sheet registration (`fathomlessgears.js`): dropped the `Actors.unregisterSheet("core",
  ActorSheet)` / `Items.unregisterSheet(...)` calls (core no longer registers default
  sheets in v13+, so these were already no-ops) and moved registration to
  `foundry.documents.collections.Actors/Items.registerSheet(...)`.
- `Token` / `TokenDocument` base classes (`tokens/token.js`) →
  `foundry.canvas.placeables.Token` / `foundry.documents.TokenDocument`.
- `CompendiumCollection` (`data-files/file-utils.js`) →
  `foundry.documents.collections.CompendiumCollection`. Also dropped the broken
  `path: ["packs/", compendiumName].join()` (this produced the literal string
  `"packs/,name"` since `Array.join()` defaults to a comma separator - the option is
  simply omitted now, matching how the plan flagged it).
- All remaining bare `$(...)` jQuery-global usages outside sheet `activateListeners`
  bodies replaced with native DOM: `grid-base.js` (`highlightInternal`, `renderInternal`,
  `popInternal`, `unpopInternal` now use `event.target.closest(...)` /
  `querySelector(...)` / `element.style.*` instead of jQuery `.closest()`/`.css()`), and
  correspondingly `grid-space.js`'s `toggleHighlight` (which receives the element these
  functions produce) now uses `querySelector` chains instead of `.find()`. This was
  pulled forward from part of plan §7 item 6, since `toggleHighlight`'s jQuery-shaped
  parameter and `grid-base.js`'s bare `$(...)` calls are the same coupled piece of code -
  fixing one without the other would have left a broken half-state. The grid's outer
  `activateListeners(html)` (still `html.find(...).click(...)`, called from the AppV1
  actor sheet) is untouched and stays jQuery until §7 converts the actor sheet itself.
  `actor-sheet.js:256-257`'s `$(this.element).get(0)` → `this.element[0]` (this.element
  is still a jQuery collection until the sheet itself becomes ApplicationV2 in §7; the
  fix here is just removing the redundant bare `$()` re-wrap, not the sheet's jQuery-ness
  itself), and the `addListeners()` call now passes `this.element[0]` as the scan root
  instead of defaulting to the whole `document`.
- **Deferred to §6 (not chunk 1):** the three `Color.from(...)` calls in
  `configureElevationRuler` - that whole function is dead code being deleted in §6, so
  fixing its globals now would be wasted work.

### Not yet done (tracked for later chunks)
- §2 data models / `documentTypes` / `template.json` removal.
- §5 active effects / token effect drawing, §6 ruler replacement.
- §7 ApplicationV2 migration (all dialogs, apps, HUD, item/actor sheets).
- §8 CSS/theming.
- §9 token-action-hud-FG (separate repo).
- §10 smaller cleanup items.
- Manual, environment-dependent follow-ups already called out above: re-exporting
  `src/packs/fg_roll_tables/*.json` from a live v13 world, and running `npm run
  lint`/`npm install` (not possible in this sandbox - no npm binary available, though
  network access to the registry does work).

## Chunk 1 code review (findings + fixes)

Ran an independent code-review pass over the three chunk 1 commits. Four issues were
raised and fixed; a couple of other candidates the review's finder agents raised were
independently refuted (the "new" native-DOM crash sites they flagged had an identically-
placed unguarded property access in the old jQuery code, so they aren't regressions -
same failure point, just a different error message).

1. **Real bug, confirmed and fixed:** `Grid.checkInternal()`
   (`src/grid/grid-base.js`) calls `this.renderInternal(uuid)` with a single argument,
   but `renderInternal(event, uuid)` takes two - so `event` is actually the uuid string
   and `uuid` is `undefined`. This is a pre-existing latent bug (there's no real DOM event
   available on this call path at all), but the old jQuery `$(event.target)` silently
   no-opped on the resulting `undefined`, while the new `event.target.closest(...)` threw
   on it. Fixed by guarding with `event?.target?.closest(...)` and returning `null` early
   if there's no display element, restoring the original silent-no-op behaviour rather
   than attempting to fix the deeper pre-existing design issue (out of scope for a
   migration pass).
2. **Flagged, left as-is (already documented):** `grid-hover.js`'s
   `li.directory-item.entry.actor` / `dataset.entryId` selector is unverified against a
   real v13/v14 client. No code change possible without one; already called out above and
   in the §12 test matrix as a required manual check before release.
3. **Real gap, fixed:** the delegated sidebar hover handler only cleared the grid HUD on
   `mouseleave` of the whole sidebar, not when the pointer moved from an actor row onto a
   non-actor part of the same sidebar (folder header, search box). The original
   per-row-`mouseenter`-plus-container-`mouseleave` code had the exact same gap, so this
   wasn't a regression, but since the delegated handler already tracks entry-id
   transitions it costs nothing to also clear the HUD state when `actorId` becomes falsy
   partway through, so this was fixed as a small improvement bundled with the rewrite.
4. **Real duplication, fixed:** all 24 `renderTemplate`/1 `loadTemplates` call sites had
   the full `foundry.applications.handlebars.*` path inlined instead of importing from
   `compat.js`, contradicting that module's own stated purpose ("exactly one place to
   update"). Added `renderTemplate`/`loadTemplates` re-exports to `compat.js` and switched
   every call site to import from there.

**Process note for future chunks:** the mechanical find/replace used to rewire those 24
call sites onto the new import inserted the new `import` line at the position right after
the *first line* of the previous import statement, which happens to land mid-statement
when that first import spans multiple lines (`import {\n\tFOO,\n\tBAR\n} from "...";`).
This broke `roll-handler.js`, `actor.js`, and `grid-base.js`, and - notably -
`node --check` reported all three as syntactically valid anyway (see the syntax-check
gotcha note above). Caught by copying to `.mjs` and rechecking after the code review
flagged the duplication issue that led to touching these files again; fixed by moving the
misplaced import above the multi-line block it landed inside. A full `.mjs`-based sweep
of the entire `src/` tree (not just touched files) confirms no other files were affected.

## Chunk 1: verification against the official API docs

Got access to Foundry's real generated API reference (JSDoc/TypeDoc) - the live v14 docs
at `https://foundryvtt.com/api/` (currently 14.365), plus archived v13 snapshots via
`web.archive.org` for anything version-specific (see
`documentation/foundry-module-migration-reference.md` for how to use this). Went back
through every "unverified" assumption from chunk 1 and checked it against real class/
method docs instead of the plan's prose or training-data recall alone.

**Confirmed correct as implemented:**
- `renderActorDirectory` / `renderCompendiumDirectory` hooks: both `ActorDirectory` and
  `CompendiumDirectory` are real classes (the latter isn't linked from the docs index for
  some reason, but its page exists), and `BASE_APPLICATION`'s documented behaviour
  ("Hook events for super-classes further upstream of the BASE_APPLICATION are not
  dispatched") confirms every class in the chain up to `BASE_APPLICATION` gets its own
  `render${ClassName}` hook fired - this is the actual mechanism behind the legacy-style
  hook, not something invented for v1 compat shims only.
- `ui.sidebar.changeTab("compendium", "primary")`: `Sidebar#tabGroups` is typed as
  `{primary: string}`, confirming `"primary"` is the real tab group name.
- `foundry.applications.ux.TextEditor.implementation.enrichHTML(content, options)`:
  confirmed signature; `EnrichmentOptions` has `secrets` and `relativeTo` fields and **no
  `async` field at all** (fully removed, not just ignored), confirming that option should
  be dropped rather than kept.
- `foundry.applications.handlebars.renderTemplate(path, data)` /
  `loadTemplates(paths)`: both exist at exactly that namespaced path with the exact
  signatures used everywhere in this codebase.
- `foundry.documents.collections.Actors/Items.registerSheet(...)`: the docs' own example
  (`foundry.documents.collections.Actors.registerSheet("dnd5e", ActorSheet5eCharacter,
  {types: [...], makeDefault: true})`) matches our call shape exactly.
- `foundry.canvas.placeables.Token` / `foundry.documents.TokenDocument`: both exist at
  those exact paths.
- `canvas.tokens.active`: `PlaceablesLayer#active` ("Is this layer currently active") is
  a real getter inherited by `TokenLayer`.
- `token.bounds.contains(x, y)`: `Token#bounds` returns a `Rectangle`, which has
  `contains`.
- Using `t.visible` (not `t.isVisible`) in `token.js`'s `getTokenAtPosition`: `Token` also
  has a documented `isVisible` getter ("visible to the calling user" - a vision/fog-of-war
  check), which is a *different* property from the plain `visible` flag PIXI's rendering
  pipeline toggles for level/elevation occlusion. The plan's §0.3 explicitly said
  `token.visible`, not `isVisible` - confirmed that was the deliberate, correct choice.
- `table.roll({roll: new Roll(...)})`: the docs literally include this as a worked
  example ("Example: Draw results using a custom roll formula"), word-for-word matching
  the fix in `roll-table.js`. `RollTableDraw` is confirmed to be `{results:
  TableResult[], roll: Roll}`, matching `roll.results[0]` / `roll.roll` usage.
- `TableResult`'s schema is confirmed to be `name` (`StringField`), `documentUuid`
  (`DocumentUUIDField`), `type` (`DocumentTypeField`) - **no** `text`, `documentCollection`,
  or `documentId` fields exist at all in the current schema, confirming the `roll-table.js`
  fix and ruling out any fallback path for the old field names.

**Real bug found and fixed:** the plan's §0.3 claim that `ChatMessage.applyRollMode` is
"shimmed on v14 until V16 but warns" is **wrong** for 14.365 - it doesn't exist at all
(no static or instance method by that name anywhere in the v14 docs). This didn't break
anything because `compat.js`'s `applyMessageMode` feature-detects on `ChatMessage.applyMode`
existing rather than branching on version, so it never reaches the `applyRollMode` call on
v14 - but the v14 branch itself had a latent bug: it called
`game.settings.get("core", "messageMode")`, a setting key that appears nowhere in the
v14 docs. `ChatMessage.applyMode`'s own docs say its `mode` parameter is optional and
"otherwise appl[ies] the default mode stored in client settings" when omitted - so the fix
was to stop guessing the setting key entirely and call `ChatMessage.applyMode(messageData)`
with one argument, letting core resolve the default itself. Without this fix, every chat
message created on v14 risked throwing "sceneModes is not a registered game setting" (or
similar) if that guessed key didn't exist - it doesn't appear to.

**Still not fully nailable down from docs alone (needs a live client):**
- The exact sidebar row markup (`li.directory-item.entry.actor` / `dataset.entryId` in
  `grid-hover.js`). JSDoc/TypeDoc only documents JS classes/methods, not compiled
  Handlebars template output, so the literal CSS class list and attribute name can't be
  confirmed this way. What *is* now confirmed: `DocumentDirectory`'s entire method surface
  uses "entry" terminology pervasively (`_getEntryDragData(entryId)`,
  `_onMatchSearchEntry(query, entryIds, element)`, etc.) - not "document" - which strongly
  corroborates `dataset.entryId` over the old `dataset.documentId`, but the precise class
  chain is still a required manual test-matrix item (§12).
- The exact hook-argument shape for `renderChatMessageHTML` (i.e. that `html` is an
  `HTMLElement`, not jQuery) wasn't pinned down via an explicit `@fires`-tagged doc block
  in this reference (TypeDoc's "Fires" sections present in the docs didn't resolve to a
  readable event name via the extraction method used here). This is still well-corroborated
  by Foundry's own published v12 migration notes (independent of this plan), so left
  as-is, but flagged as the one item in this pass not confirmed by the API docs
  themselves.

See `documentation/foundry-module-migration-reference.md` for the reusable how-to (doc
site access, tooling gotchas) distilled out of this session for future migration work.

## npm now available - real lint run, extra chunk 1 verification

Got a working `npm`/`node` in this environment for the first time (previously only
syntax-checkable via `.mjs` copies and manual review). Ran `npm install` (157 packages,
0 vulnerabilities) and used it to actually verify chunk 1 rather than just simulate it.

- `npm run lint` (real `eslint . --fix`, not a manual read-through): found one genuine
  bug introduced by the chunk 1 §3.2 roll-table fix. `RollTableHandler.getRenderedHistory`
  took a `result` parameter that was only ever used to build
  `` `@UUID[Compendium.${result.documentCollection}...` ``; when that was replaced with
  `` `@UUID[${item.uuid}]{${item.name}}` `` (the real §3.2 fix), `result` became fully
  unused but was left in the signature and call site
  (`src/actions/roll-table.js:25-30,90`). ESLint's `no-unused-vars` (added in chunk 1's
  own `eslint.config.mjs` changes) caught it immediately - this is exactly the kind of
  thing manual review missed and a real lint pass exists to catch. Fixed by dropping the
  dead parameter from both `getRenderedHistory`'s signature and its one call site in
  `createRollTableResult`. Re-ran `npm run lint` clean afterwards.
- `npx prettier . --check`: only the three documentation `.md` files need reformatting
  (pre-existing, unrelated to any migration code) - all touched JS is already
  Prettier-clean.
- Full `src/` tree re-verified with the `.mjs`-copy syntax check (still the reliable
  method - see the migration reference doc) - all files pass, no repeat of the
  mid-import-insertion bug from the chunk 1 code review.
- Manually confirmed every `compat.js` import site (`message-handler.js`, `roll-handler.js`,
  `attack.js`, `roll-table.js`, `reel.js`, `hud-actions.js`, `item.js`, `grid-base.js`,
  `templates.js`, `actor.js`) imports only names `compat.js` actually exports
  (`applyMessageMode`, `renderTemplate`, `loadTemplates`) - no typos.
- Verified the `eslint.config.mjs` `no-restricted-globals` regression guard (added in
  chunk 1) actually fires: a throwaway file calling bare `renderTemplate(...)` was
  correctly flagged and removed again.
- Manually re-checked `system.json` against plan §1 - `compatibility`, `relationships.requires`
  versions, `grid`/no `gridDistance`, `type: "system"`, and every pack `path` (including
  the intentional `grid_type` name vs `packs/grid_types` path mismatch) all match the plan
  exactly, and every referenced `packs/<name>` directory exists on disk.
- Grepped `src/` for lingering deprecated-API usage: no bare `$(...)` left outside the
  (still-AppV1, not-yet-migrated) sheets/grid files chunk 1 didn't touch; the two
  `result.text` hits left in `roll-handler.js` are a false positive - that `result` is the
  return value of `rollNoTarget` (an internal roll-message object), not a Foundry
  `TableResult`, so it's unrelated to the §3.2 roll-table field rename.
- **Confirmed (not just documented) that §3.2's remaining source-pack task still needs a
  live Foundry world:** ran `npm run pull-packs` against the existing `packs/`
  LevelDB stores. It re-extracted `fg_roll_tables`'s JSON with the exact same
  `text`/`documentCollection`/`documentId` fields as before (just reformatted
  indentation from the newer CLI version) - i.e. the on-disk compendium data itself was
  never migrated to `name`/`documentUuid`, because that migration only happens inside a
  live Foundry core document class, which `@foundryvtt/foundryvtt-cli`'s `extractPack`
  doesn't invoke. This reverted the pack directories back to their committed state
  afterwards (formatting-only diff, no content value) rather than leaving noise.
- **New, unrelated-to-migration finding surfaced by the same `pull-packs` run:** the
  compendium LevelDB stores in `packs/background`, `packs/deep_word`, `packs/development`,
  `packs/frame_pc`, `packs/internal_pc`, and `packs/maneuver` all contain real, substantial
  content (7 backgrounds, 9 deep words, 20 developments, 13 frames, ~100 internals, 36
  maneuvers), but the corresponding `src/packs/<name>/` directories are committed
  **empty** - the JSON source-of-truth export for six entire compendiums appears to have
  never been committed. This is a pre-existing gap, not something this migration touched
  or caused, and re-exporting/committing ~150 new files is out of scope for this pass -
  flagged here for the maintainer to decide whether to `npm run pull-packs` and commit
  the result. (The run's other two single-file drifts - a renamed `Catch Counter`
  condition and a renamed `Siltstalker Leviathan` grid type, whose old committed
  filenames no longer match the live compendium's current document names - are the same
  underlying "source JSON is stale relative to the live packs" issue, just smaller in
  scope.)
- Confirmed `.github/workflows/main.yml` still matches what chunk 1 recorded
  (`checkout@v4`, `LICENSE.txt`, `template.json` still zipped pending §2).

No further code changes needed beyond the `roll-table.js` fix above - chunk 1 remains
otherwise verified correct. `npm run lint`/`npm install` are no longer blocked in this
environment and should be part of routine verification for every future chunk.
