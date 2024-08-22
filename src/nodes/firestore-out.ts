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
import { FirestoreOut } from "../lib/firestore-node";
import { FirestoreOutConfig, FirestoreOutNode } from "../lib/types";
import { configNodeStatusHandler, updateDependenciesHandler } from "../lib/endpoints";

module.exports = function (RED: NodeAPI) {
	// ----- ENDPOINTS FOR ALL FIRESTORE NODES ----- //

	// Check if the Config Node version satisfies the require one
	RED.httpAdmin.get(
		"/firebase/firestore/config-node/status",
		RED.auth.needsPermission("firestore-out.write"),
		configNodeStatusHandler
	);

	// Run the Update Script
	RED.httpAdmin.post(
		"/firebase/firestore/config-node/scripts",
		RED.auth.needsPermission("firestore-out.write"),
		(req, resp) => updateDependenciesHandler(RED, req, resp)
	);

	// TODO: Autocomplete endpoint

	function FirestoreOutNode(this: FirestoreOutNode, config: FirestoreOutConfig) {
		RED.nodes.createNode(this, config);

		const firestore = new FirestoreOut(this, config, RED);

		firestore.attachStatusListener();

		this.on("input", (msg, _send, done) => firestore.modify(msg, done));

		this.on("close", (done: () => void) => firestore.detachStatusListener(done));
	}

	RED.nodes.registerType("firestore-out", FirestoreOutNode);
};
