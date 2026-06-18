"""Scan a single URL.

Run: DRALVIA_API_KEY=... python examples/scan_url.py https://example.com
"""

import json
import os
import sys

from dralvia_sdk import DralviaApiError, DralviaClient


def main() -> int:
    target = sys.argv[1] if len(sys.argv) > 1 else "https://example.com"
    client = DralviaClient(api_key=os.environ.get("DRALVIA_API_KEY"))
    try:
        result = client.scan_url(target)
    except DralviaApiError as err:
        print(f"API error {err.status_code} (request {err.request_id}): {err.payload}")
        return 1
    print(f"risk_level={result.get('risk_level')} score={result.get('score')}")
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
