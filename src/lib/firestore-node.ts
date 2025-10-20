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

import { NodeAPI, NodeMessage } from "node-red";
import {
	Constraint,
	CollectionData,
	DataSnapshot,
	SetOptions,
	QueryConfig,
	QueryMethod,
	Unsubscribe,
	SpecialFieldValue,
} from "@gogovega/firebase-config-node/firestore";
import { ConfigNode, ServiceType } from "@gogovega/firebase-config-node/types";
import { Entry, isFirebaseConfigNode } from "@gogovega/firebase-config-node/utils";
import {
	DocumentChangeType,
	Filter,
	FirestoreConfig,
	FirestoreGetConfig,
	FirestoreGetNode,
	FirestoreInConfig,
	FirestoreInNode,
	FirestoreNode,
	FirestoreOutConfig,
	FirestoreOutNode,
	IncomingMessage,
	NodeConfig,
	OutgoingMessage,
} from "./types";

export class Firestore<Node extends FirestoreNode, Config extends FirestoreConfig = NodeConfig<Node>> {
	private readonly serviceType: ServiceType = "firestore";

	/**
	 * Incoming msg is needed for this types
	 */
	protected static dynamicFieldTypes = ["flow", "global", "jsonata", "msg"];

	protected static limitFieldTypes = ["flow", "global", "jsonata", "env", "msg", "num"];
	protected static orderFieldTypes = ["flow", "global", "jsonata", "env", "msg", "str"];
	protected static pathFieldTypes = ["flow", "global", "jsonata", "env", "msg", "str"];
	protected static rangeFieldTypes = [
		"bool",
		"date",
		"env",
		"flow",
		"global",
		"json",
		"jsonata",
		"msg",
		"null",
		"num",
		"str",
	];
	protected static selectFieldTypes = ["flow", "global", "jsonata", "env", "msg", "str", "json"];
	protected static whereFieldTypes = [
		"bool",
		"date",
		"env",
		"flow",
		"global",
		"json",
		"jsonata",
		"msg",
		"null",
		"num",
		"str",
	];

	/**
	 * This property is used to indicate whether the config node version meets the version required by this palette.
	 * If this is not the case, the nodes in this palette will not be active.
	 */
	public static configNodeSatisfiesVersion = false;

	/**
	 * This property contains the identifier of the timer used to define the error status of the node and will be used
	 * to clear the timeout.
	 */
	private errorTimeoutID?: ReturnType<typeof setTimeout>;

	/**
	 * This property is used to store the "Permission Denied" state of the node.
	 * Error received when database rules deny reading/writing data.
	 */
	protected permissionDeniedStatus = false;

	constructor(
		protected node: Node,
		config: Config,
		protected RED: NodeAPI
	) {
		node.config = config;
		node.database = RED.nodes.getNode(config.database) as ConfigNode | null;

		if (!node.database) {
			node.error("Database not configured or disabled!");
			node.status({ fill: "red", shape: "ring", text: "Database not ready!" });
		} else {
			if (!isFirebaseConfigNode(node.database))
				throw new Error("The selected database is not compatible with this module, please check your config-node");

			if (!Firestore.configNodeSatisfiesVersion) {
				node.status({ fill: "red", shape: "ring", text: "Invalid Database Version!" });

				// To avoid initializing the database (avoid creating unhandled errors)
				node.database = null;
			}
		}

		// Allow the node to be reloaded (not a full restart)
		// @ts-expect-error unknown event
		node.on("node-reload", () => {
			node.database = RED.nodes.getNode(config.database) as ConfigNode | null;
			this.attachStatusListener();
		});
	}

	/**
	 * Gets the Firestore instance from the `config-node`.
	 */
	protected get firestore() {
		return this.node.database?.firestore;
	}

	public attachStatusListener() {
		this.node.database?.addStatusListener(this.node, this.serviceType);
	}

