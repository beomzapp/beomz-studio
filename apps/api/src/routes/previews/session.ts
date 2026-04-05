import type {
  CreatePreviewSessionRequest,
  CreatePreviewSessionResponse,
  PreviewSession,
} from "@beomz-studio/contracts";
import {
  buildLocalFallbackHtml,
  createPreviewSession,
  createRuntimeContract,
  isPreviewRuntimeConfigured,
  patchPreviewFiles,
} from "@beomz-studio/preview-e2b";
import { getTemplateDefinition } from "@beomz-studio/templates";
import { Hono } from "hono";
import { z } from "zod";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";

const createPreviewSessionRequestSchema = z.object({
  generationId: z.string().uuid().optional(),
  projectId: z.string().uuid(),
}) satisfies z.ZodType<CreatePreviewSessionRequest>;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown preview error.";
}

function buildLocalPreviewResponse(input: {
  error?: string;
  generationId: string;
  previewId: string;
  project: {
    id: string;
    name: string;
    templateId: Parameters<typeof getTemplateDefinition>[0];
  };
  startedAt: string;
}): CreatePreviewSessionResponse {
  const localSession = {
    createdAt: input.startedAt,
    entryPath: getTemplateDefinition(input.project.templateId).previewEntryPath,
    id: input.previewId,
    projectId: input.project.id,
    provider: "local",
    status: "running",
  } satisfies PreviewSession;
  const runtime = createRuntimeContract({
    mode: "preview",
    project: input.project,
    provider: "local",
    session: localSession,
  });

  return {
    error: input.error,
    fallbackHtml: buildLocalFallbackHtml({
      message: input.error,
      runtime,
      title: "Remote preview unavailable",
    }),
    generationId: input.generationId,
    runtime,
    session: localSession,
  };
}

const previewsSessionRoute = new Hono();

previewsSessionRoute.post("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  const orgContext = c.get("orgContext") as OrgContext;
  const requestBody = await c.req.json().catch(() => null);
  const parsedBody = createPreviewSessionRequestSchema.safeParse(requestBody);

  if (!parsedBody.success) {
    return c.json(
      {
        details: parsedBody.error.flatten(),
        error: "Invalid preview session request body.",
      },
      400,
    );
  }

  const projectRow = await orgContext.db.findProjectById(parsedBody.data.projectId);
  if (!projectRow || projectRow.org_id !== orgContext.org.id) {
    return c.json({ error: "Project not found." }, 404);
  }

  const generationRow = parsedBody.data.generationId
    ? await orgContext.db.findGenerationById(parsedBody.data.generationId)
    : await orgContext.db.findLatestGenerationByProjectId(projectRow.id);

  if (!generationRow || generationRow.project_id !== projectRow.id) {
    return c.json({ error: "Generation not found for project." }, 404);
  }

  const project = {
    id: projectRow.id,
    name: projectRow.name,
    templateId: projectRow.template,
  };
  let previewRow = await orgContext.db.findPreviewByGenerationId(generationRow.id);

  if (!isPreviewRuntimeConfigured()) {
    const errorMessage = "E2B preview is not configured on the API runtime.";

    previewRow = previewRow
      ? await orgContext.db.updatePreview(previewRow.id, {
        error: errorMessage,
        preview_url: null,
        sandbox_id: null,
        status: "failed",
      })
      : await orgContext.db.createPreview({
        error: errorMessage,
        generation_id: generationRow.id,
        status: "failed",
      });

    return c.json(
      buildLocalPreviewResponse({
        error: errorMessage,
        generationId: generationRow.id,
        previewId: previewRow.id,
        project,
        startedAt: previewRow.started_at,
      }),
    );
  }

  // If no row exists, or the existing row failed (e.g. previous E2B error),
  // start fresh so we attempt a new sandbox instead of reusing a dead one.
  if (!previewRow || previewRow.status === "failed") {
    previewRow = await orgContext.db.createPreview({
      generation_id: generationRow.id,
      status: "booting",
    });
  }

  const currentPreviewRow = previewRow;

  try {
    const remotePreview = currentPreviewRow.sandbox_id
      ? await patchPreviewFiles({
        generation: {
          files: generationRow.files,
          id: generationRow.id,
        },
        previewId: currentPreviewRow.id,
        project,
        sandboxId: currentPreviewRow.sandbox_id,
      }).catch(() =>
        createPreviewSession({
          generation: {
            files: generationRow.files,
            id: generationRow.id,
          },
          previewId: currentPreviewRow.id,
          project,
          sandboxId: currentPreviewRow.sandbox_id,
        }))
      : await createPreviewSession({
        generation: {
          files: generationRow.files,
          id: generationRow.id,
        },
        previewId: currentPreviewRow.id,
        project,
      });

    previewRow = await orgContext.db.updatePreview(currentPreviewRow.id, {
      error: null,
      expires_at: remotePreview.session.expiresAt ?? null,
      preview_url: remotePreview.session.url ?? null,
      sandbox_id: remotePreview.session.sandboxId ?? null,
      started_at: remotePreview.session.createdAt,
      status: remotePreview.session.status,
    });

    const response: CreatePreviewSessionResponse = {
      generationId: generationRow.id,
      runtime: remotePreview.runtime,
      session: {
        ...remotePreview.session,
        createdAt: previewRow.started_at,
      },
    };

    return c.json(response);
  } catch (error) {
    const errorMessage = toErrorMessage(error);

    previewRow = await orgContext.db.updatePreview(previewRow.id, {
      error: errorMessage,
      preview_url: null,
      sandbox_id: null,
      status: "failed",
    });

    return c.json(
      buildLocalPreviewResponse({
        error: errorMessage,
        generationId: generationRow.id,
        previewId: previewRow.id,
        project,
        startedAt: previewRow.started_at,
      }),
    );
  }
});

export default previewsSessionRoute;
