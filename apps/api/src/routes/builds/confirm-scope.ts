/**
 * POST /api/builds/:id/confirm-scope
 *
 * BEO-312 — Resume a build that is paused in 'awaiting_scope_confirmation'
 * state after the user confirms (or adjusts) the feature list.
 *
 * Body: { features: string[], extras?: string }
 * - features: the confirmed feature list (subset of featureCandidates)
 * - extras:   optional free-text describing additional features
 *
 * Flow:
 *  1. Auth + generation ownership check
 *  2. Validate status === 'awaiting_scope_confirmation'
 *  3. Read metadata.pendingScope for enrichedPrompt + original input data
 *  4. Build confirmed prompt with feature injection
 *  5. Reset status to 'queued' so SSE resumes polling
 *  6. Call runBuildInBackground with confirmedScope set
 *  7. Return { ok: true }
 */
import { Hono } from "hono";
import { z } from "zod";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";
import { runBuildInBackground } from "./generate.js";

const confirmScopeRoute = new Hono();

const BodySchema = z.object({
  features: z.array(z.string()).min(1),
  extras: z.string().optional(),
});

confirmScopeRoute.post("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  const buildId = c.req.param("id") as string;
  const orgContext = c.get("orgContext") as OrgContext;
  const { db } = orgContext;

  const generationRow = await db.findGenerationById(buildId);
  if (!generationRow) {
    return c.json({ error: "Build not found." }, 404);
  }

  // Ownership check via project
  const project = await db.findProjectById(generationRow.project_id);
  if (!project || project.org_id !== orgContext.org.id) {
    return c.json({ error: "Build not found." }, 404);
  }

  if (generationRow.status !== "awaiting_scope_confirmation") {
    return c.json(
      { error: `Build is not awaiting scope confirmation (current status: ${generationRow.status})` },
      409,
    );
  }

  // Parse + validate body
  let body: { features: string[]; extras?: string };
  try {
    body = BodySchema.parse(await c.req.json());
  } catch {
    return c.json({ error: "Invalid request body — features array required." }, 400);
  }

  // Read the pending scope stored during the pause
  const meta = typeof generationRow.metadata === "object" && generationRow.metadata !== null
    ? (generationRow.metadata as Record<string, unknown>)
    : {};

  const pendingScope = meta.pendingScope as {
    enrichedPrompt: string;
    featureCandidates: string[];
    model: string;
    templateId: string;
    originalPrompt: string;
  } | undefined;

  if (!pendingScope?.enrichedPrompt) {
    return c.json({ error: "No pending scope data found — build may have already started." }, 409);
  }

  // Merge confirmed features + any extras
  const confirmedFeatures = [...body.features];
  if (body.extras?.trim()) {
    // Split by comma or newline so users can type "feature A, feature B"
    const extraItems = body.extras
      .split(/[,\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    confirmedFeatures.push(...extraItems);
  }

  console.log("[confirm-scope] confirmed features:", confirmedFeatures, { buildId });

  // Reset status to queued so the SSE polling resumes
  await db.updateGeneration(buildId, {
    status: "queued",
  });

  // Fire the resumed build in the background — same buildId, same SSE stream
  runBuildInBackground(
    {
      buildId,
      projectId: generationRow.project_id,
      orgId: orgContext.org.id,
      userId: orgContext.user.id,
      userEmail: orgContext.user.email,
      prompt: pendingScope.originalPrompt,
      sourcePrompt: pendingScope.originalPrompt,
      templateId: pendingScope.templateId,
      model: pendingScope.model,
      requestedAt: new Date().toISOString(),
      operationId: generationRow.operation_id,
      isIteration: false,
      existingFiles: [],
      confirmedScope: {
        features: confirmedFeatures,
        enrichedPrompt: pendingScope.enrichedPrompt,
      },
    },
    db,
  ).catch((err: unknown) => {
    console.error("[confirm-scope] runBuildInBackground error:", err instanceof Error ? err.message : String(err));
  });

  return c.json({ ok: true });
});

export default confirmScopeRoute;
