const NEON_API = "https://console.neon.tech/api/v2";

function getNeonKey(): string {
  const key = process.env.NEON_API_KEY;
  if (!key) throw new Error("NEON_API_KEY not set");
  return key;
}

export async function provisionNeonProject(name: string): Promise<{
  neonProjectId: string;
  connectionUri: string;
  pooledConnectionUri: string;
}> {
  const res = await fetch(`${NEON_API}/projects`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getNeonKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      project: {
        name,
        region_id: process.env.NEON_DEFAULT_REGION ?? "aws-us-west-2",
        pg_version: 17,
      },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Neon provision failed: ${res.status} ${JSON.stringify(err)}`);
  }
  const data = await res.json() as {
    project?: { id?: string };
    connection_uris?: Array<{
      connection_uri?: string;
      pooled_connection_uri?: string;
    }>;
  };
  const uri = data.connection_uris?.[0];
  return {
    neonProjectId: data.project?.id ?? "",
    connectionUri: uri?.connection_uri ?? "",
    pooledConnectionUri: uri?.pooled_connection_uri ?? uri?.connection_uri ?? "",
  };
}

export async function deleteNeonProject(neonProjectId: string): Promise<void> {
  const res = await fetch(`${NEON_API}/projects/${neonProjectId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${getNeonKey()}` },
  });
  if (!res.ok && res.status !== 404) {
    console.error("[neon] delete failed:", res.status);
  }
}
