import assert from "node:assert/strict";
import test from "node:test";

import {
  abortActiveBuild,
  activeBuilds,
  findActiveBuildIdByProject,
  registerActiveBuild,
  unregisterActiveBuild,
} from "./activeBuilds.js";

test("active build registry aborts the registered controller and cleans up", () => {
  const buildId = `build-${Date.now()}`;
  const projectId = `project-${Date.now()}`;
  const controller = new AbortController();

  assert.equal(registerActiveBuild(buildId, projectId, controller), true);

  assert.equal(activeBuilds.has(buildId), true);
  assert.equal(findActiveBuildIdByProject(projectId), buildId);
  assert.equal(controller.signal.aborted, false);
  assert.equal(abortActiveBuild(buildId), true);
  assert.equal(controller.signal.aborted, true);
  assert.equal(abortActiveBuild(buildId), false);

  unregisterActiveBuild(buildId);

  assert.equal(activeBuilds.has(buildId), false);
  assert.equal(findActiveBuildIdByProject(projectId), null);
});

test("active build registry rejects a second active build on the same project", () => {
  const projectId = `project-${Date.now()}`;
  const firstBuildId = `build-a-${Date.now()}`;
  const secondBuildId = `build-b-${Date.now()}`;

  assert.equal(registerActiveBuild(firstBuildId, projectId), true);
  assert.equal(registerActiveBuild(secondBuildId, projectId), false);
  assert.equal(findActiveBuildIdByProject(projectId), firstBuildId);

  unregisterActiveBuild(firstBuildId);
});
