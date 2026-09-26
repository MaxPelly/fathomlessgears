# Notes for the `token-action-hud-FG` v13/v14 migration

Written at the end of the `fathomlessgears` system's own v13/v14 migration (target:
Foundry 13.351 → 14.x, verified 14.368), for whoever picks up the companion
`token-action-hud-FG` module next. That work happens in a separate repository this
session had no access to, so everything below is what the *system side* can tell you
about the contract `token-action-hud-FG` depends on - not an audit of
`token-action-hud-FG`'s own code, which nobody working on this side has seen.

If you also have `documentation/foundry-module-migration-reference.md` from the
`fathomlessgears` repo (the reusable how-to for finding and reading Foundry's real
TypeDoc API docs, working around the `web.archive.org`/`WebFetch` block, and the
`.mjs`-copy syntax-check trick) - use it. It's not duplicated here.

## 1. What `token-action-hud-FG` actually needs to do (plan §9, unstarted)

This is the original plan's checklist for this module, carried over verbatim since none
of it could be started from the `fathomlessgears` workspace:

- [ ] `module.json`: `compatibility: {"minimum": "13.351", "verified": "14.368"}`;
      `relationships.requires` on `token-action-hud-core`:
      `{"minimum": "2.1.0", "verified": "2.1.1"}`; the `relationships.systems` (or
      equivalent) entry for `fathomlessgears` should point at the new system version this
      migration produces.
- [ ] `scripts/constants.js` (or wherever it lives in this module):
      `REQUIRED_CORE_MODULE_VERSION = "2"` - this should accept any `2.x` release of
      `token-action-hud-core` that is `>= 2.1`, since 2.1.x is the only `token-action-hud-core`
      line that supports v14 at all (per the dependency matrix below).
- [ ] Re-test every action category against the system's public API (§2 below): attributes,
      weapons/active/passive internals, maneuvers, deep words, conditions, utility actions.
- [ ] Optional: adopt `token-action-hud-core` 2.1's `hasContextMenu` feature for internals
      (e.g. break/repair actions surfaced from a context menu on the HUD button, instead of
      needing to open the sheet).
- [ ] Release this module before or together with the `fathomlessgears` system release,
      and bump the system's own `relationships.requires` minimum for
      `token-action-hud-FG` to whatever version comes out of this work (currently pinned
      at `0.6.0` in `fathomlessgears/system.json`, a pre-migration version - it was
      deliberately *not* bumped during the system migration because no compatible release
      of this module exists yet).

### Dependency matrix (from the system's own plan)

| Package | v13 | v14 | Manifest entry |
|---|---|---|---|
| token-action-hud-core | 2.1.x (min 13.351) | 2.1.x | `minimum: "2.1.0"`, `verified: "2.1.1"` |
| fathomlessgears (this system) | migrated, see below | migrated | `minimum:` whatever version this migration ships as |

## 2. The system's public API surface - verified stable across the whole migration

The system migration's own guiding rule was: **the following names, signatures, and
behaviours must not change**, because `token-action-hud-FG` calls them directly. Every
one of these was checked against the actual post-migration `fathomlessgears` source
immediately before writing this file (not just assumed from the original plan text) -
they are exactly as they were before the system's migration:

- **`game.rollHandler.startRollDialog(actor, attributeKey, itemId?, actionCode?)`**
  (`src/actions/roll-handler.js`). Still a 4-arg method (2 required, 2 optional),
  still returns the constructed `RollDialog` instance synchronously (this was
  deliberately preserved during the system's own `ApplicationV2` migration - the dialog
  class now internally uses `ApplicationV2`, but still calls `this.render({force:true})`
  from inside its own constructor rather than moving that call out to the caller, purely
  so this return value stays available exactly as before for anything depending on it,
  like this).
- **`game.hudActions`** (a `HUDActionCollection` instance, `src/actions/hud-actions.js`),
  methods and arities confirmed unchanged:
  - `weightTotal()` - no args, operates on `canvas.tokens.controlled`.
  - `createBallastTokens()` - no args, operates on `canvas.tokens.controlled`.
  - `rollNarrative(actor)`
  - `calculateRepairCost(speaker)`
  - `holdAp(actor)`
  - `scanTarget(speaker)`
  - `textAction(speaker, actionCode)`
