//This code draws on from Eriku33's Image Hover: https://github.com/Eriku33/Foundry-VTT-Image-Hover
import {ACTOR_TYPES} from "../constants.js";
import {HLMApplication} from "../sheets/application.js";

/**
 * Copy Placeable HUD template
 */
export class GridHoverHUD extends HLMApplication {
	static DEFAULT_OPTIONS = {
		id: "grid-hover-hud",
		classes: ["grid-hover-hud", "popout"],
		window: {
			frame: false,
			positioned: false,
			minimizable: false,
			resizable: false
		}
	};

	static PARTS = {
		main: {
			template:
				"systems/fathomlessgears/templates/grid-hover-template.html"
		}
	};

	actor;

	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const actor = this.actor;
		if (!actor) return context;
		let grid = actor.grid;

		context.grid = grid;
		context.lockPrompt = this.getLockPrompt();
		context.interactive = actor.testUserPermission(
			game.user,
			CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
		);
		context.position = game.settings.get(
			"fathomlessgears",
			"gridHUDPosition"
		);

		if (actor.type == ACTOR_TYPES.fish) {
			const hp = grid.calculateHP();
			const tranq = Math.min(actor.getConditionValue("tranq"), 3);
			const catchCounters = actor.getConditionValue("catchcounter");
			const effectiveHP = Math.max(hp - tranq - catchCounters, 0);
			context.hp = `${game.i18n.localize("GRID.remainingHP")}: ${effectiveHP}`;
			context.hpBreakdown = `(${hp} HP`;
			if (tranq) {
				context.hpBreakdown = context.hpBreakdown.concat(
					` - ${tranq} ${game.i18n.localize("CONDITIONS.tranq")}`
				);
			}
			if (catchCounters) {
				context.hpBreakdown = context.hpBreakdown.concat(
					` - ${catchCounters} ${game.i18n.localize("CONDITIONS.catchcounter")}`
				);
			}
			context.hpBreakdown = context.hpBreakdown.concat(")");
		}

		return context;
	}

	/**
	 * check requirements then show grid
	 */
	checkShowGridRequirements(actor) {
		setTimeout(function () {
			if (
				actor.getFlag("fathomlessgears", "interactiveGrid") &&
				actor.testUserPermission(
					game.user,
					CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER
				)
			) {
				game.gridHover.assignActor(actor);
			} else {
				if (!this.lock) {
					game.gridHover.clear();
				}
			}
		}, 0);
	}

	_onRender(context, options) {
		super._onRender(context, options);
		this.actor?.grid.activateListeners(this.element);
	}

	/**
	 * Activates a grid HUD
	 * @param {HLMActor} actor The actor being hovered (fom token or sidebar)
	 */
	assignActor(actor) {
		this.actor = actor;
		if (this.state === this.constructor.RENDER_STATES.CLOSING) {
			this.awaitingRefresh = true;
		} else {
			this.render({force: true});
		}
	}

	/**
	 * Removes the token grid HUD
	 */
	clear() {
		this.actor = null;
		this.close().then(() => {
			if (this.awaitingRefresh && this.actor) {
				this.render({force: true});
			}
		});
	}

	/**
	 * toggles on/off grid lock
	 */
	toggleLock() {
		const showOnHover = game.settings.get(
			"fathomlessgears",
			"gridHUDOnHover"
		);
		const showOnSidebarHover = game.settings.get(
			"fathomlessgears",
			"gridHUDOnSidebarHover"
		);
		if (this.lock) {
			this.lock = false;
			if (
				(!this.hovering || !showOnHover) &&
				(!this.hoveringSidebar || !showOnSidebarHover)
			) {
				this.clear();
			}
		} else {
			if (this.hovering) {
				this.lock = true;
				if (!showOnHover) {
					this.checkShowGridRequirements(this.hoveredToken.actor);
				}
			} else if (this.hoveringSidebar) {
				this.lock = true;
				if (!showOnSidebarHover) {
					this.checkShowGridRequirements(this.hoveredSidebarActor);
				}
			}
		}
	}

	/**
	 * Create a Grid HUD manager and attach it to the game
	 */
	static addGridHUD() {
		game.gridHover = new GridHoverHUD();
		game.gridHover.initialiseHooks();
	}

	initialiseHooks() {
		/**
		 * Display grid when user hovers mouse over a actor
		 * Must be used on the token layer and have relevant actor permissions (configurable settings by the game master)
		 * @param {*} token passed in token
		 * @param {Boolean} hovered if token is mouseovered
		 */
		Hooks.on("hoverToken", (token, hovered) => {
			game.gridHover.hoveredToken = token;
			game.gridHover.hovering = hovered;
			const showOnHover = game.settings.get(
				"fathomlessgears",
				"gridHUDOnHover"
			);
			if (showOnHover && canvas.tokens.active) {
				if (game.gridHover.lock) {
					return;
				}
				if (!hovered) {
					game.gridHover.clear();
					return;
				}
				game.gridHover.checkShowGridRequirements(token.actor);
			}
		});

		Hooks.on("preUpdateToken", () => clearGrid());
		Hooks.on("deleteToken", () => clearGrid());
		Hooks.on("closeSettingsConfig", () => clearGrid());
		// Every application in this system is now ApplicationV2 (HLMActorSheet/
		// HLMItemSheet converted in a later chunk than the one that added this hook), so
		// the V1 base-class hook (closeApplication) and the ActorSheet-specific V1 hook
		// (closeActorSheet) are both dead code - closeApplicationV2 alone now covers every
		// app in the system.
		Hooks.on("closeApplicationV2", () => clearGrid());

		Hooks.on("updateActor", (...args) => refreshGrid(...args));
		Hooks.on("updateActiveEffect", (condition) =>
			refreshGrid(condition.parent)
		);
		Hooks.on("deleteActiveEffect", (condition) =>
			refreshGrid(condition.parent)
		);
		Hooks.on("createActiveEffect", (condition) =>
			refreshGrid(condition.parent)
		);
	}

	getLockPrompt() {
		let keyString = game.keybindings.get("fathomlessgears", "pinGrid")[0]
			.key;
		keyString = keyString.replace("Key", "");
		if (!this.lock) {
			return game.i18n
				.localize("GRIDHUD.lockON")
				.replace("_KEY_", keyString);
		} else {
			return game.i18n
				.localize("GRIDHUD.lockOFF")
				.replace("_KEY_", keyString);
		}
	}

	refresh() {
		if (this.rendered) {
			refreshGrid(this.actor);
		}
	}
}

