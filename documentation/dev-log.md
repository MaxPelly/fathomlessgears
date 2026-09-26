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

## Chunk 2: §5 active effects/token rendering + §6 movement ruler

Verified every version-sensitive API claim in these two sections against the real v14.365
docs (`https://foundryvtt.com/api/`) before writing code, per the migration reference doc's
own rule of thumb. Notably, `TokenRulerWaypoint` and its `measurement.cost` field aren't
linked from the docs' own class/module indexes (same gap already seen with
`CompendiumDirectory` in chunk 1) - found via the `TokenRuler` class page's own hyperlinks
into `types/foundry.types.TokenRulerWaypoint.html` rather than the site nav. Confirmed:
`Actor#appliedEffects` and `Actor#temporaryEffects` both exist on v14; `ActiveEffect#showIcon`
is a real schema field; `CONST.ACTIVE_EFFECT_SHOW_ICON` is `{NEVER:0, CONDITIONAL:1, ALWAYS:2}`
(default CONDITIONAL); `CONFIG.Token.rulerClass: typeof TokenRuler` exists;
`TokenRuler#_getGridHighlightStyle(waypoint, offset)` / `_getSegmentStyle(waypoint)` have
exactly the plan's assumed signatures; `waypoint.measurement.cost` is a real field on
`GridMeasurePathResultWaypoint`. TypeDoc only documents signatures, not method bodies, so
the *exact* internal logic of core's real `_drawEffects()` (e.g. whether the
`CONDITIONAL` branch's "does it get an icon anyway" check is exactly `isTemporary ||
statuses.size` as the plan asserts) couldn't be confirmed this way - implemented per the
plan's text, flagged below and already tracked as a required §12 live-client test.

**§5 active effects:**
- `active-effect.js`: `_onCreate`/`_onUpdate`/`_onDelete` now call `super` first, then
  `this.parent?.transferEffects?.()` (was unguarded `this.parent.transferEffects()` called
  *before* `super`) - guards the v14 case where an effect's parent can be a world/compendium
  document with no actor, and stops calling `super` after the side effect for no reason.
  Also gated the transfer on `args.at(-1) === game.user.id` (userId is always the last
  argument across all three lifecycle methods, despite their different arities) so a
  multi-client session doesn't have every connected client redundantly recompute the same
  actor's effect transfer.
- `token.js` `_drawEffects`: replaced the hand-copied-from-v12-core reimplementation with
  a thin wrapper that computes the system's filtered effect list once
  (`filterEffectList(getTokenEffectsToDraw(this))`), temporarily shadows the actor's
  `appliedEffects`/`temporaryEffects` getter (whichever the running version's core actually
  reads, feature-detected on `CONST.ACTIVE_EFFECT_SHOW_ICON`) with that pre-filtered list,
  and delegates to the real `super._drawEffects()` - this is the plan's explicitly
  "preferred" option over re-copying core's drawing body. `getTokenEffectsToDraw` (new,
  in `compat.js`) returns `actor.temporaryEffects` on v13 and, on v14,
  `actor.appliedEffects` filtered to `showIcon === ALWAYS`, or `showIcon === CONDITIONAL`
  effects that are temporary or carry a status - matching plan §5's stated safety net for
  duration-less `toggleStatusEffect` conditions.
  - **Caveat worth testing for, not fixed here:** this shadows an own-property on
    `this.actor`, which for a *linked* token is the same shared Actor instance across every
    placeable representing it. Foundry draws all placeables on a layer concurrently
    (`Promise.all`), so if two linked tokens of the same actor are redrawn in the same
    batch, there's a narrow window where one token's shadowed getter could theoretically be
    read while computing the other's effect list, temporarily showing the wrong filtered
    set (e.g. a ballast token flashing non-ballast icons) until the next redraw
    self-corrects it. This risk is inherent to the plan's own preferred design, not
    something avoidable without reimplementing core's `_drawEffects` body (the alternative
    the plan explicitly wanted to avoid) - flagged for the maintainer to watch for with
    duplicate linked tokens of the same actor during §12 testing, not blocking merge.

**§6 movement ruler:**
- Deleted `configureElevationRuler` and its `ready`-hook call entirely, along with the
  `game.modules.get("elevationruler").active` guard that would throw when the module isn't
  installed (this was also §10's first bullet - resolved as a side effect, as the plan
  itself predicted).
- Added `src/tokens/token-ruler.js`: `HLMTokenRuler extends
  foundry.canvas.placeables.tokens.TokenRuler`, overriding `_getGridHighlightStyle` and
  `_getSegmentStyle` to recolour (only the `color` field, preserving every other property
  `super()` returns) by comparing `waypoint.measurement.cost` against
  `actor.system.attributes.speed.total`: at/under 1x speed is blue (`#1a4e9d`), up to 2x is
  green (`#0e880e`), beyond is red (`#8c1818`) - same three thresholds and colours as the
  deleted Elevation Ruler configuration, now expressed through the real v14 ruler API
  instead of a third-party module integration.
