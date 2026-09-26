import {HLMApplication} from "../sheets/application.js";
import {NARRATIVE_DIFFICULTY} from "../constants.js";
import {Utils} from "../utilities/utils.js";
import {LabelRollParameters} from "../actions/roll-params.js";

export class LabelRollElement {
	/**
	 * Represents a modifier to a die roll
	 * @param {integer} value The value of the modifier
	 */
	constructor(name) {
		this.name = name;
		this.active = false;
		this.id = "id" + foundry.utils.randomID();
	}
}

function getGoodEnoughThreshold(difficulty) {
	let value = "-";
	if (game.rollHandler.goodEnoughThreshold(difficulty)) {
		value =
			game.rollHandler.goodEnoughThreshold(difficulty).toString() +
			"&plus;";
	}
	return value;
}

function getFullSuccessThreshold(difficulty) {
	let value = "-";
	if (game.rollHandler.fullSuccessThreshold(difficulty)) {
		value =
			game.rollHandler.fullSuccessThreshold(difficulty).toString() +
			"&plus;";
	}
	return value;
}

export class NarrativeRollDialog extends HLMApplication {
	static DEFAULT_OPTIONS = {
		classes: ["fathomlessgears"],
		window: {title: "Roll Inputs"},
		position: {width: 500},
		actions: {
			triggerRoll: NarrativeRollDialog.#onTriggerRoll
		}
	};

	static PARTS = {
		main: {
			template: "systems/fathomlessgears/templates/narrative-dialog.html"
		}
	};

	modifiers;
	actor;
	additionalLabels;
	difficulty;

	constructor(labels, actor, ...args) {
		super(...args);
		this.modifiers = [];
		labels.forEach((label) => {
			let modifier = new LabelRollElement(label.name);
			this.modifiers.push(modifier);
		});
		this.actor = actor;
		this.additionalLabels = 0;
		this.difficulty = NARRATIVE_DIFFICULTY.none;
		this.render({force: true});
	}

	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		context.modifiers = this.modifiers;
		context.additional = this.additional;
		context.difficulty = this.difficulty;
		context.totalString = this.calculateDieTotal().toString() + "d6";
		context.checkDifficulties = [];
		Object.keys(NARRATIVE_DIFFICULTY).forEach((difficulty) => {
			let item = {};
			item.id = difficulty;
			item.name = game.i18n.localize("NARRATIVE." + difficulty);
			context.checkDifficulties.push(item);
		});
		context.goodEnoughString = getGoodEnoughThreshold(this.difficulty);
		context.fullSuccessString = getFullSuccessThreshold(this.difficulty);
		return context;
	}

	_onRender(context, options) {
		super._onRender(context, options);
		Utils.activateButtons(this.element);
		this.element
			.querySelector('[data-selector="additional"]')
			.addEventListener("change", (evt) => {
				this.additional = evt.target.value;
				this.updateTotalString();
			});
		this.element
			.querySelectorAll(".element-checkbox")
			.forEach((checkbox) => {
				checkbox.addEventListener("change", (evt) => {
					this.toggleModifier(evt);
				});
			});
		this.element
			.querySelectorAll('[name="difficulty"]')
			.forEach((radio) => {
				radio.addEventListener("change", (evt) => {
					this.updateDifficulty(evt.target.value);
				});
			});
	}

	calculateDieTotal() {
		let labelCount = 0;
		this.modifiers.forEach((modifier) => {
			if (modifier.active) {
				labelCount += 1;
			}
		});
		if (parseInt(this.additional)) {
			labelCount += parseInt(this.additional);
		}
		let dice = 2;
		if (labelCount >= 7) {
			dice += 4;
		} else if (labelCount >= 4) {
			dice += 3;
		} else if (labelCount >= 2) {
			dice += 2;
		} else if (labelCount >= 1) {
			dice += 1;
		}
		return dice;
	}

	static async #onTriggerRoll() {
		const modifierStack = this.modifiers.filter((element) =>
			Boolean(element.active)
		);
		const rollParams = new LabelRollParameters(
			this.actor.uuid,
			this.calculateDieTotal(),
			modifierStack,
			this.difficulty
		);

		if (parseInt(this.additionalLabels)) {
			rollParams.modifierStack.push(
				new LabelRollElement(
					parseInt(this.additionalLabels),
					game.i18n.localize("ROLLDIALOG.other")
				)
			);
		}

		await game.rollHandler.rollNarrative(rollParams, null, 0);
		this.close();
	}

	findMatchingModifier(id) {
		let foundModifier = null;
		this.modifiers.forEach((modifier) => {
			if (modifier.id == id) foundModifier = modifier;
		});
		return foundModifier;
	}

	updateTotalString() {
		const totalString = this.calculateDieTotal().toString() + "d6";
		const totalElement = this.element.querySelector("#total-string");
		totalElement.innerHTML = totalString;
	}

	updateGoodEnoughString() {
		const string = getGoodEnoughThreshold(this.difficulty);
		const goodEnoughElement =
			this.element.querySelector("#goodenough-string");
		goodEnoughElement.innerHTML = string;
	}

	updateFullSuccessString() {
		const string = getFullSuccessThreshold(this.difficulty);
		const fullSuccessElement = this.element.querySelector(
			"#fullsuccess-string"
		);
		fullSuccessElement.innerHTML = string;
	}

	toggleModifier(evt) {
		const modifier = this.findMatchingModifier(
			evt.currentTarget.dataset.id
		);
		if (modifier) {
			modifier.active = evt.currentTarget.checked;
		}
		this.updateTotalString();
	}

	updateDifficulty(newDifficulty) {
		this.difficulty = newDifficulty;
		this.updateGoodEnoughString();
		this.updateFullSuccessString();
	}
}
