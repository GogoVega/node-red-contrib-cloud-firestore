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
import { FirestoreGet } from "../lib/firestore-node";
import { FirestoreGetConfig, FirestoreGetNode } from "../lib/types";

module.exports = function (RED: NodeAPI) {
	function FirestoreGetNode(this: FirestoreGetNode, config: FirestoreGetConfig) {
		RED.nodes.createNode(this, config);

		const firestore = new FirestoreGet(this, config, RED);

		firestore.attachStatusListener();

		this.on("input", (msg, send, done) => firestore.get(msg, send, done));

		this.on("close", (done: () => void) => firestore.detachStatusListener(done));
	}

	RED.nodes.registerType("firestore-get", FirestoreGetNode);
};
