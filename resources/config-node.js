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

; (function () {
	"use strict";

	const notify = function (notifications) {
		if (!Array.isArray(notifications)) {
			notifications = [notifications];
		}

		notifications.forEach((notification) => {
			const { buttons, fixed, modal, msg, type } = notification;
			const myNotification = RED.notify(msg, {
				modal: modal,
				fixed: fixed,
				type: type,
				buttons: (function () {
					return buttons.map((button) => {
						if (button === "Close" || button === "Cancel") {
							return {
								text: button,
								class: "primary",
								click: () => {
									myNotification.close();
								}
							};
						} else if (button === "View Log") {
							return {
								text: button,
								class: "pull-left",
								click: () => {
									RED.actions.invoke("core:show-event-log");
								}
							};
						} else if (button === "Confirm Update") {
							const path = "firebase/firestore/config-node/scripts";

							return {
								text: "Confirm",
								click: (event) => {
									const spinner = RED.utils.addSpinnerOverlay($(event.target));

									// Start the event log panel
									RED.eventLog.startEvent("FIRESTORE: Updating dependencies...");

									$.post(path, { script: "update-dependencies" }, function (resp) {
										spinner.remove();
										myNotification.close();
										
										if (resp.status === "success") {
											notify({
												msg: "<html><p>Update Successful!</p><p>Restarts now Node-RED and reload your browser</p></html>",
												type: "success",
												fixed: true,
												buttons: ["Close"]
											});
										} else if (resp.status === "error") {
											notify({
												msg: `
												<html>
													<p>Update Failed!</p>
													<p>Please raise an issue <a href="https://github.com/GogoVega/node-red-contrib-cloud-firestore/issues/new/choose">here</a> with log details:</p>
													<pre>${resp.msg}</pre>
												</html>`,
												type: "error",
												fixed: true,
												buttons: ["Close"],
											});
										} else {
											console.log("J'ai glissé chef!");
										}
									});
								}
							};
						} else if (button === "Run Update") {
							return {
								text: button,
								class: "pull-left",
								click: () => {
									myNotification.close();
									notify([{
										msg: `
											<html>
												<p>Are you really sure you want to do this?</p>
												<p>The Update script will run <code>npm update</code> in your Node-RED directory to update dependencies.</p>
												<p>If you have version constraints with one or more nodes, please check first the pinning of those versions.</p>
												<p><strong>Tip</strong>: Click on <strong>View Log</strong> then <strong>Confirm</strong> and not the other way around 🤫</p>
											</html>`,
										modal: false, fixed: true, type: "warning", buttons: ["Confirm Update", "View Log", "Cancel"]
									}]);
								}
							};
						} else {
							console.error("Unknown button", button);
							return {};
						}
					});
				})(),
			});
		});
	};

	function generateNotification(script) {
		const updateMsg = `
			<html>
				<p>Welcome to Google Cloud Firestore</p>
				<p>The Config Node version don't meet the version required by the Cloud Firestore palette.</p>
				<p>
					Can happen when you use both Cloud Firestore and <a href="https://flows.nodered.org/node/@gogovega/node-red-contrib-firebase-realtime-database">RTDB</a> palettes.
					Indeed NPM installs a new version into the wrong package instead of updating the existing one.
				</p>
				<p>To solve this issue, please run the Update script.</p>
			</html>`;
		const restartMsg = `
			<html>
				<p>Welcome to Google Cloud Firestore</p>
				<p>To use this palette of nodes, please restart Node-RED. If you are using FlowFuse, suspend then start the instance.</p>
				<p>If you have installed from the Manage Palette you need to restart because Node-RED did not load all nodes correctly.</p>
				<p>Read more about this issue <a href="https://github.com/GogoVega/node-red-contrib-firebase-realtime-database/discussions/50">here</a>.</p>
			</html>`;
		const restartAfterUpdateMsg = `
			<html>
				<p>Don't forget to restart Node-RED!</p>
				<p>It looks like you didn't restart Node-RED after running the Update script 🙄</p>
			</html>`;

		let msg;
		let buttons = ["Close"];
		switch (script) {
			case "update":
				msg = updateMsg;
				buttons = ["Run Update", "Close"];
				break;
			case "restart":
				msg = restartMsg;
				break;
			case "restart-update":
				msg = restartAfterUpdateMsg;
				break;
			default:
				throw new Error("Unknown notification script: " + script);
		}

		notify([{
			msg: msg,
			type: "warning",
			fixed: true,
			modal: true,
			buttons: buttons,
		}]);
	}

	function installFromPaletteManager() {
		return !RED.nodes.getType("firebase-config");
	}

	// TODO: see with the NR team a guideline (#4965)
	// To avoid lots of tours randomly popping up in the editor
	function initTourGuide() {
		// Skip if the user don't want tours
		if (RED.settings.theme("tours") === false) return;

		const tourName = "first-flow";
		const packageName = "gogovega/node-red-contrib-cloud-firestore";
		const settingName = `editor.tours.${packageName}.${tourName}`;

		// Skip if the tour has already been runned
		if (RED.settings.get(settingName, false) === true) return;

		// TODO: At this stage, it's better to load the file from the repo
		// to avoid publishing a new version for every change made to the tour.
		const tourUrl = "https://gogovega.github.io/firebase-tours/firestore/first-flow.js";
		//const tourUrl = `/resources/@${packageName}/${tourName}.js`;

		let telemetry;
		const tourGuide = function (tour) {
			// Skip if the tour has already been runned
			if (RED.settings.get(settingName, false) === true) return;

			// Skip if a tour is running - concurrent calls are not yet protected
			// Can happen with both Firestore and RTDB installed
			const tourRunning = $(".red-ui-tourGuide-shade").length > 0;
			if (tourRunning) {
				// Listen to the event to run the tour once the current one has finished
				$(".red-ui-tourGuide-shade").one("remove", () => setTimeout(() => tourGuide(tour), 1000));
			} else {
				RED.tourGuide.run(tourUrl, function (error) {
					if (error) {
						console.error("Firebase tour: ", error);
						RED.notify("Failed to run the Firestore tour", "error");
					}

					RED.settings.set(settingName, true);
					// Workaround until
					// RED.tourGuide.run(url: string, done: (error?: Error, state: object) => void)
					telemetry?.sendTelemetry(null, error);
				});
			}
		};

		const telemetryUrl = "https://gogovega.github.io/firebase-tours/firestore/telemetry.js";
		RED.tourGuide.load(tourUrl, function (error, tour) {
			FirestoreUI._telemetrySupported = true;
			import(telemetryUrl).then(function (result) {
				telemetry = result;
				if (tour) {
					telemetry.prepareTelemetry(tour);
					tourGuide(tour);
				}
			}).finally(function () {
				if (error) {
					console.error("Failed to load the Firestore Tour: ", error);
					telemetry?.sendTelemetry(null, error);
				}
			});
		});
	}

	function init() {
		try {
			console.log("Firestore Check Worker Started");

			// Config Node not loaded, so the user must restart NR
			if (installFromPaletteManager()) {
				generateNotification("restart");
				return;
			}

			// Research if the Config Node version satisfies the required version by this palette
			$.getJSON("firebase/firestore/config-node/status", function (result) {
				if (!result.status.versionIsSatisfied) {
					if (result.status.updateScriptCalled) {
						// The user has triggered the Update script but not restarted NR
						generateNotification("restart-update");
					} else {
						// Ask the user to trigger the Update script
						generateNotification("update");
					}
				} else {
					// All ready => run the 'First flow' guide
					initTourGuide();
				}
			});
		} catch (error) {
			console.error("An error occurred while checking the status of the config-node", error);
		}
	}

	setTimeout(init, 200);
})();
