import { randomUUID } from "node:crypto";

import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { z } from "zod";

import {
  CHAT_IMAGES_BUCKET,
  uploadChatImage,
  CHAT_IMAGE_MAX_BYTES,
  isAllowedChatImageMimeType,
} from "../../lib/chatImageStorage.js";
import { buildAssetProxyUrl } from "../../lib/studioAssetProxy.js";
import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";

const uploadImageFormSchema = z.object({
  projectId: z.string().trim().uuid(),
  sessionId: z.string().trim().min(1).max(200).optional(),
});

interface UploadImageRouteDeps {
  authMiddleware?: MiddlewareHandler;
  loadOrgContextMiddleware?: MiddlewareHandler;
  now?: () => number;
  uploadImage?: typeof uploadChatImage;
}

function isFileLike(value: FormDataEntryValue | null): value is File {
  return value instanceof File;
}

export function createBuildsUploadImageRoute(deps: UploadImageRouteDeps = {}) {
  const route = new Hono();

  route.post(
    "/",
    deps.authMiddleware ?? verifyPlatformJwt,
    deps.loadOrgContextMiddleware ?? loadOrgContext,
    async (c) => {
      const orgContext = c.get("orgContext") as OrgContext;
      const formData = await c.req.formData().catch(() => null);

      if (!formData) {
        return c.json({ error: "Invalid multipart form data." }, 400);
      }

      const parsed = uploadImageFormSchema.safeParse({
        projectId: typeof formData.get("projectId") === "string" ? formData.get("projectId") : undefined,
        sessionId: typeof formData.get("sessionId") === "string" ? formData.get("sessionId") : undefined,
      });

      if (!parsed.success) {
        return c.json({ details: parsed.error.flatten(), error: "Invalid upload request." }, 400);
      }

      const image = formData.get("image");
      if (!isFileLike(image)) {
        return c.json({ error: "Image file is required." }, 400);
      }

      if (!image.type.startsWith("image/")) {
        return c.json({ error: "Only image uploads are supported." }, 415);
      }

      if (!isAllowedChatImageMimeType(image.type)) {
        return c.json({ error: "Supported image types are PNG, JPG, WebP, and GIF." }, 415);
      }

      if (image.size > CHAT_IMAGE_MAX_BYTES) {
        return c.json({ error: "Image must be 10MB or smaller." }, 413);
      }

      const project = await orgContext.db.findProjectById(parsed.data.projectId);
      if (!project || project.org_id !== orgContext.org.id) {
        return c.json({ error: "Project not found." }, 404);
      }

      try {
        const uploader = deps.uploadImage ?? uploadChatImage;
        const result = await uploader({
          bytes: await image.arrayBuffer(),
          contentType: image.type,
          fileName: image.name || "upload",
          projectId: parsed.data.projectId,
          sessionId: parsed.data.sessionId ?? randomUUID(),
          timestamp: deps.now?.() ?? Date.now(),
        });

        return c.json({
          imageUrl: buildAssetProxyUrl(CHAT_IMAGES_BUCKET, result.path),
          url: buildAssetProxyUrl(CHAT_IMAGES_BUCKET, result.path),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown upload error.";
        console.error("[builds/upload-image] upload failed.", {
          projectId: parsed.data.projectId,
          error: message,
        });
        return c.json({ error: `Image upload failed: ${message}` }, 500);
      }
    },
  );

  return route;
}

const buildsUploadImageRoute = createBuildsUploadImageRoute();

export default buildsUploadImageRoute;
