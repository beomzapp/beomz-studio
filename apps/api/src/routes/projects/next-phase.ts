/**
 * POST /api/projects/:id/next-phase
 *
 * BEO-197: Phased Build System — advance to the next build phase.
 *
 * Validates ownership, increments current_phase, fetches existing files,
 * and fires the same runBuildInBackground pipeline with phase context injected.
 * Returns the same 202 + SSE-stream shape as /builds/start.
 */

import { randomUUID } from "node:crypto";

import { getTemplateDefinitionSafe } from "@beomz-studio/templates";
import { Hono } from "hono";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";
import type { Phase } from "../../lib/planPhases.js";
import { runBuildInBackground } from "../builds/generate.js";
import { mapProjectRowToProject, readBuildMetadata, readBuildTraceMetadata } from "../builds/shared.js";
import type { TemplateId } from "@beomz-studio/contracts";

const nextPhaseRoute = new Hono();

nextPhaseRoute.post("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  const orgContext = c.get("orgContext") as OrgContext;
  const projectId = c.req.param("id") ?? "";

  if (!projectId) return c.json({ error: "Project id is required." }, 400);

  const project = await orgContext.db.findProjectById(projectId);
  if (!project || project.org_id !== orgContext.org.id) {
    return c.json({ error: "Project not found." }, 404);
  }

  if (!project.phase_mode) {
    return c.json({ error: "Project is not in phase mode." }, 400);
  }

  const currentPhase = Number(project.current_phase ?? 0);
  const phasesTotal = Number(project.phases_total ?? 0);

  if (currentPhase >= phasesTotal) {
    return c.json({ error: "already_complete" }, 400);
  }

  const rawPhases = project.build_phases;
  const phases: Phase[] = Array.isArray(rawPhases)
    ? (rawPhases as Phase[]).filter(
        (p): p is Phase =>
          typeof p === "object" &&
          p !== null &&
          typeof p.index === "number" &&
          typeof p.title === "string" &&
          typeof p.description === "string" &&
          Array.isArray(p.focus),
      )
    : [];

  if (phases.length === 0) {
    return c.json({ error: "Phase plan not found on project." }, 400);
  }

  const nextPhase = currentPhase + 1;

  // Persist the incremented phase before firing the build
  await orgContext.db.updateProject(projectId, { current_phase: nextPhase });

  // Fetch existing files from the latest generation so phase context can reference them
  const latestGeneration = await orgContext.db.findLatestGenerationByProjectId(projectId);
  const existingFiles = latestGeneration?.files ? [...latestGeneration.files] : [];

  const buildId = randomUUID();
  const requestedAt = new Date().toISOString();
  const operationId = `phaseIteration_${nextPhase}`;
  const templateId = project.template as string;
  const templateDef = getTemplateDefinitionSafe(templateId);

  // Use the original project prompt if available, fall back to phase description
  const currentPhaseData = phases.find((p) => p.index === nextPhase);
  const buildPrompt = currentPhaseData
    ? `${currentPhaseData.description}. Focus on: ${currentPhaseData.focus.join(", ")}`
    : `Continue building phase ${nextPhase}`;

  const initialMetadata = {
    builderTrace: {
      events: [
        {
          code: "build_queued",
          id: "1",
          message: `Phase ${nextPhase} build queued.`,
          operation: "initial_build",
          timestamp: requestedAt,
          type: "status",
          phase: "queued",
        },
      ],
      lastEventId: "1",
      previewReady: false,
      fallbackReason: null,
      fallbackUsed: false,
    },
  };

  const generationRow = await orgContext.db.createGeneration({
    completed_at: null,
    error: null,
    files: [],
    id: buildId,
    metadata: initialMetadata,
    operation_id: operationId,
    output_paths: [],
    preview_entry_path: "/",
    project_id: projectId,
    prompt: buildPrompt,
    started_at: requestedAt,
    status: "queued",
    summary: `Phase ${nextPhase} of ${phasesTotal}: ${currentPhaseData?.title ?? "Continuation"}`,
    template_id: templateId as TemplateId,
    warnings: [],
  });

  runBuildInBackground(
    {
      buildId,
      projectId,
      orgId: orgContext.org.id,
      userId: orgContext.user.id,
      userEmail: orgContext.user.email,
      prompt: buildPrompt,
      sourcePrompt: buildPrompt,
      templateId,
      model: "claude-sonnet-4-6",
      requestedAt,
      operationId,
      isIteration: false,
      existingFiles,
      phaseOverride: {
        phases,
        currentPhase: nextPhase,
        phasesTotal,
      },
    },
    orgContext.db,
  ).catch((err: unknown) => {
    console.error("[next-phase] Unhandled error in runBuildInBackground.", {
      buildId,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  const updatedProject = { ...project, current_phase: nextPhase } as typeof project;
  const metadata = readBuildMetadata(generationRow.metadata);
  const trace = readBuildTraceMetadata(generationRow);

  return c.json(
    {
      build: {
        completedAt: generationRow.completed_at,
        error: generationRow.error,
        id: generationRow.id,
        phase: metadata.phase ?? null,
        projectId: generationRow.project_id,
        source: metadata.resultSource ?? null,
        startedAt: generationRow.started_at,
        status: generationRow.status,
        summary: generationRow.summary,
        templateId: generationRow.template_id,
        workflowId: null,
      },
      project: mapProjectRowToProject(updatedProject),
      currentPhase: nextPhase,
      phasesTotal,
      result: null,
      template: templateDef,
      trace,
    },
    202,
  );
});

export default nextPhaseRoute;
