export class ConfirmDialog {
	title = "";
	content = "";
	callbackAction = null;
	args = null;

	/**
	 * Create a confirmation dialog
	 * @param {str} title
	 * @param {str} content
	 * @param {function} callbackAction returns True if Proceed is selected, False if Cancel is selected
	 * @param {*} args Other inputs to callbackAction
	 */
	constructor(title, content, callbackAction, args = null) {
		this.title = title;
		this.content = content;
		this.callbackAction = callbackAction;
		this.args = args;
		this.showDialog();
	}

	async showDialog() {
		const proceed = await foundry.applications.api.DialogV2.confirm({
			window: {title: this.title},
			content: "<p>" + this.content + "</p>",
			rejectClose: false,
			yes: {label: "Confirm"},
			no: {label: "Cancel"}
		});
		await this.callbackAction(Boolean(proceed), this.args);
	}
}
