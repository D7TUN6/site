export class ApiError extends Error {
  status: number;
  payload: unknown;
  code: string | null;
  requestId: string | null;

  constructor(message: string, status: number, payload: unknown, options: { code?: string | null; requestId?: string | null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
    this.code = options.code ?? null;
    this.requestId = options.requestId ?? null;
  }
}

type ParsedApiError = {
  message: string | null;
  code: string | null;
  requestId: string | null;
};

function extractApiError(payload: unknown): ParsedApiError {
  if (!payload || typeof payload !== "object") {
    return { message: null, code: null, requestId: null };
  }
  const candidate = payload as { error?: unknown; requestId?: unknown };

  const topRequestId = typeof candidate.requestId === "string" && candidate.requestId ? candidate.requestId : null;

  if (typeof candidate.error === "string") {
    return { message: candidate.error, code: null, requestId: topRequestId };
  }

  if (candidate.error && typeof candidate.error === "object") {
    const err = candidate.error as { message?: unknown; code?: unknown; requestId?: unknown };
    return {
      message: typeof err.message === "string" ? err.message : null,
      code: typeof err.code === "string" ? err.code : null,
      requestId: typeof err.requestId === "string" ? err.requestId : topRequestId
    };
  }

  return { message: null, code: null, requestId: topRequestId };
}

function headersToObject(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    const out: Record<string, string> = {};
    for (const [key, value] of headers.entries()) {
      out[key] = value;
    }
    return out;
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return headers as Record<string, string>;
}

type ApiRequestInit = RequestInit & { timeoutMs?: number };

export async function apiFetchJson<T>(input: string, init: ApiRequestInit = {}): Promise<T> {
  const timeoutMs = typeof init.timeoutMs === "number" && Number.isFinite(init.timeoutMs) ? init.timeoutMs : 20000;

  const controller = init.signal ? null : new AbortController();
  const timeout = controller
    ? globalThis.setTimeout(() => controller.abort(), timeoutMs)
    : null;

  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      signal: init.signal ?? controller?.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "fetch",
        ...headersToObject(init.headers)
      },
      referrerPolicy: "same-origin",
      credentials: "include"
    });
  } catch (error) {
    if (timeout != null) {
      globalThis.clearTimeout(timeout);
    }

    const message = error instanceof DOMException && error.name === "AbortError" ? "Request timed out" : "Network error";
    throw new ApiError(message, 0, null);
  } finally {
    if (timeout != null) {
      globalThis.clearTimeout(timeout);
    }
  }

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await response.json().catch(() => null) : await response.text().catch(() => null);
  const requestId = response.headers.get("x-request-id");

  if (!response.ok) {
    const extracted = extractApiError(payload);
    const code = extracted.code ?? null;
    const id = extracted.requestId ?? requestId ?? null;
    const baseMessage = extracted.message ?? `Request failed (${response.status})`;
    const message = (response.status >= 500 || response.status === 0) && id ? `${baseMessage} (id: ${id})` : baseMessage;
    throw new ApiError(message, response.status, payload, { code, requestId: id });
  }

  return payload as T;
}
