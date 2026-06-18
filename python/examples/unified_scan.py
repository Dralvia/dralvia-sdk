"""Unified scan: hand the API any supported input (URL, domain, email, ...).

Run: DRALVIA_API_KEY=... python examples/unified_scan.py https://example.com/login
"""

import json
import os
import sys

from dralvia_sdk import DralviaClient


def main() -> int:
    value = sys.argv[1] if len(sys.argv) > 1 else "https://example.com/login"
    client = DralviaClient(api_key=os.environ.get("DRALVIA_API_KEY"))
    result = client.unified_scan(value, type="url")
    print(f"type={result.get('type')} risk_level={result.get('risk_level')}")
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
