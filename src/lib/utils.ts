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

import { existsSync } from "node:fs";
import { join } from "node:path";
import { NodeAPI } from "node-red";

type Exec = Record<"run", (command: string, args: string[], option: object, emit: boolean) => Promise<object>>;

/**
 * Run a system command with stdout/err being emitted as notification to the Event Log panel.
 *
 * @param RED The NodeAPI
 * @param exec The `@node-red/util.exec` instance (because not imported to NodeAPI)
 * @returns A promise that resolves (rc=0) or rejects (rc!=0) when the command completes.
 */
export function runUpdateDependencies(RED: NodeAPI, exec: Exec): Promise<object> {
	const isWindows = process.platform === "win32";
	const npmCommand = isWindows ? "npm.cmd" : "npm";
	const extraArgs = [
		"--no-audit",
		"--no-update-notifier",
		"--no-fund",
		"--save",
		"--save-prefix=~",
		"--omit=dev",
		"--engine-strict",
	];
	const args = ["update", ...extraArgs];
	const userDir = RED.settings.userDir || process.env.NODE_RED_HOME || ".";

	return exec.run(npmCommand, args, { cwd: userDir, shell: true }, true);
}

/**
 * Some useful methods (and not critical) are not imported to NodeAPI,
 * so it's a workaround to get them 🤫
 * @param name The NR module to load
 */
export function loadInternalNRModule(name: string) {
	let path = join(process.env.NODE_RED_HOME || ".", "node_modules", name);

	if (!existsSync(path)) {
		// Some installations like FlowFuse use this path
		path = join(process.env.NODE_RED_HOME || ".", "..", name);
	}

	// eslint-disable-next-line @typescript-eslint/no-require-imports
	return require(path);
}

export function tinySemver(requiredVersion: number[], currentVersion: string): boolean {
	const match = /([0-9])\.([0-9]+)\.([0-9]+)/.exec(currentVersion);

	if (match) {
		match.shift();

		const [major, minor, patch] = match.map((v) => parseInt(v, 10));

		return (
			major > requiredVersion[0] ||
			(major === requiredVersion[0] &&
				(minor > requiredVersion[1] || (minor === requiredVersion[1] && patch >= requiredVersion[2])))
		);
	}

	return false;
}

export function isConfigNodeLoadable(RED: NodeAPI): boolean {
	const { userDir } = RED.settings;

	if (!userDir) {
		RED.log.debug("[firestore:plugin]: userDir not available");
		return false;
	}

	const configNodePath = join(userDir, "node_modules", "@gogovega", "firebase-config-node");

	return existsSync(configNodePath);
}
