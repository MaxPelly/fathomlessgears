import {Utils} from "../utilities/utils.js";

export async function constructCollapsibleRollMessage(roll) {
	let html = await roll.render();
	const collapseString = `<section class="tooltip-part">`;

	const formulaRegex = new RegExp(
		// eslint-disable-next-line no-useless-escape
		`<div class="dice-formula">[0-9,d,+,\-, ]*<\/div>`
	);
	const collapseRegex = new RegExp(collapseString);

	const formulaMatch = html.match(formulaRegex);
	// If the template structure has changed (e.g. in a Foundry update), fall
	// back to returning the raw rendered HTML so rolls never silently crash.
	if (!formulaMatch) {
		console.warn(
			"fathomlessgears | constructCollapsibleRollMessage: could not find dice-formula element in roll HTML. Returning un-collapsed roll."
		);
		return html;
	}
	const result = formulaMatch[0];
	html = html.replace(formulaRegex, "");

	const location = html.match(collapseRegex);
	if (!location) {
		return html;
	}
	html = Utils.insertIntoString(
		html,
		result,
		location["index"] + collapseString.length
	);
	return html;
}
