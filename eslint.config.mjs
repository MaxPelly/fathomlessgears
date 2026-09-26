import js from "@eslint/js";
import globals from "globals";

// Deprecated Foundry VTT globals (see documentation/foundry-v13-v14-migration-plan.md §0.2).
// Flagging these prevents accidental reintroduction of the old, non-namespaced APIs.
const deprecatedFoundryGlobals = ["renderTemplate", "loadTemplates"];

export default [
	{ignores: ["scripts/**/*.js", "scripts/**/*.mjs"]},
	js.configs.recommended,
	{
		files: ["**/*.js"],
		languageOptions: {
			parserOptions: {
				ecmaVersion: "latest",
				sourceType: "module"
			},
			globals: {
				...globals.browser,
				foundry: "readonly",
				game: "readonly",
				CONFIG: "readonly",
				CONST: "readonly",
				canvas: "readonly",
				ui: "readonly",
				Hooks: "readonly",
				JSZip: "readonly"
			}
		},
		rules: {
			"no-undef": 0,
			"no-restricted-globals": [
				"error",
				...deprecatedFoundryGlobals.map((name) => ({
					name,
					message:
						"Deprecated Foundry global - use the namespaced replacement from the v13/v14 migration plan (§0.2) instead."
				}))
			],
			"no-unused-vars": [
				"error",
				{
					args: "all",
					argsIgnorePattern: "^_",
					caughtErrors: "all",
					caughtErrorsIgnorePattern: "^_",
					destructuredArrayIgnorePattern: "^_",
					varsIgnorePattern: "^_",
					ignoreRestSiblings: true
				}
			]
		},
		linterOptions: {
			reportUnusedDisableDirectives: "error"
		}
	}
];
