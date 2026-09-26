/**
 * @extends {foundry.applications.sheets.ItemSheetV2}
 */
export class HLMItemSheet extends foundry.applications.api.HandlebarsApplicationMixin(
	foundry.applications.sheets.ItemSheetV2
) {
	static DEFAULT_OPTIONS = {
		classes: ["fathomlessgears", "sheet", "item"],
		tag: "form",
		position: {width: 400, height: 200},
		form: {submitOnChange: true},
		dragDrop: [{dragSelector: ".item-list .item", dropSelector: null}]
	};

	static PARTS = {
		main: {template: "systems/fathomlessgears/templates/item-sheet.html"}
	};
}
