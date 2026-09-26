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

## Chunk 4: §7 ApplicationV2 migration, steps 1-6

Converted every non-sheet application in the codebase (dialogs, file/data-file managers,
the grid hover HUD) plus the grid DOM helpers they depend on, following the plan's own
step order (small to large) across four commits. `HLMActorSheet`/`HLMItemSheet` remain
ApplicationV1 - that's steps 7-8, a later chunk - so every touched class that has a
still-V1 caller or sibling was bridged rather than assumed converted; each is called out
below.

**Step 1 - `ConfirmDialog`:** internals rewritten onto `DialogV2.confirm({window:{title},
content, rejectClose:false})` (signature confirmed against the real v14 docs' own worked
example). Public constructor API (`title, content, callbackAction, args`) unchanged, so
`items-manager.js`/`fsh-manager.js`'s call sites needed no edits. Dismissing the dialog
(closing without a button) now explicitly invokes `callbackAction(false, args)` rather
than never firing at all (the old AppV1 `Dialog` only invoked a button's own callback) -
a deliberate small behaviour change, since leaving a promise permanently unresolved is
worse than treating "dismissed" as "cancelled", and every caller's callback already
no-ops on `false`.

**Step 2 - `HLMApplication` base:** `HandlebarsApplicationMixin(ApplicationV2)`; the
loading-overlay helpers (`startLoading`/`updateLoadingMessage`/`stopLoading`) now query
`this.element` instead of the global `document`, per the plan's general rule (these ids
only ever exist inside `fsh-manager.html`, so this was already fragile - just not
previously flagged as a bug since only one app instance ever rendered that markup at a
time).

**Step 3 - `IntroDialog`, `ReserveApDialog`, `NarrativeRollDialog`, `RollDialog`:**
`static DEFAULT_OPTIONS`/`PARTS`; `getData` -> `_prepareContext`; `activateListeners(html)`
-> `_onRender(context, options)` using `this.element` and native `addEventListener`;
`.btn` clicks -> `data-action`/`actions` map (static private methods, framework-bound
`this`); jQuery `.click()`-simulated checkbox/radio pre-ticking replaced with
`{{checked ...}}`/the existing `{{#ifcond}}` helper directly in the templates, which also
meant actually wiring `context.focused`/`context.difficulty` into `_prepareContext` (the
old code computed `this.focused`/`this.difficulty` but only ever *simulated a click* to
reflect it in the DOM - the template itself never received the value). Removed `<form>`
wrappers from every template that doesn't submit data, per the plan's general rule.
**Deliberately did not move `this.render(...)` out of these constructors** despite the
plan's general suggestion to do so: `RollDialog`'s return value from `new RollDialog(...)`
is exactly what `game.rollHandler.startRollDialog(...)` returns, which is one of the
system's frozen public-API methods (token-action-hud-FG calls it directly, per this plan's
own guiding decisions section) - keeping `render()` inside the constructor preserves that
return value's synchronous availability with zero call-site changes anywhere, which is
lower-risk than restructuring every call site to await a separate `.render()` call.
**Deliberately preserved, not fixed,** two bugs plan §10 already tracks for a later,
dedicated chunk: `NarrativeRollDialog`'s `additional`/`additionalLabels` mismatch (the
"other" input's change handler and `calculateDieTotal()` both use `this.additional`, but
`triggerRoll` checks `this.additionalLabels`, which is never actually updated - so the
"other" bonus box's value never reaches the actual roll) and `LabelRollElement` being
constructed with 2 arguments when its constructor only takes 1. Both bugs are inside code
this chunk otherwise rewrote, but fixing them isn't a mechanical migration change - it
needs a decision about what the intended combined behaviour actually is - so they were
carried over exactly as before.
`Utils.activateButtons` (used across all four dialogs plus the not-yet-converted
`actor-sheet.js`) now takes an `HTMLElement`; the one remaining jQuery caller bridges with
`html[0]`.

