/**
 * POST /api/builds/:id/force-simple
 *
 * BEO-335 — Start a capped single-phase build for orgs that hit the credit
 * gate during a complex build. The build uses max_tokens: 16000 (≈23 credits)
 * so it fits within the free-tier or low-credit balance.
 *
 * Flow:
 *  1. Auth + ownership check
 *  2. Validate status === 'insufficient_credits'
 *  3. Read pendingScope from metadata for the enriched prompt
 *  4. Reset status to 'queued'
 *  5. runBuildInBackground with forcedSimple: true + max_tokens: 16000
 *  6. Return { ok: true }
 */
import { Hono } from "hono";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";
import { runBuildInBackground } from "./generate.js";

const forceSimpleRoute = new Hono();

forceSimpleRoute.post("/", verifyPlatformJwt, loadOrgContext, async (c) => {
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

  if (generationRow.status !== "insufficient_credits") {
    return c.json(
      { error: `Build is not in insufficient_credits state (current status: ${generationRow.status})` },
      409,
    );
  }

  // Read the pending scope stored during the credit gate pause
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

  console.log("[force-simple] starting capped build for", buildId, "with enrichedPrompt length:", pendingScope.enrichedPrompt.length);

  // Reset status to queued so SSE polling resumes
  await db.updateGeneration(buildId, { status: "queued" });

  // Fire the simple build in the background — same buildId, same SSE stream
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
      forcedSimple: true,
      // Empty features = use full enriched prompt without feature filtering
      confirmedScope: { features: [], enrichedPrompt: pendingScope.enrichedPrompt },
    },
    db,
  ).catch((err: unknown) => {
    console.error("[force-simple] runBuildInBackground error:", err instanceof Error ? err.message : String(err));
  });

  return c.json({ ok: true });
});

export default forceSimpleRoute;