	public detachStatusListener(done: () => void) {
		if (this.node.database) {
			this.node.database.removeStatusListener(this.node, this.serviceType, done);
		} else {
			done();
		}
	}

	/**
	 * Evaluates a node property value according to its type.
	 *
	 * @param value the raw value
	 * @param type the type of the value
	 * @param node the node evaluating the property
	 * @param msg the message object to evaluate against
	 * @return A promise with the evaluted property
	 */
	protected evaluateNodeProperty<T = unknown>(
		value: string,
		type: string,
		node: Node,
		msg?: IncomingMessage
	): Promise<T> {
		return new Promise((resolve, reject) => {
			if (!msg && Firestore.dynamicFieldTypes.includes(type) && (type === "msg" || /\[msg\./.test(value)))
				return reject("Incoming message missing to evaluate the node/msg property");

			return this.RED.util.evaluateNodeProperty(value, type, node, msg!, (error, result) => {
				if (error) return reject(error);

				resolve(result);
			});
		});
	}

	/**
	 * Evaluates the payload message to replace reserved keywords (`ARRAY_UNION`, `ARRAY_REMOVE`, `DELETE`,
	 * `GEO_POINT`, `TIMESTAMP`, `INCREMENT` and `DECREMENT`) with the corresponding field value.
	 *
	 * @remarks Keywords cannot be used inside an array. Recursive therefore only applies to objects.
	 * See https://github.com/firebase/firebase-ios-sdk/issues/1164#issuecomment-384323764.
	 *
	 * @param payload The payload to be evaluated
	 * @returns The payload evaluated
	 */
	protected evaluatePayloadForFieldValue(payload: unknown): object {
		if (typeof payload === "undefined") return {};
		if (typeof payload !== "object" || !payload) throw new TypeError("msg.payload must be an object");

		const fieldValue = new SpecialFieldValue(this.firestore!.client.admin!);

		for (const [key, value] of Object.entries(payload)) {
			switch (typeof value) {
				case "string": {
					if (/^\s*TIMESTAMP\s*$/.test(value)) {
						(payload as Record<string, unknown>)[key] = fieldValue.serverTimestamp();
					} else if (/^\s*DELETE\s*$/.test(value)) {
						(payload as Record<string, unknown>)[key] = fieldValue.delete();
					} else if (/^\s*(?:INCREMENT|DECREMENT)\s*-?\d+\.?\d*\s*$/.test(value)) {
						const deltaString = value.match(/-?\d+\.?\d*/)?.[0] || "";
						const delta = Number(deltaString);

						if (Number.isNaN(delta)) throw new Error("The delta of increment function must be a valid number.");

						const toOppose = /DECREMENT/.test(value);
						(payload as Record<string, unknown>)[key] = fieldValue.increment(toOppose ? -delta : delta);
					}
					continue;
				}
				case "object": {
					if (value === null) continue;
					if (Object.prototype.hasOwnProperty.call(value, "ARRAY_UNION")) {
						(payload as Record<string, unknown>)[key] = fieldValue.arrayUnion(value["ARRAY_UNION"]);
					} else if (Object.prototype.hasOwnProperty.call(value, "ARRAY_REMOVE")) {
						(payload as Record<string, unknown>)[key] = fieldValue.arrayRemove(value["ARRAY_REMOVE"]);
					} else if (Object.prototype.hasOwnProperty.call(value, "GEO_POINT")) {
						(payload as Record<string, unknown>)[key] = fieldValue.geoPoint(
							value["GEO_POINT"].latitude,
							value["GEO_POINT"].longitude
						);
					} else {
						(payload as Record<string, object>)[key] = this.evaluatePayloadForFieldValue(value);
					}
					continue;
				}
				default:
					continue;
			}
		}

		return payload;
	}

	protected async getQueryConfig(msg?: IncomingMessage): Promise<QueryConfig> {
		const config = this.node.config;
		const queryConfig: QueryConfig = {
			collection: await this.evaluateNodeProperty<string>(config.collection, config.collectionType, this.node, msg),
			document: await this.evaluateNodeProperty<string>(config.document, config.documentType, this.node, msg),
		};

		if (!this.isFirestoreOutNode(this.node)) {
			queryConfig.collectionGroup = await this.evaluateNodeProperty<string>(
				this.node.config.collectionGroup,
				this.node.config.collectionGroupType,
				this.node,
				msg
			);
			queryConfig.constraints = await this.getQueryConstraints(msg);
		}

		return queryConfig;
	}

	/**
	 * Gets the Query Constraints from the message received or from the node configuration.
	 * Calls the `valueFromType` method to replace the value of the value field with its real value from the type.
	 *
	 * Example: user defined `msg.topic`, type is `msg`, saved value `topic` and real value is the content of `msg.topic`.
	 *
	 * @param msg The message received
	 * @returns A promise with the Query Constraints
	 */
	protected async getQueryConstraints(msg?: IncomingMessage): Promise<Constraint> {
		if (this.isFirestoreOutNode(this.node))
			throw new Error("Invalid call to 'getQueryConstraints' by Firestore OUT node");

		// TODO: Type Guards
		if (msg?.constraints) return msg.constraints;

		const constraints: Constraint = {};
		const configConstraints = this.node.config.constraints;

		for (const [key, value] of Object.entries(configConstraints) as Entry<typeof configConstraints>[]) {
			switch (key) {
				case "endAt":
				case "endBefore":
				case "startAfter":
				case "startAt": {
					if (!Firestore.rangeFieldTypes.includes(value.valueType))
						throw new Error(`Invalid type (${value.valueType}) for the ${key} field. Please reconfigure this node.`);

					constraints[key] = await this.evaluateNodeProperty(value.value, value.valueType, this.node, msg);
					break;
				}
				case "limitToFirst":
				case "limitToLast":
				case "offset": {
					if (!Firestore.limitFieldTypes.includes(value.valueType))
						throw new Error(`Invalid type (${value.valueType}) for the ${key} field. Please reconfigure this node.`);

					constraints[key] = await this.evaluateNodeProperty(value.value, value.valueType, this.node, msg);

					if (typeof constraints[key] !== "number")
						throw new TypeError("The LimitTo... or Offset value of Query Constraints must be a number.");
					break;
				}
				case "orderBy": {
					// Ensure it's an array - v < 0.0.2
					let valArray = value;
					if (!Array.isArray(value)) {
						valArray = [value];
					}

					for (const [index, val] of valArray.entries()) {
						if (!Firestore.orderFieldTypes.includes(val.pathType))
							throw new Error(`Invalid type (${val.pathType}) for the ${key} field. Please reconfigure this node.`);

						constraints[key] ||= [];
						constraints[key][index] = {
							fieldPath: await this.evaluateNodeProperty(val.path, val.pathType, this.node, msg),
							direction: val.direction,
						};

						if (typeof constraints[key][index].fieldPath !== "string")
							throw new TypeError("The OrderBy fieldPath value of Query Constraints must be a string.");
					}

					break;
				}
				case "select": {
					if (!Firestore.selectFieldTypes.includes(value.valueType))
						throw new Error(`Invalid type (${value.valueType}) for the ${key} field. Please reconfigure this node.`);

					constraints[key] = await this.evaluateNodeProperty(value.value, value.valueType, this.node, msg);

					if (typeof constraints[key] !== "string" && !Array.isArray(constraints[key]))
						throw new TypeError(
							"The Select fieldPath value of Query Constraints must be a string or an array of string."
						);
					break;
				}
				case "where": {
					// Ensure it's an array - v < 0.0.2
					let valArray = value;
					if (!Array.isArray(value)) {
						valArray = [value];
					}

					for (const [index, val] of valArray.entries()) {
						if (!Firestore.whereFieldTypes.includes(val.valueType))
							throw new Error(`Invalid type (${val.valueType}) for the ${key} field. Please reconfigure this node.`);
						if (!Firestore.pathFieldTypes.includes(val.pathType))
							throw new Error(`Invalid type (${val.pathType}) for the ${key} field. Please reconfigure this node.`);

						constraints[key] ||= [];
						constraints[key][index] = {
							fieldPath: await this.evaluateNodeProperty(val.path, val.pathType, this.node, msg),
							filter: val.filter,
							value: await this.evaluateNodeProperty(val.value, val.valueType, this.node, msg),
						};

						if (typeof constraints[key][index].fieldPath !== "string")
							throw new TypeError("The Where fieldPath value of Query Constraints must be a string.");
					}

					break;
				}
			}
		}

		return constraints;
	}

	/**
	 * Checks if the given node matches the `Firestore IN` node.
	 * @param node The node to check.
	 * @returns `true` if the node matches the `Firestore IN` node.
	 */
	protected isFirestoreInNode(node: FirestoreNode): node is FirestoreInNode {
		return node.type === "firestore-in";
	}

	/**
	 * Checks if the given node matches the `Firestore OUT` node.
	 * @param node The node to check.
	 * @returns `true` if the node matches the `Firestore OUT` node.
	 */
	protected isFirestoreOutNode(node: FirestoreNode): node is FirestoreOutNode {
		return node.type === "firestore-out";
	}

	/**
	 * A custom method on error to set node status as `Error` or `Permission Denied`.
	 * @param error The error received
	 * @param done If defined, a function to be called to return the error message.
	 */
	protected onError(error: unknown, done?: (error?: Error) => void) {
		const code = typeof error === "object" && error && "code" in error ? error.code : "";

		if (code === "permission-denied") {
			this.setStatus("Permission Denied");
		} else {
			this.setStatus("Error", 5000);
		}

		if (done) return done(error as Error);

		this.node.error(error);
	}

	/**
	 * This method is called when a DataSnapshot is received in order to send a `payload` containing the desired data.
	 * @param snapshot A DataSnapshot contains data from a Database location.
	 * @param msg The message to pass through.
	 */
	protected sendMsg(snapshot: DataSnapshot, msg?: IncomingMessage, send?: (msg: NodeMessage) => void) {
		if (this.isFirestoreOutNode(this.node)) throw new Error("Invalid call to 'sendMsg' by Firestore OUT node");

		// Clear Permission Denied Status
		if (this.permissionDeniedStatus) {
			this.permissionDeniedStatus = false;
			this.setStatus();
		}

		if (!this.isFirestoreInNode(this.node)) this.setStatus("Query Done", 500);

		const msg2Send: OutgoingMessage = {
			...(msg || {}),
			payload: snapshot,
		};

		if (send) return send(msg2Send);

		this.node.send(msg2Send);
	}

	/**
	 * Sets the status of node. If `msg` is defined, the status fill will be set to `red` with the message `msg`.
	 * @param msg If defined, the message to display on the status.
	 * @param time If defined, the status will be cleared (to current status) after `time` ms.
	 */
	protected setStatus(status: string = "", time?: number) {
		// Clear the status to the current after ms
		if (status && time) {
			clearTimeout(this.errorTimeoutID);
			this.errorTimeoutID = setTimeout(() => this.setStatus(), time);
		}

		if (this.permissionDeniedStatus && status === "") {
			status = "Permission Denied";
		}

		switch (status) {
			case "Error":
				this.node.status({ fill: "red", shape: "dot", text: status });
				break;
			case "Permission Denied":
				this.permissionDeniedStatus = true;
				this.node.status({ fill: "red", shape: "ring", text: "Permission Denied!" });
				break;
			case "Querying":
				this.node.status({ fill: "blue", shape: "dot", text: "Querying..." });
				break;
			case "Query Done":
				this.node.status({ fill: "blue", shape: "dot", text: "Query Done!" });
				break;
			case "Subscribed":
			case "Unsubscribed":
				this.node.status({ fill: "blue", shape: "dot", text: status });
				break;
			case "Waiting":
				this.node.status({ fill: "blue", shape: "ring", text: "Waiting for Subscription..." });
				break;
			case "":
				this.node.database?.setCurrentStatus(this.node);
				break;
			default:
				this.node.status({ fill: "red", shape: "dot", text: status });
				break;
		}
	}
}

export class FirestoreGet extends Firestore<FirestoreGetNode> {
	constructor(node: FirestoreGetNode, config: FirestoreGetConfig, RED: NodeAPI) {
		super(node, config, RED);
	}