**Step 4 - `FileUploader`, `FshManager`:** same `DEFAULT_OPTIONS`/`PARTS`/`_prepareContext`/
`_onRender`/actions-map treatment. **Real pre-existing bug found and fixed while
converting `activateListeners`:** `FileUploader`'s constructor defaults `options` to
`null` and line 49's old body read `this.uploaderOptions.importNameOption` with no
optional chaining (unlike line 13, which does use `?.`) - `fsh-manager.js:131`'s
`new FileUploader(this)` call passes no options at all, so every time a user clicked
"Add new" in the FSH manager (the plain, no-target-file upload path), rendering the
uploader dialog threw `TypeError: Cannot read properties of null`. Fixed by adding the
missing `?.`, matching the already-correct line 13. `FshManager.isOpen` - previously a
manually-toggled `static` field that could drift from reality (e.g. if `close()` was
never reached on an error path) - is now a getter backed by the real
`foundry.applications.instances` registry (confirmed a real `Map<string, ApplicationV2>`
against the docs) keyed by a fixed `static ID`, so no external caller
(`fathomlessgears.js`'s intro dialog flow, the compendium sidebar button) needed to
change since the read-only `FshManager.isOpen` access pattern itself is unchanged.

**Steps 5-6 - `GridHoverHUD` and the grid DOM helpers:** `GridHoverHUD` ->
`HandlebarsApplicationMixin(ApplicationV2)` with `window: {frame: false, positioned:
false}` (both confirmed real `ApplicationWindowConfiguration` fields; position stays
CSS-driven via the existing `gridHUDPosition`-derived class, matching prior behaviour -
no `position:` width/height carried over since `positioned:false` makes JS-driven
positioning inert anyway). `this.object` -> `this.actor` throughout (this class, its
module-level helper functions, and every external reader - checked, there were none
outside this file). `this.closing` (an AppV1-only property this class only ever *read*,
never set - it's core's own internal flag) doesn't exist on `ApplicationV2`; replaced with
`this.state === this.constructor.RENDER_STATES.CLOSING`. `RENDER_STATES` itself is
confirmed real (`Record<string, number>`, "the sequence of rendering states that describe
the Application life-cycle"), but TypeDoc doesn't expose an object literal's member names
for a value marked `= ...`, so the exact key `CLOSING` couldn't be doc-confirmed the way
almost everything else in this migration has been - this relies on long-standing,
stable Foundry convention instead (unchanged since AppV1's own `RENDER_STATES`) and needs
a live-client check, flagged below.
`Grid#activateListeners` (`grid-base.js`) now takes an `HTMLElement`
(`querySelectorAll`/`addEventListener`) instead of jQuery `.find().click()`;
`grid-space.js` needed no changes at all (already fully native DOM from chunk 1).
The one remaining V1 caller (`actor-sheet.js`, not converted until a later chunk) bridges
with `html[0]`, and - since `Grid#activateListeners` now returns a raw `HTMLElement`
instead of the jQuery object it received - the caller no longer reassigns `html` to its
return value (the old reassignment was already a no-op passthrough, since the old
implementation just returned whatever jQuery object it was given).
Also fixed, per chunk 1's own explicit deferral note ("these become closeActorSheetV2 /
closeApplicationV2 ... in the §7 AppV2 chunk"): kept the V1 `closeApplication` hook
registration (still needed - `HLMItemSheet` is V1 until a later chunk and has no other
listener covering it) and added a `closeApplicationV2` registration alongside it, so the
grid HUD still clears when any of the newly-V2 dialogs/managers this chunk converted are
closed. `closeActorSheet` is untouched (`HLMActorSheet` itself isn't V2 yet).

**New, unrelated-to-migration bug noticed, deliberately not fixed:**
`checkShowGridRequirements`'s `setTimeout` callback is a plain `function () {...}`, not an
arrow function, so `this.lock` inside it doesn't refer to the `GridHoverHUD` instance (it
was already broken this way before this chunk touched anything nearby, and the chunk's
changes don't require touching this method's body at all). Likely means the "else" branch
always treats the HUD as unlocked regardless of actual lock state. Flagged here rather
than fixed, matching the same "pre-existing, unrelated design/logic bug -> document, don't
fix mid-migration" precedent set for the `NarrativeRollDialog` bugs above and the
`string_id` collision gap from chunk 3.

**Verification:** `npm run lint` clean and `npx prettier --check` clean after every
commit in this chunk, full `src/` `.mjs`-copy syntax sweep clean, every touched Handlebars
template precompiled without error via a temporary, unsaved `npm install handlebars`
(removed again immediately after each check - never touched `package.json`).

**Still needs, per §12 and the doc-verification gaps above:**
- A live client to confirm `RENDER_STATES.CLOSING` is the correct member name (checked via
  established convention, not TypeDoc, since TypeDoc doesn't expose enum member names for
  a static property whose initializer is elided as `= ...`).
- Confirm `window.title` string options (e.g. `"INTRO.title"`, `"RESERVEDIALOG.name"`)
  are lazily localized by core at render time rather than needing
  `game.i18n.localize(...)` applied eagerly in `DEFAULT_OPTIONS` - assumed based on
  established ApplicationV2 convention (raw localization keys are the norm across core
  and every major system), not confirmed via TypeDoc (which only documents the `title`
  accessor's return type, not its localization behaviour).
- All of §12's dialog/HUD-relevant test items: FSH manager import/update/delete + intro
  dialog flow, sidebar/token hover -> grid HUD, `G` lock, HUD position setting, all roll
  types' dialogs (attribute, reel, narrative, tag), pop-out behaviour.

## Chunk 4 code review (finding, fixed; two flagged, no action needed)

Ran `/code-review` (high effort) against all five chunk 4 commits. Three findings came
back:

1. **Real regression, confirmed and fixed:** `ConfirmDialog`'s `showDialog()` call to
   `DialogV2.confirm(...)` didn't pass `yes`/`no` button-label overrides, so every caller
   (e.g. `items-manager.js`'s "Override Imported Data" prompts) fell back to
   `DialogV2.confirm`'s own default button text instead of the original "Confirm"/"Cancel"
   wording the old `Dialog` implementation set explicitly. Confirmed the fix's shape
   against the real docs: `confirm()`'s own doc text documents `yes`/`no` as valid
   top-level config keys ("Options to overwrite the default yes/no button configuration"),
   and `DialogV2Button` confirms `label: string` is the field to override. Fixed by adding
   `yes: {label: "Confirm"}, no: {label: "Cancel"}` to the `confirm()` call.
2. **Already tracked, no new action:** the review independently re-found
   `NarrativeRollDialog`'s `additional`/`additionalLabels` mismatch - this is the exact bug
   chunk 4's own dev-log entry (step 3, above) already documented as deliberately
   preserved rather than fixed, pending the dedicated plan §10 cleanup chunk. Re-confirmed
   the reasoning still holds; no code change from this review pass.
3. **Considered, declined:** the review suggested extracting the repeated
   `querySelectorAll(sel).forEach((el) => el.addEventListener(type, handler))` pattern
   into a shared `Utils` helper. Checked the actual spread: it's only 4 call sites across
   2 files (`roll-dialog.js`, `narrative-dialog.js`) - `reserve-ap-dialog.js`/`uploader.js`
   use single-element `querySelector`, a different (simpler) shape, so the duplication is
   narrower than the review's phrasing suggested. Declined per this project's own stated
   preference for avoiding premature abstraction over a handful of similar lines; each
   site's selector, event type, and handler body already differ enough that a generic
   wrapper would save little while adding a new API surface to maintain.

Re-verified after the fix: `npm run lint` clean, `npx prettier --check` clean.

## Chunk 5: §7 ApplicationV2 steps 7-8 (item/actor sheets) + §8 CSS

**Step 7 - `HLMItemSheet`:** trivial, as the plan predicted - this sheet is still a
placeholder stub ("Item sheets coming soon"). `HandlebarsApplicationMixin(ItemSheetV2)`,
`tag: "form"` + `form: {submitOnChange: true}` replacing the template's own `<form>`
wrapper.

**Step 8 - `HLMActorSheet`:** the largest single file in this migration (529 lines, two
~130-250 line templates, ~9 partials). Converted whole in one pass since the base class
change (AppV1 -> AppV2) makes an incremental per-method migration impossible - every
`activateListeners`/`getData` caller had to move together.

- `static PARTS = {fisher: {...}, fish: {...}}`, filtered down to the one matching
  `this.actor.type` in `_configureRenderParts` (per the plan). This method isn't
  independently doc-verifiable - `HandlebarsApplicationMixin`'s own returned class has no
  TypeDoc page at all (same gap chunk 4 hit for `RENDER_STATES`) - so this relies on
  established, stable Foundry v12+ system convention, not a confirmed doc reference.
  Flagged below for a live-client check.
- `getData` -> `_prepareContext`, `activateListeners(html)` -> `_onRender(context,
  options)`. `_getSubmitData` -> `_prepareSubmitData` (confirmed signature via docs:
  `(event, form, formData: FormDataExtended, updateData?)`), rewritten to use
  `foundry.utils.getProperty`/`setProperty` with the same dotted paths instead of direct
  bracket access, since `formData` is no longer guaranteed flat like `_getSubmitData`'s
  old return value was.
- **Per the plan, removed the direct `calculateBallast()`/`calculateAttributeTotals()`/
  `this.render()` calls from the submit path.** Confirmed exactly why this was a bug, not
  just cosmetic: `Actor#prepareDerivedData` already recomputes ballast on every data
  access (`actor.js:67`), so the manual `calculateBallast()` call was pure waste - but
  `calculateAttributeTotals(updateSource=true)` (the default) calls `this.update(...)`
  *internally* (`actor.js:368`), meaning the old submit path triggered a **second, real
  database update** on top of the form's own submitted update, every single time any field
  changed. Removing these calls is a real bug fix, not just avoiding a redundant render.
- ~40 `html.find(...).click(...)` bindings -> the `actions` map the plan names almost
  verbatim (`roll`, `breakInternal`, `postItem`, `resetManeuvers`, `hitLocation`, `scan`,
  `import`, `manualSetup`, `toggleManeuver`, `meltdown`, `postFrameAbility`, `toggleInjury`,
  `narrative`, `editHistory`, `historyUp`, `historyDown`, `historyDelete`, `injury`,
  `touch`, `repairs`), plus one the plan doesn't mention (`switchTab` - see tabs, below).
  Handlers that used to read `event.target.dataset.id`/`event.target.closest(...)` now
  read from the action dispatcher's own `target` parameter directly (confirmed via docs:
  "the capturing HTML element which defined a `[data-action]`" - i.e. already the correct,
  closest-matching ancestor), which let several handlers (`historyUp`/`historyDown`/
  `historyDelete`) drop their manual `.closest(".history-cover-button")` call entirely.
- **Images (`data-edit="img"`/`system.pilot_portrait`/`system.grid`):** added
  `data-action="editImage"` alongside the existing `data-edit`. Confirmed via docs, not
  guessed - `DocumentSheetV2`'s own `DEFAULT_OPTIONS.actions` already includes a built-in
  `editImage: (event, target) => void|Promise<void>` handler, inherited automatically; no
  code needed on this class's side beyond the template attribute.
- **Biography editor: plan predicted a change here that real docs show is unnecessary.**
  The plan said `{{editor}}` needs replacing with a raw `<prose-mirror>` element. Checked
  the live v14 docs' `foundry.applications.handlebars.editor` function page directly: the
  `editor` Handlebars helper still exists in v14, with the exact same signature
  (`content, {button, class, collaborate, editable, engine, target}`) already used in
  `fisher-sheet.html` unchanged. Left this template call exactly as-is - a clean example of
  why checking the plan's own prose against real docs matters even late in a migration.
- **Tabs: deliberately did NOT use `ActionsV2`/`static TABS`'s built-in tab machinery,**
  despite the plan suggesting `static TABS = {primary: {tabs: [...], initial: "gear"}}`.
  Reasoning: the exact wiring convention (`data-group`/`data-tab`/whether `data-action:
  "tab"` is a framework-reserved action name) isn't in TypeDoc at all - it's exactly the
  class of thing the migration reference doc flags as unconfirmable this way (compiled
  template/DOM behaviour, not a JS signature) - and getting it wrong would be a severe,
  instantly-visible failure (no tab content would ever be reachable). Checked this
  system's own CSS first and found **no** `.tab:not(.active) {display:none}` rule
  anywhere - meaning tab visibility already depended on some hide/show mechanism this
  system's own stylesheets don't define, so relying on an unconfirmed *framework*
  mechanism to fill that gap felt too risky to ship blind. Implemented a small, fully
  self-contained hand-rolled tab switcher instead: `switchTab` action stores
  `this.activeTab` on the sheet instance, toggles `.active` on every `[data-tab]` element
  via `_syncActiveTab()` (called from `_onRender` so it survives re-renders), and a new
  `.tab:not(.active) {display:none}` CSS rule (§8, `sheet.css`) makes that toggle actually
  hide content - the exact same effect `static TABS` would have provided, but entirely
  driven by code in this diff rather than an unverified core mechanism. Fish sheets have
  no tab markup at all, so this is inert for them.
- **Real bug found and fixed while doing the required `document`/`querySelector`
  conversion:** `toggleInternalBrokenDisplay` called `document.querySelector(selector,
  ".card")` - a **second argument `querySelector` doesn't accept at all** (silently
  ignored by the real DOM API). Since `.card`/`.break-button`/`.post-button` all carry the
  *same* `data-id` on a given internal (per `internal-partial.html`), the single-argument
  selector `[data-id=id${uuid}]` always matched the outermost `.card` element first,
  regardless of which of the three lines was "supposed" to target the break/post buttons -
  so 2 of these 3 lines were toggling the wrong element's classes the entire time. Since
  converting to `this.element.querySelector(...)` requires collapsing to one valid
  selector regardless, wrote the combined selectors that actually match driver intent
  (`` `[data-id=id${uuid}].card` ``, `` `[data-id=id${uuid}].break-button` ``, etc.) - this
  isn't a judgment call the way the narrative-dialog/string_id bugs were; there's no valid
  way to "faithfully preserve" a bug caused by passing a nonexistent argument to a real Web
  API.
- **Second bug found and fixed the same way:** `if (this.type == ACTOR_TYPES.fish)` inside
  the rollable-attribute-styling loop - `this.type` doesn't exist on an ActorSheet
  (V1 or V2); every other reference to the actor's type in this same file correctly says
  `this.actor.type`. Since `this.type` is always `undefined`, this branch (adding
  `btn-dark` to fish attribute buttons) has never actually run. Fixed to `this.actor.type`
  while rewriting this exact loop for the `_onRender` conversion anyway.
- **`gearwright-actor.js`:** replaced both `document.querySelector("#HLMActorSheet-Actor-
  ${actor._id}")` calls (fragile - depended on AppV1's own default element-id naming
  convention, which V2 may not reproduce identically) with `actor.sheet?.element?.classList`,
  per the plan.
- **Sheet registration:** `foundry.documents.collections.Actors.registerSheet(...)` now
  passes `{types: ["fisher", "fish"], makeDefault: true}` (previously no `types` filter -
  harmless before since this was the only registered Actor sheet anyway, but now explicit
  per the plan).
- **`grid-hover.js` hook cleanup:** with both `HLMActorSheet` and `HLMItemSheet` now
  ApplicationV2, there is no V1 application left anywhere in this codebase. Removed the
  now-permanently-dead `closeApplication` (V1 base hook) and `closeActorSheet`
  (ActorSheet-specific V1 hook) registrations chunk 4 had deliberately kept for exactly
  this not-yet-converted case; `closeApplicationV2` alone now covers every app in the
  system. `closeSettingsConfig` is untouched (core Foundry's own app, unrelated to this
  system's V1/V2 status).
- **§8 CSS:** added the `.tab:not(.active) {display:none}` rule described above
  (`sheet.css`, next to the pre-existing `.tab.active {height:100%}` rule). No other CSS
  changes were needed for this chunk specifically - the rest of §8 (core CSS variable
  migration, `@layer` interactions, Font Awesome 7 icons, dark theme) is unrelated to the
  sheet conversion and remains open for a dedicated pass.

**Verification:** `npm run lint` clean, `npx prettier --check` clean, full `src/`
`.mjs`-copy syntax sweep clean, every touched template (both sheets + all 9 modified
partials) precompiled without error via a temporary, unsaved `npm install handlebars`.

**Still needs, per §12 and the doc-verification gaps above (this is the single riskiest
chunk in the whole migration to skip live-testing):**
- The hand-rolled tab switcher's actual visual behaviour (gear/character tabs show/hide
  correctly, survive re-render, default to "gear").
- `_configureRenderParts` is the correct hook name for per-instance PARTS filtering
  (established convention, not TypeDoc-confirmed).
- Whether dynamically adding `data-action="roll"` to attribute `.name-box` elements inside
  `_onRender` (rather than baking it into the template) is picked up by the actions
  dispatcher - this assumes the framework uses one delegated click listener checking
  `event.target.closest("[data-action]")` at click time (not a one-time scan at initial
  render), which is standard event-delegation practice but not something TypeDoc's
  signature-only reference can confirm.
- The `editImage` built-in action actually opens the FilePicker and updates
  `img`/`system.pilot_portrait`/`system.grid` correctly for all three image fields.
- Every action in the ~20-entry map, the drag/drop flow (`_onDropItem` receiving an
  already-resolved `Item` instead of raw drop data), and the Gearwright import flow
  (`waiting` class toggling via `actor.sheet?.element`).
- Existing world actors (fisher and fish) open correctly with data intact after this
  conversion, per §12's final test-matrix item.

## Chunk 5 continued: rest of §8 CSS

**Real regression found and fixed, caused by this chunk's own earlier work:** removing the
templates' `<form class="... fish">`/`<form class="... fisher">` wrapper (needed because
AppV2 supplies the form via `tag: "form"` at the *outer* app frame) also deleted the only
element carrying the `fish`/`fisher` class - and `sheet.css`'s entire per-type colour theme
(`.fathomlessgears.sheet { & .fish {...} & .fisher {...} }`, ~24 custom-property
overrides) is scoped as a *descendant* selector expecting that class on an *inner* element,
not the outer frame. Restored it by wrapping each template's content in a plain
`<div class="fish">`/`<div class="fisher">` (a div, not a new `<form>`, since the outer
frame already provides the real form). Also fixed the same class of bug in
`utils.css`: `.fathomlessgears form {height:100%}` no longer matched anything (the outer
frame is now *simultaneously* `.fathomlessgears` and a `<form>` on the same element, not a
descendant relationship), rewritten as `.fathomlessgears.sheet {height:100%}` - scoped to
sheets specifically, not dialogs, since only the actor/item sheets carry the `"sheet"`
class.

**Design question resolved with the maintainer, not guessed:** `theme.css` redefines
roughly 50 of Foundry core's own CSS custom property names (`--color-*` plus
`--sidebar-*`/`--hotbar-*`/`--z-index-*`, unscoped at `:root`) with this system's own
palette and sizes - not confined to this system's own sheets, but affecting the whole
Foundry client (sidebar, hotbar, chat, any other module's dialogs). The plan's §8 item
assumed this was an accidental name collision and said to rename everything to
system-scoped names (`--fg-*`) so v13/v14's own theming isn't disturbed - but doing that
as written would have reverted the *entire client's* look to core's default everywhere
outside this system's own sheets, which only makes sense if the original global override
was accidental. Asked the maintainer directly rather than guessing at intent: confirmed
this is a deliberate whole-client reskin, kept as-is, no renaming performed.

**Real, unresolved v13/v14 compatibility risk surfaced by the above, flagged not fixed:**
v13+ auto-wraps every system stylesheet in `@layer system` (already noted as a general
risk in chunk 1's dev log entry). If core's *own* `:root`/`.theme-light`/`.theme-dark`
variable definitions for these same `--color-*` names live in an unlayered or
higher-priority layer than `@layer system`, this reskin's global `:root` override could
silently lose the cascade and stop working entirely under v13/v14, regardless of the
"keep it" decision above - this is a structural question about how the *mechanism* the
reskin depends on interacts with a real v13/v14 change, not a scope/intent question, and
TypeDoc (a JS API reference) has no way to answer it. Could not resolve this without
either Foundry's actual core CSS source or a live client to inspect computed styles -
flagged here as the **highest-priority visual check** for this chunk's §12 testing:
confirm the system's custom colours (not core's v13/v14 defaults) are what actually renders.
- Added `"themed", "theme-light"` to every sheet/dialog's `classes` (actor sheet, item
  sheet, all four dialogs, FshManager, FileUploader - not `GridHoverHUD`, which is a
  frameless HUD overlay the concept doesn't apply to), per the plan's explicit
  recommendation. This forces a consistent light-mode baseline for anything this system's
  *own* CSS doesn't explicitly style (native form control chrome, etc.) regardless of the
  user's OS/core dark-mode preference - complementary to, not a replacement for, the kept
  whole-client reskin above. Exact class names (`themed`/`theme-light`) aren't
  TypeDoc-verifiable (a CSS/DOM convention, not a JS API) - matches the plan's own stated
  knowledge, flagged for a live visual check.
- **Font Awesome:** `narrative-dice-partial.html`'s `fa-unlock-alt` (an FA5 alias) ->
  `fa-lock-open` (stable across FA5/6/7), exactly as the plan named. Checked
  `grid-space.html` (no icons at all) and `history-table.html`/`history-list-item.html`
  (chevron/trash/pen/xmark - all stable, non-aliased names, nothing to rename). Can't
  verify rendered glyph *width* differences between FA6 (this system's configured
  `--font-awesome` family) and FA7 (bundled with v14) without a live client - flagged, not
  fixable from source alone.
- **FSH manager sidebar button:** fixed a real, concrete bug found while looking at this -
  the button's icon `<i>` element had a sizing class (`i--s`) but no actual icon glyph
  class at all, so no icon has ever rendered, just the "FSH Manager" text. Added
  `fa-solid fa-file-import`. Added a small `.fsh-content-manager-button` CSS rule
  (flex layout, centered icon+label) preserving the existing `flex-basis:100%` full-width
  row placement. Exact pixel-parity with v13/v14's real header-action button padding/
  colours needs a live client - this is a bounded, low-risk cosmetic improvement, not a
  verified visual match.
- Verified every CSS file (touched or not) still parses with a nesting-aware parser
  (`postcss` + `postcss-nested`, installed temporarily and removed again) - the project's
  existing CSS uses modern nesting syntax that older/simpler CSS parsers (e.g. the plain
  `css` npm package) can't parse at all, which is worth remembering for any future CSS
  verification in this repo: reach for a nesting-aware parser, not a bare brace-count or a
  legacy CSS-parsing package.

**Verification:** `npm run lint` clean, `npx prettier --check` clean, full `src/`
`.mjs`-copy syntax sweep clean, all touched templates precompiled without error, all CSS
(touched and untouched) parses cleanly with `postcss`+`postcss-nested`.

This closes out chunk 5 (plan §11 item 5: §7 steps 7-8 + §8) in full.

## Chunk 5 code review (two fixed, two false-positive/pre-existing)

Ran `/code-review` (high effort) against all three chunk 5 commits. Four findings came
back:

1. **Real regression, confirmed and fixed:** removing the templates' own
   `<form autocomplete="off">` wrapper (both sheets *and* `HLMItemSheet`) dropped
   `autocomplete="off"` entirely, since the real `<form>` is now the outer ApplicationV2
   frame (`tag: "form"`), which nothing set that attribute on. Fixed by setting
   `this.form.autocomplete = "off"` in `_onRender` on both sheet classes (`this.form` is
   the real, confirmed-via-docs accessor for the top-level form element) -
   `HLMItemSheet` didn't have an `_onRender` override before this, so one was added just
   for this line.
2. **Real inconsistency, considered, reverted to a different fix:** `deleteItem` was the
   one handler left in the old instance-method/`event.target` shape while every sibling
   was rewritten to the static `#onX(event, target)` actions pattern. First tried
   converting it to match (`static #onDeleteItem`) for consistency - but it's not wired to
   any `actions` entry (the `.delete-item`/`.delete-overlay` UI it would serve is
   HTML-commented-out in every partial, deliberately disabled, same as before this
   migration), and ESLint's `no-unused-private-class-members` correctly flagged the
   resulting private method as genuinely dead code. Reverted to keeping it a plain public
   method instead - forcing dead code into the "active" pattern's clothes just to look
   consistent would have been worse than leaving it honestly distinct, and a lint
   suppression comment to justify that would have been worse still.
3. **Pre-existing, not this chunk's doing, no action taken:** `toggleInternalBrokenDisplay`
   has no callers anywhere in the codebase - confirmed via repo-wide grep, and confirmed
   this was *already* true before this migration touched it (`items-manager.js`'s
   `toggleInternalBroken` only ever calls `app.render()`, never this method). The
   `.card`/`.break-button`/`.post-button` `querySelector` bug fixed earlier in this chunk
   was a real, worthwhile fix regardless (turning invalid API usage into valid,
   correctly-scoped selectors), but the method it's part of was already unreachable
   beforehand - not something to delete as part of a version-compat migration pass.
4. **Partial false positive:** flagged `context.owner`/`context.editable` as computed
   every render but unused by any touched template. Checked directly:
   `fisher-sheet.html`'s `{{editor ... editable=editable}}` call *does* consume
   `editable` (a real, documented `editor` helper parameter) - only `owner` is genuinely
   unconsumed (`editor`'s real parameter list has no `owner` field), and that specific
   `owner=owner` template reference already existed, unchanged, before this migration
   touched the file. Not a regression from this chunk; left as-is.

Re-verified after the two fixes: `npm run lint` clean (including the
`no-unused-private-class-members` check that caught the reverted attempt), `npx prettier
--check` clean, both touched files pass the `.mjs` syntax check.

## Chunk 6: §10 cleanup (final code chunk)

The last plan §11 item within this workspace's reach (§9, `token-action-hud-FG`, is a
separate repo not present here - left entirely untouched). Worked through every §10 bullet:

- **`elevationruler.active` throwing:** already resolved as a side effect of §6 deleting
  `configureElevationRuler` entirely back in chunk 2 - nothing left to do here.
- **`conditionListReady` listener leak, fixed:** `HLMActor#prepareDerivedData` registered
  a *new* `Hooks.on("conditionListReady", ...)` listener on every single data-preparation
  cycle, for every actor, and never removed any of them - since `prepareDerivedData` runs
  constantly for the lifetime of a client session (every update, every render, every
  derived-data access) while `conditionListReady` itself only ever fires once (at world
  `ready`), this was pure unbounded listener accumulation for the rest of the session, with
  no corresponding benefit (all the excess copies simply never fire again once the one-shot
  hook has fired). Replaced with a single global listener (`fathomlessgears.js`, registered
  once at `init`) that iterates `game.actors` plus any currently-placed tokens' synthetic
  actors (`canvas.tokens.placeables`) and calls `applyConditions()` on each - matching the
  original per-instance registration's actual coverage (world actors and unlinked-token
  synthetic actors alike) without the leak.
- **`narrative-dialog.js` bugs, fixed** (deliberately left alone in chunk 4 pending this
  dedicated chunk): traced where `modifierStack` - the array the buggy code was trying to
  push an extra entry onto - actually ends up. It's never rendered anywhere;
  `roll-handler.js`'s `rollNarrative` only reads `rollParams.dieTotal` (which
  `calculateDieTotal()` *already* correctly folds `this.additional` into) to decide how
  many dice to roll, and only `console.log`s `modifierStack.length` otherwise. So the
  "other" input's actual functional effect on the roll was never broken - only the
  cosmetic, never-displayed modifier-stack entry was. Fixed anyway for correctness and
  future maintainability: renamed the dead `additionalLabels` field to `additional`
  (matching what the UI listener and `calculateDieTotal()` already used), and fixed the
  `LabelRollElement` call to pass its one real constructor parameter (a name string,
  e.g. `"Other: 3"`) instead of two arguments to a one-argument constructor.
