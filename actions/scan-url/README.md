# Dralvia scan URL action

Scan a URL or domain with Dralvia and fail the job when the verdict or a flag
severity is not acceptable. Runs on Linux and macOS runners.

Pin the action to a full commit SHA from this repository, not to a branch:

```yaml
- uses: Dralvia/dralvia-sdk/actions/scan-url@<full-commit-sha>  # v0.3.0
  with:
    target: example.com
    api-key: ${{ secrets.DRALVIA_API_KEY }}
    fail-on: Avoid
    fail-on-severity: high
```

| Input | Default | Meaning |
| --- | --- | --- |
| `target` | required | URL or domain to scan. |
| `api-key` | required | Workspace API key, from a repository secret. |
| `fail-on` | `Avoid` | Comma-separated verdicts that fail the job: `Safe`, `Caution`, `Avoid`. |
| `fail-on-severity` | empty | Also fail when any flag has this severity or higher: `info`, `low`, `medium`, `high`, `critical`. |
| `force-scan` | `false` | Run a fresh scan instead of reusing a recent result. |
| `output` | `dralvia-scan-result.json` | File the full JSON result is written to. |
| `sdk-version` | `0.3.0` | Exact `dralvia-sdk` version installed from PyPI. |

The step exits with code `3` when the result is blocked and `2` when the scan
could not run, so an outage never passes as a clean result.

The same check runs anywhere Python runs:

```bash
pip install dralvia-sdk==0.3.0
DRALVIA_API_KEY=... dralvia-scan-url example.com --fail-on Avoid --fail-on-severity high
```
