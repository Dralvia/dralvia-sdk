// Dralvia JavaScript SDK
//
// A thin, dependency-light client for the Dralvia workspace API. It handles
// API-key auth, base-URL defaults, request timeouts, JSON shaping, and
// structured errors so an application can run scans without re-implementing
// the request layer.
//
// This file is the single source of truth for the public `@dralvia/sdk`
// package. It only calls public, already-shipped API endpoints. It does NOT
// embed any Dralvia backend, scanner, rule, or dataset logic.

export const DEFAULT_BASE_URL = "https://dralvia.tech/api/tenant";
export const DEFAULT_TIMEOUT_MS = 15000;

/** Base class for every error the SDK throws. */
class DralviaError extends Error {
  constructor(message) {
    super(message);
    this.name = "DralviaError";
  }
}

/** Thrown when the client is constructed or called with bad configuration. */
class DralviaConfigError extends DralviaError {
  constructor(message) {
    super(message);
    this.name = "DralviaConfigError";
  }
}

/** Thrown when a request exceeds the configured timeout. */
class DralviaTimeoutError extends DralviaError {
  constructor(requestUrl, timeoutMs) {
    super(`Dralvia request timed out after ${timeoutMs}ms: ${requestUrl}`);
    this.name = "DralviaTimeoutError";
    this.requestUrl = requestUrl;
    this.timeoutMs = timeoutMs;
  }
}

/** Thrown on any non-2xx HTTP response. Carries status, body, and request URL. */
class DralviaApiError extends DralviaError {
  constructor(status, payload, requestUrl) {
    super(`Dralvia API error (${status})`);
    this.name = "DralviaApiError";
    this.status = status;
    this.payload = payload || {};
    this.requestUrl = requestUrl;
    // Surface a request id when the API returns one; useful for support.
    this.requestId =
      (payload && (payload.request_id || payload.requestId)) || undefined;
  }
}

/** Thrown when calling a reserved namespace whose endpoint does not exist yet. */
class DralviaNotImplementedError extends DralviaError {
  constructor(feature) {
    super(
      `${feature} is reserved for a future Dralvia release and is not available yet.`
    );
    this.name = "DralviaNotImplementedError";
    this.feature = feature;
  }
}

