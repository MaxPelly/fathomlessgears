// Import Modules
import {HLMActor} from "./actors/actor.js";
import {HLMItem} from "./items/item.js";
import {HLMActorSheet} from "./sheets/actor-sheet.js";
import {HLMActiveEffect} from "./conditions/active-effect.js";
import {HLMToken, HLMTokenDocument, TokenDropHandler} from "./tokens/token.js";
import {HLMTokenRuler} from "./tokens/token-ruler.js";
import {preloadHandlebarsTemplates} from "./utilities/templates.js";
import {initialiseHelpers} from "./utilities/handlebars.js";
import {addFshManager} from "./data-files/fsh-manager.js";
import {HLMItemSheet} from "./sheets/item-sheet.js";
import {conditions, discoverConditions} from "./conditions/conditions.js";
import {GridHoverHUD, addGridHudToSidebar} from "./tokens/grid-hover.js";
import {GRID_HUD_LOCATION} from "./constants.js";
import {RollHandler} from "./actions/roll-handler.js";
import {MessageHandler} from "./formatting/message-handler.js";
import {HUDActionCollection} from "./actions/hud-actions.js";
import {addRollableTables} from "./actions/roll-table.js";
import HLMFishModel from "./actors/fish-schema.js";
import HLMFisherModel from "./actors/fisher-schema.js";
import {
	HLMConditionModel,
	HLMInternalNPCModel,
	HLMInternalPCModel,
	HLMTagModel,
	HLMFrameModel,
	HLMSizeModel,
	HLMGridModel,
	HLMFishTemplateModel,
	HLMHistoryModel
} from "./items/base-item-schema.js";
import {IntroDialog} from "./dialogs/intro-dialog.js";

/* -------------------------------------------- */
/*  Foundry VTT Initialization                  */
/* -------------------------------------------- */

/**
 * Init hook.
 */
Hooks.once("init", async function () {
	console.log(`Initializing Fathomless Gears System`);

	game.fathomlessgears = {
		HLMActor,
		HLMItem
	};

	// Define custom Document classes
	CONFIG.Actor.documentClass = HLMActor;
	CONFIG.Actor.dataModels = {
		fisher: HLMFisherModel,
		fish: HLMFishModel
	};
	CONFIG.Item.documentClass = HLMItem;
	CONFIG.Item.dataModels = {
		tag: HLMTagModel,
		condition: HLMConditionModel,
		internal_pc: HLMInternalPCModel,
		internal_npc: HLMInternalNPCModel,
		frame_pc: HLMFrameModel,
		size: HLMSizeModel,
		grid: HLMGridModel,
		fish_template: HLMFishTemplateModel,
		history_event: HLMHistoryModel
	};
	CONFIG.Token.documentClass = HLMTokenDocument;
	CONFIG.Token.objectClass = HLMToken;
	CONFIG.Token.rulerClass = HLMTokenRuler;
	CONFIG.ActiveEffect.documentClass = HLMActiveEffect;
	CONFIG.statusEffects = foundry.utils.duplicate(conditions);

	// Register sheet application classes
	foundry.documents.collections.Actors.registerSheet(
		"fathomlessgears",
		HLMActorSheet,
		{types: ["fisher", "fish"], makeDefault: true}
	);

	foundry.documents.collections.Items.registerSheet(
		"fathomlessgears",
		HLMItemSheet,
		{makeDefault: true}
	);

	//Load templates
	await preloadHandlebarsTemplates();
	CONFIG.Combat.initiative = {
		formula: "20-@attributes.ballast.total + 0.1*@attributes.speed.total",
		decimals: 1
	};
	Hooks.on("renderCompendiumDirectory", async (_app, html) => {
		addFshManager(html);
	});
	Hooks.on("renderActorDirectory", async (_app, html) => {
		addGridHudToSidebar(html);
	});
	// A single global listener for every actor prepared before the condition item
	// compendium finished loading, rather than one `HLMActor#prepareDerivedData`
	// registering its own (never-removed) listener on every data-prep cycle.
	Hooks.on("conditionListReady", () => {
		setTimeout(() => {
			const actors = new Set(game.actors);
			canvas.tokens?.placeables?.forEach((token) => {
				if (token.actor) actors.add(token.actor);
			});
			actors.forEach((actor) => actor.applyConditions());
		}, 2000);
	});

	initialiseHelpers();
});

Hooks.on("init", async function () {
	game.keybindings.register("fathomlessgears", "pinGrid", {
		name: "Lock HUD Grid Display",
		hint: "Locks or unlocks the grid currently displayed on the HUD",
		editable: [
			{
				key: "KeyG"
			}
		],
		onDown: () => {
			game.gridHover.toggleLock();
		},
		onUp: () => {},
		restricted: false, // Restrict this Keybinding to gamemaster only?
		precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
	});

	// Settings must be registered in init so they exist before anything reads them
	// (v14 pop-outs and early hooks may read settings before ready fires).
	game.settings.register("fathomlessgears", "gridHUDPosition", {
		name: "Grid HUD Position",
		hint: "The position of the grid HUD display",
		scope: "client",
		config: true,
		type: String,
		choices: {
			[GRID_HUD_LOCATION.bottomLeft]: "Bottom Left",
			[GRID_HUD_LOCATION.bottomRight]: "Bottom Right",
			[GRID_HUD_LOCATION.topLeft]: "Top Left",
			[GRID_HUD_LOCATION.topRight]: "Top Right"
		},
		default: GRID_HUD_LOCATION.topRight,
		onChange: (_value) => {
			game.gridHover.refresh();
		}
	});
	game.settings.register("fathomlessgears", "gridHUDOnHover", {
		name: "Show grid HUD on token hover",
		hint: "If disabled, the grid HUD will only be visible via the lock hotkey",
		scope: "client",
		config: true,
		type: Boolean,
		default: true
	});
	game.settings.register("fathomlessgears", "gridHUDOnSidebarHover", {
		name: "Show grid HUD on actor sidebar hover",
		hint: "If disabled, the grid HUD will only be visible via the lock hotkey",
		scope: "client",
		config: true,
		type: Boolean,
		default: true
	});
	game.settings.register("fathomlessgears", "datafiles", {
		name: "Source data files",
		hint: "Stores the datafile sources for frames, internals, sizes, etc",
		scope: "world",
		config: false,
		type: Array,
		default: [],
		requiresReload: false
	});
	game.settings.register("fathomlessgears", "introComplete", {
		name: "Has viewed & checked intro dialog",
		hint: "Stores the datafile sources for frames, internals, sizes, etc",
		scope: "world",
		config: false,
		type: Boolean,
		default: false,
		requiresReload: false
	});
});

export const system_ready = new Promise((success) => {
	Hooks.once("ready", async function () {
		MessageHandler.addMessageHandler();
		RollHandler.addRollHandler();
		HUDActionCollection.addHUDActions();
		TokenDropHandler.addTokenDropHandler();

		//Post-init stuff goes here
		const gridCollection = await game.packs.get(
			"fathomlessgears.grid_type"
		);
		if (game.user.isGM) {
			gridCollection.configure({ownership: {PLAYER: "NONE"}});
		}

		GridHoverHUD.addGridHUD();

		const dataFiles = game.settings.get("fathomlessgears", "datafiles");
		const introComplete = game.settings.get(
			"fathomlessgears",
			"introComplete"
		);

		if (dataFiles.length == 0 && !introComplete) {
			new IntroDialog();
		}

		game.availableConditionItems = discoverConditions();
		addRollableTables();
		Hooks.callAll("conditionListReady");

		console.log("Ready!");
		success();
	});
});
