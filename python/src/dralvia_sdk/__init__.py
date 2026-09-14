"""Dralvia Python SDK.

A thin, typed client for the Dralvia workspace API. It handles API-key auth,
base-URL defaults, request timeouts, JSON shaping, and structured errors so a
script or backend job can run scans without re-implementing the request layer.

This module is the single source of truth for the public ``dralvia-sdk``
package. It only calls public, already-shipped API endpoints. It does NOT
embed any Dralvia backend, scanner, rule, or dataset logic.
"""

from __future__ import annotations

import os
import time
from typing import Any, Dict, Optional
from urllib.parse import quote

import requests

__all__ = [
    "DralviaClient",
    "DralviaError",
    "DralviaConfigError",
    "DralviaTimeoutError",
    "DralviaApiError",
    "DralviaNotImplementedError",
    "AgentNamespace",
    "DEFAULT_BASE_URL",
    "DEFAULT_TIMEOUT_SECONDS",
    "__version__",
]

__version__ = "0.1.0"

DEFAULT_BASE_URL = "https://dralvia.tech/api/tenant"
DEFAULT_TIMEOUT_SECONDS = 15.0
API_VERSION_PREFIX = "/v1"
DEFAULT_REPO_SCAN_WAIT_SECONDS = 600.0
DEFAULT_REPO_SCAN_POLL_SECONDS = 5.0
# A repository scan in one of these states will not change any more.
REPO_SCAN_TERMINAL_STATUSES = frozenset({"completed", "done", "failed", "dead_letter"})


class DralviaError(Exception):
    """Base class for every error the SDK raises."""


class DralviaConfigError(DralviaError):
    """Raised when the client is constructed with bad configuration."""


class DralviaTimeoutError(DralviaError):
    """Raised when a request exceeds the configured timeout."""

    def __init__(self, request_url: str, timeout: float):
        super().__init__(f"Dralvia request timed out after {timeout}s: {request_url}")
        self.request_url = request_url
        self.timeout = timeout


class DralviaApiError(DralviaError):
    """Raised on any non-2xx HTTP response."""

    def __init__(self, status_code: int, payload: Optional[Dict[str, Any]], request_url: str):
        payload = payload if isinstance(payload, dict) else {}
        self.status_code = status_code
        self.payload: Dict[str, Any] = payload
        self.request_url = request_url
        self.request_id = payload.get("request_id") or payload.get("requestId")
        #: Machine-readable error code, e.g. ``"forbidden"`` or ``"not_found"``.
        self.error_code: Optional[str] = payload.get("error")
        #: Why the request was refused, e.g. ``"api_key_scope_missing"``.
        self.reason: Optional[str] = payload.get("reason")
        #: The API key permission this route needs, when a key lacks it.
        self.required_scope: Optional[str] = payload.get("required_scope")
        message = f"Dralvia API error {status_code}"
        if self.required_scope:
            message += f": API key is missing the `{self.required_scope}` permission"
        elif self.error_code:
            message += f": {self.error_code}"
        super().__init__(message)


class DralviaNotImplementedError(DralviaError):
    """Raised when calling a reserved namespace whose endpoint does not exist yet."""

    def __init__(self, feature: str):
        super().__init__(
            f"{feature} is reserved for a future Dralvia release and is not available yet."
        )
        self.feature = feature


class AgentNamespace:
    """AI-agent pre-action guardrail checks.

    ``check_action`` asks Dralvia for a safety verdict before the agent acts on
    a URL (visit, enter credentials, pay, download, connect a tool, sign a
    transaction). ``check_content`` screens content the agent just retrieved
    for prompt-injection / tool-hijack patterns.
    """

    def __init__(self, client: "DralviaClient"):
        self._client = client

    def check_action(self, action: Any) -> Dict[str, Any]:
        """Pre-action safety verdict.

        ``action`` is a mapping such as
        ``{"url": "https://...", "intent": "enter_credentials"}``. A bare URL
        string is also accepted and treated as a ``visit`` intent.
        """
        if isinstance(action, str):
            body: Dict[str, Any] = {"url": action}
        else:
            body = dict(action or {})
        return self._client._request("POST", "/agent/check-action", json=body)

    def check_content(self, content: Any) -> Dict[str, Any]:
        """Prompt-injection screen for retrieved content.

        ``content`` is the page text / tool output string, or a mapping such as
        ``{"content": "...", "url": "https://..."}``.
        """
        if isinstance(content, str):
            body: Dict[str, Any] = {"content": content}
        else:
            body = dict(content or {})
        return self._client._request("POST", "/agent/check-content", json=body)


