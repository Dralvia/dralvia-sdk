# Changelog

All notable changes to the Dralvia SDKs are documented here. This project
follows [Semantic Versioning](https://semver.org/). The JavaScript
(`@dralvia/sdk`) and Python (`dralvia-sdk`) packages are versioned together.

## [Unreleased]

## [0.3.0] - 2026-11-19

### Changed
- Both SDKs send the documented `Authorization: Api-Key <key>` header instead
  of the legacy `X-API-KEY`. With a bearer token, `Authorization` carries the
  token and the key is sent as `X-API-KEY`, as before. The API accepts both, so
  no change is needed on your side.

### Added
- Python: `dralvia-scan-url` command for CI. It fails with exit code `3` on a
  blocked verdict (`--fail-on`) or flag severity (`--fail-on-severity`) and
  with `2` when the scan could not run.
- `actions/scan-url`: a GitHub Action that runs the same check. Pin it by
  commit SHA.
- Release workflow: PyPI and npm releases use Trusted Publishing, so no
  publishing token is stored. PyPI files carry signed Sigstore attestations and
  npm releases carry provenance.

## [0.2.0] - 2026-09-24

Both packages are on the public registries: `npm install @dralvia/sdk` and
`pip install dralvia-sdk`.

Note on 0.1.0: the 0.1.0 uploaded to npm and PyPI on 2026-09-24 was built from
the repository as it stood that day, so it already contains the additions
below. 0.2.0 is the same code with registry install instructions in the READMEs
and the version that matches this changelog.

### Changed
- The READMEs install from npm and PyPI; installing from source remains an
  option.

### Added
- Repository scan results: `getRepoScan` / `get_repo_scan`,
  `waitForRepoScan` / `wait_for_repo_scan` (polls until a terminal status,
  raises a timeout error otherwise), `getRepoScanCiGate` /
  `get_repo_scan_ci_gate` (optional policy `profile`), `exportRepoScan` /
  `export_repo_scan` (`json`, `sarif`, and the other formats the API lists),
  `getRepoScanExportManifest` / `get_repo_scan_export_manifest`, and
  `getRepoScanTriage` / `get_repo_scan_triage`.
- `getUsageSummary` / `get_usage_summary`.
- `DralviaApiError` exposes `code` / `error_code`, `reason`, and
  `requiredScope` / `required_scope`; a missing API key permission is named in
  the error message.

### Changed
- The repository scan examples run the full CI flow: upload, wait, gate,
  optional SARIF file, non-zero exit when the gate blocks.
- The Python client URL-encodes ids in request paths, as the JavaScript client
  already did.
- Ruff's rule set is pinned in `pyproject.toml`, so a newer ruff release does
  not change what CI enforces.

## [0.1.0] - 2026-07-02

Initial public release of both packages.

### Added
- Core helpers from the first repo-local iteration: `scanUrl`, `evaluateSwg`,
  `protectEmail`, `unifiedScan`, `scanRepoArchive`, webhook list/create, and a
  basic `DralviaApiError`.
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
