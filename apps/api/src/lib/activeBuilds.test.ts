import assert from "node:assert/strict";
import test from "node:test";

import {
  abortActiveBuild,
  activeBuilds,
  registerActiveBuild,
  unregisterActiveBuild,
} from "./activeBuilds.js";

test("active build registry aborts the registered controller and cleans up", () => {
  const buildId = `build-${Date.now()}`;
  const controller = new AbortController();

  registerActiveBuild(buildId, controller);

  assert.equal(activeBuilds.has(buildId), true);
  assert.equal(controller.signal.aborted, false);
  assert.equal(abortActiveBuild(buildId), true);
  assert.equal(controller.signal.aborted, true);
  assert.equal(abortActiveBuild(buildId), false);

  unregisterActiveBuild(buildId);

  assert.equal(activeBuilds.has(buildId), false);
});