async function ensureFetch() {
  if (typeof fetch !== "undefined") {
    return fetch;
  }
  // Node < 18 has no global fetch. The SDK has no runtime dependencies, so
  // fall back to node-fetch only if the host project already provides it.
  try {
    const { default: polyfill } = await import("node-fetch");
    globalThis.fetch = polyfill;
    return polyfill;
  } catch {
    throw new DralviaConfigError(
      "No global fetch is available. Use Node.js 18+ or install the optional " +
        "'node-fetch' package in your project."
    );
  }
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

/**
 * Reserved namespace for AI-agent guardrail checks.
 *
 * The `checkAction` / `checkContent` endpoints do not exist on the API yet.
 * These methods intentionally throw so that integrators can wire the call
 * site today and have it light up once the endpoints ship, without the SDK
 * pretending to call something that is not there.
 */
class AgentNamespace {
  async checkAction(_action) {
    throw new DralviaNotImplementedError("dralvia.agent.checkAction");
  }

  async checkContent(_content) {
    throw new DralviaNotImplementedError("dralvia.agent.checkContent");
  }
}

class DralviaClient {
  /**
   * @param {object} [options]
   * @param {string} [options.apiKey] Workspace API key. Falls back to env DRALVIA_API_KEY.
   * @param {string} [options.baseUrl] API base URL. Falls back to env DRALVIA_BASE_URL, then DEFAULT_BASE_URL.
   * @param {string} [options.bearerToken] Optional bearer token for console-session calls.
   * @param {number} [options.timeoutMs] Per-request timeout. Defaults to 15000.
   */
  constructor(options = {}) {
    const env = (typeof process !== "undefined" && process.env) || {};
    const apiKey = firstDefined(options.apiKey, env.DRALVIA_API_KEY);
    const baseUrl = firstDefined(
      options.baseUrl,
      env.DRALVIA_BASE_URL,
      DEFAULT_BASE_URL
    );

    if (!apiKey) {
      throw new DralviaConfigError(
        "apiKey is required. Pass { apiKey } or set the DRALVIA_API_KEY environment variable."
      );
    }

    this.apiKey = apiKey;
    this.baseUrl = String(baseUrl).replace(/\/+$/, "");
    this.bearerToken = options.bearerToken;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.agent = new AgentNamespace();
  }

  // --- Scanning -----------------------------------------------------------

  /** Scan a single URL. */
  async scanUrl(url, payload = {}) {
    return this._requestJson("POST", "/scan", { url, ...payload });
  }

  /** Unified scan helper. Accepts a URL, domain, email, or other supported input. */
  async unifiedScan(input, payload = {}) {
    return this._requestJson("POST", "/unified/scan", { input, ...payload });
  }

  /** Web Access Protection (SWG) evaluation for a destination URL. */
  async evaluateSwg(url, payload = {}) {
    return this._requestJson("POST", "/swg/evaluate", { url, ...payload });
  }

  /** Email-protection scoring helper for an inbound message. */
  async protectEmail(payload) {
    return this._requestJson("POST", "/email/protect", payload);
  }

  /** Upload a repository archive (zip bytes / Blob) for a repo scan. */
  async scanRepoArchive(fileName, fileContent, payload = {}) {
    const form = new FormData();
    const blob = fileContent instanceof Blob ? fileContent : new Blob([fileContent]);
    form.append("file", blob, fileName || "repo.zip");
    Object.entries(payload || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        form.append(key, String(value));
      }
    });
    return this._requestForm("POST", "/repo/scan/upload", form);
  }

  // --- Webhooks -----------------------------------------------------------

  /** List the workspace's registered webhooks. */
  async listWebhooks() {
    return this._requestJson("GET", "/pro/webhooks");
  }

  /** Register a new webhook. */
  async createWebhook(payload) {
    return this._requestJson("POST", "/pro/webhooks", payload);
  }

  /** Delete a webhook by id. */
  async deleteWebhook(webhookId) {
    return this._requestJson("DELETE", `/pro/webhooks/${encodeURIComponent(webhookId)}`);
  }

  /** Send a test delivery to a webhook by id. */
  async testWebhook(webhookId) {
    return this._requestJson("POST", `/pro/webhooks/${encodeURIComponent(webhookId)}/test`);
  }

  // --- Internals ----------------------------------------------------------

  _buildHeaders(includeJson = true) {
    const headers = {
      "X-API-KEY": this.apiKey,
      Accept: "application/json",
    };
    if (includeJson) {
      headers["Content-Type"] = "application/json";
    }
    if (this.bearerToken) {
      headers.Authorization = `Bearer ${this.bearerToken}`;
    }
    return headers;
  }

  async _send(method, path, { headers, body }) {
    const makeFetch = await ensureFetch();
    const requestUrl = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;
    try {
      response = await makeFetch(requestUrl, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
    } catch (err) {
      if (err && (err.name === "AbortError" || controller.signal.aborted)) {
        throw new DralviaTimeoutError(requestUrl, this.timeoutMs);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new DralviaApiError(response.status, payload, requestUrl);
    }
    return payload;
  }

  async _requestJson(method, path, body) {
    return this._send(method, path, {
      headers: this._buildHeaders(method !== "GET"),
      body: method === "GET" ? undefined : JSON.stringify(body || {}),
    });
  }

  async _requestForm(method, path, formData) {
    return this._send(method, path, {
      headers: this._buildHeaders(false),
      body: formData,
    });
  }
}

export {
  DralviaClient,
  DralviaError,
  DralviaConfigError,
  DralviaTimeoutError,
  DralviaApiError,
  DralviaNotImplementedError,
};
