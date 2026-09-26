/**
 * Foundry v13/v14 compatibility helpers.
 *
 * Every call site that needs to branch on a v13-vs-v14 API difference (see
 * documentation/foundry-v13-v14-migration-plan.md §0.3) should import from here instead
 * of feature-detecting inline, so there is exactly one place to update when a shim is
 * eventually removed by core.
 */

/**
 * Applies the current message visibility mode (public/private/blind/self) to a chat
 * message data object before it's created.
 *
 * v14 replaces the roll-mode setting/API with a message-mode one; the old API still
 * works on v14 via a deprecation-warning shim until V16, so we feature-detect instead of
 * branching on version number.
 * @param {object} messageData The chat message data to mutate in place
 * @returns {object} The same messageData, for chaining
 */
export function applyMessageMode(messageData) {
	if (typeof ChatMessage.applyMode === "function") {
		ChatMessage.applyMode(
			messageData,
			game.settings.get("core", "messageMode")
		);
	} else {
		ChatMessage.applyRollMode(
			messageData,
			game.settings.get("core", "rollMode")
		);
	}
	return messageData;
}

/**
 * Re-export of the namespaced Handlebars helpers (see §0.2) so every call site imports
 * from this one module instead of spelling out `foundry.applications.handlebars.*`.
 */
export function renderTemplate(...args) {
	return foundry.applications.handlebars.renderTemplate(...args);
}

export function loadTemplates(...args) {
	return foundry.applications.handlebars.loadTemplates(...args);
}
