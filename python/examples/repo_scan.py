"""Upload a repository archive (.zip) for a repo scan.

Run: DRALVIA_API_KEY=... python examples/repo_scan.py ./repo.zip
"""

import json
import os
import sys


from dralvia_sdk import DralviaClient


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: python examples/repo_scan.py <path-to-repo.zip>")
        return 2
    archive_path = sys.argv[1]
    client = DralviaClient(api_key=os.environ.get("DRALVIA_API_KEY"))
    with open(archive_path, "rb") as fh:
        data = fh.read()
    result = client.scan_repo_archive(os.path.basename(archive_path), data, async_mode="1")
    print(f"scan id={result.get('id')} risk_level={result.get('risk_level')}")
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
