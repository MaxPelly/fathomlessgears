import {Utils} from "../utilities/utils.js";
import {HLMApplication} from "../sheets/application.js";
import {FshManager} from "../data-files/fsh-manager.js";

export class IntroDialog extends HLMApplication {
	static DEFAULT_OPTIONS = {
		classes: ["fathomlessgears", "themed", "theme-light"],
		window: {title: "INTRO.title"},
		position: {width: 300},
		actions: {
			skip: IntroDialog.#onSkip,
			openManager: IntroDialog.#onOpenManager
		}
	};

	static PARTS = {
		main: {template: "systems/fathomlessgears/templates/intro-dialog.html"}
	};

	dontshow = false;

	constructor(...args) {
		super(...args);
		this.render({force: true});
	}

	_onRender(context, options) {
		super._onRender(context, options);
		Utils.activateButtons(this.element);
		this.element
			.querySelector('[data-selector="dontshow"]')
			.addEventListener("change", (evt) => {
				this.dontshow = evt.target.checked;
			});
	}

	static #onSkip() {
		if (this.dontshow) {
			this.saveDontShow();
		}
		this.close();
	}

	static #onOpenManager() {
		if (this.dontshow) {
			this.saveDontShow();
		}
		if (!FshManager.isOpen) {
			new FshManager();
		}
		this.close();
	}

	saveDontShow() {
		game.settings.set("fathomlessgears", "introComplete", true);
	}
}
