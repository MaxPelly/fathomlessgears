/**
 * Renders a roll, then moves its dice formula inside the collapsible tooltip section so
 * it's hidden until the tooltip is expanded.
 * @param {Roll} roll The evaluated roll to render
 * @returns {Promise<string>} The rendered roll HTML, with the formula relocated
 */
export async function constructCollapsibleRollMessage(roll) {
	const html = await roll.render();
	const doc = new DOMParser().parseFromString(html, "text/html");

	const formula = doc.querySelector(".dice-formula");
	const tooltipPart = doc.querySelector("section.tooltip-part");
	if (!formula || !tooltipPart) {
		return html;
	}

	tooltipPart.prepend(formula);
	return doc.body.innerHTML;
}
