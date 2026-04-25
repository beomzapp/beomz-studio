import assert from "node:assert/strict";
import test from "node:test";

import { calcCreditCost, calcIterationCreditCost } from "./credits.js";

test("calcCreditCost uses the full build rate", () => {
  assert.equal(calcCreditCost(15_000, 8_000), 49.5);
});

test("calcIterationCreditCost uses the lower iteration rate", () => {
  assert.equal(calcIterationCreditCost(15_000, 8_000), 20.7);
});
