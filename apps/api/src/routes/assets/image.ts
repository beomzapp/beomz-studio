import { Hono } from "hono";

import {
  downloadStudioAsset,
  isStudioProxyableBucket,
} from "../../lib/images/index.js";

interface AssetImageRouteDeps {
  downloadAsset?: typeof downloadStudioAsset;
}

export function createAssetImageRoute(deps: AssetImageRouteDeps = {}) {
  const route = new Hono();

  route.get("/", async (c) => {
    const bucket = c.req.query("bucket");
    const path = c.req.query("path")?.trim();

    if (!bucket || !isStudioProxyableBucket(bucket)) {
      return c.json({ error: "Invalid bucket." }, 400);
    }

    if (!path || path.includes("..")) {
      return c.json({ error: "Invalid path." }, 400);
    }

    try {
      const asset = await (deps.downloadAsset ?? downloadStudioAsset)(bucket, path);
      return new Response(asset.body, {
        headers: {
          "access-control-allow-origin": "*",
          "cache-control": "public, max-age=31536000, immutable",
          "content-type": asset.contentType,
          "cross-origin-resource-policy": "cross-origin",
        },
      });
    } catch (error) {
      return c.json({
        error: error instanceof Error ? error.message : "Asset proxy failed.",
      }, 404);
    }
  });

  return route;
}

const assetImageRoute = createAssetImageRoute();

export default assetImageRoute;
