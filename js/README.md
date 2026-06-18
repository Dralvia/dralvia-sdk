# Dralvia JavaScript SDK

Official thin client for the [Dralvia](https://dralvia.tech) security API. It
runs in Node.js (workers, serverless, CI) and modern browsers, and handles
API-key auth, base-URL defaults, request timeouts, JSON shaping, and structured
errors so your app can run scans without re-implementing the request layer.

The SDK has no required runtime dependencies on Node.js 18+ (it uses the global
`fetch`).

## What is Dralvia

[Dralvia](https://dralvia.tech) is a security service that scores links,
domains, emails, and code for phishing and other threats. This SDK is the
programmatic way to use it: call the same checks the Dralvia app runs, straight
from your own backend, worker, or CI.

## What you can do with this SDK

- **Scan a URL** for phishing and risk (`scanUrl`).
- **Unified scan** of a URL, domain, email, or other input (`unifiedScan`).
- **Evaluate a destination** for Web Access Protection / SWG policy
  (`evaluateSwg`).
- **Score an inbound email** message (`protectEmail`).
- **Scan a repository archive** (`scanRepoArchive`).
- **Manage webhooks** for scan events (`listWebhooks`, `createWebhook`,
  `testWebhook`, `deleteWebhook`).

This SDK covers the core scanning surface of the Dralvia API. Some product areas
are managed in the Dralvia app and are not exposed here. See the
[full docs](https://dralvia.tech/docs) for the complete feature set.

## Package status

The source for `@dralvia/sdk` is public on GitHub.
The package is not published on the public npm registry yet; until it is,
install it from source (see Install). `npm install @dralvia/sdk` will start
working once the package is published.

## Requirements

- Node.js 18 or newer (older Node needs the optional `node-fetch` package).
- A Dralvia workspace API key (see next).

## Get an API key

1. Sign in to Dralvia at `https://dralvia.tech`.
2. Open the API Keys page in the workspace console:
   `https://dralvia.tech/#/api-keys`.
3. Generate a key yourself and copy it. It grants programmatic access to your
   workspace, so keep it in a secret manager, never in source control.
4. Export it for the SDK to pick up automatically:

   ```bash
   export DRALVIA_API_KEY="your-key"
   ```

The SDK sends the key as the `X-API-KEY` header on every request and refuses to
construct a client without one.

## Install

```bash
# From source: clone the repo, then from the js/ folder:
npm install

# Or, once published, from the registry:
npm install @dralvia/sdk
```

## Quick start

```js
import { DralviaClient } from "@dralvia/sdk";

// apiKey falls back to DRALVIA_API_KEY, baseUrl to DRALVIA_BASE_URL.
const client = new DralviaClient({
  apiKey: process.env.DRALVIA_API_KEY,
});

const scan = await client.scanUrl("https://example.com");
console.log(scan.risk_level, scan.score);
```

The base URL defaults to `https://dralvia.tech/api/tenant`. Override it with the
`baseUrl` option or the `DRALVIA_BASE_URL` environment variable.

## Helpers

```js
// Unified scan: pass a URL, domain, email, or other supported input.
const unified = await client.unifiedScan("https://example.com/login", { type: "url" });

// Web Access Protection (SWG) evaluation.
const swg = await client.evaluateSwg("https://example.com/social");

// Email-protection scoring for an inbound message.
await client.protectEmail({
  subject: "Quarterly results",
  sender: "ceo@example.com",
  recipients: ["user@workspace.com"],
  html: "<p>See attached</p>",
});

// Repository archive scan (zip bytes / Blob).
const repo = await client.scanRepoArchive("repo.zip", zipBytes, { async: "1" });

// Webhooks.
const hooks = await client.listWebhooks();
await client.createWebhook({ url: "https://your-app/webhooks/dralvia", events: ["scan.completed"] });
await client.testWebhook(hookId);
await client.deleteWebhook(hookId);
```

## Errors

Every method returns parsed JSON. The SDK throws typed errors so you can branch
cleanly:

| Error | When |
| --- | --- |
| `DralviaConfigError` | Missing API key or no available `fetch`. |
| `DralviaTimeoutError` | Request exceeded `timeoutMs` (default 15000). |
| `DralviaApiError` | Non-2xx response. Carries `status`, `payload`, `requestUrl`, `requestId`. |
| `DralviaNotImplementedError` | A reserved future feature was called (see below). |

```js
import { DralviaApiError } from "@dralvia/sdk";

try {
  await client.scanUrl("https://example.com");
} catch (err) {
  if (err instanceof DralviaApiError) {
    console.error(err.status, err.requestId, err.payload);
  }
}
```

## Reserved: agent guardrails

`client.agent.checkAction(...)` and `client.agent.checkContent(...)` are
reserved for a future Dralvia release. They currently throw
`DralviaNotImplementedError`. Wire your call site today; it lights up when the
endpoints ship.

## Examples

See [`examples/`](./examples) for runnable scripts: `scan_url.js`,
`unified_scan.js`, `email_protect.js`, `repo_scan.js`, and
`webhook_receiver.js`.

## Tests

```bash
npm test
```

## Learn more

- Product: https://dralvia.tech
- Full documentation: https://dralvia.tech/docs
- JavaScript SDK guide: https://dralvia.tech/docs/sdks/javascript
- Get / rotate an API key: https://dralvia.tech/#/api-keys
- Developer support: https://dralvia.tech/docs/tenant/developer
- Report a security issue: see [SECURITY.md](../SECURITY.md)
