// Type declarations for @dralvia/sdk
//
// Hand-written types for the thin JavaScript client. The SDK ships as plain
// ES modules; these declarations give editors and TypeScript consumers full
// IntelliSense without a build step.

export const DEFAULT_BASE_URL: string;
export const DEFAULT_TIMEOUT_MS: number;

/** A parsed JSON response body. The API shape is intentionally open. */
export type JsonObject = Record<string, unknown>;

export interface DralviaClientOptions {
  /** Workspace API key. Falls back to the DRALVIA_API_KEY environment variable. */
  apiKey?: string;
  /** API base URL. Falls back to DRALVIA_BASE_URL, then DEFAULT_BASE_URL. */
  baseUrl?: string;
  /** Optional bearer token for console-session calls. */
  bearerToken?: string;
  /** Per-request timeout in milliseconds. Defaults to DEFAULT_TIMEOUT_MS. */
  timeoutMs?: number;
}

export class DralviaError extends Error {}

export class DralviaConfigError extends DralviaError {}

export class DralviaTimeoutError extends DralviaError {
  requestUrl: string;
  timeoutMs: number;
}

export class DralviaApiError extends DralviaError {
  status: number;
  payload: JsonObject;
  requestUrl: string;
  requestId?: string;
}

export class DralviaNotImplementedError extends DralviaError {
  feature: string;
}

/** AI-agent pre-action guardrail checks. */
export class AgentNamespace {
  /** Pre-action safety verdict for a URL the agent is about to act on. */
  checkAction(action: JsonObject | string): Promise<JsonObject>;
  /** Prompt-injection screen for content the agent just retrieved. */
  checkContent(content: JsonObject | string): Promise<JsonObject>;
}

export class DralviaClient {
  constructor(options?: DralviaClientOptions);

  apiKey: string;
  baseUrl: string;
  bearerToken?: string;
  timeoutMs: number;
  readonly agent: AgentNamespace;

  scanUrl(url: string, payload?: JsonObject): Promise<JsonObject>;
  unifiedScan(input: string, payload?: JsonObject): Promise<JsonObject>;
  evaluateSwg(url: string, payload?: JsonObject): Promise<JsonObject>;
  protectEmail(payload: JsonObject): Promise<JsonObject>;
  scanRepoArchive(
    fileName: string,
    fileContent: Blob | ArrayBuffer | Uint8Array | string,
    payload?: JsonObject
  ): Promise<JsonObject>;

  listWebhooks(): Promise<JsonObject>;
  createWebhook(payload: JsonObject): Promise<JsonObject>;
  deleteWebhook(webhookId: string | number): Promise<JsonObject>;
  testWebhook(webhookId: string | number): Promise<JsonObject>;
}
