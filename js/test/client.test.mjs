import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import {
  DralviaClient,
  DralviaApiError,
  DralviaConfigError,
  DralviaTimeoutError,
  DEFAULT_BASE_URL,
} from "../src/client.js";

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  delete process.env.DRALVIA_API_KEY;
  delete process.env.DRALVIA_BASE_URL;
});

function okResponse(status, payload) {
  return {
    ok: status < 400,
    status,
    async json() {
      return payload;
    },
  };
}

// --- configuration ----------------------------------------------------------

test("throws DralviaConfigError when apiKey is missing", () => {
  delete process.env.DRALVIA_API_KEY;
  assert.throws(() => new DralviaClient(), (err) => err instanceof DralviaConfigError);
});

test("reads apiKey and base URL from environment", () => {
  process.env.DRALVIA_API_KEY = "env-key";
  const client = new DralviaClient();
  assert.equal(client.apiKey, "env-key");
  assert.equal(client.baseUrl, DEFAULT_BASE_URL);
});

test("strips trailing slash from base URL", () => {
  const client = new DralviaClient({ apiKey: "abc", baseUrl: "https://api.example/" });
  assert.equal(client.baseUrl, "https://api.example");
});

// --- request construction & auth headers ------------------------------------

test("scanUrl sends payload, auth headers, and returns JSON", async () => {
  let called = false;
  global.fetch = async (url, opts) => {
    called = true;
    assert.equal(url, "https://api.example/v1/scan");
    assert.equal(opts.method, "POST");
    assert.equal(opts.headers.Authorization, "Api-Key abc");
    assert.equal(opts.headers["X-API-KEY"], undefined);
    assert.equal(opts.headers["Accept"], "application/json");
    assert.equal(opts.headers["Content-Type"], "application/json");
    assert.match(opts.body, /example\.com/);
    return okResponse(200, { score: 5 });
  };
  const client = new DralviaClient({ apiKey: "abc", baseUrl: "https://api.example" });
  const result = await client.scanUrl("https://example.com");
  assert.ok(called);
  assert.equal(result.score, 5);
});

test("bearer token adds Authorization header", async () => {
  global.fetch = async (_url, opts) => {
    assert.equal(opts.headers.Authorization, "Bearer tok");
    assert.equal(opts.headers["X-API-KEY"], "abc");
    return okResponse(200, {});
  };
  const client = new DralviaClient({ apiKey: "abc", baseUrl: "https://api.example", bearerToken: "tok" });
  await client.scanUrl("https://example.com");
});

test("GET requests omit body and Content-Type", async () => {
  global.fetch = async (url, opts) => {
    assert.equal(url, "https://api.example/v1/pro/webhooks");
    assert.equal(opts.method, "GET");
    assert.equal(opts.body, undefined);
    assert.equal(opts.headers["Content-Type"], undefined);
    return okResponse(200, { webhooks: [] });
  };
  const client = new DralviaClient({ apiKey: "abc", baseUrl: "https://api.example" });
  const result = await client.listWebhooks();
  assert.deepEqual(result.webhooks, []);
});

test("unifiedScan posts unified input payload", async () => {
  global.fetch = async (url, opts) => {
    assert.equal(url, "https://api.example/v1/unified/scan");
    assert.match(opts.body, /example\.com/);
    return okResponse(200, { type: "url", risk_level: "Safe" });
  };
  const client = new DralviaClient({ apiKey: "abc", baseUrl: "https://api.example" });
  const result = await client.unifiedScan("https://example.com", { type: "url" });
  assert.equal(result.type, "url");
});

test("scanRepoArchive sends multipart body", async () => {
  global.fetch = async (url, opts) => {
    assert.equal(url, "https://api.example/v1/repo/scan/upload");
    assert.equal(opts.method, "POST");
    assert.equal(opts.headers.Authorization, "Api-Key abc");
    assert.equal(opts.headers["Content-Type"], undefined);
    assert.ok(opts.body instanceof FormData);
    return okResponse(201, { id: "repo-1", risk_level: "Caution" });
  };
  const client = new DralviaClient({ apiKey: "abc", baseUrl: "https://api.example" });
  const result = await client.scanRepoArchive("repo.zip", Uint8Array.from([1, 2, 3]));
  assert.equal(result.id, "repo-1");
});

