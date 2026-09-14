"""Scan a repository archive (.zip) and use the result as a CI gate.

Uploads the archive, waits for the scan to finish, prints the gate decision,
optionally writes a SARIF file for code-scanning upload, and exits non-zero when
the gate says the change should be blocked.

Run: DRALVIA_API_KEY=... python examples/repo_scan.py ./repo.zip [results.sarif]
"""

import json
import os
import sys

from dralvia_sdk import DralviaClient


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: python examples/repo_scan.py <path-to-repo.zip> [results.sarif]")
        return 2
    archive_path = sys.argv[1]
    sarif_path = sys.argv[2] if len(sys.argv) > 2 else None
    client = DralviaClient(api_key=os.environ.get("DRALVIA_API_KEY"))

    with open(archive_path, "rb") as fh:
        upload = client.scan_repo_archive(os.path.basename(archive_path), fh.read())
    scan_id = upload["id"]
    print(f"scan id={scan_id} status={upload.get('status')}")

    scan = client.wait_for_repo_scan(scan_id)
    if scan.get("status") not in {"completed", "done"}:
        print(f"scan did not complete: status={scan.get('status')} error={scan.get('error')}")
        return 1

    gate = client.get_repo_scan_ci_gate(scan_id)
    print(f"decision={gate.get('decision')} risk={gate.get('risk_level')} ({gate.get('risk_score')})")
    for blocker in gate.get("blockers") or []:
        print(f"  blocker: {json.dumps(blocker)}")

    if sarif_path:
        with open(sarif_path, "w", encoding="utf-8") as fh:
            json.dump(client.export_repo_scan(scan_id, format="sarif"), fh, indent=2)
        print(f"wrote {sarif_path}")

    return 1 if gate.get("should_block_merge") else 0


if __name__ == "__main__":
    raise SystemExit(main())
