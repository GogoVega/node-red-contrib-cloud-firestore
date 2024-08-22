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
import { Request, Response } from "express";
import { runUpdateDependencies, versionIsSatisfied } from "./utils";

/**
 * To avoid running the script multiple times
 *
 * @internal
 */
let updateScriptCalled: boolean = false;

function configNodeStatusHandler(_req: Request, res: Response) {
	res.json({
		status: {
			versionIsSatisfied: versionIsSatisfied(),
			updateScriptCalled: updateScriptCalled,
		},
	});
}

async function updateDependenciesHandler(RED: NodeAPI, req: Request, res: Response) {
	try {
		const scriptName = req.body.script;

		if (scriptName === "update-dependencies") {
			if (updateScriptCalled) throw new Error("Update Script already called");

			updateScriptCalled = true;

			if (!RED.settings.userDir) throw new Error("Node-RED 'userDir' Setting not available");

			// @node-red/util.exec is not imported to NodeAPI, so it's a workaround to get it
			// TODO: if there is a risk that the "require" fails, make a locally revisited copy
			let utilPath = join(process.env.NODE_RED_HOME || ".", "node_modules", "@node-red/util");

			if (!existsSync(utilPath)) {
				// Some installations like FlowFuse use this path
				utilPath = join(process.env.NODE_RED_HOME || ".", "../", "@node-red/util");
			}

			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const exec = require(utilPath).exec;

			RED.log.info("Starting to update Node-RED dependencies...");

			await runUpdateDependencies(RED, exec);

			RED.log.info("Successfully updated Node-RED dependencies. Please restarts Node-RED.");
		} else {
			// Forbidden
			res.sendStatus(403);
			return;
		}

		res.json({ status: "success" });
	} catch (error) {
		const msg = error instanceof Error ? error.toString() : (error as Record<"stderr", string>).stderr;

		RED.log.error("An error occured while updating Node-RED dependencies: " + msg);

		res.json({
			status: "error",
			msg: msg,
		});
	}
}

export { configNodeStatusHandler, updateDependenciesHandler };
