import assert from "node:assert/strict";
import test from "node:test";
import type { StudioFile } from "@beomz-studio/contracts";

import { ensureRequestedDatabaseApp } from "./buildPipeline.js";

function createAppFile(content: string): StudioFile {
  return {
    path: "apps/web/src/app/generated/workspace-task/App.tsx",
    kind: "route",
    language: "tsx",
    content,
    source: "ai",
    locked: false,
  };
}

test("ensureRequestedDatabaseApp replaces in-memory todo apps when database is requested", () => {
  const result = ensureRequestedDatabaseApp({
    files: [
      createAppFile(`import { useState } from "react";

export function App() {
  const [todos, setTodos] = useState<string[]>([]);
  return <button onClick={() => setTodos((prev) => [...prev, "todo"])}>{todos.length}</button>;
}
`),
    ],
    prompt: "Build a todo app with persistence",
    sourcePrompt: "build a todo app",
    templateId: "workspace-task",
    withDatabase: true,
  });

  assert.equal(result.appliedFallback, true);
  const appFile = result.files.find((file) => file.path.endsWith("/App.tsx"));
  assert.ok(appFile);
  assert.match(appFile.content, /@neondatabase\/serverless/);
  assert.match(appFile.content, /VITE_DATABASE_URL/);
  assert.match(appFile.content, /CREATE TABLE IF NOT EXISTS tasks/);
  assert.match(appFile.content, /INSERT INTO tasks/);
});

test("ensureRequestedDatabaseApp preserves existing Neon-backed output", () => {
  const result = ensureRequestedDatabaseApp({
    files: [
      createAppFile(`import { neon } from "@neondatabase/serverless";

const sql = neon(import.meta.env.VITE_DATABASE_URL);

export function App() {
  void sql\`CREATE TABLE IF NOT EXISTS tasks (id SERIAL PRIMARY KEY)\`;
  return <div>ok</div>;
}
`),
    ],
    prompt: "Build a todo app with persistence",
    sourcePrompt: "build a todo app",
    templateId: "workspace-task",
    withDatabase: true,
  });

  assert.equal(result.appliedFallback, false);
  const appFile = result.files.find((file) => file.path.endsWith("/App.tsx"));
  assert.ok(appFile);
  assert.doesNotMatch(appFile.content, /Persisted with Neon Postgres/);
});
