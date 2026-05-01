import { Hono } from "hono";
import { z } from "zod";

import { generateFalFluxImageUrl } from "../../lib/images/fal.js";

const imageGenerateRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(2_000),
  width: z.number().int().positive().max(4_096).optional(),
  height: z.number().int().positive().max(4_096).optional(),
});

interface ImagesGenerateRouteDeps {
  generateImageUrl?: typeof generateFalFluxImageUrl;
}

export function createImagesGenerateRoute(deps: ImagesGenerateRouteDeps = {}) {
  const route = new Hono();

  route.post("/generate", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = imageGenerateRequestSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({
        error: "prompt is required; width and height must be positive integers up to 4096.",
      }, 400);
    }

    try {
      const url = await (deps.generateImageUrl ?? generateFalFluxImageUrl)({
        prompt: parsed.data.prompt,
        width: parsed.data.width,
        height: parsed.data.height,
        abortSignal: c.req.raw.signal,
      });

      return c.json({ url });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image generation failed.";
      const status = message.includes("FAL_KEY") ? 503 : 502;
      console.error("[images/generate] request failed:", message);
      return c.json({ error: message }, status);
    }
  });

  return route;
}

const imagesGenerateRoute = createImagesGenerateRoute();

export default imagesGenerateRoute;