	public get(msg: IncomingMessage, send: (msg: NodeMessage) => void, done: (error?: Error) => void): void {
		const msg2PassThrough = this.node.config.passThrough ? msg : undefined;

		(async () => {
			try {
				if (!this.firestore) return done();

				this.setStatus("Querying");

				const queryConfig = await this.getQueryConfig(msg);

				if (!(await this.node.database?.clientSignedIn())) return done();

				const snapshot = await this.firestore.get(queryConfig);

				this.sendMsg(snapshot, msg2PassThrough, send);

				done();
			} catch (error) {
				this.onError(error, done);
			}
		})();
	}
}

export class FirestoreIn extends Firestore<FirestoreInNode> {
	private static filterAllowed: Array<Filter> = ["added", "modified", "removed", "none"];

	private _filter?: Filter;

	/**
	 * Whether the node should await a payload to subscribe to data.
	 */
	private isDynamicConfig: boolean = false;

	/**
	 * This property contains the **function to call** to unsubscribe the listener
	 */
	private unsubscribeCallback?: Unsubscribe;

	constructor(node: FirestoreInNode, config: FirestoreInConfig, RED: NodeAPI) {
		super(node, config, RED);

		// No need to re-check all config - if the node has an input, the config is dynamic.
		this.isDynamicConfig = this.node.config.inputs === 1;

		// @ts-expect-error unknown event
		node.on("node-reload", this.subscribe.bind(this));
	}

