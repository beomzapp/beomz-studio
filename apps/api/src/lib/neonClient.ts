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

export async function createProject(name: string): Promise<{ id: string }> {
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
    throw new Error(`Neon createProject failed: ${res.status} ${JSON.stringify(err)}`);
  }
  const data = await res.json() as { project?: { id?: string } };
  const id = data.project?.id;
  if (!id) throw new Error("Neon createProject: no project id in response");
  return { id };
}

export async function createBranch(
  projectId: string,
  name: string,
): Promise<{ id: string; connectionString: string }> {
  const res = await fetch(`${NEON_API}/projects/${projectId}/branches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getNeonKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      branch: { name },
      endpoints: [{ type: "read_write" }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Neon createBranch failed: ${res.status} ${JSON.stringify(err)}`);
  }
  const data = await res.json() as {
    branch?: { id?: string };
    connection_uris?: Array<{ connection_uri?: string }>;
  };
  const id = data.branch?.id;
  if (!id) throw new Error("Neon createBranch: no branch id in response");
  return { id, connectionString: data.connection_uris?.[0]?.connection_uri ?? "" };
}

export async function deleteBranch(
  projectId: string,
  branchId: string,
): Promise<void> {
  const res = await fetch(`${NEON_API}/projects/${projectId}/branches/${branchId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${getNeonKey()}` },
  });
  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => "");
    throw new Error(`Neon deleteBranch failed (${res.status})${body ? `: ${body}` : ""}`);
  }
}

export async function deleteNeonProject(neonProjectId: string): Promise<void> {
  const res = await fetch(`${NEON_API}/projects/${neonProjectId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${getNeonKey()}` },
  });
  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => "");
    throw new Error(`Neon delete failed (${res.status})${body ? `: ${body}` : ""}`);
  }
}

export async function enableNeonAuth(
  neonProjectId: string,
  branchId: string,
): Promise<{
  baseUrl: string;
  pubClientKey: string;
  secretServerKey: string;
}> {
  const res = await fetch(
    `${NEON_API}/projects/${neonProjectId}/branches/${branchId}/auth`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getNeonKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ auth_provider: "better_auth" }),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    // Non-fatal — log and continue without auth
    console.error("[neon] auth enable failed:", res.status, err);
    return { baseUrl: "", pubClientKey: "", secretServerKey: "" };
  }
  const data = await res.json() as {
    base_url?: string;
    pub_client_key?: string;
    secret_server_key?: string;
  };
  return {
    baseUrl: data.base_url ?? "",
    pubClientKey: data.pub_client_key ?? "",
    secretServerKey: data.secret_server_key ?? "",
  };
}

export async function getNeonProjectBranches(
  neonProjectId: string,
): Promise<Array<{ id: string; name: string; default: boolean }>> {
  const res = await fetch(
    `${NEON_API}/projects/${neonProjectId}/branches`,
    {
      headers: { Authorization: `Bearer ${getNeonKey()}` },
    },
  );
  const data = await res.json() as {
    branches?: Array<{ id?: string; name?: string; default?: boolean }>;
  };
  return (data.branches ?? []).map((branch) => ({
    id: branch.id ?? "",
    name: branch.name ?? "",
    default: Boolean(branch.default),
  }));
}

export async function enableNeonDataApi(
  neonProjectId: string,
  branchId: string,
): Promise<void> {
  const res = await fetch(
    `${NEON_API}/projects/${neonProjectId}/branches/${branchId}/data-api/neondb`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getNeonKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth_provider: "neon_auth",
        add_default_grants: true,
      }),
    },
  );
  if (!res.ok) {
    console.error("[neon] data api enable failed:", res.status);
    // Non-fatal
  }
}