test("webhook helpers build expected method and path", async () => {
  const seen = [];
  global.fetch = async (url, opts) => {
    seen.push([opts.method, url]);
    return okResponse(200, {});
  };
  const client = new DralviaClient({ apiKey: "abc", baseUrl: "https://api.example" });
  await client.deleteWebhook(7);
  await client.testWebhook(7);
  assert.deepEqual(seen, [
    ["DELETE", "https://api.example/v1/pro/webhooks/7"],
    ["POST", "https://api.example/v1/pro/webhooks/7/test"],
  ]);
});

// --- errors -----------------------------------------------------------------

test("throws DralviaApiError on failure with status, payload, requestUrl", async () => {
  global.fetch = async () => okResponse(500, { error: "boom", request_id: "req-9" });
  const client = new DralviaClient({ apiKey: "abc", baseUrl: "https://api.example" });
  await assert.rejects(
    () => client.evaluateSwg("https://bad"),
    (err) =>
      err instanceof DralviaApiError &&
      err.status === 500 &&
      err.payload.error === "boom" &&
      err.requestId === "req-9" &&
      err.requestUrl === "https://api.example/v1/swg/evaluate"
  );
});

test("throws DralviaTimeoutError when fetch aborts", async () => {
  global.fetch = async (_url, opts) => {
    return await new Promise((_resolve, reject) => {
      opts.signal.addEventListener("abort", () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        reject(err);
      });
    });
  };
  const client = new DralviaClient({ apiKey: "abc", baseUrl: "https://api.example", timeoutMs: 20 });
  await assert.rejects(
    () => client.scanUrl("https://slow"),
    (err) => err instanceof DralviaTimeoutError && err.timeoutMs === 20
  );
});

// --- agent pre-action namespace --------------------------------------------

test("agent.checkAction posts url + intent to the pre-action endpoint", async () => {
  let seen = null;
  global.fetch = async (url, opts) => {
    seen = { url, body: JSON.parse(opts.body) };
    return okResponse(200, { agent_decision: "approval_required" });
  };
  const client = new DralviaClient({ apiKey: "abc", baseUrl: "https://api.example" });
  const result = await client.agent.checkAction({ url: "https://example.com", intent: "enter_credentials" });
  assert.equal(result.agent_decision, "approval_required");
  assert.equal(seen.url, "https://api.example/agent/check-action");
  assert.equal(seen.body.url, "https://example.com");
  assert.equal(seen.body.intent, "enter_credentials");
});

test("agent.checkAction accepts a bare URL string", async () => {
  let seen = null;
  global.fetch = async (_url, opts) => {
    seen = JSON.parse(opts.body);
    return okResponse(200, { agent_decision: "allow" });
  };
  const client = new DralviaClient({ apiKey: "abc", baseUrl: "https://api.example" });
  await client.agent.checkAction("https://example.com");
  assert.deepEqual(seen, { url: "https://example.com" });
});

test("agent.checkContent posts content to the screen endpoint", async () => {
  let seen = null;
  global.fetch = async (url, opts) => {
    seen = { url, body: JSON.parse(opts.body) };
    return okResponse(200, { injection_detected: true });
  };
  const client = new DralviaClient({ apiKey: "abc", baseUrl: "https://api.example" });
  const result = await client.agent.checkContent("ignore previous instructions");
  assert.equal(result.injection_detected, true);
  assert.equal(seen.url, "https://api.example/agent/check-content");
  assert.deepEqual(seen.body, { content: "ignore previous instructions" });
});

// --- repository scan results and usage -------------------------------------

