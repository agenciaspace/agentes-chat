/** LegalOps API contract. Documents and analysis snapshots never enter the general chat cache. */
export interface LegalMatter {
  id: string;
  orgId: string;
  title: string;
  client: string;
  brief: string;
  ownerId: string;
  memberIds: string[];
  revision: number;
  createdAt: string;
}
export interface LegalDocument {
  id: string;
  documentKey: string;
  version: number;
  name: string;
  kind: "contract" | "model" | "policy";
  content: string;
  digest: string;
  createdAt: string;
}
export interface LegalSource {
  id: string;
  documentId: string;
  name: string;
  version: number;
  digest: string;
  position: number;
  text: string;
}
export interface LegalOutput {
  summary: string;
  findings: {
    title: string;
    detail: string;
    severity: "attention" | "info";
    citations: { sourceId: string; quote: string }[];
  }[];
  nextActions: string[];
  missingInformation: string[];
}
export interface LegalAnalysis {
  id: string;
  revision: number;
  status: "queued" | "running" | "review" | "approved" | "changes_requested" | "failed" | "canceled" | "superseded";
  step: number;
  snapshot: {
    title: string;
    brief: string;
    sources: LegalSource[];
    totalPassages: number;
    agents: { id: string; role: string }[];
  };
  outputs: LegalOutput[];
  error: string | null;
  decisionNote: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
}
export interface LegalDetail {
  matter: LegalMatter;
  documents: LegalDocument[];
  analyses: LegalAnalysis[];
}

export async function legalRequest<T>(orgId: string, path: string, input?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/app/organizations/${encodeURIComponent(orgId)}/legalops/matters${path}`, {
    method: input === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    signal,
    ...(input === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(input) }),
  });
  const value = await response.json();
  if (!response.ok) {
    const error = value as { error?: { message?: string } };
    throw new Error(error.error?.message ?? "Não foi possível concluir. Tente novamente.");
  }
  return value as T;
}
