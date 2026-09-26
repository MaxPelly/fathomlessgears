export class HLMApplication extends foundry.applications.api.HandlebarsApplicationMixin(
	foundry.applications.api.ApplicationV2
) {
	loading = false;

	startLoading(message) {
		this.element.querySelector("#overlay").style.display = "block";
		this.updateLoadingMessage(`${message}`);
	}

	updateLoadingMessage(newMessage) {
		this.element.querySelector("#loading-text").innerHTML =
			`<p>${newMessage}...</p>`;
	}

	stopLoading() {
		this.element.querySelector("#overlay").style.display = "none";
	}
}