- **`fathomlessgears.js` `ready`-hook cleanup, all fixed:**
  - `game.keybindings.initialize()` removed (core already does this itself after `init`).
  - `gridCollection.configure({ownership: ...})` now runs only for `game.user.isGM` -
    previously every connected client redundantly reconfigured the same world-level
    compendium setting.
  - All five `game.settings.register(...)` calls moved from `ready` into the existing
    second `init` hook (alongside the `pinGrid` keybinding registration); only the
    corresponding `game.settings.get(...)` reads and the intro-dialog decision they feed
    stayed in `ready`, since those still need world data to be loaded.
- **`string_id` collision reminder: surfaced**, as its own bullet explicitly asked for once
  the plan was otherwise finished (see the plan document itself, and the end of this
  session's conversation) - not a code fix, a decision for the maintainer.

**Plan document reconciliation:** separately from the code changes above, went through
`documentation/foundry-v13-v14-migration-plan.md` itself and checked off every completed
item (the checkboxes had never been updated as chunks landed - only this dev log tracked
progress). Annotated every spot where the actual implementation differs from the plan's
original text, cross-referenced to the relevant dev-log entry above. Left unchecked, with
reasons: §9 (separate repo), three genuine "needs a live client" items (pack re-export,
v14 status-icon verification, the CSS `@layer` cascade-priority risk), and the two §8
CSS items the maintainer explicitly decided against.

**Verification:** `npm run lint` clean, `npx prettier --check` clean, full `src/`
`.mjs`-copy syntax sweep clean.

This is the final code chunk of the v13/v14 migration within this workspace's scope.
Everything remaining is either §9 (separate repo) or requires a live Foundry client this
sandboxed environment has never had access to at any point in this migration - see every
chunk's own "Still needs" list above, and the plan document's now-annotated checkboxes,
for the complete rundown.
