import type { ActionDefinition } from "./types.js";
import { addComponentAction } from "./addComponent.js";
import { createFileAction } from "./createFile.js";
import { deleteFileAction } from "./deleteFile.js";
import { editFileAction } from "./editFile.js";
import { finishAction } from "./finish.js";
import { listFilesAction } from "./listFiles.js";
import { readFileAction } from "./readFile.js";
import { runCommandAction } from "./runCommand.js";

export * from "./types.js";
export { addComponentAction } from "./addComponent.js";
export { createFileAction } from "./createFile.js";
export { deleteFileAction } from "./deleteFile.js";
export { editFileAction } from "./editFile.js";
export { finishAction } from "./finish.js";
export { listFilesAction } from "./listFiles.js";
export { readFileAction } from "./readFile.js";
export { runCommandAction } from "./runCommand.js";

export const CORE_ACTIONS = [
  createFileAction,
  editFileAction,
  readFileAction,
  listFilesAction,
  deleteFileAction,
  addComponentAction,
  runCommandAction,
  finishAction,
] as const satisfies readonly ActionDefinition[];

export function getCoreAction(actionName: string): ActionDefinition | undefined {
  return CORE_ACTIONS.find((action) => action.name === actionName);
}

export function getCoreActionToolDefinitions(): Array<{
  description: string;
  input_schema: Record<string, unknown>;
  name: string;
}> {
  return CORE_ACTIONS.map((action) => ({
    description: action.description,
    input_schema: action.jsonSchema,
    name: action.name,
  }));
}
