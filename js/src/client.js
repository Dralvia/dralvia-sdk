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
const API_VERSION_PREFIX = "/v1";
const DEFAULT_REPO_SCAN_WAIT_MS = 600000;
const DEFAULT_REPO_SCAN_POLL_MS = 5000;
// A repository scan in one of these states will not change any more.
const REPO_SCAN_TERMINAL_STATUSES = new Set(["completed", "done", "failed", "dead_letter"]);

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
    const body = payload && typeof payload === "object" ? payload : {};
    let message = `Dralvia API error (${status})`;
    if (body.required_scope) {
      message += `: API key is missing the \`${body.required_scope}\` permission`;
    } else if (body.error) {
      message += `: ${body.error}`;
    }
    super(message);
    this.name = "DralviaApiError";
    this.status = status;
    this.payload = body;
    this.requestUrl = requestUrl;
    // Surface a request id when the API returns one; useful for support.
    this.requestId = body.request_id || body.requestId || undefined;
    /** Machine-readable error code, e.g. "forbidden" or "not_found". */
    this.code = body.error || undefined;
    /** Why the request was refused, e.g. "api_key_scope_missing". */
    this.reason = body.reason || undefined;
    /** The API key permission this route needs, when a key lacks it. */
    this.requiredScope = body.required_scope || undefined;
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

/** Encode an id as a single path segment so it cannot change the route. */
function pathId(value) {
  return encodeURIComponent(String(value));
}

