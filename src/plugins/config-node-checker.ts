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
					// TODO: 204 vs 200 with error body
					if (status.updateScriptCalled) throw new Error("Update Script already called");

					// For now, we assume that the script can only be triggered once even if it fails.
					status.updateScriptCalled = true;

					const { exec } = loadInternalNRModule("@node-red/util");

					RED.log.warn("[firestore:plugin]: Starting to update nodes dependencies...");

					await runUpdateDependencies(RED, exec);

					// TODO: Green with chalk
					RED.log.info("[firestore:plugin]: Successfully updated nodes dependencies. Please restarts Node-RED.");
				} else if (scriptName === "load-config-node") {
					const { addModule } = loadInternalNRModule("@node-red/registry");

					RED.log.warn("[firestore:plugin]: Starting to load the config node...");

					// When Firestore nodes are installed from the Palette Manager, the process works as follows:
					// - the runtime installs the package via NPM,
					// - the registry locates the directory (based on package name) and reads the package.json,
					// - the registry then loads all nodes defined by the package.json.
					//
					// The issue with the Firestore palette is that the config node is located inside a dependency.
					// However, nothing in the package.json instructs the registry to load that dependency’s config node directly.
					//
					// Before suggesting a solution to the Node-RED team, my goal is to avoid the most common problem:
					// having to restart Node-RED after installing from the Palette Manager.
					//
					// If the config node is placed in the correct directory, Node-RED will be able to load it automatically
					// on the next restart. In that case, I could consider forcing its loading to avoid requiring a restart.
					//
					// If the config node is not directly loadable, I could still forcing its loading since I know all possible
					// directories where it may reside. However, before doing so, I would need to study how the registry works
					// in detail to understand what risks this approach could introduce or potentially break.
					if (!status.loaded && status.loadable) {
						const info = await addModule("@gogovega/firebase-config-node");
						RED.events.emit("runtime-event", { id: "node/added", retain: false, payload: info.nodes });
						status.loaded = true;
						res.sendStatus(201);
						return;
					} else if (!status.loadable) {
						res.json({
							status: "error",
							msg: "The config node is not loadable",
						});
						return;
					} else {
						res.sendStatus(204);
						return;
					}
				} else {
					// Forbidden
					res.sendStatus(403);
					return;
				}

				res.json({ status: "success" });
			} catch (error) {
				const msg = error instanceof Error ? error.toString() : (error as Record<"stderr", string>).stderr;
				const action = req.body.script === "update-dependencies" ? "updating nodes dependencies" : "loading the config node";

				RED.log.error(`[firestore:plugin]: An error occurred while ${action}: ` + msg);

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

			const checker = function () {
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
					} else {
						RED.log.error("[firestore:plugin]: Config node NOT registered");

						if (isConfigNodeLoadable(RED)) {
							RED.log.warn("[firestore:plugin]: Please restarts Node-RED to load the config node");
							status.loadable = true;
						} else {
							RED.log.warn("[firestore:plugin]: The config node was not installed in the correct directory by NPM");
							RED.log.warn("[firestore:plugin]: Please run:\n\ncd ~/.node-red\nnpm update --omit=dev\n");
						}
					}
				} catch (error) {
					RED.log.warn("[firestore:plugin]: Unable to determine the config node version");
					RED.log.debug("[firestore:plugin]: Failed to load 'getModuleInfo': " + error);
					// Checker failed; config node may have been loaded correctly - let the user worry about that
					Firestore.configNodeSatisfiesVersion = true;
				}

				// To do a once event
				RED.events.off("runtime-event", checker);
				RED.events.off("flows:started", checker);
			};

			// On missing node types - existing install
			RED.events.on("runtime-event", checker);
			// For new/clean install
			RED.events.on("flows:started", checker);
		},
	});
};
