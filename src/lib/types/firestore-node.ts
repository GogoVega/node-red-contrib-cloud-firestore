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

import { Node, NodeMessage, NodeMessageInFlow } from "node-red";
import { Constraint, DataSnapshot, QueryMethod } from "@gogovega/firebase-config-node/firestore";
import { ConfigNode } from "@gogovega/firebase-config-node/types";
import { DocumentChangeType, FirestoreGetConfig, FirestoreInConfig, FirestoreOutConfig } from "./firestore-config";

interface QueryOptions {
	merge: boolean | Array<string>;
}

export interface IncomingMessage extends NodeMessageInFlow {
	constraints?: Constraint;
	filter?: DocumentChangeType | "reset";
	method?: QueryMethod;
	options?: QueryOptions;
}

export interface OutgoingMessage extends NodeMessage {
	payload: DataSnapshot;
}

export interface FirestoreBaseNode extends Node {
	database: ConfigNode | null;
}

export interface FirestoreInNode extends FirestoreBaseNode {
	config: FirestoreInConfig;
}

export interface FirestoreGetNode extends FirestoreBaseNode {
	config: FirestoreGetConfig;
}

export interface FirestoreOutNode extends FirestoreBaseNode {
	config: FirestoreOutConfig;
}

export type FirestoreNode = FirestoreInNode | FirestoreGetNode | FirestoreOutNode;

export type NodeConfig<TNode extends FirestoreNode> = TNode["config"];
