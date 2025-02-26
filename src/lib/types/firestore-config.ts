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

import { NodeDef } from "node-red";
import { QueryMethod } from "@gogovega/firebase-config-node/firestore";

export type DynamicTypedInputType = "env" | "flow" | "global" | "jsonata" | "msg";

export type Collection = string;
export type CollectionType = DynamicTypedInputType | "str";

export type CollectionGroup = string;
export type CollectionGroupType = DynamicTypedInputType | "str";

export type Document = string;
export type DocumentType = DynamicTypedInputType | "str";

export type OrderByDirection = "asc" | "desc";
export type WhereFilter =
	| "<"
	| "<="
	| "=="
	| "!="
	| ">="
	| ">"
	| "array-contains"
	| "in"
	| "not-in"
	| "array-contains-any";

interface FieldValues {
	value: string;
	valueType: DynamicTypedInputType | "bool" | "date" | "null" | "num" | "str" | "json";
}

interface Limit {
	value: string;
	valueType: DynamicTypedInputType | "num";
}

interface Offset {
	value: string;
	valueType: DynamicTypedInputType | "num";
}

interface OrderBy {
	path: string;
	pathType: DynamicTypedInputType | "str";
	direction?: OrderByDirection;
}

interface Select {
	value: string;

	/**
	 * The `array` type used in the editor is a minimal version of the `json` type that only accepts
	 * an array of strings. That's why the `json` type is used here to convert the value.
	 */
	valueType: DynamicTypedInputType | "str" | "json";
}

interface Where {
	path: string;
	pathType: DynamicTypedInputType | "str";
	filter: WhereFilter;
	value: string;
	valueType: DynamicTypedInputType | "bool" | "date" | "null" | "num" | "str" | "json";
}

interface Constraint {
	endAt?: FieldValues;
	endBefore?: FieldValues;
	limitToFirst?: Limit;
	limitToLast?: Limit;
	orderBy?: Array<OrderBy>;
	offset?: Offset;
	select?: Select;
	startAfter?: FieldValues;
	startAt?: FieldValues;
	where?: Array<Where>;
}

export type DocumentChangeType = "added" | "removed" | "modified";
export type Filter = DocumentChangeType | "msg" | "none";

interface QueryOption {
	merge: boolean;
}

export interface FirestoreGetConfig extends NodeDef {
	database: string;
	collection: Collection;
	collectionType: CollectionType;
	collectionGroup: CollectionGroup;
	collectionGroupType: CollectionGroupType;
	constraints: Constraint;
	document: Document;
	documentType: DocumentType;
	passThrough: boolean;
}

export interface FirestoreInConfig extends NodeDef {
	database: string;
	collection: Collection;
	collectionType: CollectionType;
	collectionGroup: CollectionGroup;
	collectionGroupType: CollectionGroupType;
	constraints: Constraint;
	document: Document;
	documentType: DocumentType;
	filter: Filter;
	inputs: 0 | 1;
	passThrough: boolean;
}

export interface FirestoreOutConfig extends NodeDef {
	database: string;
	collection: Collection;
	collectionType: CollectionType;
	document: Document;
	documentType: DocumentType;
	queryMethod: QueryMethod | "msg";
	queryOptions: QueryOption;
}

export type FirestoreConfig = FirestoreInConfig | FirestoreGetConfig | FirestoreOutConfig;