	// TODO: Magic filter
	private applyFilter(snapshot: DataSnapshot): DataSnapshot {
		if (snapshot && "changes" in snapshot && "size" in snapshot && this._filter !== "none") {
			snapshot.changes = (snapshot as CollectionData).changes.filter((doc) => doc.type === this._filter);
		}

		return snapshot;
	}

	private getFilter(msg?: IncomingMessage): Filter {
		const { filter } = this.node.config;

		// Dynamic Filter ? Skip the static subscription
		if (filter === "msg" && !msg) return filter;

		const docChangeType = filter === "msg" ? (msg?.filter as DocumentChangeType | undefined) : filter;

		if (typeof docChangeType !== "string" || !FirestoreIn.filterAllowed.includes(docChangeType))
			throw new Error(`Unknown filter (DocumentChangeType): Received ${docChangeType}.`);

		return docChangeType;
	}

	public subscribe(): void;
	public subscribe(msg: IncomingMessage, send: (msg: NodeMessage) => void, done: (error?: Error) => void): void;
	public subscribe(msg?: IncomingMessage, send?: (msg: NodeMessage) => void, done?: (error?: Error) => void): void {
		(async () => {
			try {
				if (!this.firestore) {
					if (done) done();
					return;
				}

				const msg2PassThrough = this.node.config.passThrough ? msg : undefined;

				// Unsubscribe and passthrough the msg
				if (msg && msg.filter === "reset") {
					this.unsubscribe();
					this.setStatus("Unsubscribed");
					if (send && msg2PassThrough) send(msg2PassThrough);
					if (done) done();
					return;
				}

				// Not work when starting the flow
				// TODO: need LocalStatus to resolve it
				this.setStatus("Waiting");

				// Await the filter defined in the incoming message
				this._filter = this.getFilter(msg);
				if (this._filter === "msg" || (this.isDynamicConfig && !msg)) {
					if (done) done();
					return;
				}

				const config = await this.getQueryConfig(msg);

				if (!(await this.node.database?.clientSignedIn())) {
					if (done) done();
					return;
				}

				this.unsubscribe();
				this.unsubscribeCallback = this.firestore?.subscribe(
					config,
					(snapshot) => this.sendMsg(this.applyFilter(snapshot)),
					(error) => this.onError(error)
				);

				this.setStatus("Subscribed", 2000);

				if (send && msg2PassThrough) send(msg2PassThrough);
				if (done) done();
			} catch (error) {
				this.onError(error, done);
			}
		})();
	}

