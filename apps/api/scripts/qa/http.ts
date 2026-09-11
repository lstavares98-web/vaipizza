import type { QaConfig } from "./types.js";

export interface QaRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  token?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface QaHttpResponse<T> {
  ok: boolean;
  status: number;
  data: T;
  durationMs: number;
}

export async function qaRequest<T>(
  config: QaConfig,
  path: string,
  options: QaRequestOptions = {},
): Promise<QaHttpResponse<T>> {
  if (!path.startsWith("/")) throw new Error(`QA request path must start with '/': ${path}`);
  const url = `${config.apiUrl}${path}`;
  const started = performance.now();

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "network error";
    throw new Error(`QA API unavailable for ${path}: ${message}`);
  }

  const durationMs = performance.now() - started;
  const contentType = response.headers.get("content-type") ?? "";
  let data: unknown;
  if (contentType.includes("application/json")) {
    data = await response.json();
  } else {
    data = { message: await response.text() };
  }

  return {
    ok: response.ok,
    status: response.status,
    data: data as T,
    durationMs,
  };
}

export function expectQaSuccess<T extends { success?: boolean }>(response: QaHttpResponse<T>, label: string): T {
  if (!response.ok || response.data?.success === false) {
    const message = (response.data as { message?: string } | undefined)?.message ?? `HTTP ${response.status}`;
    throw new Error(`${label} failed: ${message}`);
  }
  return response.data;
}
