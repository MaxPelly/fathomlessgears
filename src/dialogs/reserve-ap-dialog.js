import {CONDITIONS, findConditionFromStatus} from "../conditions/conditions.js";
import {Utils} from "../utilities/utils.js";
import {HLMApplication} from "../sheets/application.js";

export class ReserveApDialog extends HLMApplication {
	static DEFAULT_OPTIONS = {
		classes: ["fathomlessgears"],
		window: {title: "RESERVEDIALOG.name"},
		position: {width: 200},
		actions: {
			confirm: ReserveApDialog.#onConfirm
		}
	};

	static PARTS = {
		main: {
			template: "systems/fathomlessgears/templates/reserve-ap-dialog.html"
		}
	};

	constructor(actor, ...args) {
		super(...args);
		this.actor = actor;
		this.ap = 1;
		this.quickened = true;
		this.render({force: true});
	}

	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		context.ap = this.ap;
		context.quickened = this.quickened;
		return context;
	}

	_onRender(context, options) {
		super._onRender(context, options);
		Utils.activateButtons(this.element);
		this.element
			.querySelector('[data-selector="quickened"]')
			.addEventListener("change", (evt) => {
				this.quickened = evt.target.checked;
			});
		this.element
			.querySelector('[data-selector="ap"]')
			.addEventListener("change", (evt) => {
				this.ap = evt.target.valueAsNumber;
			});
	}

	static async #onConfirm() {
		const quickened = await findConditionFromStatus(CONDITIONS.quickened);
		const evasive = await findConditionFromStatus(CONDITIONS.evasive);

		this.actor.itemsManager
			.dropCondition(evasive, {value: this.ap})
			.then(() => {
				if (this.quickened) {
					setTimeout(() => {
						this.actor.itemsManager.dropCondition(quickened, {
							value: this.ap
						});
					}, 600);
				}
			});
		this.close();
	}
}
