/**
 * Copyright 2023-2024 Gauthier Dandele
 *
 * Licensed under the MIT License,
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://opensource.org/licenses/MIT.
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var FirestoreUI = FirestoreUI || (function () {
	"use strict";

	const i18n = function (key, tplStrs) {
		return FirestoreUI._(key, "firestore-in", "validator", tplStrs);
	};

	const validators = {
		boolean: function () {
			return function (value, opt) {
				// See NR#4715 - "on" value
				if (typeof value === "boolean" || value === "on") return true;
				if (opt?.label) return i18n("errors.invalid-bool-prop", { prop: opt.label });
				return opt ? i18n("errors.invalid-bool") : false;
			};
		},
		filter: function () {
			return function (value, opt) {
				if (typeof value === "string" && /^(msg|none|added|modified|removed)$/.test(value)) return true;
				return opt ? i18n("errors.invalid-filter") : false;
			};
		},
		limit: function () {
			return function (value, opt) {
				if (typeof value === "string" && /^[1-9][0-9]*$/.test(value)) return true;
				if (typeof value === "string" && /^$|[.]/.test(value))
					return opt ? opt.label ? i18n("errors.no-integer-prop", { prop: opt.label }) : i18n("errors.no-integer") : false;
				if (typeof value === "string" && /^-+|^0$/.test(value))
					return opt ? opt.label ? i18n("errors.invalid-range-prop", { prop: opt.label }) : i18n("errors.invalid-range") : false;
				return opt ? opt.label ? i18n("errors.invalid-num-prop", { prop: opt.label }) : i18n("errors.invalid-num") : false;
			};
		},
		path: function (options) {
			options = Object.assign({ allowBlank: false, allowSlash: true }, options);
			const regex = options.allowBlank ? /^\s|\s$|\/{2,}/ : /^$|^\s|\s$|\/{2,}/;
			return function (value, opt) {
				// TODO: Remove the default label - need to handle it into the NR core
				if (opt && !opt.label) { opt.label = FirestoreUI._("placeholder.path", "firestore-in", "constraints"); }
				if (!options.allowSlash && typeof value === "string" && /[\/]/.test(value))
					return opt ? i18n("errors.contains-slash") : false;
				if (typeof value === "string" && !regex.test(value))
					return true;
				if (!options.allowBlank && !value)
					return opt ? i18n("errors.empty-path-prop", { prop: opt.label }) : false;
				if (/^\s|\s$/.test(value))
					return opt ? i18n("errors.contains-space-prop", { prop: opt.label }) : false;
				return opt ? i18n("errors.invalid-path-prop", { prop: opt.label }) : false;
			};
		},
		pathType: function () {
			return function (value, opt) {
				if (typeof value === "string" && /^(msg|str|flow|global|jsonata|env)$/.test(value)) return true;
				if (opt?.label) return i18n("errors.invalid-type-prop", { prop: opt.label });
				return opt ? i18n("errors.invalid-type") : false;
			};
		},
		queryMethod: function () {
			return function (value, opt) {
				if (typeof value === "string" && /^(msg|set|delete|update)$/.test(value)) return true;
				return opt ? i18n("errors.invalid-queryMethod") : false;
			};
		},
		typedInput: function (typeName, opts = {}) {
			let options = typeName;

			if (typeof typeName === "string") {
				options = {
					allowBlank: false,
					isConfig: false,
					typeField: typeName,
					...opts,
				};
			}

			// TODO: validateNode override TypedInput - Quid with NR team?
			return function (value, opt) {
				const type = options.type || $(`#node-input-${options.typeField}`).val() || this[options.typeField];

				if (type === "str" && ["collectionType", "collectionGroupType", "documentType"].includes(options.typeField)) {
					const fieldName = options.typeField.match(/([a-zA-Z]+)Type/)[1];
					const refSelect = $("#node-input-referenceType");

					let allowBlank = false, allowSlash = true;
					if (refSelect.length) {
						// Validation by the edit box
						const referenceType = refSelect.val();
						allowBlank = referenceType !== fieldName;
						allowSlash = fieldName !== "collectionGroup";
					} else if (this.type === "firestore-out") {
						if (fieldName === "collection") {
							allowBlank = true;
						} else if (($("#node-input-queryMethod").val() ?? this.queryMethod) === "set") {
							allowBlank = true;
						}
					} else {
						// Validation by the node
						if ((this.document || this.collection) && this.collectionGroup) {
							allowBlank = true;
							allowSlash = fieldName !== "collectionGroup";
						} else {
							const referenceType = this.document ? "document" : this.collectionGroup ? "collectionGroup" : "collection";
							allowBlank = referenceType !== fieldName;
							allowSlash = fieldName !== "collectionGroup";
						}
					}

					return FirestoreUI.validators.path(Object.assign({ allowBlank: allowBlank, allowSlash: allowSlash }, opts))(value, opt);
				}

				// If NR version >= 3.1.3 use the new validators
				const redVersion = (RED.settings.version || "0.0.0").split(".").map((s) => Number(s));
				if (redVersion[0] > 3 || (redVersion[0] === 3 && (redVersion[1] > 1 || (redVersion[1] === 1 && redVersion[2] >= 3))))
					return RED.validators.typedInput(options).call(this, value, opt);

				// Workaround for NR#4440 to pass type
				const validateTypedProperty = RED.validators.typedInput(options.typeField || "fake-typeName");
				const context = options.type ? { "fake-typeName": options.type } : {};
				return validateTypedProperty.call(Object.assign(this, context), value, opt);
			}
		},
	};

	class TypedPathInput {
		constructor(fieldName) {
			this._autoComplete = {};
			this._allowBlank = false;
			this._allowSlash = true;
			this._fieldName = fieldName;
			this._modeByDefault = "dynamic";
			this.mode = this._modeByDefault;
			this.input = $(`#node-input-${fieldName}`);
			this._types = [];
		}

		#applyNewTypes() {
			const types = this.mode === "static" ? this.staticFieldOptions : this.dynamicFieldOptions;
			this.input.typedInput("types", types);
		}

		/**
		 * Allow blank path
		 * @param {boolean} value True to allow blank path
		 * @returns {TypedPathInput}
		 */
		allowBlank(value) {
			if (typeof value !== "boolean") throw new TypeError("allowBlank must be a boolean");
			this._allowBlank = value;
			return this;
		}

		/**
		 * Allow path to contains slash (`/`). Default true.
		 * @param {boolean} value True to allow slash in path
		 * @returns {TypedPathInput}
		 */
		allowSlash(value) {
			if (typeof value !== "boolean") throw new TypeError("allowSlash must be a boolean");
			this._allowSlash = value;
			return this;
		}

		/**
		 * Build the typedPathField
		 * @returns {void}
		 */
		build() {
			this.mode = this._modeByDefault;
			this.staticFieldOptions = [{ value: "str", label: "string", icon: "red/images/typedInput/az.svg", validate: validators.path({ allowBlank: this._allowBlank, allowSlash: this._allowSlash }), ...this._autoComplete }];
			this.dynamicFieldOptions = [...this.staticFieldOptions, "msg", "flow", "global", "jsonata", "env"];
			this.input.typedInput({
				typeField: `#node-input-${this._fieldName}Type`,
				types: this._modeByDefault === "dynamic" ? this.dynamicFieldOptions : this.staticFieldOptions,
			});
		}

		/**
		 * Allow blank path
		 * @param {boolean} value True to allow blank path
		 * @returns {void}
		 */
		dynamicallyAllowBlank(value) {
			if (typeof value !== "boolean") throw new TypeError("dynamicallyAllowBlank must be a boolean");
			this._allowBlank = value;
			this.staticFieldOptions[0].validate = validators.path({ allowBlank: this._allowBlank, allowSlash: this._allowSlash });
			this.#applyNewTypes();
		}

		/**
		 * Enable the autocomplete option to the path field
		 * @returns {TypedPathInput}
		 */
		enableAutoComplete() {
			// TODO: Autocomplete
			//this._autoComplete = { autoComplete: autoComplete() };
			return this;
		}

		/**
		 * The path may be defined dynamically or statically. By default, dynamic types are displayed.
		 * @param {"static" | "dynamic"} mode The mode to set (`static` or `dynamic`)
		 * @returns {TypedPathInput}
		 */
		modeByDefault(mode) {
			if (mode === "static") this._modeByDefault = "static";
			else if (mode === "dynamic") this._modeByDefault = "dynamic";
			else throw new Error("mode must be 'static' or 'dynamic'");
			return this;
		}

		/**
		 * Switch the types of the typedPathField to static or dynamic
		 * @param {"dynamic" | "static"} mode The mode to switch to
		 * @returns {void}
		 */
		switchModeTo(mode) {
			if (mode !== "static" && mode !== "dynamic") throw new Error("mode must be 'static' or 'dynamic'");
			this.mode = mode;
			this.#applyNewTypes();
		}
	}

	function generateToolTip(element, message) {
    const tip = $('<i class="fa fa-info-circle"></i>').css("cursor", "pointer");
    //RED.popover.tooltip(tip, message);

    RED.popover.create({
      target: tip,
      direction: "right",
      maxWidth: 300,
      trigger: "hover",
      content: message,
      tooltip: true,
      interactive: true,
    });

    $(element).parent().append(tip);
  }

	function i18nFullOptions(key, dict, group = "", tplStrs) {
		if (typeof group === "object" && !tplStrs) {
			tplStrs = group;
			group = "";
		}

		return RED._(`@gogovega/node-red-contrib-cloud-firestore/${dict}:${group || dict}.${key}`, tplStrs);
	}

	// Check the Firebase Config Node
	$.getScript("resources/@gogovega/node-red-contrib-cloud-firestore/config-node.js");

	return {
		_: i18nFullOptions,
		generateToolTip: generateToolTip,
		typedPathField: { create: (fieldName) => new TypedPathInput(fieldName) },
		validators: validators,
	};
})();