class DralviaClient:
    """Thin client for the Dralvia workspace API."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        *,
        bearer_token: Optional[str] = None,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
        session: Optional[requests.Session] = None,
    ):
        api_key = api_key or os.environ.get("DRALVIA_API_KEY")
        base_url = base_url or os.environ.get("DRALVIA_BASE_URL") or DEFAULT_BASE_URL
        if not api_key:
            raise DralviaConfigError(
                "api_key is required. Pass api_key=... or set the "
                "DRALVIA_API_KEY environment variable."
            )
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.bearer_token = bearer_token
        self.timeout = timeout
        self.session = session or requests.Session()
        self.agent = AgentNamespace(self)

    # --- Scanning -----------------------------------------------------------

    def scan_url(self, url: str, **payload: Any) -> Dict[str, Any]:
        """Scan a single URL."""
        return self._request("POST", f"{API_VERSION_PREFIX}/scan", json={"url": url, **payload})

    def unified_scan(self, input_value: str, **payload: Any) -> Dict[str, Any]:
        """Unified scan helper. Accepts a URL, domain, email, or other input."""
        return self._request("POST", f"{API_VERSION_PREFIX}/unified/scan", json={"input": input_value, **payload})

    def swg_evaluate(self, url: str, **payload: Any) -> Dict[str, Any]:
        """Web Access Protection (SWG) evaluation for a destination URL."""
        return self._request("POST", f"{API_VERSION_PREFIX}/swg/evaluate", json={"url": url, **payload})

    def email_protect(self, **payload: Any) -> Dict[str, Any]:
        """Email-protection scoring helper for an inbound message."""
        return self._request("POST", f"{API_VERSION_PREFIX}/email/protect", json=payload)

    def scan_repo_archive(self, file_name: str, file_bytes: bytes, **payload: Any) -> Dict[str, Any]:
        """Upload a repository archive (zip bytes) for a repo scan."""
        files = {"file": (file_name, file_bytes, "application/zip")}
        return self._request("POST", f"{API_VERSION_PREFIX}/repo/scan/upload", data=payload or None, files=files)

    # --- Repository scan results ---------------------------------------------

    def get_repo_scan(self, scan_id: Any) -> Dict[str, Any]:
        """Fetch a repository scan: status, risk, findings, and summaries."""
        return self._request("GET", f"{API_VERSION_PREFIX}/repo/scan/{_path_id(scan_id)}")

    def wait_for_repo_scan(
        self,
        scan_id: Any,
        *,
        timeout: float = DEFAULT_REPO_SCAN_WAIT_SECONDS,
        poll_interval: float = DEFAULT_REPO_SCAN_POLL_SECONDS,
    ) -> Dict[str, Any]:
        """Poll a repository scan until it finishes and return the final result.

        Returns the scan once its ``status`` is terminal (``completed``,
        ``done``, ``failed`` or ``dead_letter``); check ``status`` before
        trusting the result. Raises :class:`DralviaTimeoutError` if the scan is
        still running after ``timeout`` seconds.
        """
        deadline = time.monotonic() + timeout
        while True:
            scan = self.get_repo_scan(scan_id)
            if str(scan.get("status") or "").lower() in REPO_SCAN_TERMINAL_STATUSES:
                return scan
            if time.monotonic() + poll_interval > deadline:
                raise DralviaTimeoutError(
                    f"{self.base_url}{API_VERSION_PREFIX}/repo/scan/{_path_id(scan_id)}", timeout
                )
            time.sleep(poll_interval)

    def get_repo_scan_ci_gate(self, scan_id: Any, profile: Optional[str] = None) -> Dict[str, Any]:
        """CI gate decision for a scan (``pass`` / ``review`` / ``fail``).

        ``profile`` optionally evaluates the scan under another policy, such as
        ``advisory``, ``balanced`` or ``fail_closed``.
        """
        params = {"profile": profile} if profile else None
        return self._request("GET", f"{API_VERSION_PREFIX}/repo/scan/{_path_id(scan_id)}/ci-gate", params=params)

    def export_repo_scan(self, scan_id: Any, format: str = "json") -> Dict[str, Any]:
        """Export a scan, e.g. ``format="sarif"`` for code-scanning upload.

        An unsupported format raises :class:`DralviaApiError` whose payload
        lists the ``supported`` formats.
        """
        return self._request(
            "GET", f"{API_VERSION_PREFIX}/repo/scan/{_path_id(scan_id)}/export", params={"format": format}
        )

    def get_repo_scan_export_manifest(self, scan_id: Any) -> Dict[str, Any]:
        """Signed manifest listing every export artifact of a scan and its digest."""
        return self._request("GET", f"{API_VERSION_PREFIX}/repo/scan/{_path_id(scan_id)}/export/manifest")

    def get_repo_scan_triage(self, scan_id: Any) -> Dict[str, Any]:
        """Review decisions and suppressions recorded against a scan's findings."""
        return self._request("GET", f"{API_VERSION_PREFIX}/repo/scan/{_path_id(scan_id)}/triage")

    # --- Usage ----------------------------------------------------------------

    def get_usage_summary(self) -> Dict[str, Any]:
        """Scan counts, plan limits, and the current billing period for the workspace."""
        return self._request("GET", f"{API_VERSION_PREFIX}/usage/summary")

    # --- Webhooks -----------------------------------------------------------

    # Webhook management needs an API key created or rotated with the
    # ``webhooks`` permission; other keys get DralviaApiError 403.

    def list_webhooks(self) -> Dict[str, Any]:
        """List the workspace's registered webhooks."""
        return self._request("GET", f"{API_VERSION_PREFIX}/pro/webhooks")

    def create_webhook(self, **payload: Any) -> Dict[str, Any]:
        """Register a new webhook."""
        return self._request("POST", f"{API_VERSION_PREFIX}/pro/webhooks", json=payload)

    def delete_webhook(self, webhook_id: Any) -> Dict[str, Any]:
        """Delete a webhook by id."""
        return self._request("DELETE", f"{API_VERSION_PREFIX}/pro/webhooks/{_path_id(webhook_id)}")

    def test_webhook(self, webhook_id: Any) -> Dict[str, Any]:
        """Send a test delivery to a webhook by id."""
        return self._request("POST", f"{API_VERSION_PREFIX}/pro/webhooks/{_path_id(webhook_id)}/test")

    # --- Internals ----------------------------------------------------------

    def _headers(self) -> Dict[str, str]:
        headers = {"X-API-KEY": self.api_key, "Accept": "application/json"}
        if self.bearer_token:
            headers["Authorization"] = f"Bearer {self.bearer_token}"
        return headers

    def _request(
        self,
        method: str,
        path: str,
        json: Any = None,
        data: Any = None,
        files: Any = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        request_url = f"{self.base_url}{path}"
        try:
            resp = self.session.request(
                method=method,
                url=request_url,
                json=json,
                data=data,
                files=files,
                params=params,
                headers=self._headers(),
                timeout=self.timeout,
            )
        except requests.exceptions.Timeout as exc:
            raise DralviaTimeoutError(request_url, self.timeout) from exc
        if resp.status_code >= 400:
            raise DralviaApiError(resp.status_code, _safe_json(resp), request_url)
        return _safe_json(resp)


def _path_id(value: Any) -> str:
    """Encode an id as a single path segment so it cannot change the route."""
    return quote(str(value), safe="")


def _safe_json(resp: requests.Response) -> Dict[str, Any]:
    try:
        return resp.json()
    except Exception:
        return {"text": getattr(resp, "text", ""), "status": resp.status_code}