	public unsubscribe(): void {
		if (this.unsubscribeCallback) this.unsubscribeCallback();
	}
}

export class FirestoreOut extends Firestore<FirestoreOutNode> {
	constructor(node: FirestoreOutNode, config: FirestoreOutConfig, RED: NodeAPI) {
		super(node, config, RED);
	}

	/**
	 * Checks if the query is valid otherwise throws an error.
	 * @param method The query to be checked
	 * @returns The query checked
	 */
	private checkQueryMethod(method: unknown): QueryMethod {
		if (method === undefined) throw new Error("msg.method do not exist!");
		if (typeof method !== "string") throw new Error("msg.method must be a string!");
		if (["delete", "set", "update"].includes(method)) return method as QueryMethod;
		throw new Error("msg.method must be one of 'delete', 'set' or 'update'.");
	}

	/**
	 * Gets the query from the node or message. Calls `checkQuery` to check the query.
	 * @param msg The message received
	 * @returns The query checked
	 */
	private getQueryMethod(msg: IncomingMessage): QueryMethod {
		const method = this.node.config.queryMethod === "msg" ? msg.method : this.node.config.queryMethod;
		return this.checkQueryMethod(method);
	}

	private getQueryOptions(msg: IncomingMessage): SetOptions {
		const msgOptions: Record<string, boolean | Array<string>> = {};

		if (msg.options && "merge" in msg.options) {
			if (typeof msg.options.merge === "boolean") {
				msgOptions.merge = msg.options.merge;
			} else if (typeof msg.options.merge === "object" && Array.isArray(msg.options.merge)) {
				msgOptions.mergeFields = msg.options.merge;
			} else throw new TypeError("msg.options.merge must be boolean or a string array.");
		}

		return Object.assign({}, this.node.config.queryOptions, msgOptions);
	}

