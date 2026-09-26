# Foundry v13 + v14 Migration Plan

Target: **Foundry 13.351 → 14.x** (verified 14.368). v12 support is dropped.
Status: plan only — nothing below has been implemented.

## Guiding decisions

- **One code path for v13 and v14.** Every API chosen below exists in both. The only
  exceptions are feature-detected (listed in §0.3), never branched on version number
  unless unavoidable.
- **Minimum 13.351**, because Token Action HUD Core 2.1.x (the only line supporting
  v14) requires it.
- **Full migration to ApplicationV2.** AppV1 is deprecated since v13 and removed in
  V16; doing it now also removes the jQuery dependency and supports v14 pop-out windows.
- **Preserve the system's public surface.** The `token-action-hud-FG` module calls these
  directly, so their names and signatures must not change during refactoring:
  - `game.rollHandler.startRollDialog(actor, attributeKey, itemId?, actionCode?)`
  - `game.hudActions.{weightTotal, createBallastTokens, rollNarrative, calculateRepairCost, holdAp, scanTarget, textAction}`
  - `game.rollTables.{rollInjury, rollTouch, rollMeltdown}`
  - `actor.{shareFrameAbility, postItem, toggleScan, locationHitMessage, itemsManager.clearConditions, itemTypes, system.attributes}`
  - `game.tagHandler`, `game.gridHover`, `game.availableConditionItems`, hook `conditionListReady`

## 0. Reference

### 0.1 Dependency matrix

| Package | v13 | v14 | Manifest entry |
|---|---|---|---|
| token-action-hud-core | 2.1.x (min 13.351) | 2.1.x | `minimum: "2.1.0"`, `verified: "2.1.1"` |
| statuscounter | 3.0.3 / 3.0.4 | 3.1.x (min 14.359) | `minimum: "3.0.3"`, `verified: "3.1.2"`, **no `maximum`** |
| socketlib | 1.1.3+ | 1.1.4 | `minimum: "1.1.3"`, `verified: "1.1.4"` |
| token-action-hud-FG | new release (see §9) | same | `minimum: <new version>` |
| elevationruler | — | — | **remove integration** (see §6) |

statuscounter flags (`flags.statuscounter.value/visible`) are unchanged across all of these.

### 0.2 API replacement table (valid on v13 and v14)

| Old | New |
|---|---|
| `renderTemplate` | `foundry.applications.handlebars.renderTemplate` |
| `loadTemplates` | `foundry.applications.handlebars.loadTemplates` |
| `TextEditor.enrichHTML` | `foundry.applications.ux.TextEditor.implementation.enrichHTML` |
| `Actors`/`Items` `.registerSheet` | `foundry.documents.collections.Actors/Items.registerSheet` |
| `ActorSheet`/`ItemSheet` | `foundry.applications.sheets.ActorSheetV2/ItemSheetV2` + `HandlebarsApplicationMixin` |
| `Application` | `foundry.applications.api.ApplicationV2` + `HandlebarsApplicationMixin` |
| `Dialog` | `foundry.applications.api.DialogV2` |
| `Token` / `TokenDocument` | `foundry.canvas.placeables.Token` / `foundry.documents.TokenDocument` |
| `CompendiumCollection` | `foundry.documents.collections.CompendiumCollection` |
| `Color` | `foundry.utils.Color` |
| `renderChatMessage` hook | `renderChatMessageHTML` (HTMLElement) |
| `renderSidebarTab` hook | `renderActorDirectory` / `renderCompendiumDirectory` (HTMLElement) |
| `ui.sidebar.activateTab(x)` | `ui.sidebar.changeTab(x, "primary")` |
| TableResult `text`, `documentCollection` | `name` (+ `description`), `documentUuid` |
| `template.json` | `documentTypes` in `system.json` |
| `gridDistance` manifest key | `"grid": {"distance": 1, "units": ""}` (removed in v14) |
| `canvas.activeLayer.name == "TokenLayer"` | `canvas.tokens.active` |

### 0.3 Places needing feature detection (v13 vs v14 differ)

1. **Message/roll mode.** v14: `ChatMessage.applyMode(data)` / `core.messageMode`. v13:
   `ChatMessage.applyRollMode(data, game.settings.get("core","rollMode"))`. Old API is
   shimmed on v14 until V16 but warns. Use `if (ChatMessage.applyMode) … else …` in one helper.
