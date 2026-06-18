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
from typing import Any, Dict, Optional

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
        super().__init__(f"Dralvia API error {status_code}")
        self.status_code = status_code
        self.payload: Dict[str, Any] = payload or {}
        self.request_url = request_url
        self.request_id = self.payload.get("request_id") or self.payload.get("requestId")


class DralviaNotImplementedError(DralviaError):
    """Raised when calling a reserved namespace whose endpoint does not exist yet."""

    def __init__(self, feature: str):
        super().__init__(
            f"{feature} is reserved for a future Dralvia release and is not available yet."
        )
        self.feature = feature


class AgentNamespace:
    """Reserved namespace for AI-agent guardrail checks.

    The ``check_action`` / ``check_content`` endpoints do not exist on the API
    yet. These methods intentionally raise so integrators can wire the call
    site today and have it light up once the endpoints ship, without the SDK
    pretending to call something that is not there.
    """

    def check_action(self, action: Any) -> Any:
        raise DralviaNotImplementedError("dralvia.agent.check_action")

    def check_content(self, content: Any) -> Any:
        raise DralviaNotImplementedError("dralvia.agent.check_content")


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
        self.agent = AgentNamespace()

    # --- Scanning -----------------------------------------------------------

    def scan_url(self, url: str, **payload: Any) -> Dict[str, Any]:
        """Scan a single URL."""
        return self._request("POST", "/scan", json={"url": url, **payload})

    def unified_scan(self, input_value: str, **payload: Any) -> Dict[str, Any]:
        """Unified scan helper. Accepts a URL, domain, email, or other input."""
        return self._request("POST", "/unified/scan", json={"input": input_value, **payload})

    def swg_evaluate(self, url: str, **payload: Any) -> Dict[str, Any]:
        """Web Access Protection (SWG) evaluation for a destination URL."""
        return self._request("POST", "/swg/evaluate", json={"url": url, **payload})

    def email_protect(self, **payload: Any) -> Dict[str, Any]:
        """Email-protection scoring helper for an inbound message."""
        return self._request("POST", "/email/protect", json=payload)

    def scan_repo_archive(self, file_name: str, file_bytes: bytes, **payload: Any) -> Dict[str, Any]:
        """Upload a repository archive (zip bytes) for a repo scan."""
        files = {"file": (file_name, file_bytes, "application/zip")}
        return self._request("POST", "/repo/scan/upload", data=payload or None, files=files)

    # --- Webhooks -----------------------------------------------------------

    def list_webhooks(self) -> Dict[str, Any]:
        """List the workspace's registered webhooks."""
        return self._request("GET", "/pro/webhooks")

    def create_webhook(self, **payload: Any) -> Dict[str, Any]:
        """Register a new webhook."""
        return self._request("POST", "/pro/webhooks", json=payload)

    def delete_webhook(self, webhook_id: Any) -> Dict[str, Any]:
        """Delete a webhook by id."""
        return self._request("DELETE", f"/pro/webhooks/{webhook_id}")

    def test_webhook(self, webhook_id: Any) -> Dict[str, Any]:
        """Send a test delivery to a webhook by id."""
        return self._request("POST", f"/pro/webhooks/{webhook_id}/test")

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
    ) -> Dict[str, Any]:
        request_url = f"{self.base_url}{path}"
        try:
            resp = self.session.request(
                method=method,
                url=request_url,
                json=json,
                data=data,
                files=files,
                headers=self._headers(),
                timeout=self.timeout,
            )
        except requests.exceptions.Timeout as exc:
            raise DralviaTimeoutError(request_url, self.timeout) from exc
        if resp.status_code >= 400:
            raise DralviaApiError(resp.status_code, _safe_json(resp), request_url)
        return _safe_json(resp)


def _safe_json(resp: requests.Response) -> Dict[str, Any]:
    try:
        return resp.json()
    except Exception:
        return {"text": getattr(resp, "text", ""), "status": resp.status_code}