	/**
	 * `SET`, `UPDATE` or `DELETE` data at the target Database.
	 * @param msg The message to be sent to Firestore Database
	 * @returns A Promise when write/update on server is complete.
	 */
	public modify(msg: IncomingMessage, done: (error?: Error) => void): void {
		(async () => {
			try {
				if (!this.firestore) return done();

				this.setStatus("Querying");

				const method = this.getQueryMethod(msg);
				const payload = this.evaluatePayloadForFieldValue(msg.payload);
				const config = await this.getQueryConfig(msg);
				const options = this.getQueryOptions(msg);

				if (!(await this.node.database?.clientSignedIn())) return done();

				switch (method) {
					case "update":
						if (payload && typeof payload === "object") {
							await this.firestore.modify(method, config, payload);
							break;
						}

						throw new Error("msg.payload must be an object with 'update' query.");
					case "delete":
						await this.firestore.modify(method, config);
						break;
					case "set":
						if (typeof payload !== "object" || !payload)
							throw new Error("msg.payload must be an object with 'set' query.");
						await this.firestore.modify(method, config, payload, options);
						break;
					default:
						throw new Error("msg.method must be one of 'set', 'update' or 'delete'");
				}

				this.setStatus("Query Done", 500);

				done();
			} catch (error) {
				this.onError(error, done);
			}
		})();
	}
}
