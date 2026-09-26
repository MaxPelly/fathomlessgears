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
 * v14 removes `ChatMessage.applyRollMode` entirely and replaces it with
 * `ChatMessage.applyMode(chatData, mode?)`, whose `mode` argument is optional and - per
 * its own docs - defaults to "the default mode stored in client settings" when omitted.
 * v13 has no `applyMode` and requires the roll mode to be passed explicitly. We
 * feature-detect on the new method rather than the version number, and deliberately
 * don't try to read/guess whatever setting key v14 stores its default mode under (no
 * `core.messageMode` setting is documented) - we let `applyMode` resolve its own default.
 * @param {object} messageData The chat message data to mutate in place
 * @returns {object} The same messageData, for chaining
 */
export function applyMessageMode(messageData) {
	if (typeof ChatMessage.applyMode === "function") {
		ChatMessage.applyMode(messageData);
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
