import {NUMBERED_CONDITIONS} from "./conditions.js";

export class HLMActiveEffect extends ActiveEffect {
	/**
	 * `Actor#transferEffects` (src/actors/actor.js) already gates its own body on
	 * `game.user.id == this.firstOwner().id`, so it's safe (and necessary - that gate
	 * doesn't correlate with which client made this particular edit) to call it
	 * unconditionally here on every connected client; exactly one of them will pass the
	 * inner check. `this.parent` can be null on v14 (effects can be world/compendium
	 * documents with no actor parent), hence the optional chains.
	 */
	_onCreate(...args) {
		super._onCreate(...args);
		this.parent?.transferEffects?.();
	}

	_onDelete(...args) {
		super._onDelete(...args);
		this.parent?.transferEffects?.();
	}

	_onUpdate(...args) {
		super._onUpdate(...args);
		this.parent?.transferEffects?.();
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
