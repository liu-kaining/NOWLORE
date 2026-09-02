export interface PublicStats {
  projects: number;
  launched: number;
  sources: number;
  creatorFeesLamports: string;
}

export interface SignalView {
  id: string;
  source: string;
  sourceType: string;
  title: string;
  summary: string;
  url: string;
  publishedAt: string;
  metrics: Record<string, number>;
}

export interface ProjectView {
  id: string;
  sequence: number;
  slug: string;
  name: string;
  symbol: string;
  tagline: string;
  thesis: string;
  description: string;
  websiteCopy: string;
  riskDisclosures: string[];
  disclaimers: string[];
  status: string;
  network: string;
  creatorWallet?: string;
  teamAllocation: string;
  creatorInitialBuy: string;
  contentHash: string;
  experimentStartsAt: string;
  experimentEndsAt: string;
  publishedAt?: string;
  assetBundle?: { posterUrl: string; metadataUrl: string };
  assessment?: {
    summary: string;
    narrative: string;
    confidence: number;
    expectedWindowHours: number;
    providerProtocol: string;
    model: string;
    scores: Record<string, number>;
  };
  signals?: SignalView[];
  launches?: Array<{ mint: string; transactionSignature?: string; status: string; network: string }>;
  metrics?: Array<{ observedAt: string; creatorVaultLamports: string; transactionStatus: string }>;
}

export interface AdminOverview {
  signals: SignalView[];
  topics: Array<{ id: string; canonicalTitle: string; heuristicScore: number; sourceCount: number; status: string }>;
  assessments: Array<{ id: string; topicId: string; recommendation: string; scores: Record<string, number> }>;
  projects: ProjectView[];
  launches: Array<{ id: string; projectId: string; status: string; mint: string }>;
  runs: Array<{ id: string; kind: string; status: string; startedAt: string; counters: Record<string, number> }>;
}

export async function api<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}`, "x-operator-id": "nowlore-ops" } : {}),
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message ?? `Request failed with ${response.status}`);
  return body as T;
}