- Registered `CONFIG.Token.rulerClass = HLMTokenRuler` in the `init` hook, alongside the
  other `CONFIG.Token.*` assignments.
- Bundled in the same commit: moved `CONFIG.statusEffects = foundry.utils.duplicate(conditions)`
  from the `ready` hook to `init` (plan §5's "consider" item) - safe because `conditions` is
  a plain imported array with no dependency on world data being loaded, unlike
  `discoverConditions()` (which needs `game.packs`, populated only from `setup` onward) and
  was deliberately left in `ready`.

**Verification:** `npm run lint` clean, `npx prettier --check` clean on all touched files,
full `src/` `.mjs`-copy syntax sweep clean, grepped for any leftover `elevationruler`/
`Color.from`/`configureElevationRuler` references (none). No `CONFIG.ActiveEffect.legacyTransferral`
change needed (plan confirms nothing to do there).

Still needs, per §12: confirm on both versions that status effects created via
`toggleStatusEffect` (no duration) still show token icons.

## Chunk 2 code review (findings + fixes)

Ran `/code-review` (high effort) against the chunk 2 commit before starting chunk 3, per
the maintainer's request. Both findings were confirmed real and fixed; both are more
serious than the caveats chunk 2's own dev-log entry had already flagged, so this section
replaces (not just supplements) that entry's "duplicate-linked-token race" caveat, which
turned out to understate the actual bug.

1. **Real bug, confirmed and fixed:** the new `_transferEffectsIfOriginatingClient` gate
   in `active-effect.js` (`args.at(-1) === game.user.id`) broke the ballast/character
   effect-transfer feature outright, rather than just having a narrow race. `Actor#transferEffects`
   (`src/actors/actor.js:155-160`) already has its own independent gate,
   `game.user.id == this.firstOwner().id` - `firstOwner()` returns whichever *player* owns
   the actor (falling back to the active GM only if no player does), which has nothing to
   do with who happened to make the particular edit that triggered the hook. Concretely: a
   GM toggling a condition via the token HUD on a player-owned actor fires the hook with
   `userId` = the GM's id on every client. The new outer gate meant only the GM's own
   client even attempted the call - but the GM usually isn't `firstOwner()` of a
   player-owned actor, so the inner check then failed there too, and the actual owning
   player's client was already filtered out by the outer gate before it ever reached the
   inner check. Net effect: the transfer silently never ran for the single most common way
   of toggling a condition. Fixed by removing the outer gate entirely and calling
   `this.parent?.transferEffects?.()` unconditionally after `super` on all three lifecycle
   methods, letting `firstOwner()`'s existing check be the sole gate again (exactly the
   pre-chunk-2 behaviour, just reordered to run after `super` and null-guarded for v14).
2. **Real bug, confirmed and fixed:** the "preferred" `_drawEffects` design (temporarily
   shadowing `appliedEffects`/`temporaryEffects` directly on the shared `Actor` document
   while awaiting `super._drawEffects()`) raced with more than just "two linked tokens of
   the same actor redrawing at once", as chunk 2's own caveat assumed - it also raced with
   `Actor#transferEffects` itself, which reads `this.appliedEffects` directly on that same
   actor (`actor.js:169`). Toggling a status effect on a linked token's actor fires both
   `_onCreate` (→ `transferEffects()`, reading `appliedEffects`) and a redraw of that
   actor's own token (→ `_drawEffects()`, shadowing `appliedEffects`) off the same change,
   with no ordering guarantee between the two - so the transfer could read this token's
   filtered subset instead of the actor's real effect list, corrupting what gets mirrored
   to the paired ballast/character actor. A same-actor-single-token repro, not just the
   duplicate-token edge case originally disclosed.
   - Considered a narrower fix (shadow `Token#actor` itself, via a
     `Object.create(actor, {...})` stand-in, instead of the shared actor's own property -
     confines the shadow to reads through this one token instance). Rejected: core's real
     `_drawEffects()` body is closed-source and undocumented at the implementation level
     (TypeDoc only has signatures - see the migration reference doc §2), so there's no way
     to confirm it wouldn't internally invoke some other actor method/getter with `this`
     bound to the stand-in: if that method touches a native private class field (`#foo`),
     it throws immediately, because a prototype-linked stand-in is not a real instance of
     the `Actor` class for private-field purposes. Verifying that risk away isn't possible
     without live core source or a running client.
   - Fixed instead by reverting to the plan's other explicitly-sanctioned option: kept
     `_drawEffects` as the same hand-rolled, pre-migration reimplementation it already was
     (never delegating to `super`, never touching the actor at all), only swapping its
     effect-list source to `getTokenEffectsToDraw(this)` in place of the old hardcoded
     `this.actor?.temporaryEffects`. No shared state is mutated, so the race is eliminated
     rather than narrowed. Trade-off (acknowledged, not fixed): this reimplementation's
     PIXI drawing mechanics (container clearing, z-ordering, `renderFlags.set`) are
     unverified against real v13/v14 core beyond "this is what already shipped before this
     migration" - same residual risk the plan's phrasing ("a copy of a core function")
     originally flagged, just no longer compounded by a new concurrency bug on top of it.

