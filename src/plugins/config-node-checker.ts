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

import { NodeAPI } from "node-red";
import { Firestore } from "../lib/firestore-node";
import { isConfigNodeLoadable, loadInternalNRModule, runUpdateDependencies, tinySemver } from "../lib/utils";

/**
 * The required version of the {@link https://github.com/GogoVega/Firebase-Config-Node | Config Node}.
 *
 * WARNING: Do not change the name because it's used by the publish script!
 *
 * @internal
 */
const requiredVersion = [0, 3, 0];

module.exports = function (RED: NodeAPI) {
	const status = {
		loadable: false,
		loaded: false,
		version: "0.0.0",
		versionIsSatisfied: false,
		updateScriptCalled: false,
	};

	// Check if the Config Node version satisfies the require one
	RED.httpAdmin.get(
		"/firebase/firestore/config-node/status",
		RED.auth.needsPermission("firestore-out.write"),
		function (_req, res) {
			RED.log.debug("[firestore:plugin]: GET '/config-node/status'");
			res.json(status);
		}
	);

	// Run the Update Script
	RED.httpAdmin.put(
		"/firebase/firestore/config-node/scripts",
		RED.auth.needsPermission("firestore-out.write"),
		async function (req, res) {
			try {
				const scriptName = req.body.script;

				RED.log.debug("[firestore:plugin]: PUT '/config-node/scripts' for " + scriptName);

				if (scriptName === "update-dependencies") {
					// TODO: 404 vs 200 with error body
					if (status.updateScriptCalled) throw new Error("Update Script already called");

					// For now, we assume that the script can only be triggered once even if it fails.
					status.updateScriptCalled = true;

					const { exec } = loadInternalNRModule("@node-red/util");

					RED.log.warn("[firestore:plugin]: Starting to update nodes dependencies...");

					await runUpdateDependencies(RED, exec);

					// TODO: Green with chalk
					RED.log.info("[firestore:plugin]: Successfully updated nodes dependencies. Please restarts Node-RED.");
				} else {
					// Forbidden
					res.sendStatus(403);
					return;
				}

				res.json({ status: "success" });
			} catch (error) {
				const msg = error instanceof Error ? error.toString() : (error as Record<"stderr", string>).stderr;

				RED.log.error("[firestore:plugin]: An error occurred while updating nodes dependencies: " + msg);

				res.json({
					status: "error",
					msg: msg,
				});
			}
		}
	);

	// Register the plugin
	RED.plugins.registerPlugin("firestore-config-node-checker", {
		type: "firebase-config-node-checker",
		onadd: function () {
			RED.log.debug("[firestore:plugin]: Firestore Config Node Checker started");

			const onRuntimeStarted = function () {
				try {
					const { getModuleInfo } = loadInternalNRModule("@node-red/registry");
					const configNode = getModuleInfo("@gogovega/firebase-config-node");

					if (configNode) {
						status.loadable = true;
						status.loaded = true;
						status.version = configNode.version;

						RED.log.debug("[firestore:plugin]: Config node v" + status.version + " registered");

						if (tinySemver(requiredVersion, status.version)) {
							status.versionIsSatisfied = true;
							Firestore.configNodeSatisfiesVersion = true;
						} else {
							Firestore.configNodeSatisfiesVersion = false;
							RED.log.error(
								"[firestore:plugin]: The Config Node version does not meet the requirements of this palette."
							);
							RED.log.error("\tRequired Version: " + requiredVersion.join("."));
							RED.log.error("\tCurrent Version:  " + status.version);
							RED.log.error("\tPlease to resolve the issue run:\n\ncd ~/.node-red\nnpm update --omit=dev\n");
						}
					}
				} catch (error) {
					RED.log.warn("[firestore:plugin]: Unable to determine the config node version");
					RED.log.debug("[firestore:plugin]: Failed to load 'getModuleInfo': " + error);
					// Checker failed; config node may have been loaded correctly - let the user worry about that
					Firestore.configNodeSatisfiesVersion = true;
				}

				// To do a once event
				RED.events.off("flows:started", onRuntimeStarted);
			};

			const onPaletteMissing = function (event: { payload?: { error?: string } }) {
				if (!event.payload || event.payload.error !== "missing-types") return;

				RED.log.error("[firestore:plugin]: Config node NOT registered");

				if (isConfigNodeLoadable(RED)) {
					RED.log.warn("[firestore:plugin]: Please restarts Node-RED to load the config node");
					status.loadable = true;
				} else {
					RED.log.warn("[firestore:plugin]: The config node was not installed in the correct directory by NPM");
					RED.log.warn("[firestore:plugin]: Please run:\n\ncd ~/.node-red\nnpm update --omit=dev\n");
				}

				// To do a once event
				RED.events.off("runtime-event", onPaletteMissing);
			};

			RED.events.on("runtime-event", onPaletteMissing);
			RED.events.on("flows:started", onRuntimeStarted);
		},
	});
};