/**
 * Clear grid
 */
function clearGrid() {
	if (game.gridHover) {
		if (!game.gridHover.lock) {
			game.gridHover.clear();
		}
	}
}

/**
 * When an actor is modified, check if the current HUD needs to refresh
 * @param {HLMActor} actor The actor that has been updated
 */
function refreshGrid(actor) {
	if (game.gridHover?.rendered && game.gridHover.actor._id == actor.id) {
		setTimeout(() => {
			game.gridHover.render({force: true});
		}, 20);
	}
}

/**
 * Wires up grid HUD hover behaviour on the actors sidebar.
 * Uses a single delegated listener so partial re-renders of the directory
 * (e.g. folder expand/collapse) don't lose or duplicate listeners.
 * @param {HTMLElement} html The rendered actors sidebar element
 */
export function addGridHudToSidebar(html) {
	if (html.dataset.gridHudBound) return;
	html.dataset.gridHudBound = "true";

	let hoveredEntryId = null;
	html.addEventListener("mouseover", (ev) => {
		const actorEntry = ev.target.closest("li.directory-item.entry.actor");
		const actorId = actorEntry?.dataset.entryId ?? null;
		if (actorId === hoveredEntryId) return;
		hoveredEntryId = actorId;
		if (!actorId) {
			game.gridHover.hoveredSidebarActor = null;
			game.gridHover.hoveringSidebar = false;
			clearGrid();
			return;
		}

		const showOnHover = game.settings.get(
			"fathomlessgears",
			"gridHUDOnSidebarHover"
		);
		const actor = game.actors.get(actorId);
		game.gridHover.hoveredSidebarActor = actor;
		game.gridHover.hoveringSidebar = true;
		if (showOnHover) {
			if (game.gridHover.lock) {
				return;
			}
			game.gridHover.checkShowGridRequirements(actor);
		}
	});
	html.addEventListener("mouseleave", () => {
		hoveredEntryId = null;
		game.gridHover.hoveredSidebarActor = null;
		game.gridHover.hoveringSidebar = false;
		clearGrid();
	});
}
