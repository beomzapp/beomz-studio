import assert from "node:assert/strict";
import test from "node:test";

import { createBuildStageEmitter } from "./buildStageEvents.js";

test("fresh build stage events fire once and in order", async () => {
  const events: Array<{ type: string; stage: string; elapsedMs: number }> = [];
  let now = 1_000;
  let next = 1;

  const stages = createBuildStageEmitter({
    operation: "initial_build",
    nextId: () => String(next++),
    now: () => now,
    timestamp: () => new Date(now).toISOString(),
    emit: async (event) => {
      events.push(event);
    },
  });

  await stages.emit("classifying");
  now += 25;
  await stages.emit("enriching");
  now += 50;
  stages.markPreBuildAck();
  now += 100;
  await stages.emit("generating");
  now += 200;
  await stages.emit("sanitising");
  now += 300;
  await stages.emit("persisting");
  now += 400;
  await stages.emit("deploying");
  await stages.emit("deploying");

  assert.deepEqual(
    events.map((event) => event.type),
    [
      "stage_classifying",
      "stage_enriching",
      "stage_generating",
      "stage_sanitising",
      "stage_persisting",
      "stage_deploying",
    ],
  );
  assert.deepEqual(
    events.map((event) => event.stage),
    ["classifying", "enriching", "generating", "sanitising", "persisting", "deploying"],
  );
  assert.deepEqual(
    events.map((event) => event.elapsedMs),
    [0, 0, 100, 300, 600, 1000],
  );
});

test("iteration stage events skip stage_classifying and keep order", async () => {
  const events: Array<{ type: string; stage: string; elapsedMs: number }> = [];
  let now = 5_000;
  let next = 1;

  const stages = createBuildStageEmitter({
    operation: "iteration",
    nextId: () => String(next++),
    now: () => now,
    timestamp: () => new Date(now).toISOString(),
    emit: async (event) => {
      events.push(event);
    },
  });

  await stages.emit("enriching");
  now += 25;
  stages.markPreBuildAck();
  now += 75;
  await stages.emit("generating");
  now += 150;
  await stages.emit("sanitising");
  now += 250;
  await stages.emit("persisting");
  now += 325;
  await stages.emit("deploying");

  assert.deepEqual(
    events.map((event) => event.type),
    [
      "stage_enriching",
      "stage_generating",
      "stage_sanitising",
      "stage_persisting",
      "stage_deploying",
    ],
  );
  assert.deepEqual(
    events.map((event) => event.stage),
    ["enriching", "generating", "sanitising", "persisting", "deploying"],
  );
  assert.deepEqual(
    events.map((event) => event.elapsedMs),
    [0, 75, 225, 475, 800],
  );
});