2. **Token status icon filtering.** v14 adds `ActiveEffect#showIcon` and core filters by it.
   Feature-detect `CONST.ACTIVE_EFFECT_SHOW_ICON` (see §5).
3. **statuscounter** version differs per core version — handled by manifest range only.
4. **Scene levels** (v14): use `token.visible` for hit-tests (works on both) rather than
   v14-only `locatedInLevel`.

Recommended: a single `src/utilities/compat.js` exporting helpers (`applyMessageMode`,
`getTokenEffectsToDraw`, and re-exports of the namespaced APIs in §0.2) so every call
site imports from one place.

---

## 1. Manifest, packaging and build

`system.json`
- [ ] `compatibility`: `{"minimum": "13.351", "verified": "14.368"}`.
- [ ] Update `relationships.requires` per §0.1; drop `maximum` on statuscounter.
- [ ] Replace `"gridDistance": 1` with `"grid": {"distance": 1, "units": ""}`.
- [ ] Add `"type": "system"` (optional new v14 field; harmless on v13).
- [ ] Pack paths: drop `.db` (`"path": "packs/core_macros"` etc.). Note `grid_type` pack
      name vs `packs/grid_types` folder — set the path to the actual folder `packs/grid_types`
      and keep the pack `name` as `grid_type` (referenced by `COMPENDIUMS.grid_type` and
      `fathomlessgears.grid_type` in code).
- [ ] Add `documentTypes` (see §2) and delete `template.json`.
- [ ] Styles: keep the list; they're auto-wrapped in `@layer system` (see §8).

`.github/workflows/main.yml`
- [ ] Remove `template.json` from the zip list once deleted; `LICENSE` → `LICENSE.txt`
      (current name doesn't exist, so the licence isn't shipped).
- [ ] Bump `actions/checkout@v3` → `@v4` (housekeeping).

`package.json`
- [ ] Bump `@foundryvtt/foundryvtt-cli` to the latest release (packs for v13/v14 LevelDB).
- [ ] Add a `globals` entry for `foundry`, `game`, `CONFIG`, etc. in `eslint.config.mjs`
      if not already present, and consider an ESLint `no-restricted-globals` rule for the
      deprecated globals in §0.2 to prevent regressions.

## 2. Data models and `template.json` → `documentTypes`

`template.json` is deprecated in v14 (removed V16); `documentTypes` works on both.

**Pre-existing issue found:** `CONFIG.Item.dataModels` in `src/fathomlessgears.js:55-65`
uses keys `frame`, `template`, `history`, but the item types are `frame_pc`,
`fish_template`, `history_event`. Those three models are currently **never applied**.
Also `development`, `maneuver`, `deep_word`, `background` have no model and no
template.json body at all.

