import {BALLAST_TOKEN_CONDITIONS} from "../conditions/conditions.js";
import {getTokenEffectsToDraw} from "../utilities/compat.js";

/**
 * Extend the base TokenDocument to support resource type attributes.
 * @extends {foundry.documents.TokenDocument}
 */
export class HLMTokenDocument extends foundry.documents.TokenDocument {}

/**
 * Extend the base Token class to implement additional system-specific logic.
 * @extends {foundry.canvas.placeables.Token}
 */
export class HLMToken extends foundry.canvas.placeables.Token {
	_onHoverIn(...args) {
		super._onHoverIn(...args);
		game.hoveredToken = this;
	}

	_onHoverOut(...args) {
		super._onHoverOut(...args);
		game.hoveredToken = null;
	}
	/**
	 * Draw the actor's effect icons, filtered to only those applicable to this token (see
	 * `filterEffectList`), by temporarily substituting the actor's effect list core reads
	 * from and delegating everything else to core's own `_drawEffects` implementation.
	 * This avoids re-implementing core's drawing logic (which differs between v13 and
	 * v14 - see `getTokenEffectsToDraw`), while still applying the system's own filtering.
	 * @override
	 */
	async _drawEffects() {
		const actor = this.actor;
		if (!actor) return super._drawEffects();

		const effects = this.filterEffectList(getTokenEffectsToDraw(this));
		const propertyName = CONST.ACTIVE_EFFECT_SHOW_ICON
			? "appliedEffects"
			: "temporaryEffects";
		const descriptor = Object.getOwnPropertyDescriptor(actor, propertyName);

		Object.defineProperty(actor, propertyName, {
			configurable: true,
			get: () => effects
		});

		try {
			await super._drawEffects();
		} finally {
			if (descriptor) {
				Object.defineProperty(actor, propertyName, descriptor);
			} else {
				delete actor[propertyName];
			}
		}
	}

	filterEffectList(actorEffects) {
		return actorEffects.filter((effect) => {
			const statusName = effect.statuses.values().next().value;
			let result = false;
			if (this.document.flags.fathomlessgears?.ballastToken) {
				result = BALLAST_TOKEN_CONDITIONS.includes(statusName);
			} else {
				result = !BALLAST_TOKEN_CONDITIONS.includes(statusName);
			}
			return result;
		});
	}
}

export class TokenDropHandler {
	static addTokenDropHandler() {
		game.tokenDrop = new TokenDropHandler();
		game.tokenDrop.initialiseHooks();
	}

	initialiseHooks() {
		Hooks.on("dropCanvasData", (_canvas, data) => {
			if (data.type == "Item") {
				game.tokenDrop.onCanvasDrop(data);
			}
		});
	}

	async onCanvasDrop(data) {
		const token = getTokenAtPosition(data);
		if (!token) return;
		const item = await fromUuid(data.uuid);
		const actor = token.actor;

		if (actor.itemsManager.canDropItem(item)) {
			actor.itemsManager.receiveDrop(item, data);
		}
	}
}

function getTokenAtPosition(position) {
	const token = canvas.tokens.placeables
		.filter((t) => t.visible)
		.find((t) => t.bounds.contains(position.x, position.y));
	return token?.document;
}
