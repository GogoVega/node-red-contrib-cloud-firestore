/**
 * Copyright 2023 Gauthier Dandele
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

/**
 * First Flow tour guide for creating a Firestore flow in Node-RED.
 *
 * This module exports an object that defines a series of steps for a guided tour
 * to help users create their first Firestore flow in Node-RED. Each step includes
 * a title, description, and actions to be performed.
 */
export default {
	steps: [
		{	// TODO: go through a class for icon
			titleIcon: 'firebase"><img src="/icons/@gogovega/node-red-contrib-cloud-firestore/firebase.svg',
			title: {
				"en-US": "Create your first Firestore flow",
				"fr": "Créer votre premier flux Firestore"
			},
			width: 400,
			description: {
				"en-US": "This tutorial will guide you through creating your first Firestore flow.",
				"fr": "Ce didacticiel vous guidera dans la création de votre premier flux Firestore."
			},
			prepare: function () {
				const that = this;

				let isNewUser = true;
				RED.nodes.eachConfig((c) => {
					if (c.type === "firebase-config") {
						isNewUser = false;
						return false;
					}
				});

				this.startTime = Date.now();
				this.telemetry = {};
				this.saveStep = () => {
					this.telemetry[this.index] = Date.now();
				};

				// Send telemetry when the tour has finished
				const url = "webhooks/1345451455666192474/vIzTRG50WigquZVgySe7pT89Yb5Br8GV_9EkZqvZkmtONijJWP74syaMDZYZ60U8L2TZ";
				$(".red-ui-tourGuide-shade").one("remove", function () {
					that.index++;
					const color = that.index === 1 ? 16753920 : that.index === that.count ? 32768 : 255;
					const payload = {
						embeds:[{
							fields: [
								{ name: "Node-RED version", value: RED.settings.version },
								{ name: "Nouvel utilisateur", value: isNewUser ? "Oui" : "Non" },
								{ name: "Étapes complétées", value: `${that.index}/${that.count}`, inline: true },
								{ name: "Temps mis", value: `${(Date.now() - that.startTime)/1000}s`, inline: true },
								{ name: "Détail des étapes", value: `\`\`\`json\n${JSON.stringify({...that.telemetry}, null, 2)}\n\`\`\`` },
							],
							footer: {
								// Pseudo UUID
								text: RED.nodes.getWorkspaceOrder()[0] || "Unknown",
							},
							title: "Firestore - First Flow tour",
							timestamp: new Date(),
							color: color
						}]
					};

					const send = function () {
						$.ajax({
							method: "POST",
							url: "https://discord.com/api/" + url,
							data: JSON.stringify(payload),
							dataType: "json",
							headers: {
								"Content-Type": "application/json"
							},
							success: (_data, _textStatus, jqXHR) => {
								if (jqXHR.status === 429 && jqXHR.responseJSON) {
									const waitUntil = jqXHR.responseJSON["retry_after"];
									setTimeout(send, waitUntil);
								}
							},
						});
					};

					send();
				});
			},
			complete: function () {
				this.saveStep();
			}
		},
		{
			element: "#red-ui-palette-base-category-Firestore",
			direction: "right",
			description: {
				"en-US": "The Firestore palette lists all of the nodes available to use. Lets explore them.",
				"fr": "La palette Firestore répertorie tous les noeuds disponibles à utiliser. Prenons un moment pour les découvrir."
			},
			prepare: function (done) {
				// Show only the Firestore category - to avoid to freeze the workspace
				// RED.palette doesn't allow to sort by category so it's a trick 🤫
				const filter = $("#red-ui-palette-search input");
				this.paletteFilter = filter.searchBox("value");
				filter.searchBox("value", "");
				setTimeout(function () {
					$("#red-ui-palette .red-ui-palette-header").closest(".red-ui-palette-category").hide();
					$("#red-ui-palette-header-Firestore").closest(".red-ui-palette-category").show();
					done();
				}, 200);
			},
			complete: function () {
				this.saveStep();
			}
		},
		{
			element: ".red-ui-palette-node[data-palette-type='firestore-in']",
			direction: "right",
			title: {
				"en-US": "The Firestore In Node",
				"fr": "Le noeud Firestore In"
			},
			description: {
				"en-US": "This node subscribes to data at the specified path and sends a payload for each change.",
				"fr": "Ce noeud s'abonne aux données du chemin spécifié et envoie une charge utile pour chaque changement."
			},
			complete: function () {
				this.saveStep();
			}
		},
		{
			element: ".red-ui-palette-node[data-palette-type='firestore-get']",
			direction: "right",
			title: {
				"en-US": "The Firestore Get Node",
				"fr": "Le noeud Firestore Get"
			},
			description: {
				"en-US": "This node reads the data from the specified path and sends a payload.",
				"fr": "Ce noeud lit les données du chemin spécifié et envoie une charge utile."
			},
			complete: function () {
				this.saveStep();
			}
		},
		{
			element: ".red-ui-palette-node[data-palette-type='firestore-out']",
			direction: "right",
			title: {
				"en-US": "The Firestore Out Node",
				"fr": "Le noeud Firestore Out"
			},
			description: {
				"en-US": "This node modifies the data of the specified document.",
				"fr": "Ce noeud modifie les données du document spécifié."
			},
			complete: function () {
				// Clear the Firestore filter to returns to previous Palette state
				$("#red-ui-palette-search input").searchBox("value", "pending");
				$("#red-ui-palette-search input").searchBox("value", this.paletteFilter || "");
				this.saveStep();
			}
		},
		{
			element: "#red-ui-tab-red-ui-clipboard-dialog-import-tab-examples",
			direction: "bottom",
			width: 400,
			title: {
				"en-US": "Let's import a flow of examples",
				"fr": "Importons un flux d'exemples"
			},
			description: {
				"en-US": "<p>Click on the '<strong>Examples</strong>' button.</p>",
				"fr": "<p>Cliquer sur le bouton '<strong>Exemples</strong>'.</p>"
			},
			fallback: "inset-bottom-right",
			wait: {
				type: "dom-event",
				event: "click",
			},
			prepare: function (done) {
				RED.actions.invoke("core:show-import-dialog");
				setTimeout(done, 200);
			},
			complete: function () {
				this.saveStep();
			}
		},
		{
			element: "#red-ui-clipboard-dialog-ok",
			direction: "top",
			description: {
				"en-US": "<p>Select the '<strong>demo-flow</strong>' example and import it.</p>",
				"fr": "<p>Sélectionner l'exemple '<strong>demo-flow</strong>' et importer le.</p>"
			},
			fallback: "inset-bottom-right",
			wait: {
				type: "dom-event",
				event: "click",
			},
			prepare: function (done) {
				// Expand the Firestore examples
				$("#red-ui-clipboard-dialog-import-tab-examples ol")
					.find(".red-ui-editableList-item-content .red-ui-treeList-label")
					.filter(function () {
						return $(this).text().trim() === "@gogovega/node-red-contrib-cloud-firestore";
					})
					.trigger("click");
				setTimeout(done, 200);
			},
			complete: function () {
				this.saveStep();
			}
		},
		{
			element: "#red-ui-sidebar-config-category-global ul .red-ui-palette-node_id_e8796a1869e179bc",
			direction: "left",
			description: {
				"en-US": "<p>Double-click on the '<strong>My Database</strong>' configuration node to open it.</p>",
				"fr": "<p>Double-cliquer sur le noeud de configuration '<strong>My Database</strong>' pour l'ouvrir.</p>"
			},
			fallback: "inset-bottom-right",
			wait: {
				type: "nr-event",
				event: "editor:open",
				filter: function () {
					// Ensures it's the right config node being opened
					return RED.editor.getEditStack()[0]?.id === "e8796a1869e179bc";
				}
			},
			prepare: function (done) {
				// Highlight the config node
				RED.sidebar.config.show("e8796a1869e179bc");
				setTimeout(done, 300);
			},
			complete: function () {
				this.saveStep();
			}
		},
		{
			element: "#node-config-input-authType",
			direction: "bottom",
			description: {
				"en-US": `
					<p>Select the authentication method, complete the required fields and finish by saving your changes.</p>
					<p>Each field has a ℹ️ icon to help you to complete it. In addition, each node contains documentation in the <strong>Help</strong> tab of the Sidebar on your right.</p>`,
				"fr": `
					<p>Sélectionner la méthode d'authentification, compléter les champs requis et terminer par sauver vos modifications.</p>
					<p>Chaque champ dispose d'une icone ℹ️ pour vous aider à le compléter. De plus, chaque noeud contient une documentation dans l'onglet <strong>Aide</strong> de la Sidebar à votre droite.</p>`
			},
			fallback: "inset-bottom-left",
			width: 500,
			wait: {
				type: "nr-event",
				event: "editor:save",
				filter: function (event) {
					// Ensures it's the right config node being saved
					return event.id === "e8796a1869e179bc";
				}
			},
			prepare: function (done) {
				// Timeout needed to prepare the edit dialog
				setTimeout(function () {
					RED.sidebar.help.show("firebase-config");
					done();
				}, 500);
			},
			complete: function () {
				this.saveStep();
			}
		},
		{
			element: "#red-ui-header-button-deploy",
			description: {
				"en-US": "Deploy your changes so the flow is active in the runtime.",
				"fr": "Déployer vos modifications afin que le flux soit actif dans le runtime."
			},
			wait: {
				type: "dom-event",
				event: "click"
			},
			prepare: function (done) {
				RED.workspaces.show("13c4e8e8f85d50b9");
				RED.sidebar.show("debug");
				setTimeout(done, 300);
			},
			complete: function () {
				this.saveStep();
			}
		},
		{
			title: {
				"en-US": "Now it's your turn",
				"fr": "A vous de jouer maintenant"
			},
			description: {
				"en-US": `
					<p>This flow will introduce you to the basic usage of nodes. Enjoy exploring!</p>
					<p>I hope this tutorial helped you... feel free to send me your <a href="https://github.com/GogoVega/node-red-contrib-cloud-firestore/discussions/new?category=ideas">comments <i class="fa fa-external-link-square"></i></a> to improve it 🙂</p>`,
				"fr": `
					<p>Ce flux d'exemples vous fera découvrir l'utilisation basique des noeuds. Bonne découverte!</p>
					<p>J'espère que ce didacticiel vous a aidé... n'hésitez pas à me transmettre vos <a href="https://github.com/GogoVega/node-red-contrib-cloud-firestore/discussions/new?category=ideas">remarques <i class="fa fa-external-link-square"></i></a> pour l'enrichir 🙂</p>`
			},
			width: 400,
			complete: function () {
				this.saveStep();
			}
		}
	],
}