- [ ] Add to `system.json`:
      ```json
      "documentTypes": {
        "Actor": { "fish": {"htmlFields": ["biography"]}, "fisher": {"htmlFields": ["biography"]} },
        "Item": {
          "tag": {"htmlFields": ["description"]}, "condition": {"htmlFields": ["description"]},
          "internal_pc": {"htmlFields": ["description"]}, "internal_npc": {"htmlFields": ["description"]},
          "frame_pc": {"htmlFields": ["description"]}, "size": {"htmlFields": ["description"]},
          "grid": {}, "development": {}, "maneuver": {}, "deep_word": {},
          "background": {}, "fish_template": {}, "history_event": {"htmlFields": ["description"]}
        }
      }
      ```
      (Confirm each type's `htmlFields` against whether its model defines `description`.)
- [ ] Before deleting `template.json`, confirm every default it provides is expressed as
      an `initial:` in the corresponding `defineSchema()` — particularly the actor
      templates (`attributes`, `internals`, `fisher_history`, `resources`, `downtime`,
      `ballast`) and the fish `grid` default image path.
- [ ] Fix the `dataModels` keys to `frame_pc`, `fish_template`, `history_event`.
      **Risk:** turning a model on for existing data will clean out any fields not in its
      schema. Test against a copy of a real world first; add `static migrateData` shims
      for any renamed fields.
- [ ] Decide for `development`, `maneuver`, `deep_word`, `background`: either leave
      schemaless (`{}` in `documentTypes`, data kept as-is), or write models. Recommended:
      leave schemaless in this migration, models as a follow-up.
- [ ] `src/items/item.js:70` `static migrateData` references `this.system` inside a static
      method (always undefined). Rewrite to test `source.system?.string_id` instead.

## 3. Hard breakages (must fix for v13)

### 3.1 Sidebar integrations
- [ ] `src/fathomlessgears.js:87`: replace `renderSidebarTab` with
      `renderCompendiumDirectory` → `addFshManager(html)` and `renderActorDirectory` →
      `addGridHudToSidebar(html)`. Register outside the `init` handler body is fine but
      keep it at init.
- [ ] `src/data-files/fsh-manager.js:19-37` `addFshManager`: native DOM; idempotent guard
      `html.querySelector(".fsh-content-manager")`; insert after `.header-actions`.
- [ ] `src/data-files/fsh-manager.js:105`: `ui.sidebar.changeTab("compendium", "primary")`.
- [ ] `src/tokens/grid-hover.js:246-276` `addGridHudToSidebar`: use
      `html.querySelectorAll("li.directory-item.entry.actor")` (confirm class list in v13
      DOM) and `dataset.entryId`. Use event delegation on the directory list (one
      `mouseover`/`mouseleave` listener) so partial re-renders don't lose or duplicate
      listeners.
- [ ] `src/tokens/grid-hover.js:185-187`: `closeActorSheet`/`closeApplication` only fire
      for V1. After §7, use `closeActorSheetV2` / `closeApplicationV2` (or a single
      `closeApplicationV2` listener).

### 3.2 Roll tables
- [ ] `src/actions/roll-table.js:15`: `result.text` → `result.name`.
- [ ] `src/actions/roll-table.js:85`: link with `item.uuid` (`@UUID[${item.uuid}]{${item.name}}`)
      instead of building from `result.documentCollection`.
- [ ] `src/actions/roll-table.js:59`: `table.formula = …` mutates the compendium document
      in memory; replace with `table.roll({roll: new Roll(\`2d6+${backlash}\`)})`.
- [ ] `src/actions/roll-table.js:43`: `canvas.tokens.controlled` is an array — `.size`
      → `.length`.
- [ ] Source packs `src/packs/fg_roll_tables/*.json` use `text`/`documentCollection`/
      `documentId`. After core migrates them in a v13 world, `npm run pull-packs` and
      commit so the source is in the new format (`name`, `documentUuid`, `type: "document"`).

### 3.3 Chat
- [ ] `src/formatting/message-handler.js:19`: `renderChatMessage` → `renderChatMessageHTML`.
      Attach listeners to the passed `html` element rather than rescanning `document`
      after a 50 ms timeout. `addListeners()` should take a root element (default
      `document` for sheets).
- [ ] Replace the 3 `ChatMessage.applyRollMode(create, game.settings.get("core","rollMode"))`
      calls (`message-handler.js:93, 265, 353`) with the `applyMessageMode` compat helper (§0.3).
- [ ] `src/actions/collapsible-roll.js`: regex surgery on `roll.render()` output throws
      if markup differs (`.match(...)[0]` on null). Markup is reported unchanged in v13/v14,
      but rewrite with `DOMParser` + `querySelector(".dice-formula")` /
      `querySelector("section.tooltip-part")` and fall back to unmodified HTML if not found.

### 3.4 Token drop and hover
- [ ] `src/tokens/token.js:104-124`: filter `canvas.tokens.placeables` by `t.visible` so
      v14 tokens on other levels aren't targeted. Optionally replace the manual bounds
      maths with `token.bounds.contains(x, y)`.
- [ ] `src/tokens/grid-hover.js:171`: `canvas.activeLayer.name == "TokenLayer"` →
      `canvas.tokens.active`.

## 4. Deprecated globals (warnings on v13, removed V15)

Apply the §0.2 table. Call sites:
- [ ] `renderTemplate` — 24 sites: `actors/actor.js:571,600`, `items/item.js:172,191,217`,
      `actions/reel.js:17`, `actions/attack.js:112,198`, `actions/roll-handler.js` (7),
      `actions/roll-table.js:87,103`, `actions/hud-actions.js` (3), `grid/grid-base.js:272`,
      `formatting/message-handler.js:245,310,343`.
- [ ] `loadTemplates` — `utilities/templates.js:41` (also pass an object `{name: path}` if you
      want to reference partials by short names).
- [ ] `TextEditor` — `sheets/actor-sheet.js:49` (drop `async: true`; add `relativeTo: this.actor`).
- [ ] Sheet registration — `fathomlessgears.js:71-79`; remove `unregisterSheet("core", …)`
      (core no longer registers defaults in v13).
- [ ] `Token`, `TokenDocument` — `tokens/token.js:7,13`.
- [ ] `CompendiumCollection` — `data-files/file-utils.js:66`. Also fix
      `path: ["packs/", compendiumName].join()` (produces `"packs/,name"`; just omit `path`).
- [ ] `Color` — goes away with §6.
- [ ] `$(...)` usages outside sheets — `fsh-manager.js:23,25`, `grid-base.js:257,268,291,292,300`,
      `message-handler.js:83`, `actor-sheet.js:256`. Replace with native DOM.

## 5. Active effects and token rendering

- [ ] `src/conditions/active-effect.js`: in `_onCreate/_onUpdate/_onDelete`, guard
      `this.parent?.transferEffects?.()` — v14 effects can be world/compendium documents
      with no actor parent. Also call `super` first, then the side-effect, and only on the
      originating client (`if (userId === game.user.id)`), otherwise every connected client
      triggers `transferEffects`.
- [ ] `src/tokens/token.js:27` `_drawEffects` is a copy of v12 core. Replace with a
      version that doesn't duplicate core:
      - Add a compat helper `getTokenEffectsToDraw(token)` that returns
        `actor.temporaryEffects` on v13, and on v14 `actor.appliedEffects` filtered by
        `showIcon` (ALWAYS, or CONDITIONAL && (isTemporary || statuses.size)).
      - Then apply `filterEffectList`. Either re-copy the v14 core body once with that
        substitution, or (preferred) temporarily wrap the actor effect getter while calling
        `super._drawEffects()`.
      - Must still call `this._drawEffect` / `this._drawOverlay` — statuscounter 3.1 wraps
        these.
- [ ] **Verify on v14:** status effects created with `toggleStatusEffect` have no duration;
      confirm they still show icons (the `statuses.size` clause above is the safety net).
- [ ] `CONFIG.statusEffects = foundry.utils.duplicate(conditions)` (`fathomlessgears.js:191`)
      works on both (array form is shimmed on v14 until V16). Keep ids unique (they are).
      Consider moving this from `ready` to `init`/`setup` so it's set before the canvas draws.
- [ ] `CONFIG.ActiveEffect.legacyTransferral` is not set — nothing to do.

## 6. Movement ruler (replace Elevation Ruler integration)

Elevation Ruler has no v14 release and removed the speed-highlighting API this system
configures, so `configureElevationRuler()` is dead code (and `game.modules.get(...).active`
throws if the module isn't installed).

- [ ] Delete `configureElevationRuler` and its call (`fathomlessgears.js:196-198, 205-247`).
- [ ] Add `src/tokens/token-ruler.js`: `class HLMTokenRuler extends
      foundry.canvas.placeables.tokens.TokenRuler`, overriding `_getGridHighlightStyle`
      and `_getSegmentStyle` to colour by `waypoint.measurement.cost` vs
      `actor.system.attributes.speed.total`: ≤1× blue `#1a4e9d`, ≤2× green `#0e880e`,
      beyond red `#8c1818`. Register `CONFIG.Token.rulerClass = HLMTokenRuler` at init.
      Reference: dnd5e `module/canvas/ruler.mjs` (5.3.x branch).

## 7. ApplicationV2 migration

General rules for every app:
- `static DEFAULT_OPTIONS` (classes, `window.title`, `position.width/height`, `actions`),
  `static PARTS = { main: { template } }`.
- `getData` → `_prepareContext`; `activateListeners(html)` → `_onRender(context, options)`
  using `this.element`; simple button clicks → `actions` with `data-action` in templates.
- Replace every `document.getElementById/getElementsByClassName` inside apps with
  `this.element.querySelector` (fixes multi-window bugs and v14 pop-out windows).
- `render(true)` → `render({force: true})`.
- `_onRender` must be idempotent (v14 re-runs it on pop-out/re-attach).
- `Utils.activateButtons(html)` (`utils.js:219`) → accept an HTMLElement.
- Remove `<form>` roots from non-form templates (AppV2 supplies the form via `tag: "form"`
  where needed).

Order (small → large):

1. [ ] **`ConfirmDialog`** (`utilities/confirm-dialog.js`) → `DialogV2.confirm({window:{title},
       content, rejectClose:false})` and call `callbackAction(result, args)`. Keep the class
       API so `items-manager.js:256,271` and `fsh-manager.js:176` don't change.
2. [ ] **`HLMApplication`** base (`sheets/application.js`) →
       `HandlebarsApplicationMixin(ApplicationV2)`; loading overlay via `this.element`.
3. [ ] **`IntroDialog`**, **`ReserveApDialog`**, **`NarrativeRollDialog`**, **`RollDialog`**
       (`src/dialogs/*`). Note these call `this.render(true)` in their constructor — move to
       the caller (`new X(...).render({force:true})`) or keep a static `create()` helper.
       The `html.find(...).click()` calls used to pre-tick checkboxes should become
       `checked` attributes in the templates.
4. [ ] **`FileUploader`** (`data-files/uploader.js`) and **`FshManager`**
       (`data-files/fsh-manager.js`). Replace `static isOpen` with a singleton check
       (`foundry.applications.instances.get(id)`) and a fixed `id`.
5. [ ] **`GridHoverHUD`** (`tokens/grid-hover.js`) → ApplicationV2 with
       `window: {frame: false, positioned: false}` and a fixed `id: "grid-hover-hud"`;
       rendered into `document.body` (or `#hud`). Keep `assignActor/clear/toggleLock/
       refresh`. Replace `this.object` with `this.actor`. `super.getData()` goes away.
6. [ ] **Grid DOM helpers** (`grid/grid-base.js:88-90,250-300`, `grid/grid-space.js:122`):
       `activateListeners(root: HTMLElement)` using `querySelectorAll`/`addEventListener`;
       `toggleHighlight`, `highlightInternal`, `renderInternal`, `popInternal`,
       `unpopInternal` → `closest()`/`querySelector()`/`style`.
7. [ ] **`HLMItemSheet`** → `HandlebarsApplicationMixin(ItemSheetV2)` (trivial template).
8. [ ] **`HLMActorSheet`** → `HandlebarsApplicationMixin(ActorSheetV2)`:
       - `PARTS`: separate `fisher` and `fish` templates, chosen in `_configureRenderParts`
         by `this.actor.type` (replaces the `get template()` override).
       - Tabs: `static TABS = { primary: { tabs: [{id:"gear"},{id:"character"}], initial: "gear" } }`
         and template `data-group="primary"`; fish sheet has no tabs.
       - `form: { submitOnChange: true }`; port `_getSubmitData` custom-attribute
         sanitisation to `_prepareSubmitData` / `_processFormData`. Remove the direct
         `calculateBallast()` / `render()` calls from submit (they cause double renders).
       - Images: `data-edit="img"` → `data-action="editImage" data-edit="img"` (also
         `system.pilot_portrait`, `system.grid`).
       - ~40 `html.find(...).click(...)` bindings → `static actions` map
         (`roll`, `breakInternal`, `postItem`, `resetManeuvers`, `hitLocation`, `scan`,
         `import`, `manualSetup`, `toggleManeuver`, `meltdown`, `postFrameAbility`,
         `toggleInjury`, `narrative`, `editHistory`, `historyUp`, `historyDown`,
         `historyDelete`, `injury`, `touch`, `repairs`). Add `data-action` in templates.
       - `document.getElementById("post-frame-ability")` (`actor-sheet.js:225`) is global
         — becomes an action.
       - Drag/drop: `_onDropItem(event, item)` in ActorSheetV2 receives the document;
         keep the `itemsManager.canDropItem/receiveDrop` flow. History-row
         `dragover/dragleave` listeners go in `_onRender`.
       - `toggleInternalBrokenDisplay` (`actor-sheet.js:352`) queries `document` globally —
         use `this.element`.
       - `editingHistory`/`loading` state stays on the instance; `close()` override →
         `_onClose`.
       - `game.tagHandler.transformTagNameToButton($(this.element).get(0))` → pass
         `this.element`.
       - `gearwright-actor.js:39,52` finds the sheet via `#HLMActorSheet-Actor-<id>` —
         use `actor.sheet?.element?.classList`.
       - `{{editor}}` for biography (if present) → `<prose-mirror>` element.
       - Register with `foundry.documents.collections.Actors.registerSheet("fathomlessgears",
         HLMActorSheet, {types: ["fisher","fish"], makeDefault: true})`.

## 8. CSS and theming

- [ ] Stylesheets are auto-wrapped in `@layer system`. Check for places that relied on
      beating core by specificity/order and now lose to core's `exceptions` layer (rare).
- [ ] Define system-owned variables (e.g. `--fg-bg-header`, `--fg-border-light`) in one
      block in `theme.css` and replace uses of core's v12 names (`--color-border-light-1`,
      `--color-text-light-heading`, `--color-bg-header`, `--color-bg-dialog`, etc.) in
      `chat.css`, `dialogs.css`, `canvas.css`, `sheet.css`.
- [ ] `chat.css:1-20` overrides every `.chat-message` background. Scope to the system's
      own message wrapper, and check contrast under `.theme-dark` (v13/v14 default for
      chat/sidebar when OS is dark).
- [ ] Sheets/dialogs: either set `classes: ["themed", "theme-light"]` to force the current
      light palette, or add `.theme-dark` variants. Recommended: force light first, dark
      variants later.
- [ ] Rewrite selectors that assume V1 window structure (`.window-app`, `.window-content`
      as direct form parent) for V2 (`.application`, `.window-content`).
- [ ] Font Awesome 7 on v14: re-check `fa-unlock-alt` (FA5 alias) → `fa-lock-open`; check
      icon widths in `grid-space.html`, `history-*.html`, `narrative-dice-partial.html`.
- [ ] Style the new FSH Manager sidebar button to match v13 header buttons.

## 9. token-action-hud-FG (separate repo)

- [ ] `module.json`: compatibility `{"minimum":"13.351","verified":"14.368"}`; requires
      `token-action-hud-core` `{"minimum":"2.1.0","verified":"2.1.1"}`; system
      relationship `fathomlessgears` → the new system version.
- [ ] `scripts/constants.js`: `REQUIRED_CORE_MODULE_VERSION = "2"` (accepts any 2.x ≥ 2.1).
- [ ] Re-test all action categories (attributes, weapons/active/passive internals,
      maneuvers, deep words, conditions, utility actions) against the system public API
      listed at the top.
- [ ] Optional: adopt 2.1's `hasContextMenu` for internals (e.g. break/repair from HUD).
- [ ] Release it before (or together with) the system release, and set the system's
      `requires` minimum to that version.

## 10. Smaller pre-existing bugs worth fixing during testing

- [ ] `fathomlessgears.js:196` `game.modules.get("elevationruler").active` throws when
      not installed (removed by §6 anyway).
- [ ] `actors/actor.js:60` registers a `conditionListReady` hook in `prepareDerivedData`
      — a new listener on every data prep for every actor (leak). Move to a single
      global hook that iterates actors.
- [ ] `dialogs/narrative-dialog.js`: `additional` vs `additionalLabels` mismatch;
      `LabelRollElement` constructed with two args but takes one.
- [ ] `fathomlessgears.js:120` `game.keybindings.initialize()` in `ready` is unnecessary.
- [ ] `fathomlessgears.js:125` `gridCollection.configure({ownership: …})` runs for every
      client; guard with `game.user.isGM`.
- [ ] Settings are registered in `ready`; move to `init` so they exist before anything
      reads them (v14 pop-outs and early hooks may).

## 11. Suggested implementation order (separate PRs)

1. §1 manifest/deps + §3 hard breakages + §4 globals → **runs on v13 and v14 with V1 apps**.
2. §5 effects/token + §6 ruler.
3. §2 data models / documentTypes (with world-data backup testing).
4. §7 AppV2: steps 1–6 (dialogs, apps, HUD, grid DOM).
5. §7 AppV2: steps 7–8 (item and actor sheets) + §8 CSS.
6. §9 TAH-FG release, then system release.
7. §10 cleanup.

## 12. Test matrix

Run on **13.351** and **14.368**, each in **light and dark** interface themes, with the
console filtered for deprecation warnings (target: zero from `fathomlessgears`).

- Everything in `documentation/testprocess.md`.
- FSH manager: button appears in Compendium tab, import/update/delete, intro dialog flow.
- Sidebar actor hover → grid HUD; token hover → grid HUD; `G` lock; HUD position setting.
- All roll types: attribute, targeted attack (hit/miss/crit, hit location), reel, bash,
  threat display, narrative (lock/reroll), tag rolls/rerolls; each under public/GM/blind/self mode.
- Roll tables: Injury, Touch of the Deep (with backlash), Meltdown — links open items.
- Conditions: apply from chat drag, sheet, token HUD; counters show and update
  (statuscounter 3.0.4 on v13, 3.1.x on v14); ballast tokens show only ballast conditions.
- v14 only: token icons still show for status effects; token drop with scene levels;
  pop-out a sheet and interact with it.
- Gearwright import for fisher and fish.
- Ruler colour bands at 1× / 2× / beyond speed.
- Token Action HUD: every category and action.
- Existing world upgraded from v12 data: actors/items open, data intact after §2.
