import {Utils} from "../utilities/utils.js";

export class FileUploader extends foundry.applications.api.HandlebarsApplicationMixin(
	foundry.applications.api.ApplicationV2
) {
	targetFile;
	manager;
	newFile;

	static DEFAULT_OPTIONS = {
		classes: ["fathomlessgears"],
		window: {title: "File Upload"},
		position: {width: 400, height: 115},
		actions: {
			upload: FileUploader.#onUploadButtonClick
		}
	};

	static PARTS = {
		main: {template: "systems/fathomlessgears/templates/uploader.html"}
	};

	constructor(manager, options = null, ...args) {
		super(...args);
		this.uploaderOptions = options;
		this.manager = manager;

		if (this.uploaderOptions?.importNameOption) {
			this.uploaderOptions.importNameFlag = true;
		}
		this.render({force: true});
	}

	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		context.importName = this.uploaderOptions?.importNameOption;
		return context;
	}

	_onRender(context, options) {
		super._onRender(context, options);
		Utils.activateButtons(this.element);
		let fileInput = this.element.querySelector("#fsh-file-select");
		if (fileInput) {
			fileInput.onchange = (ev) => {
				this._selectFile(ev);
			};
		}
		if (this.uploaderOptions?.importNameOption) {
			this.element
				.querySelector(".import-name-checkbox")
				.addEventListener("change", () => {
					this.uploaderOptions.importNameFlag =
						!this.uploaderOptions.importNameFlag;
				});
		}
	}

	/**
	 * Detect a selected file
	 */
	_selectFile(ev) {
		let file = ev.target.files[0];
		if (!file) return;
		this.newFile = file;
	}

	/**
	 * Load the binary and activate the upload button
	 */
	static #onUploadButtonClick() {
		//need to read the file as binary since Foundry's uploaders don't like the .fsh extension
		const fr = new FileReader();
		fr.readAsBinaryString(this.newFile);
		fr.addEventListener("load", (ev) => {
			this.manager
				.onFileLoaded(
					ev.target.result,
					this.newFile.name,
					this.uploaderOptions
				)
				.then();
			this.close();
		});
	}
}
