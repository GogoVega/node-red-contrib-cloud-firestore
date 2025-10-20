/**
 * Copyright 2025 Gauthier Dandele
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
const GH_BRANCH_REF = (process.env.BRANCH_REF || "").replace(/\//g, "-");
const PATH_BASE_REF = `github-workflow-${GH_BRANCH_REF}/${process.version.split(".")[0]}/`;

const knownTypes = ["firestore-in", "firestore-get", "firestore-out", "firebase-config", "inject", "debug"];

const flow = require("../examples/demo-flow.json")
	.filter((node) => knownTypes.includes(node.type))
	.map((node) => {
		if (node.type === "debug") {
			// To attach 'should' to the node
			node.type = "helper";
		} else if (node.type === "firebase-config") {
			// To force email/password as auth method
			node.authType = "email";
			node.createUser = true;
		} else if (node.type.startsWith("firestore-")) {
			// Update the path to allow parallel unit tests
			if (node.collectionType === "str" && node.collection) {
				node.collection = PATH_BASE_REF + node.collection;
			} else if (node.documentType === "str" && node.document) {
				node.document = PATH_BASE_REF + node.document;
			}
		}
		return node;
	});

const helper = require("node-red-node-test-helper");
const nodes = [
	require("@gogovega/firebase-config-node"),
	require("../build/nodes/firestore-in"),
	require("../build/nodes/firestore-get"),
	require("../build/nodes/firestore-out"),
	require("@node-red/nodes/core/common/20-inject.js"),
];

const creds = {
	apiKey: process.env.API_KEY,
	projectId: process.env.PROJECT_ID,
	// The goal here is to limit the creation of users; one per reference
	email: `${GH_BRANCH_REF}@github-workflow.fake`,
	password: "someAwesomePassword4gh-actions",
};

const { Firestore } = require("../build/lib/firestore-node");

Firestore.configNodeSatisfiesVersion = true;

describe("Demo Flow tests", function () {
	before(function (done) {
		helper.startServer(done);
	});

	after(function (done) {
		helper.stopServer(done);
	});

	afterEach(async function () {
		await helper.unload();
	});

	context("Set timestamp", () => {
		it("should have set a timestamp", function (done) {
			helper.load(nodes, flow, { e8796a1869e179bc: creds }, function () {
				setTimeout(() => {
					const inject = helper.getNode("5792767043952f56");
					const debug = helper.getNode("15d852f4a29abec1");
					const payload = { timestamp: Date.now() };

					debug.on("input", function (msg) {
						try {
							msg.should.have.property("payload");
							msg.payload.should.be.Object();
							msg.payload.should.have.property("timestamp");
							// TODO: why this diff?
							Math.abs(msg.payload.timestamp - payload.timestamp).should.be.belowOrEqual(10);
							setTimeout(done, 1500);
						} catch (error) {
							done(error);
						}
					});

					inject.receive(payload);
				}, 1500);
			});
		});
	});

	context("Play with users", () => {
		it("should have deleted users", function (done) {
			helper.load(nodes, flow, { e8796a1869e179bc: creds }, async function () {
				const configNode = helper.getNode("e8796a1869e179bc");

				await configNode.clientSignedIn();
				await configNode.firestore?.modify("delete", { document: PATH_BASE_REF + "users/alanisawesome" });
				await configNode.firestore?.modify("delete", { document: PATH_BASE_REF + "users/steveisapple" });
				setTimeout(() => {
					const inject = helper.getNode("ca1a112e5c6cbdb2");
					const debug = helper.getNode("9acbf29beeba99c3");

					debug.on("input", function (msg) {
						try {
							msg.should.have.property("payload");
							msg.payload.should.be.Object();
							msg.payload.should.have.property("size", 0);
							msg.payload.should.have.property("docs", {});
							setTimeout(done, 1500);
						} catch (error) {
							done(error);
						}
					});

					inject.receive();
				}, 1500);
			});
		});

		it("should have added Alan", function (done) {
			helper.load(nodes, flow, { e8796a1869e179bc: creds }, function () {
				setTimeout(() => {
					const inject = helper.getNode("7376db537268899b");
					const debug = helper.getNode("29aaf3383098e09e");

					debug.on("input", function (msg) {
						try {
							msg.should.have.property("payload");
							msg.payload.should.be.Object();
							msg.payload.should.have.property("size", 1);
							msg.payload.should.have.property("docs", {
								alanisawesome: {
									full_name: "Alan Turing",
									nickname: "Alan The Machine",
									date_of_birth: "June 23, 1912",
								},
							});
							msg.payload.should.have.property("changes", [
								{
									id: "alanisawesome",
									doc: { nickname: "Alan The Machine", full_name: "Alan Turing", date_of_birth: "June 23, 1912" },
									newIndex: 0,
									oldIndex: -1,
									type: "added",
								},
							]);
							setTimeout(done, 1500);
						} catch (error) {
							done(error);
						}
					});

					inject.receive();
				}, 1500);
			});
		});

		it("should have added Steve", function (done) {
			helper.load(nodes, flow, { e8796a1869e179bc: creds }, function () {
				setTimeout(() => {
					const inject = helper.getNode("bd18e498f7c61507");
					const debug = helper.getNode("ee3a2b0bc367a47e");

					debug.on("input", function (msg) {
						try {
							msg.should.have.property("payload");
							msg.payload.should.be.Object();
							msg.payload.should.have.property("size", 2);
							msg.payload.should.have.property("docs", {
								alanisawesome: {
									full_name: "Alan Turing",
									nickname: "Alan The Machine",
									date_of_birth: "June 23, 1912",
								},
								steveisapple: { full_name: "Steve Jobs", hobby: "Computer", nickname: "Steve The King" },
							});
							msg.payload.should.have.property("changes", [
								{
									id: "steveisapple",
									doc: { full_name: "Steve Jobs", hobby: "Computer", nickname: "Steve The King" },
									newIndex: 1,
									oldIndex: -1,
									type: "added",
								},
							]);
							setTimeout(done, 1500);
						} catch (error) {
							done(error);
						}
					});

					inject.receive();
				}, 1500);
			});
		});

		it("should have modified Alan nickname", function (done) {
			helper.load(nodes, flow, { e8796a1869e179bc: creds }, function () {
				setTimeout(() => {
					const inject = helper.getNode("19355c55dc280ad7");
					const debug = helper.getNode("735b562a594841f3");

					debug.on("input", function (msg) {
						try {
							msg.should.have.property("payload");
							msg.payload.should.be.Object();
							msg.payload.should.have.property("size", 2);
							msg.payload.should.have.property("docs", {
								alanisawesome: { full_name: "Alan Turing", nickname: "Alan is Genius", date_of_birth: "June 23, 1912" },
								steveisapple: { full_name: "Steve Jobs", hobby: "Computer", nickname: "Steve The King" },
							});
							msg.payload.should.have.property("changes", [
								{
									id: "alanisawesome",
									doc: { full_name: "Alan Turing", date_of_birth: "June 23, 1912", nickname: "Alan is Genius" },
									newIndex: 0,
									oldIndex: 0,
									type: "modified",
								},
							]);
							setTimeout(done, 1500);
						} catch (error) {
							done(error);
						}
					});

					inject.receive();
				}, 1500);
			});
		});

		it("should have removed Alan nickname", function (done) {
			helper.load(nodes, flow, { e8796a1869e179bc: creds }, function () {
				setTimeout(() => {
					const inject = helper.getNode("1addc1cfbb75e991");
					const debug = helper.getNode("735b562a594841f3");

					debug.on("input", function (msg) {
						try {
							msg.should.have.property("payload");
							msg.payload.should.be.Object();
							msg.payload.should.have.property("size", 2);
							msg.payload.should.have.property("docs", {
								alanisawesome: { full_name: "Alan Turing", date_of_birth: "June 23, 1912" },
								steveisapple: { full_name: "Steve Jobs", hobby: "Computer", nickname: "Steve The King" },
							});
							msg.payload.should.have.property("changes", [
								{
									id: "alanisawesome",
									doc: { full_name: "Alan Turing", date_of_birth: "June 23, 1912" },
									newIndex: 0,
									oldIndex: 0,
									type: "modified",
								},
							]);
							setTimeout(done, 1500);
						} catch (error) {
							done(error);
						}
					});

					inject.receive();
				}, 1500);
			});
		});

		it("should have removed Steve", function (done) {
			helper.load(nodes, flow, { e8796a1869e179bc: creds }, function () {
				setTimeout(() => {
					const inject = helper.getNode("0ef7c0721cf81927");
					const debug = helper.getNode("6a90881898ed3551");

					debug.on("input", function (msg) {
						try {
							msg.should.have.property("payload");
							msg.payload.should.be.Object();
							msg.payload.should.have.property("size", 1);
							msg.payload.should.have.property("docs", {
								alanisawesome: { full_name: "Alan Turing", date_of_birth: "June 23, 1912" },
							});
							msg.payload.should.have.property("changes", [
								{
									id: "steveisapple",
									doc: { full_name: "Steve Jobs", nickname: "Steve The King", hobby: "Computer" },
									newIndex: -1,
									oldIndex: 1,
									type: "removed",
								},
							]);
							setTimeout(done, 1500);
						} catch (error) {
							done(error);
						}
					});

					inject.receive();
				}, 1500);
			});
		});
	});

	context("Play with reserved keywords", () => {
		it("should have set the index to 1", function (done) {
			helper.load(nodes, flow, { e8796a1869e179bc: creds }, async function () {
				const configNode = helper.getNode("e8796a1869e179bc");

				await configNode.clientSignedIn();
				await configNode.firestore?.modify("set", { document: PATH_BASE_REF + "keywords/index" }, { index: 0 });

				setTimeout(() => {
					const inject = helper.getNode("5395c1e6288eedd1");
					const debug = helper.getNode("e8373909bb49fb32");

					debug.on("input", function (msg) {
						try {
							msg.should.have.property("payload");
							msg.payload.should.be.Object();
							msg.payload.should.have.property("index", 1);
							setTimeout(done, 1500);
						} catch (error) {
							done(error);
						}
					});

					inject.receive();
				}, 1500);
			});
		});

		it("should have increased the index to 5", function (done) {
			helper.load(nodes, flow, { e8796a1869e179bc: creds }, function () {
				setTimeout(() => {
					const inject = helper.getNode("a946387bbf0e9716");
					const debug = helper.getNode("e8373909bb49fb32");

					let count = 2;
					debug.on("input", function (msg) {
						try {
							msg.should.have.property("payload");
							msg.payload.should.be.Object();
							msg.payload.should.have.property("index", count);
							count++;
							if (count > 6) setTimeout(done, 1500);
						} catch (error) {
							done(error);
						}
					});

					for (let i = 0; i < 5; i++) {
						inject.receive();
					}
				}, 1500);
			});
		});

		it("should have decreased the index to 0", function (done) {
			helper.load(nodes, flow, { e8796a1869e179bc: creds }, function () {
				setTimeout(() => {
					const inject = helper.getNode("909e56335c63fd16");
					const debug = helper.getNode("e8373909bb49fb32");

					let count = 5;
					debug.on("input", function (msg) {
						try {
							msg.should.have.property("payload");
							msg.payload.should.be.Object();
							msg.payload.should.have.property("index", count);
							count--;
							if (count < 0) done();
						} catch (error) {
							done(error);
						}
					});

					for (let i = 0; i < 6; i++) {
						inject.receive();
					}
				}, 1500);
			});
		});

		it("should have set the Geo Point", function (done) {
			helper.load(nodes, flow, { e8796a1869e179bc: creds }, async function () {
				const configNode = helper.getNode("e8796a1869e179bc");

				await configNode.clientSignedIn();
				await configNode.firestore?.modify("delete", { document: PATH_BASE_REF + "keywords/some-place" });

				setTimeout(() => {
					const inject = helper.getNode("de1b6f4ab2d8b0b4");
					const debug = helper.getNode("f0cecb01bbbe7392");

					debug.on("input", function (msg) {
						try {
							msg.should.have.property("payload");
							msg.payload.should.be.Object();
							msg.payload.should.have.property("geo-point");
							// TODO: Difference between twice modules
							//msg.payload["geo-point"].should.have.property("_latitude", 70);
							//msg.payload["geo-point"].should.have.property("_longitude", 25);
							msg.payload["geo-point"].should.have.property("_lat", 70);
							msg.payload["geo-point"].should.have.property("_long", 25);
							done();
						} catch (error) {
							done(error);
						}
					});

					inject.receive();
				}, 1500);
			});
		});

		it("should have deleted the foo array", function (done) {
			helper.load(nodes, flow, { e8796a1869e179bc: creds }, async function () {
				const configNode = helper.getNode("e8796a1869e179bc");

				await configNode.clientSignedIn();
				await configNode.firestore?.modify("delete", { document: PATH_BASE_REF + "keywords/foo" });

				setTimeout(() => {
					const inject = helper.getNode("94c2f365b9a463da");
					const debug = helper.getNode("68a19221021b89e8");

					debug.on("input", function (msg) {
						try {
							msg.should.have.property("payload");
							msg.payload.should.be.Object();
							msg.payload.should.have.property("array", []);
							setTimeout(done, 1500);
						} catch (error) {
							done(error);
						}
					});

					inject.receive();
				}, 1500);
			});
		});

		it("should have added 'bar' to the foo array", function (done) {
			helper.load(nodes, flow, { e8796a1869e179bc: creds }, function () {
				setTimeout(() => {
					const inject = helper.getNode("565c7a31633cb575");
					const debug = helper.getNode("68a19221021b89e8");

					debug.on("input", function (msg) {
						try {
							msg.should.have.property("payload");
							msg.payload.should.be.Object();
							msg.payload.should.have.property("array", ["bar"]);
							setTimeout(done, 1500);
						} catch (error) {
							done(error);
						}
					});

					inject.receive();
					inject.receive();
				}, 1500);
			});
		});

		it("should have removed 'bar' from the foo array", function (done) {
			helper.load(nodes, flow, { e8796a1869e179bc: creds }, function () {
				setTimeout(() => {
					const inject = helper.getNode("7d07f5bb953b20ea");
					const debug = helper.getNode("68a19221021b89e8");

					debug.on("input", function (msg) {
						try {
							msg.should.have.property("payload");
							msg.payload.should.be.Object();
							msg.payload.should.have.property("array", []);
							done();
						} catch (error) {
							done(error);
						}
					});

					inject.receive();
					inject.receive();
				}, 1500);
			});
		});
	});
});
