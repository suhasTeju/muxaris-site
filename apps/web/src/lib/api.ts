import { env } from "./env";

export interface ApiIssue {
  path?: Array<string | number>;
  message: string;
  [key: string]: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly issues: ApiIssue[] | undefined;
  constructor(status: number, code: string, message: string, issues?: ApiIssue[]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

export interface ApiInit {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  clinicId?: string | undefined;
}

export interface ApiAuth {
  token?: string | undefined;
}

export function buildRequest(
  path: string,
  init: ApiInit = {},
  auth: ApiAuth = {},
): { url: string; init: RequestInit } {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  if (init.clinicId) headers["X-Clinic-Id"] = init.clinicId;
  const hasBody = init.body !== undefined;
  if (hasBody) headers["Content-Type"] = "application/json";
  return {
    url: `${env.apiUrl}${path}`,
    init: {
      method: init.method ?? "GET",
      headers,
      ...(hasBody ? { body: JSON.stringify(init.body) } : {}),
      cache: "no-store",
    },
  };
}

export async function apiFetch<T>(
  path: string,
  init: ApiInit = {},
  auth: ApiAuth = {},
): Promise<T> {
  const req = buildRequest(path, init, auth);
  const res = await fetch(req.url, req.init);
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  if (!res.ok) {
    const e = (
      json as { error?: { code?: string; message?: string; issues?: ApiIssue[] } } | undefined
    )?.error;
    throw new ApiError(
      res.status,
      e?.code ?? "http_error",
      e?.message ?? (res.statusText || `Request failed (${res.status})`),
      e?.issues,
    );
  }
  return json as T;
}

export interface MeResponse {
  user: { id: string; email: string; name?: string | null };
  memberships: Array<{
    clinicId: string;
    role: string;
    clinic: {
      id: string;
      name: string;
      slug: string;
      city: string | null;
      onboardingStep: string | null;
    };
  }>;
}