function withQuery(path, params) {
  const entries = Object.entries(params || {}).filter(
    ([, value]) => value !== undefined && value !== null && value !== ""
  );
  if (!entries.length) {
    return path;
  }
  return `${path}?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()}`;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

/**
 * AI-agent pre-action guardrail checks.
 *
 * `checkAction` asks Dralvia for a safety verdict before the agent acts on a
 * URL (visit, enter credentials, pay, download, connect a tool, sign a
 * transaction). `checkContent` screens content the agent just retrieved for
 * prompt-injection / tool-hijack patterns.
 */
class AgentNamespace {
  constructor(client) {
    this._client = client;
  }

  /**
   * Pre-action safety verdict.
   * @param {object|string} action `{ url, intent }` mapping, or a bare URL
   *   string (treated as a `visit` intent).
   */
  async checkAction(action) {
    const body = typeof action === "string" ? { url: action } : { ...(action || {}) };
    return this._client._requestJson("POST", "/agent/check-action", body);
  }

  /**
   * Prompt-injection screen for retrieved content.
   * @param {object|string} content The page text / tool output string, or a
   *   `{ content, url }` mapping.
   */
  async checkContent(content) {
    const body = typeof content === "string" ? { content } : { ...(content || {}) };
    return this._client._requestJson("POST", "/agent/check-content", body);
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
    this.agent = new AgentNamespace(this);
  }

  // --- Scanning -----------------------------------------------------------

  /** Scan a single URL. */
  async scanUrl(url, payload = {}) {
    return this._requestJson("POST", `${API_VERSION_PREFIX}/scan`, { url, ...payload });
  }

  /** Unified scan helper. Accepts a URL, domain, email, or other supported input. */
  async unifiedScan(input, payload = {}) {
    return this._requestJson("POST", `${API_VERSION_PREFIX}/unified/scan`, { input, ...payload });
  }

  /** Web Access Protection (SWG) evaluation for a destination URL. */
  async evaluateSwg(url, payload = {}) {
    return this._requestJson("POST", `${API_VERSION_PREFIX}/swg/evaluate`, { url, ...payload });
  }

  /** Email-protection scoring helper for an inbound message. */
  async protectEmail(payload) {
    return this._requestJson("POST", `${API_VERSION_PREFIX}/email/protect`, payload);
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
    return this._requestForm("POST", `${API_VERSION_PREFIX}/repo/scan/upload`, form);
  }

  // --- Repository scan results ---------------------------------------------

  /** Fetch a repository scan: status, risk, findings, and summaries. */
  async getRepoScan(scanId) {
    return this._requestJson("GET", `${API_VERSION_PREFIX}/repo/scan/${pathId(scanId)}`);
  }

  /**
   * Poll a repository scan until it finishes and resolve with the final result.
   * Resolves once `status` is terminal (completed, done, failed, dead_letter);
   * check `status` before trusting the result. Rejects with DralviaTimeoutError
   * if the scan is still running after `timeoutMs`.
   * @param {string|number} scanId
   * @param {object} [options]
   * @param {number} [options.timeoutMs] Defaults to 600000 (10 minutes).
   * @param {number} [options.pollIntervalMs] Defaults to 5000.
   */
  async waitForRepoScan(scanId, options = {}) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_REPO_SCAN_WAIT_MS;
    const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_REPO_SCAN_POLL_MS;
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const scan = await this.getRepoScan(scanId);
      if (REPO_SCAN_TERMINAL_STATUSES.has(String((scan && scan.status) || "").toLowerCase())) {
        return scan;
      }
      if (Date.now() + pollIntervalMs > deadline) {
        throw new DralviaTimeoutError(
          `${this.baseUrl}${API_VERSION_PREFIX}/repo/scan/${pathId(scanId)}`,
          timeoutMs
        );
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  /**
   * CI gate decision for a scan (pass / review / fail).
   * @param {string|number} scanId
   * @param {object} [options]
   * @param {string} [options.profile] Evaluate under another policy, e.g. "advisory", "balanced", "fail_closed".
   */
  async getRepoScanCiGate(scanId, options = {}) {
    return this._requestJson(
      "GET",
      withQuery(`${API_VERSION_PREFIX}/repo/scan/${pathId(scanId)}/ci-gate`, { profile: options.profile })
    );
  }

  /**
   * Export a scan, e.g. `{ format: "sarif" }` for code-scanning upload. An
   * unsupported format rejects with DralviaApiError whose payload lists the
   * `supported` formats.
   */
  async exportRepoScan(scanId, options = {}) {
    return this._requestJson(
      "GET",
      withQuery(`${API_VERSION_PREFIX}/repo/scan/${pathId(scanId)}/export`, { format: options.format || "json" })
    );
  }

  /** Signed manifest listing every export artifact of a scan and its digest. */
  async getRepoScanExportManifest(scanId) {
    return this._requestJson("GET", `${API_VERSION_PREFIX}/repo/scan/${pathId(scanId)}/export/manifest`);
  }

  /** Review decisions and suppressions recorded against a scan's findings. */
  async getRepoScanTriage(scanId) {
    return this._requestJson("GET", `${API_VERSION_PREFIX}/repo/scan/${pathId(scanId)}/triage`);
  }

  // --- Usage ----------------------------------------------------------------

  /** Scan counts, plan limits, and the current billing period for the workspace. */
  async getUsageSummary() {
    return this._requestJson("GET", `${API_VERSION_PREFIX}/usage/summary`);
  }

  // --- Webhooks -----------------------------------------------------------
  // Webhook management needs an API key created or rotated with the
  // `webhooks` permission; other keys get DralviaApiError 403.

  /** List the workspace's registered webhooks. */
  async listWebhooks() {
    return this._requestJson("GET", `${API_VERSION_PREFIX}/pro/webhooks`);
  }

  /** Register a new webhook. */
  async createWebhook(payload) {
    return this._requestJson("POST", `${API_VERSION_PREFIX}/pro/webhooks`, payload);
  }

  /** Delete a webhook by id. */
  async deleteWebhook(webhookId) {
    return this._requestJson("DELETE", `${API_VERSION_PREFIX}/pro/webhooks/${pathId(webhookId)}`);
  }

  /** Send a test delivery to a webhook by id. */
  async testWebhook(webhookId) {
    return this._requestJson("POST", `${API_VERSION_PREFIX}/pro/webhooks/${pathId(webhookId)}/test`);
  }

  // --- Internals ----------------------------------------------------------

  _buildHeaders(includeJson = true) {
    // The documented header. With a bearer session, Authorization carries the
    // session, so the key travels in the legacy X-API-KEY header instead.
    const headers = this.bearerToken
      ? { Authorization: `Bearer ${this.bearerToken}`, "X-API-KEY": this.apiKey, Accept: "application/json" }
      : { Authorization: `Api-Key ${this.apiKey}`, Accept: "application/json" };
    if (includeJson) {
      headers["Content-Type"] = "application/json";
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