Re-verified after both fixes: `npm run lint` clean, `npx prettier --check` clean, both
touched files pass the `.mjs` syntax check.

## Chunk 3: §2 data models / `documentTypes` / `template.json` removal

This is the plan's own flagged highest-risk chunk ("turning a model on for existing data
will clean out any fields not in its schema"), so before deleting `template.json` every
default it provided was checked against the corresponding `defineSchema()`, and - because
`CONFIG.Item.dataModels`'s key mismatch meant `frame_pc`, `fish_template`, and
`history_event` have never actually had a model applied before now - their real data was
checked directly too, not just inferred from the plan's prose:

- **`frame_pc`:** not in source control (`src/packs/frame_pc/` is empty - see the "npm now
  available" session's finding about several packs never having been exported), so
  extracted the live compendium to a scratch path (`/tmp`, not `src/packs/`, specifically
  to avoid repeating that earlier LevelDB-housekeeping-noise mistake) and diffed all 13
  items' `system` keys against `HLMFrameModel`'s schema: exact match on every item
  (`source`, `attributes`, `core_integrity`, `repair_kits`, `weight_cap`, `gear_ability`,
  `gear_ability_name`, `default_unlocks`) - no field the schema would silently drop.
- **`fish_template`:** never comes from a compendium at all - `gearwright-actor.js`'s
  `applyTemplate` always constructs it as `{attributes: {}}` in code before creating the
  embedded item, which is exactly `HLMFishTemplateModel`'s schema shape. No legacy-data
  risk here at all, by construction.
- **`history_event`:** JSON *is* committed (`src/packs/injuries/`,
  `src/packs/touch_of_the_deep/`) - checked directly, no extraction needed. Exact match
  against `HLMHistoryModel` (`attributes`, `type`, `description`, `mechanics`).
- Fixed the key mismatch itself: `CONFIG.Item.dataModels` in `fathomlessgears.js` used
  `frame`/`template`/`history`, but the actual item types are `frame_pc`/`fish_template`/
  `history_event` - corrected to match, which is what actually turns these three models on
  for the first time.
- Added `documentTypes` to `system.json` per plan §2, but **not** verbatim from the plan's
  own drafted JSON snippet - that snippet marked `tag`, `condition`, `internal_pc`,
  `internal_npc`, `frame_pc`, and `size` as `{"htmlFields": ["description"]}`, but none of
  those six models actually define a `description` field (they use `text`, `action_text`,
  or nothing) - only `HLMHistoryModel` does. Confirmed via `item-sheet.html` too: no
  `description` field is rendered anywhere for those six types. The plan itself flagged
  this exact snippet as needing confirmation ("Confirm each type's `htmlFields` against
  whether its model defines `description`") - this was that confirmation, and it changed
  the result. Final `documentTypes`: only `Item.history_event` and `Actor.fisher` (which
  does have a real `biography` field, unlike `Actor.fish`, which doesn't) carry
  `htmlFields`; everything else is `{}`. `development`/`maneuver`/`deep_word`/`background`
  left schemaless per the plan's own recommendation (models as a future follow-up).
- Confirmed every Actor-side default template.json provided is either already expressed as
  a schema `initial:` (attributes, internals, `fisher_history` minus `touch`, `resources`,
  `downtime` minus `rollable`, `gridType`, `frame`, `gear_name`/`pilot_portrait` - just
  spelled with underscores instead of the old template's hyphens, `biography`) or is
  actually dead/superseded data with no live reader anywhere in `src/`/`templates/`:
  `fisher_history.touch` and `downtime.rollable` are unused (history is tracked via
  `history_event` embedded items, not this field; downtime rolls are tracked via the
  `labels` array, not `rollable`), and `has-interactive-grid` was already superseded by
  the `fathomlessgears.interactiveGrid` *flag* (not a system field) everywhere it's read.
- **Real pre-existing bug found and fixed, unrelated to the migration but directly in the
  path of this chunk's own "verify every default" check:** `fish-schema.js`'s `grid`
  field's `initial` value was `".../blank-grid.jpg"` - the **fisher's** default image, not
  `template.json`'s stated fish default (`".../blank-grid-fish.jpg"`). Since
  `CONFIG.Actor.dataModels.fish` has been active all along (unlike the Item mismatch
  above), this schema default has been live and wrong since the model was introduced:
  every new fish actor gets created showing the fisher mech's blank grid image instead of
  its own. Separately, the actual asset file on disk is `assets/blank-grid-fish.JPG`
  (capital extension) - `template.json` and `actor.js`'s `removeInteractiveGrid` both
  referenced the lowercase `.jpg`, which would 404 on any case-sensitive filesystem (i.e.
  most real Foundry hosting). Fixed both: `fish-schema.js`'s initial and
  `actor.js:removeInteractiveGrid`'s literal now both point at the real
  `blank-grid-fish.JPG`.
- **Real pre-existing bug found and fixed:** `item.js`'s `static migrateData(source)`
  checked `this.system` - inside a `static` method `this` is the `HLMItem` class itself,
  never an instance, so `this.system` is always `undefined` and the entire string_id
  backfill body has never executed. Rewrote to test `source.system?.string_id` instead
  (per the plan's own suggested fix), so items created without an explicit `string_id`
  (which is every item created via any of the `constructXData` helpers, all of which use
  the schema's `"-"` placeholder default) now actually get one derived from their name on
  load, as originally intended.
- Deleted `template.json`; removed it from `.github/workflows/main.yml`'s release-zip
  step (`README.md`/`LICENSE.txt`/etc. untouched).

**Verification:** `npm run lint` clean, `npx prettier --check` clean on all touched files,
full `src/` `.mjs`-copy syntax sweep clean, `system.json` re-validated as JSON after
editing. The `frame_pc` LevelDB inspection was done via a one-off `extractPack` call to a
`/tmp` scratch path specifically to avoid touching `packs/` at all (learned from the
earlier `pull-packs` LevelDB-housekeeping-noise incident), but even so `git status`
afterward showed the store's internal log/manifest files had rotated from just being
opened for reading - reverted with `git checkout`/`git clean` on that one pack directory
before committing.

**Still needs, per §12:** load a real (ideally v12-migrated) world containing `frame_pc`
and `history_event` items and confirm nothing is stripped in practice - this chunk's
static, cross-referenced-against-real-data verification is as far as this environment can
go without a live client, and the plan's own risk warning for this chunk specifically
calls for that live check before merging.

## Chunk 3 code review (finding, accepted as-is)

Ran `/code-review` (high effort) against the chunk 3 commit. One finding survived
verification, and was deliberately left unfixed after checking with the maintainer, since
it's a pre-existing design gap this chunk exposes rather than one it introduces:

- **`item.js`'s `migrateData` fix has no collision protection for its `string_id`
  backfill.** Making the (previously dead - see above) backfill actually run means any
  item whose `string_id` is still missing/`"-"` now gets
  `Utils.toLowerHyphen(source.name)` assigned, and that helper is a plain slugify with no
  uniqueness check. Two items sharing a name (most plausibly within the same compendium
  pack, since `findCompendiumItemFromId` - the one place `string_id` is actually looked up
  by - searches one pack's index at a time) would collide. Checked how bad this actually
  is in practice: every real `frame_pc`/`history_event` sample inspected for this chunk's
  own verification has **no** existing explicit `string_id` at all, meaning
  `findCompendiumItemFromId`'s lookup has presumably never successfully matched anything
  before now either (the same root cause - `migrateData` never ran) - so this fix doesn't
  introduce a new risk into previously-safe territory, it turns an already-dead lookup
  feature into a working one that also happens to lack collision-proofing, and both of
  those were already latent in `Utils.toLowerHyphen`/`findCompendiumItemFromId`, not
  written as part of this migration.
  **Decision (confirmed with the maintainer):** leave as-is. Redesigning `toLowerHyphen`/
  the lookup to be collision-safe is a content-integrity/product decision (what scope
  counts as a collision, how to disambiguate) independent of Foundry version compatibility,
  and out of scope for this migration pass. Flagging here for a future content-authoring
  or data-integrity pass, not blocking this chunk.