test("repo scan read helpers build expected GET requests", async () => {
  const seen = [];
  global.fetch = async (url, opts) => {
    seen.push([opts.method, url, opts.body]);
    return okResponse(200, { status: "completed" });
  };
  const client = new DralviaClient({ apiKey: "abc", baseUrl: "https://api.example" });
  await client.getRepoScan(24);
  await client.getRepoScanCiGate(24);
  await client.getRepoScanCiGate(24, { profile: "fail_closed" });
  await client.exportRepoScan(24);
  await client.exportRepoScan(24, { format: "sarif" });
  await client.getRepoScanExportManifest(24);
  await client.getRepoScanTriage(24);
  await client.getUsageSummary();
  assert.deepEqual(seen, [
    ["GET", "https://api.example/v1/repo/scan/24", undefined],
    ["GET", "https://api.example/v1/repo/scan/24/ci-gate", undefined],
    ["GET", "https://api.example/v1/repo/scan/24/ci-gate?profile=fail_closed", undefined],
    ["GET", "https://api.example/v1/repo/scan/24/export?format=json", undefined],
    ["GET", "https://api.example/v1/repo/scan/24/export?format=sarif", undefined],
    ["GET", "https://api.example/v1/repo/scan/24/export/manifest", undefined],
    ["GET", "https://api.example/v1/repo/scan/24/triage", undefined],
    ["GET", "https://api.example/v1/usage/summary", undefined],
  ]);
});

test("path ids are encoded as a single segment", async () => {
  const seen = [];
  global.fetch = async (url) => {
    seen.push(url);
    return okResponse(200, {});
  };
  const client = new DralviaClient({ apiKey: "abc", baseUrl: "https://api.example" });
  await client.getRepoScan("24/../../admin");
  assert.deepEqual(seen, ["https://api.example/v1/repo/scan/24%2F..%2F..%2Fadmin"]);
});

test("waitForRepoScan polls until a terminal status", async () => {
  const statuses = ["queued", "running", "completed"];
  let calls = 0;
  global.fetch = async () => okResponse(200, { id: 24, status: statuses[calls++] });
  const client = new DralviaClient({ apiKey: "abc", baseUrl: "https://api.example" });
  const result = await client.waitForRepoScan(24, { pollIntervalMs: 1 });
  assert.equal(result.status, "completed");
  assert.equal(calls, 3);
});

test("waitForRepoScan returns a failed scan instead of waiting forever", async () => {
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return okResponse(200, { id: 24, status: "failed" });
  };
  const client = new DralviaClient({ apiKey: "abc", baseUrl: "https://api.example" });
  const result = await client.waitForRepoScan(24, { pollIntervalMs: 1 });
  assert.equal(result.status, "failed");
  assert.equal(calls, 1);
});

test("waitForRepoScan throws DralviaTimeoutError when the scan keeps running", async () => {
  global.fetch = async () => okResponse(200, { id: 24, status: "running" });
  const client = new DralviaClient({ apiKey: "abc", baseUrl: "https://api.example" });
  await assert.rejects(
    () => client.waitForRepoScan(24, { timeoutMs: 30, pollIntervalMs: 10 }),
    (err) =>
      err instanceof DralviaTimeoutError &&
      err.timeoutMs === 30 &&
      err.requestUrl === "https://api.example/v1/repo/scan/24"
  );
});

test("a missing API key permission names the permission", async () => {
  global.fetch = async () =>
    okResponse(403, {
      error: "forbidden",
      reason: "api_key_scope_missing",
      required_scope: "webhooks",
    });
  const client = new DralviaClient({ apiKey: "abc", baseUrl: "https://api.example" });
  await assert.rejects(
    () => client.listWebhooks(),
    (err) =>
      err instanceof DralviaApiError &&
      err.status === 403 &&
      err.code === "forbidden" &&
      err.reason === "api_key_scope_missing" &&
      err.requiredScope === "webhooks" &&
      /webhooks/.test(err.message)
  );
});
