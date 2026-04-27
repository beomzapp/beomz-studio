import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadDotenv({ path: process.env.LOAD_TEST_ENV_PATH ?? ".env.local" });
const { apiConfig } = await import("../config.js");

const execFileAsync = promisify(execFile);
const DEFAULT_TIERS = [10, 50, 100, 500, 1_000];
const REQUEST_TIMEOUT_MS = Number.parseInt(process.env.LOAD_TEST_TIMEOUT_MS ?? "15000", 10);
const HEALTH_TIMEOUT_MS = Number.parseInt(process.env.LOAD_TEST_HEALTH_TIMEOUT_MS ?? "3000", 10);
const PM2_APP_NAME = process.env.LOAD_TEST_PM2_APP_NAME ?? "beomz-api";
const BASE_URL = process.env.LOAD_TEST_BASE_URL ?? `http://127.0.0.1:${apiConfig.PORT}`;
const HEALTH_URL = `${BASE_URL}/health`;

interface RequestResult {
  success: boolean;
  totalLatencyMs?: number;
  ttfeMs?: number;
  error?: string;
}

interface TierResult {
  tierNumber: number;
  concurrency: number;
  successRate: number;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  p99LatencyMs: number | null;
  ttfeMs: number | null;
  memoryBeforeMb: number | null;
  memoryAfterMb: number | null;
  cpuPeakPercent: number | null;
  errors: string[];
  pass: boolean;
  failReason?: string;
}

interface Pm2Sample {
  cpuPercent: number | null;
  memoryMb: number | null;
}

function parseTiers(): number[] {
  const raw = process.env.LOAD_TEST_TIERS?.trim();
  if (!raw) {
    return DEFAULT_TIERS;
  }

  const parsed = raw
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value) && value > 0);

  return parsed.length > 0 ? parsed : DEFAULT_TIERS;
}

function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index] ?? null;
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function roundMetric(value: number | null): number | null {
  return value === null ? null : Math.round(value);
}

function formatMetric(value: number | null, suffix = "ms"): string {
  return value === null ? "n/a" : `${Math.round(value)}${suffix}`;
}

function formatErrors(errors: string[]): string {
  if (errors.length === 0) {
    return "[]";
  }

  return `[${errors.join("; ")}]`;
}

function normaliseErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function createAdminClient(): any {
  return createClient(apiConfig.STUDIO_SUPABASE_URL, apiConfig.STUDIO_SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function createThrowawaySession() {
  const serviceClient = createAdminClient();
  const email = `loadtest+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@beomz.ai`;
  const password = `BeomzLoadTest!${Math.random().toString(36).slice(2, 10)}A1`;

  const createResponse = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createResponse.error || !createResponse.data.user) {
    throw new Error(createResponse.error?.message ?? "Failed to create throwaway auth user.");
  }

  const accessToken = await signInWithPassword(email, password);
  return {
    accessToken,
    authUserId: createResponse.data.user.id,
  };
}

async function signInWithPassword(email: string, password: string): Promise<string> {
  const client = createAdminClient();
  const passwordSignIn = await client.auth.signInWithPassword({ email, password });
  if (!passwordSignIn.error && passwordSignIn.data.session?.access_token) {
    return passwordSignIn.data.session.access_token;
  }

  const response = await fetch(`${apiConfig.STUDIO_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: apiConfig.STUDIO_SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${apiConfig.STUDIO_SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to create auth session (${response.status}): ${body || response.statusText}`);
  }

  const payload = await response.json() as { access_token?: string };
  if (!payload.access_token) {
    throw new Error("Supabase auth response did not include an access token.");
  }

  return payload.access_token;
}

