import json
import os
import sys
from unittest.mock import MagicMock

import pytest
import requests

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src"))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from dralvia_sdk import (  # noqa: E402
    DEFAULT_BASE_URL,
    DralviaApiError,
    DralviaClient,
    DralviaConfigError,
    DralviaNotImplementedError,
    DralviaTimeoutError,
)


class DummyResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload or {}
        self.text = json.dumps(self._payload)

    def json(self):
        return self._payload


def _client(session, **kwargs):
    return DralviaClient(api_key="abc", base_url="https://api.example", session=session, **kwargs)


# --- configuration ----------------------------------------------------------


def test_missing_api_key_raises_config_error(monkeypatch):
    monkeypatch.delenv("DRALVIA_API_KEY", raising=False)
    with pytest.raises(DralviaConfigError):
        DralviaClient(base_url="https://api.example")


def test_api_key_and_base_url_read_from_env(monkeypatch):
    monkeypatch.setenv("DRALVIA_API_KEY", "env-key")
    monkeypatch.delenv("DRALVIA_BASE_URL", raising=False)
    client = DralviaClient()
    assert client.api_key == "env-key"
    assert client.base_url == DEFAULT_BASE_URL


def test_trailing_slash_stripped_from_base_url():
    client = DralviaClient(api_key="abc", base_url="https://api.example/")
    assert client.base_url == "https://api.example"


# --- request construction & auth headers ------------------------------------


def test_scan_url_builds_expected_request():
    session = MagicMock()
    session.request.return_value = DummyResponse(payload={"score": 5})
    client = _client(session)
    result = client.scan_url("https://example.com")
    assert result["score"] == 5
    _, kwargs = session.request.call_args
    assert kwargs["url"] == "https://api.example/scan"
    assert kwargs["json"]["url"] == "https://example.com"
    assert kwargs["headers"]["X-API-KEY"] == "abc"
    assert kwargs["headers"]["Accept"] == "application/json"
    assert kwargs["timeout"] == 15.0
    assert "Authorization" not in kwargs["headers"]


def test_bearer_token_sets_authorization_header():
    session = MagicMock()
    session.request.return_value = DummyResponse(payload={})
    client = _client(session, bearer_token="tok")
    client.scan_url("https://example.com")
    _, kwargs = session.request.call_args
    assert kwargs["headers"]["Authorization"] == "Bearer tok"


def test_unified_scan_posts_expected_payload():
    session = MagicMock()
    session.request.return_value = DummyResponse(payload={"type": "url", "risk_level": "Safe"})
    client = _client(session)
    result = client.unified_scan("https://example.com", type="url")
    assert result["type"] == "url"
    _, kwargs = session.request.call_args
    assert kwargs["url"] == "https://api.example/unified/scan"
    assert kwargs["json"]["input"] == "https://example.com"
    assert kwargs["json"]["type"] == "url"


def test_scan_repo_archive_uses_multipart_upload():
    session = MagicMock()
    session.request.return_value = DummyResponse(payload={"id": "repo-1"})
    client = _client(session)
    result = client.scan_repo_archive("repo.zip", b"zip-bytes", async_mode="1")
    assert result["id"] == "repo-1"
    _, kwargs = session.request.call_args
    assert kwargs["url"] == "https://api.example/repo/scan/upload"
    assert kwargs["files"]["file"][0] == "repo.zip"
    assert kwargs["data"] == {"async_mode": "1"}


def test_webhook_helpers_build_expected_paths():
    session = MagicMock()
    session.request.return_value = DummyResponse(payload={})
    client = _client(session)

    client.list_webhooks()
    assert session.request.call_args.kwargs["url"] == "https://api.example/pro/webhooks"

    client.delete_webhook(7)
    args = session.request.call_args
    assert args.kwargs["method"] == "DELETE"
    assert args.kwargs["url"] == "https://api.example/pro/webhooks/7"

    client.test_webhook(7)
    args = session.request.call_args
    assert args.kwargs["method"] == "POST"
    assert args.kwargs["url"] == "https://api.example/pro/webhooks/7/test"


# --- errors -----------------------------------------------------------------


def test_error_raises_dralvia_api_error():
    session = MagicMock()
    session.request.return_value = DummyResponse(
        status_code=500, payload={"error": "boom", "request_id": "req-9"}
    )
    client = _client(session)
    with pytest.raises(DralviaApiError) as err:
        client.swg_evaluate("https://bad")
    assert err.value.status_code == 500
    assert err.value.payload["error"] == "boom"
    assert err.value.request_id == "req-9"
    assert err.value.request_url == "https://api.example/swg/evaluate"


def test_timeout_raises_dralvia_timeout_error():
    session = MagicMock()
    session.request.side_effect = requests.exceptions.Timeout()
    client = _client(session, timeout=2.0)
    with pytest.raises(DralviaTimeoutError) as err:
        client.scan_url("https://example.com")
    assert err.value.timeout == 2.0
    assert err.value.request_url == "https://api.example/scan"


# --- reserved agent namespace ----------------------------------------------


def test_agent_namespace_is_reserved_not_implemented():
    client = _client(MagicMock())
    with pytest.raises(DralviaNotImplementedError):
        client.agent.check_action({"tool": "shell"})
    with pytest.raises(DralviaNotImplementedError):
        client.agent.check_content("some text")
