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

var FirestoreQueryConstraintsContainer = FirestoreQueryConstraintsContainer || (function () {
	"use strict";

	// Need window due to JS strict mode
	if (!window.FirestoreUI) {
		return;
	}

	const { validators } = FirestoreUI;

	const queryConstraintTypes = ["endAt", "endBefore", "limitToFirst", "limitToLast", "orderBy", "offset", "select", "startAfter", "startAt", "where"];
	const queryConstraintFieldOptions = queryConstraintTypes.map((fieldName) => (
		{ value: fieldName, label: i18n(`label.${fieldName}`) }
	));

	const whereFilterOptions = ["<", "<=", "==", "!=", ">=", ">", "array-contains", "in", "not-in", "array-contains-any"].map((fieldName) => (
		{ value: fieldName, label: i18n(`where-filter.${fieldName}`, { defaultValue: fieldName }) }
	));

	const directionOptions = ["asc", "desc"].map((fieldName) => ({ value: fieldName, label: i18n(`direction.${fieldName}`) }));

	const dynamicFieldTypes = ["msg", "flow", "global", "jsonata", "env"];
	const limitFieldTypes = [{ value: "num", label: "number", icon: "red/images/typedInput/09.svg", validate: validators.limit() }, ...dynamicFieldTypes];
	const rangeFieldTypes = ["bool", "num", "str", "date", { value: "null", label: "null", hasValue: false }, "json", ...dynamicFieldTypes];

	const stringArrayFieldType = {
		value: "array",
		label: "String Array",
		icon: "resources/@gogovega/node-red-contrib-cloud-firestore/array-brackets.svg",
		validate: isSelectValueValid,
		expand: function () {
			const that = this;
			let value = this.value();

			try {
				value = JSON.stringify(JSON.parse(value), null, 4);
			} catch (_error) { }

			RED.editor.editJSON({
				value: value,
				stateId: RED.editor.generateViewStateId("typedInput", that, "array"),
				focus: true,
				complete: function (val) {
					let value = val;

					try {
						value = JSON.stringify(JSON.parse(val));
					} catch (_error) { }

					that.value(value);
				},
			});
		},
	};
	const selectFieldTypes = ["str", stringArrayFieldType, ...dynamicFieldTypes];

	class EditableQueryConstraintsList {
		constructor() {
			this.containerId = "#node-input-constraints-container";
			this.containerClass = ".node-input-constraints-container-row";
			this.useConstraintsId = "#node-input-useConstraints";
			this.node = {};
		}

		#buildContainer() {
			this.container?.css({ "min-height": "250px", "min-width": "300px" }).editableList({
				addButton: i18n("addConstraint"),
				addItem: addItem,
				removable: true,
				sortable: true,
			});

			this.useConstraints?.on("change", () => this.#constraintsHandler());
		}

		#constraintsHandler() {
			if (this.useConstraints?.prop("checked") === true) {
				const constraints = Object.entries(this.node.constraints || {});

				if (!constraints.length) constraints.push(["limitToLast", { value: "5", valueType: "num" }]);

				constraints.forEach((item) => this.container?.editableList("addItem", item));
				this.containerRow?.show();
			} else {
				this.containerRow?.hide();
				this.container?.editableList("empty");
			}

			RED.tray.resize();
		}

		build(node) {
			this.container = $(this.containerId);
			this.containerRow = $(this.containerClass);
			this.useConstraints = $(this.useConstraintsId);
			this.node = node;
			this.#buildContainer();
		}

		reSize(size) {
			let height = size.height;
			const rows = $(`#dialog-form>div:not(${this.containerClass})`);
			const editorRow = $(`#dialog-form>div${this.containerClass}`);

			for (let i = 0; i < rows.length; i++) {
				height -= $(rows[i]).outerHeight(true) || 0;
			}

			height -= (parseInt(editorRow.css("marginTop")) + parseInt(editorRow.css("marginBottom")));
			height += 16;
			this.container?.editableList("height", height);
		}

		saveItems() {
			const container = this.container?.editableList("items").sort(compareItemsList);
			const node = this.node;

			this.node.constraints = {};

			// TODO: Types guards
			container?.each(function () {
				const constraintType = $(this).find("#node-input-constraint-type").typedInput("value");
				const path = $(this).find("#node-input-constraint-path").typedInput("value");
				const value = $(this).find("#node-input-constraint-value").typedInput("value");
				const options = $(this).find("#node-input-constraint-options").typedInput("value");
				const pathType = $(this).find("#node-input-constraint-path").typedInput("type");
				const valueType = $(this).find("#node-input-constraint-value").typedInput("type");

				switch (constraintType) {
					case "endAt":
					case "endBefore":
					case "startAfter":
					case "startAt":
						node.constraints[constraintType] = { value: value, valueType: valueType };
						break;
					case "limitToFirst":
					case "limitToLast":
					case "offset": {
						const valueParsed = Number(value || NaN);
						if (valueType === "num" && (!Number.isInteger(valueParsed) || valueParsed <= 0)) {
							RED.notify("Query Constraints: Setted value is not an integrer > 0!", "error");
						}

						node.constraints[constraintType] = { value: value, valueType: valueType };
						break;
					}
					case "orderBy":
						if (pathType === "str" && validators.path()(path) !== true) RED.notify("Query Constraints: Setted value is not a valid path!", "error");

						node.constraints[constraintType] = { path: path, pathType: pathType, direction: options };
						break;
					case "select": {
						const result = isSelectValueValid(value, {});
						if (result !== true) {
							RED.notify(`Query Constraints: ${result}`, "error");
						}

						// The `array` type is a minimal `json` type restricted to a string array
						node.constraints[constraintType] = { value: value, valueType: valueType === "array" ? "json" : valueType };
						break;
					}
					case "where":
						if (pathType === "str" && validators.path()(path) !== true) RED.notify("Query Constraints: Setted value is not a valid path!", "error");

						node.constraints[constraintType] = { path: path, pathType: pathType, value: value, valueType: valueType, filter: options };
						break;
				}
			});
		}
	}

	function addItem(container, index, data) {
		const inputRows = $("<div></div>", { style: "flex-grow: 1" }).appendTo(container);
		const row = $("<div/>", { style: "width: 45%; vertical-align: top; display: inline-block;" }).appendTo(inputRows);
		const row2 = $("<div/>", { style: "width: calc(54% - 5px); margin-left: 5px; vertical-align: top; display: inline-block;" }).appendTo(inputRows);
		const constraintType = $("<input/>", { type: "text", id: "node-input-constraint-type", style: "width: 100%; text-align: center;" }).appendTo(row);
		const valueField = $("<input/>", { type: "text", id: "node-input-constraint-value", style: "width: 100%;", placeholder: i18n("placeholder.value") }).appendTo(row2);
		const pathRow = $("<div/>", { class: "constraints-container-row-path" }).appendTo(row2);
		const pathField = $("<input/>", { type: "text", id: "node-input-constraint-path", style: "width: 100%;", placeholder: i18n("placeholder.path") }).appendTo(pathRow);
		const optionsField = $("<input/>", { type: "text", id: "node-input-constraint-options", style: "width: 100%;" }).appendTo(row2);

		container.css({
			overflow: "auto",
			whiteSpace: "normal",
			display: "flex",
			"align-items": "center",
		});

		valueField.typedInput({ default: "str", typeField: "#node-input-constraint-valueType", types: ["str"] });

		pathField.typedInput({
			default: "str",
			typeField: "#node-input-constraint-pathType",
			types: [{ value: "str", label: "string", icon: "red/images/typedInput/az.svg", validate: FirestoreUI.validators.path() }, ...dynamicFieldTypes]
		});

		optionsField.typedInput({ default: "filter", types: [{ value: "filter", options: whereFilterOptions }] });

		constraintType
			.typedInput({ types: [{ value: "constraint", options: queryConstraintFieldOptions }] })
			.on("change", (_event, _type, value) => updateTypeOfTypedInput(value, valueField, pathField, optionsField, pathRow))
			.typedInput("value", "orderBy");

		// if known value (previously defined)
		if (Array.isArray(data)) {
			const [key, val] = data;

			const path = val.path ?? "";
			const value = val.value ?? "";
			const options = (val.direction || val.filter) ?? "";

			const pathType = val.pathType ?? "str";
			const valueType = val.valueType ?? "str";

			constraintType.typedInput("value", key);

			valueField.typedInput("value", value);
			valueField.typedInput("type", valueType);
			pathField.typedInput("value", path);
			pathField.typedInput("type", pathType);

			optionsField.typedInput("value", options);

			data = {};
			$(container).data("data", data);
		}

		data.index = index;
	}

	function compareItemsList(a, b) {
		return a.index - b.index;
	}

	// TODO: validateConstraints
	function isSelectValueValid (val, opt) {
		let result = RED.utils.validateTypedProperty(val, "json", opt);

		if (result !== true) return result;

		try {
			const value = JSON.parse(val);

			if (!Array.isArray(value)) return i18n("validator.invalid-string-array");

			for (const v of value) {
				if (typeof v !== "string") return i18n("validator.invalid-string-array");
			}
		} catch (_error) { }

		return true;
	}

	function updateTypeOfTypedInput(value, valueField, pathField, optionsField, pathContainer) {
		// Initial state
		valueField.typedInput("show");
		pathContainer.css("padding-top", "0px");
		pathContainer.css("padding-bottom", "0px");
		pathField.typedInput("hide");
		optionsField.typedInput("hide");

		switch (value) {
			case "endAt":
			case "endBefore":
			case "startAfter":
			case "startAt":
				valueField.typedInput("types", rangeFieldTypes);
				break;
			case "limitToFirst":
			case "limitToLast":
			case "offset":
				valueField.typedInput("types", limitFieldTypes);
				break;
			case "orderBy":
				valueField.typedInput("hide");
				pathField.typedInput("show");
				pathContainer.css("padding-bottom", "5px");
				optionsField.typedInput("types", [{ value: "direction", options: directionOptions }]);
				optionsField.typedInput("show");
				break;
			case "select":
				valueField.typedInput("types", selectFieldTypes);
				break;
			case "where":
				pathField.typedInput("show");
				valueField.typedInput("types", rangeFieldTypes);
				optionsField.typedInput("show");
				optionsField.typedInput("types", [{ value: "filter", options: whereFilterOptions }]);
				pathContainer.css("padding-bottom", "5px");
				pathContainer.css("padding-top", "5px");
				break;
		}
	}

	function i18n(key, options) {
		return RED._(`@gogovega/node-red-contrib-cloud-firestore/firestore-in:constraints.${key}`, options);
	}

	return {
		editableConstraintsList: { create: () => new EditableQueryConstraintsList() },
	};
})();