- **`game.rollTables`** (a `RollTableHandler` instance, `src/actions/roll-table.js`):
  `rollInjury(actor)`, `rollTouch(actor)`, `rollMeltdown(actor)` - all unchanged. (This
  class's *internal* implementation changed during migration - it now reads
  `result.name` instead of the removed `result.text` field, and links items via
  `item.uuid` instead of a removed `result.documentCollection` field - but none of that
  is visible from these three public method signatures.)
- **`actor.shareFrameAbility()`**, **`actor.postItem(uuid)`**, **`actor.toggleScan()`**,
  **`actor.locationHitMessage()`** (all `src/actors/actor.js`) - unchanged.
- **`actor.itemsManager.clearConditions()`** (`src/actors/items-manager.js`) - unchanged.
- **`actor.itemTypes`** - this is Foundry's own core `Actor#itemTypes` getter, grouping
  embedded items by `type`. Not touched by this migration. The actual type strings you'd
  filter on (`internal_pc`, `internal_npc`, `maneuver`, `deep_word`, `condition`, `tag`,
  `frame_pc`, `size`, `grid`, `development`, `background`, `fish_template`,
  `history_event`) are all unchanged - the system migration fixed a *data model* wiring
  bug (`CONFIG.Item.dataModels` had the wrong keys for three of these types, meaning
  those three had no schema validation applied at all until this migration fixed it), but
  never renamed or restructured any of the type strings themselves.
- **`actor.system.attributes`** - the attribute schema (`close`, `far`, `mental`, `power`,
  `evasion`, `willpower`, `speed`, `sensors`, `weight`, `baseAP`, `ballast`, each shaped
  `{values: {standard: {base, additions[]}, bonus[], custom}, total, key}`) was not
  touched by this migration at all.
- **`game.tagHandler`** - a `MessageHandler` instance (`src/formatting/message-handler.js`).
  Exists, same global name. Its *internal* rendering pipeline changed substantially during
  migration (the `renderChatMessage` hook → `renderChatMessageHTML`, meaning its own
  listener-attachment code now receives a real `HTMLElement` instead of a jQuery object -
  see §3 below if `token-action-hud-FG` ever passes DOM nodes to any `game.tagHandler`
  method).
- **`game.gridHover`** - a `GridHoverHUD` instance (`src/tokens/grid-hover.js`). Exists,
  same global name. This class was fully converted from `ApplicationV1`
  (`Application`) to `ApplicationV2` during migration. Its public methods
  `assignActor(actor)`, `clear()`, `toggleLock()`, `refresh()` are confirmed unchanged in
  name, arity, and behaviour. Internally, `this.object` (the old AppV1-era property
  holding the currently-displayed actor) was renamed to `this.actor` - if
  `token-action-hud-FG` ever reads `game.gridHover.object` directly (rather than calling
  the methods above), that reference needs to become `game.gridHover.actor`.
- **`game.availableConditionItems`** - a `Map<statusId, Item>` populated by
  `discoverConditions()` at world `ready` (`src/conditions/conditions.js`). Structurally
  unchanged. Timing note: it's set synchronously to a `Map` at `ready`, but populated
  asynchronously shortly after (compendium documents load in the background) - this was
  already true before the migration and is unrelated to it.
- **Hook `conditionListReady`** - still fires exactly once, from `Hooks.callAll` in the
  system's `ready` hook, after `game.availableConditionItems` is (re)assigned. Unchanged
  in name and firing behaviour. (The system's own internal handling of this hook changed
  during migration - each actor no longer registers its own listener on every data-prep
  cycle, a leak that's now fixed with a single global listener - but this is purely
  internal and doesn't affect what firing `conditionListReady` looks like from outside.)

## 3. What actually changed in `fathomlessgears` that could matter if
   `token-action-hud-FG` does anything beyond the API surface above

If `token-action-hud-FG` sticks to calling the methods in §2, none of this should matter.
It's here in case it reaches further into the system than that (e.g. hooking into sheet
rendering directly, reading token/effect internals, or touching DOM the system's own
apps render).

