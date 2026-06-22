# Changelog

All notable changes to the Dralvia SDKs are documented here. This project
follows [Semantic Versioning](https://semver.org/). The JavaScript
(`@dralvia/sdk`) and Python (`dralvia-sdk`) packages are versioned together.

## [Unreleased]

### Added
- Default base URL (`https://dralvia.tech/api/tenant`) so a client can be
  constructed with only an API key.
- API key and base URL fall back to `DRALVIA_API_KEY` / `DRALVIA_BASE_URL`
  environment variables.
- Per-request timeout with a dedicated `DralviaTimeoutError`.
- Structured error hierarchy: `DralviaError`, `DralviaConfigError`,
  `DralviaTimeoutError`, `DralviaApiError` (with `status`, `payload`,
  `requestUrl`, `requestId`), and `DralviaNotImplementedError`.
- Helpers: `unifiedScan`, `evaluateSwg`, `protectEmail`, `scanRepoArchive`,
  `listWebhooks`, `createWebhook`, `deleteWebhook`, `testWebhook`.
- Reserved `agent` namespace (`checkAction` / `checkContent`) that throws
  `DralviaNotImplementedError` until the endpoints ship.
- Hand-written TypeScript declarations for the JavaScript SDK and a `py.typed`
  marker for the Python SDK.
- Runnable examples for both languages.

### Changed
- JavaScript SDK now has zero required runtime dependencies on Node.js 18+
  (`node-fetch` is an optional peer dependency for older Node).
- Python and JavaScript helpers now call the stable `/v1` workspace API paths
  for scan, unified scan, SWG evaluate, email protect, repo upload, and webhook
  helpers.

## [0.1.0]

- Initial repo-local SDKs: `scanUrl`, `evaluateSwg`, `protectEmail`,
  `unifiedScan`, `scanRepoArchive`, webhook list/create, and a basic
  `DralviaApiError`.
