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

/**
 * The required version of the {@link https://github.com/GogoVega/Firebase-Config-Node | Config Node}.
 */
const requiredVersion = [0, 1, 1];

/**
 * This flag prevents emitting an error log for each Firestore node.
 *
 * Indeed the {@link checkConfigNodeSatisfiesVersion} function is called in the Firestore Class which
 * is the base of each Firestore node.
 */
let errorEmitted = false;

/**
 * Checks if the {@link https://github.com/GogoVega/Firebase-Config-Node | Config Node} version matches
 * the version required by this Firestore palette.
 *
 * When installing this palette, NPM may install the Config Node inside the Firestore palette which results
 * that Node-RED not loading the correct version.
 *
 * @param RED The NodeAPI
 * @param version The current version of the Config Node
 * @returns `true` if the version of the Config Node is satisfied
 */
function checkConfigNodeSatisfiesVersion(RED: NodeAPI, version: string): boolean {
	if (errorEmitted) return false;

	const match = /([0-9])\.([0-9]+)\.([0-9]+)/.exec(version);
	if (match) {
		match.shift();

		const [major, minor, patch] = match.map((v) => parseInt(v, 10));

		if (
			major > requiredVersion[0] ||
			(major === requiredVersion[0] &&
				(minor > requiredVersion[1] || (minor === requiredVersion[1] && patch >= requiredVersion[2])))
		)
			return true;

		errorEmitted = true;

		RED.log.error("FIREBASE: The Config Node version does not meet the requirements of this palette.");
		RED.log.error("  Required Version: " + requiredVersion.join("."));
		RED.log.error("  Current Version:  " + version);
		RED.log.error(
			"  Please run the following command to resolve the issue:\n\n    cd ~/.node-red\n    npm update --omit=dev\n"
		);

		return false;
	}

	// Not supposed to happen
	return true;
}

export { checkConfigNodeSatisfiesVersion };
