"""Score an inbound email message with the email-protection helper.

Run: DRALVIA_API_KEY=... python examples/email_protect.py
"""

import json
import os

from dralvia_sdk import DralviaClient


def main() -> int:
    client = DralviaClient(api_key=os.environ.get("DRALVIA_API_KEY"))
    result = client.email_protect(
        subject="Urgent: invoice overdue",
        sender="billing@suspicious-vendor.example",
        recipients=["finance@your-workspace.com"],
        html="<p>Please wire payment using the new bank details attached.</p>",
    )
    print(f"verdict={result.get('risk_level')} score={result.get('score')}")
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
