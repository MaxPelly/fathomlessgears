import {ATTRIBUTES, ACTOR_TYPES, TEMPLATE} from "../constants.js";
import {Utils} from "../utilities/utils.js";
import {FileUploader} from "../data-files/uploader.js";
import {populateActorFromGearwright} from "../actors/gearwright-actor.js";
import {NarrativeRollDialog} from "../dialogs/narrative-dialog.js";

/**
 * @extends {foundry.applications.sheets.ActorSheetV2}
 */
export class HLMActorSheet extends foundry.applications.api.HandlebarsApplicationMixin(
	foundry.applications.sheets.ActorSheetV2
) {
	static DEFAULT_OPTIONS = {
		classes: ["fathomlessgears", "sheet", "actor", "themed", "theme-light"],
		position: {width: 750, height: 650},
		form: {submitOnChange: true},
		dragDrop: [{dragSelector: ".item-list .item", dropSelector: null}],
		actions: {
			roll: HLMActorSheet.#onRoll,
			breakInternal: HLMActorSheet.#onBreakInternal,
			postItem: HLMActorSheet.#onPostItem,
			resetManeuvers: HLMActorSheet.#onResetManeuvers,
			hitLocation: HLMActorSheet.#onLocationHitMessage,
			scan: HLMActorSheet.#onToggleScan,
			import: HLMActorSheet.#onSelectImport,
			manualSetup: HLMActorSheet.#onSelectManualSetup,
			toggleManeuver: HLMActorSheet.#onToggleManeuver,
			meltdown: HLMActorSheet.#onRollMeltdown,
			postFrameAbility: HLMActorSheet.#onPostFrameAbility,
			toggleInjury: HLMActorSheet.#onToggleInjuryHealed,
			narrative: HLMActorSheet.#onRollNarrativeCheck,
			editHistory: HLMActorSheet.#onTriggerHistoryEdit,
			historyUp: HLMActorSheet.#onHistoryItemUp,
			historyDown: HLMActorSheet.#onHistoryItemDown,
			historyDelete: HLMActorSheet.#onHistoryDelete,
			injury: HLMActorSheet.#onRollInjury,
			touch: HLMActorSheet.#onRollTouch,
			repairs: HLMActorSheet.#onCalculateRepairs,
			switchTab: HLMActorSheet.#onSwitchTab
		}
	};

	static PARTS = {
		fisher: {
			template: "systems/fathomlessgears/templates/fisher-sheet.html"
		},
		fish: {template: "systems/fathomlessgears/templates/fish-sheet.html"}
	};

	editingHistory = false;
	activeTab = "gear";

	_configureRenderParts(options) {
		const parts = super._configureRenderParts(options);
		const key = this.actor.type === ACTOR_TYPES.fish ? "fish" : "fisher";
		return {[key]: parts[key]};
	}

	_onClose(options) {
		super._onClose(options);
		this.editingHistory = false;
	}

	/** @inheritdoc */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		context.showCover =
			!context.actor.getFlag("fathomlessgears", "initialised") ||
			this.loading;
		context.showInitialiseButtons = !context.actor.getFlag(
			"fathomlessgears",
			"initialised"
		);
		context.owner = this.document.isOwner;
		context.editable = this.isEditable;
		context.biographyHTML =
			await foundry.applications.ux.TextEditor.implementation.enrichHTML(
				context.actor.system.biography,
				{
					secrets: this.document.isOwner,
					relativeTo: this.actor
				}
			);
		this.getResourceLabels(context.actor);
		context.scan_text = await context.actor.getScanText();
		context.template =
			context.actor.itemTypes.fish_template.length > 0
				? context.actor.itemTypes.fish_template[0].name
				: TEMPLATE.common;

		const items = context.actor.itemTypes;
		context.frame = items.frame_pc[0]
			? items.frame_pc[0]
			: {
					name: "",
					system: {
						gear_ability: "No frame assigned"
					}
				};
		context.size = items.size[0] ? items.size[0] : null;

		//Split attribute types
		context.rolled = {};
		context.flat = {};
		for (const [key, value] of Object.entries(
			context.actor.attributesWithConditions
		)) {
			value.label = Utils.getLocalisedAttributeLabel(key);
			if (key == "ballast") {
				context.ballast = value;
			} else {
				Utils.isRollableAttribute(key)
					? (context.rolled[key] = value)
					: (context.flat[key] = value);
			}
		}

		//Gather internal categories
		context.weapons = [];
		context.active = [];
		context.passive = [];
		const internals = items.internal_pc.concat(items.internal_npc);
		internals.forEach((internal) => {
			internal.description_text = internal.getInternalDescriptionText();
			switch (internal.system.type) {
				case "close":
				case "far":
				case "mental":
					context.weapons.push(internal);
					break;
				case "active":
					context.active.push(internal);
					break;
				case "mitigation":
				case "passive":
					context.passive.push(internal);
					break;
			}
		});
		if (this.actor.type === ACTOR_TYPES.fisher) {
			context.history = this.buildHistoryForDisplay(items);
			context.labels = this.actor.system.downtime.labels;
			context.editingHistory = this.editingHistory;
			context.activeTab = this.activeTab;
		}

		//Other items
		context.developments = items.development;
		context.maneuvers = items.maneuver;
		context.deep_words = items.deep_word;
		context.maneuvers.forEach((maneuver) => {
			maneuver.activated = maneuver.getFlag(
				"fathomlessgears",
				"activated"
			);
		});
		const encore = context.developments.find((development) =>
			development.isEncore()
		);
		if (encore) {
			encore.activated = encore.getFlag("fathomlessgears", "activated");
			context.encore = {
				name: encore.name,
				id: encore.id,
				activated: encore.getFlag("fathomlessgears", "activated")
			};
		}

		context.interactiveGrid = false;
		if (this.actor.getFlag("fathomlessgears", "interactiveGrid")) {
			context.interactiveGrid = true;
			context.grid = this.actor.grid;
		}
		return context;
	}

	/**
	 * Sanitize the submitted custom-attribute-modifier fields, forcing invalid values back
	 * to 0 rather than letting them reach the actor as e.g. an empty string.
	 * @inheritdoc
	 */
	_prepareSubmitData(event, form, formData, updateData) {
		const result = super._prepareSubmitData(
			event,
			form,
			formData,
			updateData
		);
		Object.values(ATTRIBUTES).forEach((attribute) => {
			const reference = `system.attributes.${attribute}.values.custom`;
			const formVal = foundry.utils.getProperty(result, reference);
			if (!Number.isInteger(formVal)) {
				foundry.utils.setProperty(result, reference, 0);
			}
		});
		return result;
	}

	/** @inheritdoc */
	_onRender(context, options) {
		super._onRender(context, options);

		//Add classes to attribute boxes with special properties
		Object.keys(this.actor.system.attributes).forEach((key) => {
			if (Utils.isRollableAttribute(key)) {
				const attributeDocument = this.element
					.querySelector(`#${key}`)
					.querySelector(".name-box");
				attributeDocument.classList.add(
					"attribute-button",
					"rollable",
					"btn"
				);
				attributeDocument.dataset.action = "roll";
				if (this.actor.type == ACTOR_TYPES.fish) {
					attributeDocument.classList.add("btn-dark");
				}
			}
		});

		//Activate buttons & grid interactivity for owners only
		if (
			this.actor.testUserPermission(
				game.user,
				CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
			)
		) {
			Utils.activateButtons(this.element);
			this.element.querySelectorAll(".grid-base").forEach((el) => {
				el.classList.add("interactable");
			});
		}

		if (this.actor.getFlag("fathomlessgears", "interactiveGrid")) {
			this.actor.grid.activateListeners(this.element);
		}

		if (this.actor.type === ACTOR_TYPES.fisher) {
			this.element
				.querySelectorAll(".history-table-row")
				.forEach((row) => {
					row.addEventListener(
						"dragover",
						this.dragOverHistoryTable.bind(this)
					);
					row.addEventListener(
						"dragleave",
						this.dragLeaveHistoryTable.bind(this)
					);
				});
			this._syncActiveTab();
		}

		game.tagHandler.transformTagNameToButton(this.element);
		game.tagHandler.addListeners(this.element);
	}

	/**
	 * Restore the current tab selection across re-renders (the framework doesn't persist
	 * this itself since tab switching here is hand-rolled - see `#onSwitchTab`).
	 */
	_syncActiveTab() {
		this.element.querySelectorAll("[data-tab]").forEach((el) => {
			el.classList.toggle("active", el.dataset.tab === this.activeTab);
		});
	}

	buildHistoryForDisplay(items) {
		const history = [];
		for (let i = 1; i <= this.actor.system.fisher_history.el; i++) {
			let injuries = items.history_event.filter(
				(history) =>
					history.system.obtainedAt == i &&
					history.system.type == "injury"
			);
			let touches = items.history_event.filter(
				(history) =>
					history.system.obtainedAt == i &&
					history.system.type == "touch"
			);
			history.push({
				el: i,
				injuries: injuries,
				touches: touches
			});
		}
		return history;
	}

	testOwnership() {
		return this.actor.testUserPermission(game.user, "OWNER");
	}

	getResourceLabels(actor) {
		//Resources
		if (actor.system.resources) {
			for (const resourceKey in actor.system.resources) {
				const resource = actor.system.resources[resourceKey];
				resource.label = Utils.getLocalisedResourceLabel(resourceKey);
			}
		}
	}

	static #onRoll(event, target) {
		event.preventDefault();
		if (!this.testOwnership()) {
			return false;
		}
		const attribute = target.getAttribute("attribute");
		game.rollHandler.startRollDialog(this.actor, attribute);
	}

	/**
	 * Accept and process an item dropped on this sheet
	 * @param {DragEvent} event The initiating drag event
	 * @param {documents.Item} item The dropped Item document
	 */
	async _onDropItem(event, item) {
		if (!this.testOwnership()) {
			return null;
		}
		if (this.actor.itemsManager.canDropItem(item)) {
			this.actor.itemsManager.receiveDrop(item, event);
		} else {
			ui.notifications.info(
				`Can't drop item type ${item.type} on actor type ${this.actor.type}`
			);
		}
		return null;
	}

	/**
	 * Share the actor's frame ability
	 */
	static #onPostFrameAbility() {
		if (!this.testOwnership()) {
			return false;
		}
		this.actor.shareFrameAbility();
	}

	/**
	 * Mark an internal as broken/repaired
	 */
	static async #onBreakInternal(_event, target) {
		if (!this.testOwnership()) {
			return false;
		}
		this.actor.itemsManager.toggleInternalBroken(
			safeIdClean(target.dataset.id)
		);
	}

	toggleInternalBrokenDisplay(uuid) {
		this.element
			.querySelector(`[data-id=id${uuid}].card`)
			.classList.toggle("broken");
		this.element
			.querySelector(`[data-id=id${uuid}].break-button`)
			.classList.toggle("btn-dark");
		this.element
			.querySelector(`[data-id=id${uuid}].post-button`)
			.classList.toggle("btn-dark");
	}

	static #onToggleManeuver(_event, target) {
		if (!this.testOwnership()) {
			return false;
		}
		this.actor.itemsManager.toggleManeuver(safeIdClean(target.dataset.id));
	}

	static #onResetManeuvers() {
		if (!this.testOwnership()) {
			return false;
		}
		const maneuvers = this.actor.itemTypes.maneuver;
		maneuvers.forEach((maneuver) => {
			maneuver.setFlag("fathomlessgears", "activated", false);
		});
		const developments = this.actor.itemTypes.development;
		developments.forEach((development) => {
			if (development.isEncore()) {
				development.setFlag("fathomlessgears", "activated", false);
			}
		});
	}

	static #onPostItem(_event, target) {
		if (!this.testOwnership()) {
			return false;
		}
		this.actor.postItem(safeIdClean(target.dataset.id));
	}

	deleteItem(event) {
		if (!this.testOwnership()) {
			return false;
		}
		this.actor.itemsManager.removeItemCallback(
			safeIdClean(event.target.dataset.id)
		);
	}

	static #onLocationHitMessage() {
		if (!this.testOwnership()) {
			return false;
		}
		this.actor.locationHitMessage();
	}

	static async #onToggleScan() {
		if (!this.testOwnership()) {
			return false;
		}
		this.actor.toggleScan();
	}

	static #onSelectManualSetup() {
		if (!this.testOwnership()) {
			return false;
		}
		this.actor.setFlag("fathomlessgears", "initialised", true);
	}

	static #onSelectImport() {
		if (!this.testOwnership()) {
			return false;
		}
		new FileUploader(this, {importNameOption: true});
	}

	async onFileLoaded(fileData, _fileName, options) {
		//process gearwright json
		this.loading = true;
		this.render();
		const preparedData = JSON.parse(fileData);
		populateActorFromGearwright(
			this.actor,
			preparedData,
			options?.importNameFlag
		).then(() => {
			this.loading = false;
			//Small delay to allow for the sheet to load post updates
			setTimeout(() => {
				this.render({force: true});
			}, 20);
		});
	}

	dragOverHistoryTable(event) {
		//There's no simple way to only highlight for a history item
		//TODO add extra data on drag start to pick up that this is a history item?
		event.target.parentElement.classList.add("valid-drop-hover");
	}
	dragLeaveHistoryTable(event) {
		event.target.parentElement.classList.remove("valid-drop-hover");
	}

	static #onToggleInjuryHealed(_event, target) {
		if (!this.testOwnership()) {
			return false;
		}
		this.actor.itemsManager.toggleInjuryHealed(
			safeIdClean(target.dataset.id)
		);
	}

	static #onRollNarrativeCheck() {
		new NarrativeRollDialog(this.actor.system.downtime.labels, this.actor);
	}

	static #onTriggerHistoryEdit(event) {
		if (!this.testOwnership()) {
			return false;
		}
		this.editingHistory = !this.editingHistory;
		event.target
			.closest(".history-table-holder")
			.classList.toggle("editing");
	}

	static #onSwitchTab(_event, target) {
		this.activeTab = target.dataset.tab;
		this._syncActiveTab();
	}

	static #onHistoryItemUp(_event, target) {
		const item = this.actor.items.get(safeIdClean(target.dataset.id));
		let el = parseInt(item.system.obtainedAt);
		if (el > 1) {
			el = el - 1;
		}
		item.update({"system.obtainedAt": el.toString()});
	}

	static #onHistoryItemDown(_event, target) {
		const item = this.actor.items.get(safeIdClean(target.dataset.id));
		let el = parseInt(item.system.obtainedAt);
		if (el < this.actor.system.fisher_history.el) {
			el = el + 1;
		}
		item.update({"system.obtainedAt": el.toString()});
	}

	static #onHistoryDelete(_event, target) {
		this.actor.itemsManager.removeItemCallback(
			safeIdClean(target.dataset.id)
		);
	}

	static #onRollInjury() {
		game.rollTables.rollInjury(this.actor);
	}

	static #onRollTouch() {
		game.rollTables.rollTouch(this.actor);
	}

	static #onRollMeltdown() {
		game.rollTables.rollMeltdown(this.actor);
	}

	static #onCalculateRepairs() {
		game.hudActions.calculateRepairCost(this.actor);
	}
}
function safeIdClean(safeId) {
	return safeId.substring(2);
}
