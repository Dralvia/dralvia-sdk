"""`dralvia-scan-url`: scan a URL or domain and fail a CI step on the result.

Exit codes:
  0  the verdict and flags are acceptable
  3  the verdict is in --fail-on, or a flag is at or above --fail-on-severity
  2  the scan could not be run (configuration, network or API error)

The API key is read from DRALVIA_API_KEY. Nothing else is required.
"""
from __future__ import annotations

import argparse
import json
import sys
from typing import List, Optional, Sequence

from . import DralviaClient, DralviaError

SEVERITIES = ("info", "low", "medium", "high", "critical")


def _parse(argv: Optional[Sequence[str]]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="dralvia-scan-url",
        description="Scan a URL or domain with Dralvia and fail when the result is not acceptable.",
    )
    parser.add_argument("target", help="URL or domain to scan")
    parser.add_argument(
        "--fail-on",
        default="Avoid",
        help="Comma-separated verdicts that fail the step: Safe, Caution, Avoid (default: Avoid)",
    )
    parser.add_argument(
        "--fail-on-severity",
        choices=SEVERITIES,
        default=None,
        help="Also fail when any flag has this severity or higher",
    )
    parser.add_argument("--force", action="store_true", help="Run a fresh scan instead of reusing a recent result")
    parser.add_argument("--output", help="Write the full JSON result to this file")
    parser.add_argument("--base-url", default=None, help="API base URL (default: DRALVIA_BASE_URL or the public API)")
    return parser.parse_args(argv)


def _blocking_flags(result: dict, threshold: Optional[str]) -> List[str]:
    if not threshold:
        return []
    floor = SEVERITIES.index(threshold)
    blocked = []
    for item in result.get("flag_details") or []:
        severity = str(item.get("severity") or "info").lower()
        if severity in SEVERITIES and SEVERITIES.index(severity) >= floor:
            blocked.append(f"{item.get('flag')} ({severity})")
    return blocked


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = _parse(argv)
    try:
        client = DralviaClient(base_url=args.base_url)
        payload = {"force_scan": True} if args.force else {}
        result = client.scan_url(args.target, **payload)
    except DralviaError as exc:
        print(f"dralvia-scan-url: scan failed: {exc}", file=sys.stderr)
        return 2
    if args.output:
        with open(args.output, "w", encoding="utf-8") as handle:
            json.dump(result, handle, indent=2)
    level = str(result.get("risk_level") or "unknown")
    print(f"Dralvia verdict for {args.target}: {level} (score {result.get('score')})")
    failing_levels = {part.strip().lower() for part in args.fail_on.split(",") if part.strip()}
    reasons = []
    if level.lower() in failing_levels:
        reasons.append(f"verdict {level} is in --fail-on")
    blocked = _blocking_flags(result, args.fail_on_severity)
    if blocked:
        reasons.append("flags at or above " + str(args.fail_on_severity) + ": " + ", ".join(blocked))
    if reasons:
        for reason in reasons:
            print(f"FAIL: {reason}", file=sys.stderr)
        return 3
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
