# Dralvia Python SDK

Official thin, typed client for the [Dralvia](https://dralvia.tech) security
API. It handles API-key auth, base-URL defaults, request timeouts, JSON
shaping, and structured errors so your scripts and backend jobs can run scans
without re-implementing the request layer.

## What is Dralvia

[Dralvia](https://dralvia.tech) is a security service that scores links,
domains, emails, and code for phishing and other threats. This SDK is the
programmatic way to use it: call the same checks the Dralvia app runs, straight
from your own scripts, backend jobs, or CI.

## What you can do with this SDK

- **Scan a URL** for phishing and risk (`scan_url`).
- **Unified scan** of a URL, domain, email, or other input (`unified_scan`).
- **Evaluate a destination** for Web Access Protection / SWG policy
  (`swg_evaluate`).
- **Score an inbound email** message (`email_protect`).
- **Scan a repository archive** (`scan_repo_archive`).
- **Manage webhooks** for scan events (`list_webhooks`, `create_webhook`,
  `test_webhook`, `delete_webhook`).

This SDK covers the core scanning surface of the Dralvia API. Some product areas
are managed in the Dralvia app and are not exposed here. See the
[full docs](https://dralvia.tech/docs) for the complete feature set.

## Package status

The source for `dralvia-sdk` is public on GitHub.
The package is not published on the public PyPI index yet; until it is, install
it from source (see Install). `pip install dralvia-sdk` will start working once
the package is published.

## Requirements

- Python 3.9 or newer.
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
python -m venv .venv
. .venv/bin/activate

# From source: clone the repo, then from the python/ folder:
python -m pip install -e .

# Or, once published, from the index:
python -m pip install dralvia-sdk
```

## Quick start

```python
import os
from dralvia_sdk import DralviaClient

# api_key falls back to DRALVIA_API_KEY, base_url to DRALVIA_BASE_URL.
client = DralviaClient(api_key=os.environ["DRALVIA_API_KEY"])

scan = client.scan_url("https://example.com")
print(scan.get("risk_level"), scan.get("score"))
```

The base URL defaults to `https://dralvia.tech/api/tenant`. Override it with the
`base_url=` argument or the `DRALVIA_BASE_URL` environment variable.

## Helpers

```python
# Unified scan: pass a URL, domain, email, or other supported input.
unified = client.unified_scan("https://example.com/login", type="url")

# Web Access Protection (SWG) evaluation.
swg = client.swg_evaluate("https://example.com/social")

# Email-protection scoring for an inbound message.
client.email_protect(
    subject="Quarterly results",
    sender="ceo@example.com",
    recipients=["user@workspace.com"],
    html="<p>See attached</p>",
)

# Repository archive scan (zip bytes).
with open("repo.zip", "rb") as fh:
    repo = client.scan_repo_archive("repo.zip", fh.read(), async_mode="1")

# Webhooks.
hooks = client.list_webhooks()
client.create_webhook(url="https://your-app/webhooks/dralvia", events=["scan.completed"])
client.test_webhook(hook_id)
client.delete_webhook(hook_id)
```

## Errors

Every method returns a parsed `dict`. The SDK raises typed errors so you can
branch cleanly:

| Error | When |
| --- | --- |
| `DralviaConfigError` | Missing API key. |
| `DralviaTimeoutError` | Request exceeded `timeout` (default 15s). |
| `DralviaApiError` | Non-2xx response. Carries `status_code`, `payload`, `request_url`, `request_id`. |
| `DralviaNotImplementedError` | A reserved future feature was called (see below). |

```python
from dralvia_sdk import DralviaApiError

try:
    client.scan_url("https://example.com")
except DralviaApiError as err:
    print(err.status_code, err.request_id, err.payload)
```

## Reserved: agent guardrails

`client.agent.check_action(...)` and `client.agent.check_content(...)` are
reserved for a future Dralvia release. They currently raise
`DralviaNotImplementedError`. Wire your call site today; it lights up when the
endpoints ship.

## Examples

See [`examples/`](./examples) for runnable scripts: `scan_url.py`,
`unified_scan.py`, `email_protect.py`, and `repo_scan.py`.

## Tests

```bash
pip install -e ".[dev]"
pytest tests
```

## Learn more

- Product: https://dralvia.tech
- Full documentation: https://dralvia.tech/docs
- Python SDK guide: https://dralvia.tech/docs/sdks/python
- Get / rotate an API key: https://dralvia.tech/#/api-keys
- Developer support: https://dralvia.tech/docs/tenant/developer
- Report a security issue: see [SECURITY.md](../SECURITY.md)
