import { FailureReason } from "@beomz-studio/validators";
import { z } from "zod";

import {
  type ActionDefinition,
  EngineActionError,
} from "./types.js";

const componentImportSchema = z
  .object({
    defaultImport: z.string().min(1).optional(),
    from: z.string().min(1),
    named: z.array(z.string().min(1)).default([]),
    typeOnly: z.boolean().default(false),
  })
  .strict();

const componentPropSchema = z
  .object({
    name: z.string().min(1),
    optional: z.boolean().default(false),
    type: z.string().min(1),
  })
  .strict();

const addComponentSchema = z
  .object({
    body: z.string().optional(),
    client: z.boolean().default(false),
    componentName: z.string().min(1),
    export: z.enum(["default", "named"]).default("default"),
    imports: z.array(componentImportSchema).default([]),
    path: z.string().min(1),
    props: z.array(componentPropSchema).default([]),
  })
  .strict();

function indentBlock(value: string, spaces = 2): string {
  const prefix = " ".repeat(spaces);
  return value
    .split("\n")
    .map((line) => (line.length > 0 ? `${prefix}${line}` : line))
    .join("\n");
}

function renderImport(spec: z.infer<typeof componentImportSchema>): string {
  const bindings = [spec.defaultImport, spec.named.length > 0 ? `{ ${spec.named.join(", ")} }` : ""]
    .filter((value) => typeof value === "string" && value.length > 0)
    .join(", ");

  if (bindings.length === 0) {
    return `import "${spec.from}";`;
  }

  const prefix = spec.typeOnly ? "type " : "";
  return `import ${prefix}${bindings} from "${spec.from}";`;
}

function renderDefaultBody(
  componentName: string,
  propsName: string,
  usesProps: boolean,
): string {
  const propsReference = usesProps ? "props" : "_props";

  return `return (
  <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
    <div className="text-xs uppercase tracking-[0.22em] text-orange-300">Generated component</div>
    <h2 className="mt-3 text-xl font-semibold text-white">${componentName}</h2>
    <p className="mt-2 text-sm leading-6 text-white/65">
      Scaffolded by the generation engine. Refine the layout and content using follow-up edits.
    </p>
    <div className="mt-4 text-xs text-white/40">Props type: ${propsName} via ${propsReference}</div>
  </div>
);`;
}

export const addComponentAction = {
  concurrency: "exclusive",
  description:
    "Scaffold a new React component file with imports and a typed props shape. Use this to add reusable UI building blocks quickly.",
  jsonSchema: {
    additionalProperties: false,
    properties: {
      body: {
        description:
          "Optional raw function body statements. If omitted, the engine will scaffold a presentable default component body.",
        type: "string",
      },
      client: {
        description: "Whether to add a top-level 'use client' directive.",
        type: "boolean",
      },
      componentName: {
        description: "PascalCase React component name to export from the file.",
        type: "string",
      },
      export: {
        enum: ["default", "named"],
        type: "string",
      },
      imports: {
        items: {
          additionalProperties: false,
          properties: {
            defaultImport: { type: "string" },
            from: { type: "string" },
            named: {
              items: { type: "string" },
              type: "array",
            },
            typeOnly: { type: "boolean" },
          },
          required: ["from"],
          type: "object",
        },
        type: "array",
      },
      path: {
        description: "Workspace-relative component file path inside the allowed write scope.",
        type: "string",
      },
      props: {
        items: {
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            optional: { type: "boolean" },
            type: { type: "string" },
          },
          required: ["name", "type"],
          type: "object",
        },
        type: "array",
      },
    },
    required: ["path", "componentName"],
    type: "object",
  },
  name: "addComponent",
  schema: addComponentSchema,
  execute(input, context) {
    const filePath = context.assertWriteAllowed(input.path);
    if (context.vfs.has(filePath)) {
      throw new EngineActionError(
        FailureReason.INVALID_OUTPUT,
        `Cannot scaffold ${filePath} because it already exists.`,
      );
    }

    const propsName = `${input.componentName}Props`;
    const importLines = input.imports.map(renderImport);
    const propsLines =
      input.props.length > 0
        ? [
            `export interface ${propsName} {`,
            ...input.props.map(
              (prop) => `  ${prop.name}${prop.optional ? "?" : ""}: ${prop.type};`,
            ),
            "}",
          ]
        : [`export interface ${propsName} {}`];
    const usesProps = input.props.length > 0;
    const functionName =
      input.export === "default"
        ? `export default function ${input.componentName}`
        : `export function ${input.componentName}`;
    const body = input.body?.trim() || renderDefaultBody(input.componentName, propsName, usesProps);

    const content = [
      input.client ? `"use client";` : "",
      ...importLines,
      importLines.length > 0 ? "" : "",
      ...propsLines,
      "",
      `${functionName}(${usesProps ? "props" : "_props"}: ${propsName}) {`,
      indentBlock(body),
      "}",
      "",
    ]
      .filter((line, index, lines) => {
        if (line !== "") {
          return true;
        }

        return index === 0 || lines[index - 1] !== "";
      })
      .join("\n");

    context.vfs.write(filePath, content);

    return {
      changedPaths: [filePath],
      output: {
        componentName: input.componentName,
        path: filePath,
        propsType: propsName,
      },
      summary: `Scaffolded component ${input.componentName} at ${filePath}.`,
      undoData: {
        path: filePath,
      },
    };
  },
  undo(outcome, context) {
    const pathToDelete = (outcome.undoData as { path: string } | undefined)?.path;
    if (!pathToDelete) {
      return;
    }

    context.vfs.delete(pathToDelete);
  },
} satisfies ActionDefinition<typeof addComponentSchema>;