- **Every application in the system is now `ApplicationV2`** (dialogs, the FSH manager,
  the grid hover HUD, and both the actor sheet `HLMActorSheet` and item sheet
  `HLMItemSheet`). If `token-action-hud-FG` ever hooks a `render<ClassName>` event for one
  of these, the hook fires under the *same* name it always did (Foundry's hook-naming
  mechanism is `render${ClassName}` based on the class's own name, not on which
  `Application`/`ApplicationV2` version it's built on), but the `html` argument passed to
  that hook is now a **raw `HTMLElement`**, not a jQuery object, for every one of these
  classes. Code written against the old jQuery-wrapped `html` (`html.find(...)`,
  `html[0]`) will break; use `html.querySelector(...)`/`querySelectorAll(...)` instead.
- **The actor sheet's internal DOM structure changed substantially.** Every button that
  used to be a bare CSS-class-matched element now carries a `data-action="..."` attribute
  (e.g. `data-action="roll"`, `data-action="breakInternal"`, `data-action="postItem"`,
  `data-action="toggleManeuver"`, `data-action="scan"`, etc. - see
  `src/sheets/actor-sheet.js`'s `DEFAULT_OPTIONS.actions` map for the full list of ~20
  action names if you need to cross-reference one). If `token-action-hud-FG` clicks
  elements on the rendered actor sheet DOM directly (rather than calling the system's own
  public methods), the exact selectors it targets may have changed - check against the
  current templates (`templates/fisher-sheet.html`, `templates/fish-sheet.html`, and the
  partials in `templates/partials/`) rather than assuming the old jQuery-era class names
  still work the same way structurally.
- **Tabs on the fisher sheet are hand-rolled, not framework-managed** (a deliberate choice
  - the plan originally suggested using `ApplicationV2`'s built-in `static TABS`
  mechanism, but its exact `data-action`/`data-group` wiring convention isn't documented
  in Foundry's TypeDoc reference at all, and getting it wrong would have been an
  instantly-visible, severe failure with no way to verify it without a live client). Tab
  state lives on `HLMActorSheet.activeTab` and switches via a `data-action="switchTab"`
  handler. The fish sheet has no tabs at all (single content view). Not relevant unless
  `token-action-hud-FG` specifically interacts with tab-switching on the actor sheet.
- **Grid DOM helpers** (`src/grid/grid-base.js`, `src/grid/grid-space.js`) now take a
  plain `HTMLElement` (`activateListeners(root)`) instead of a jQuery object, same as
  everything else above.
- **All internal jQuery usage is gone system-wide** - there is no remaining
  `ApplicationV1`/`Application`/jQuery-based code anywhere in `fathomlessgears` as of this
  migration. If any part of `token-action-hud-FG`'s integration assumed jQuery
  availability via the system (rather than via `token-action-hud-core` or Foundry core
  itself, which still ship jQuery for their own reasons on both v13 and v14), that
  assumption no longer holds for anything coming from this system's own code.
- **Manifest housekeeping** (`fathomlessgears/system.json`): `compatibility` is now
  `{"minimum": "13.351", "verified": "14.368"}`; `template.json` has been deleted
  entirely (replaced by a `documentTypes` block, per Foundry's v14-era convention); pack
  paths no longer have a (previously-incorrect) `.db` suffix. None of this should affect
  `token-action-hud-FG` directly, but it confirms what "the migrated system" actually
  looks like on disk if you need to cross-reference something.

## 4. Known gaps / things the system side could not verify

These are called out in case they turn out to matter for `token-action-hud-FG` too - they
were **not** things this session could resolve without a live Foundry client, which this
sandboxed environment never had access to at any point:

- Whether Foundry v13/v14's automatic `@layer system` CSS wrapping breaks
  `fathomlessgears`' theme (it globally overrides ~50 of Foundry core's own CSS variable
  names at `:root`, a deliberate whole-client reskin, not just its own sheets) against
  core's own layered CSS. If `token-action-hud-FG` has its own CSS that assumes specific
  colours/variables from the host system, worth being aware this is an open question on
  the system side too.
- Real DOM markup/class names for anything only knowable by opening an actual v13/v14
  client (compiled Handlebars output, exact core sidebar/directory row structure, etc.) -
  TypeDoc (Foundry's generated API reference) only documents JS class/method signatures,
  never compiled template output, so this class of question was a recurring blind spot
  for the system migration too and will likely be one here.

## 5. Where this came from

Extracted from `documentation/dev-log.md` and `documentation/foundry-v13-v14-migration-plan.md`
in the `fathomlessgears` repository, at the point where that system's own v13/v14
migration was code-complete (everything except §9, this module, and anything needing a
live client). Those files have the full chunk-by-chunk history, every bug found and
fixed, and every place a plan assumption turned out to be wrong when checked against
real Foundry API docs, if deeper context is ever needed and reachable.