async function ensurePaidOrg(accessToken: string, authUserId: string) {
  const serviceClient = createAdminClient();
  const bootstrapResponse = await fetch(`${BASE_URL}/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!bootstrapResponse.ok) {
    const body = await bootstrapResponse.text().catch(() => "");
    throw new Error(`Bootstrap /me failed (${bootstrapResponse.status}): ${body || bootstrapResponse.statusText}`);
  }

  const userResponse = await serviceClient
    .from("users")
    .select("id")
    .eq("platform_user_id", authUserId)
    .maybeSingle();

  const userId = typeof userResponse.data?.id === "string" ? userResponse.data.id : null;
  if (userResponse.error || !userId) {
    throw new Error(userResponse.error?.message ?? "Failed to resolve bootstrapped Studio user.");
  }

  const membershipResponse = await serviceClient
    .from("org_members")
    .select("org_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  const orgId = typeof membershipResponse.data?.org_id === "string" ? membershipResponse.data.org_id : null;
  if (membershipResponse.error || !orgId) {
    throw new Error(membershipResponse.error?.message ?? "Failed to resolve org membership for load test user.");
  }

  const updateResponse = await serviceClient
    .from("orgs")
    .update({
      plan: "business",
      credits: 1_000_000,
      topup_credits: 0,
      monthly_credits: 4_000,
      rollover_credits: 0,
      rollover_cap: 12_000,
    })
    .eq("id", orgId);

  if (updateResponse.error) {
    throw new Error(updateResponse.error.message);
  }
}

async function samplePm2(): Promise<Pm2Sample> {
  try {
    const { stdout } = await execFileAsync("pm2", ["jlist"], {
      maxBuffer: 10 * 1024 * 1024,
    });
    const payload = JSON.parse(stdout) as Array<{
      name?: string;
      monit?: {
        cpu?: number;
        memory?: number;
      };
    }>;
    const app = payload.find((entry) => entry.name === PM2_APP_NAME);
    if (!app) {
      throw new Error(`PM2 app ${PM2_APP_NAME} not found.`);
    }

    return {
      cpuPercent: typeof app.monit?.cpu === "number" ? app.monit.cpu : null,
      memoryMb: typeof app.monit?.memory === "number" ? app.monit.memory / (1024 * 1024) : null,
    };
  } catch (error) {
    console.warn("[loadtest] pm2 sampling failed:", normaliseErrorMessage(error));
    return {
      cpuPercent: null,
      memoryMb: null,
    };
  }
}

async function checkHealth(): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(HEALTH_URL, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function summariseErrors(results: RequestResult[]): string[] {
  const counts = new Map<string, number>();

  for (const result of results) {
    if (result.success || !result.error) {
      continue;
    }

    counts.set(result.error, (counts.get(result.error) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([message, count]) => `${count}x ${message}`);
}

async function runSingleRequest(accessToken: string, tierNumber: number, requestNumber: number): Promise<RequestResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const startResponse = await fetch(`${BASE_URL}/builds/start`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: `Build a tiny hello world React app for load testing tier ${tierNumber} request ${requestNumber}.`,
        projectName: `Load Test ${tierNumber}-${requestNumber}`,
      }),
      signal: controller.signal,
    });

    if (!startResponse.ok) {
      const body = await startResponse.text().catch(() => "");
      throw new Error(`start ${startResponse.status}: ${body || startResponse.statusText}`);
    }

    const startPayload = await startResponse.json() as {
      build?: { id?: string };
    };
    const buildId = startPayload.build?.id;
    if (!buildId) {
      throw new Error("start response missing build id");
    }

    const eventsResponse = await fetch(`${BASE_URL}/builds/${buildId}/events`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "text/event-stream",
      },
      signal: controller.signal,
    });

    if (!eventsResponse.ok || !eventsResponse.body) {
      const body = await eventsResponse.text().catch(() => "");
      throw new Error(`events ${eventsResponse.status}: ${body || eventsResponse.statusText}`);
    }

    const reader = eventsResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let firstEventAt: number | null = null;
    const seenTypes = new Set<string>();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

      while (buffer.includes("\n\n")) {
        const separatorIndex = buffer.indexOf("\n\n");
        const rawEvent = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);

        const dataLines = rawEvent
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice("data:".length).trim());

        if (dataLines.length === 0) {
          continue;
        }

        if (firstEventAt === null) {
          firstEventAt = Date.now();
        }

        const parsed = JSON.parse(dataLines.join("\n")) as { type?: string; message?: string };
        const type = typeof parsed.type === "string" ? parsed.type : "unknown";
        seenTypes.add(type);

        if (type === "error") {
          throw new Error(`build error: ${parsed.message ?? "unknown error"}`);
        }

        if (type === "done") {
          const requiredTypes = ["pre_build_ack", "stage_preamble", "files", "done"];
          const missingTypes = requiredTypes.filter((requiredType) => !seenTypes.has(requiredType));
          if (missingTypes.length > 0) {
            throw new Error(`missing events: ${missingTypes.join(",")}`);
          }

          return {
            success: true,
            totalLatencyMs: Date.now() - startedAt,
            ttfeMs: firstEventAt === null ? undefined : firstEventAt - startedAt,
          };
        }
      }
    }

    throw new Error("stream ended before done event");
  } catch (error) {
    if (controller.signal.aborted) {
      return {
        success: false,
        error: "timeout",
      };
    }

    return {
      success: false,
      error: normaliseErrorMessage(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runTier(tierNumber: number, concurrency: number, accessToken: string): Promise<TierResult> {
  const memoryBefore = await samplePm2();
  let cpuPeakPercent = memoryBefore.cpuPercent ?? 0;
  let samplerActive = true;

  const sampler = (async () => {
    while (samplerActive) {
      const sample = await samplePm2();
      if (typeof sample.cpuPercent === "number") {
        cpuPeakPercent = Math.max(cpuPeakPercent, sample.cpuPercent);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  })();

  const results = await Promise.all(
    Array.from({ length: concurrency }, (_, index) => runSingleRequest(accessToken, tierNumber, index + 1)),
  );

  samplerActive = false;
  await sampler.catch(() => undefined);

  const memoryAfter = await samplePm2();
  const successfulResults = results.filter((result) => result.success);
  const latencies = successfulResults
    .map((result) => result.totalLatencyMs)
    .filter((value): value is number => typeof value === "number");
  const ttfes = successfulResults
    .map((result) => result.ttfeMs)
    .filter((value): value is number => typeof value === "number");

  const successRate = results.length === 0
    ? 0
    : (successfulResults.length / results.length) * 100;
  const healthyAfterTier = await checkHealth();
  const pass = successRate >= 95 && healthyAfterTier;

  return {
    tierNumber,
    concurrency,
    successRate,
    p50LatencyMs: roundMetric(percentile(latencies, 0.5)),
    p95LatencyMs: roundMetric(percentile(latencies, 0.95)),
    p99LatencyMs: roundMetric(percentile(latencies, 0.99)),
    ttfeMs: roundMetric(average(ttfes)),
    memoryBeforeMb: roundMetric(memoryBefore.memoryMb),
    memoryAfterMb: roundMetric(memoryAfter.memoryMb),
    cpuPeakPercent: roundMetric(cpuPeakPercent),
    errors: summariseErrors(results),
    pass,
    failReason: pass
      ? undefined
      : healthyAfterTier
      ? ">5% failed"
      : "server unresponsive",
  };
}

function printTier(result: TierResult): void {
  console.log(`=== TIER ${result.tierNumber}: ${result.concurrency} concurrent ===`);
  console.log(`Success rate: ${result.successRate.toFixed(1)}%`);
  console.log(`p50: ${formatMetric(result.p50LatencyMs)} / p95: ${formatMetric(result.p95LatencyMs)} / p99: ${formatMetric(result.p99LatencyMs)}`);
  console.log(`TTFE: ${formatMetric(result.ttfeMs)}`);
  console.log(`Memory: ${formatMetric(result.memoryBeforeMb, "mb")} → ${formatMetric(result.memoryAfterMb, "mb")}`);
  console.log(`CPU peak: ${result.cpuPeakPercent === null ? "n/a%" : `${Math.round(result.cpuPeakPercent)}%`}`);
  console.log(`Errors: ${formatErrors(result.errors)}`);
  console.log(`Status: ${result.pass ? "✅ PASS" : `❌ FAIL (${result.failReason ?? "unknown"})`}`);
  console.log("");
}

async function main(): Promise<void> {
  const tiers = parseTiers();

  if (!apiConfig.MOCK_ANTHROPIC) {
    throw new Error("MOCK_ANTHROPIC must be true before running the load test script.");
  }

  if (!(await checkHealth())) {
    throw new Error(`API health check failed at ${HEALTH_URL}`);
  }

  console.log(`[loadtest] Base URL: ${BASE_URL}`);
  console.log(`[loadtest] PM2 app: ${PM2_APP_NAME}`);
  console.log(`[loadtest] Concurrency tiers: ${tiers.join(", ")}`);
  console.log("");

  const session = await createThrowawaySession();
  await ensurePaidOrg(session.accessToken, session.authUserId);

  for (const [index, concurrency] of tiers.entries()) {
    const result = await runTier(index + 1, concurrency, session.accessToken);
    printTier(result);

    if (!result.pass) {
      break;
    }
  }
}

main().catch((error) => {
  console.error("[loadtest] fatal:", normaliseErrorMessage(error));
  process.exitCode = 1;
});
