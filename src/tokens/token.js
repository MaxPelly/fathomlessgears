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
	 * Draw the effect icons applicable to this token (see `filterEffectList`). Kept as a
	 * v12-core-derived reimplementation rather than delegating to `super._drawEffects()`
	 * via a temporarily-shadowed actor effect getter: the shared Actor document is read
	 * directly by other code that can run concurrently with an `await` inside this method
	 * - notably `Actor#transferEffects` (src/actors/actor.js), which reads
	 * `this.appliedEffects` on that same actor whenever an effect changes, which is
	 * exactly when a redraw like this one is also triggered. Shadowing the real actor's
	 * property (even temporarily, even restored in a `finally`) would let that unrelated
	 * read observe this token's filtered subset instead of the actor's real effect list.
	 * Only the effect-list source has changed from the pre-migration version of this
	 * method: see `getTokenEffectsToDraw` for the v13/v14 split it replaces.
	 * @override
	 */
	async _drawEffects() {
		this.effects.renderable = false;

		// Clear Effects Container
		this.effects.removeChildren().forEach((c) => c.destroy());
		this.effects.bg = this.effects.addChild(new PIXI.Graphics());
		this.effects.bg.zIndex = -1;
		this.effects.overlay = null;

		// Categorize new effects
		const activeEffects = this.filterEffectList(
			getTokenEffectsToDraw(this)
		);
		const overlayEffect = activeEffects.findLast(
			(e) => e.img && e.getFlag("core", "overlay")
		);

		// Draw effects
		const promises = [];
		for (const [i, effect] of activeEffects.entries()) {
			if (!effect.img) continue;
			const promise =
				effect === overlayEffect
					? this._drawOverlay(effect.img, effect.tint)
					: this._drawEffect(effect.img, effect.tint);
			promises.push(
				promise.then((e) => {
					if (e) e.zIndex = i;
				})
			);
		}
		await Promise.allSettled(promises);

		this.effects.sortChildren();
		this.effects.renderable = true;
		this.renderFlags.set({refreshEffects: true});
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
