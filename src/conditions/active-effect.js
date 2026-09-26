import {NUMBERED_CONDITIONS} from "./conditions.js";

export class HLMActiveEffect extends ActiveEffect {
	_onCreate(...args) {
		super._onCreate(...args);
		this._transferEffectsIfOriginatingClient(args);
	}

	_onDelete(...args) {
		super._onDelete(...args);
		this._transferEffectsIfOriginatingClient(args);
	}

	_onUpdate(...args) {
		super._onUpdate(...args);
		this._transferEffectsIfOriginatingClient(args);
	}

	/**
	 * `transferEffects` re-derives the actor's effect list from its items, which every
	 * connected client's own copy of the actor needs done exactly once - not once per
	 * client. `userId` is always the last argument across `_onCreate`/`_onUpdate`/
	 * `_onDelete`, regardless of their differing arities. `this.parent` can be null on
	 * v14 (effects can be world/compendium documents with no actor parent).
	 * @param {Array} args The lifecycle hook's original arguments
	 */
	_transferEffectsIfOriginatingClient(args) {
		if (args.at(-1) === game.user.id) {
			this.parent?.transferEffects?.();
		}
	}

	hasCounterFlag() {
		return this.flags.statuscounter;
	}

	getCounterValue() {
		let effectCounter = foundry.utils.getProperty(
			this,
			"flags.statuscounter.value"
		);
		return effectCounter;
	}

	async setCounterValue(value) {
		await this.setFlag("statuscounter", "value", value);
	}

	async setCounterVisibility() {
		const visible = NUMBERED_CONDITIONS.includes(
			this.statuses.values().next().value
		);
		await this.setFlag("statuscounter", "visible", visible);
	}
}
