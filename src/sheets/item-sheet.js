/**
 * @extends {foundry.applications.sheets.ItemSheetV2}
 */
export class HLMItemSheet extends foundry.applications.api.HandlebarsApplicationMixin(
	foundry.applications.sheets.ItemSheetV2
) {
	static DEFAULT_OPTIONS = {
		classes: ["fathomlessgears", "sheet", "item", "themed", "theme-light"],
		tag: "form",
		position: {width: 400, height: 200},
		form: {submitOnChange: true},
		dragDrop: [{dragSelector: ".item-list .item", dropSelector: null}]
	};

	static PARTS = {
		main: {template: "systems/fathomlessgears/templates/item-sheet.html"}
	};

	/**
	 * ItemSheetV2's base _prepareContext doesn't populate context.item the way AppV1's
	 * ItemSheet.getData() used to (confirmed by the same gap on the actor sheet, found via
	 * live testing) - the template expects it, so it needs setting explicitly.
	 */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		context.item = this.item;
		return context;
	}

	//The template's own <form> wrapper (and its autocomplete="off") was removed since
	//ApplicationV2 supplies the form itself via `tag: "form"` - restore the attribute on
	//that real form element instead.
	_onRender(context, options) {
		super._onRender(context, options);
		this.form.autocomplete = "off";
	}
}
