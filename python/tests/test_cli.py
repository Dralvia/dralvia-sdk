"""`dralvia-scan-url`: a CI gate that needs nothing but the SDK and an API key."""
from __future__ import annotations

import json

import pytest

from dralvia_sdk import cli


class _FakeClient:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def scan_url(self, url, **payload):
        self.calls.append((url, payload))
        return self.result


RESULT = {
    "risk_level": "Caution",
    "score": 35,
    "flags": ["ssl:invalid_or_missing", "headers:hsts_missing"],
    "flag_details": [
        {"flag": "ssl:invalid_or_missing", "severity": "medium"},
        {"flag": "headers:hsts_missing", "severity": "info"},
    ],
}


def _run(monkeypatch, argv, result=RESULT):
    fake = _FakeClient(result)
    monkeypatch.setattr(cli, "DralviaClient", lambda **_kw: fake)
    return cli.main(argv), fake


def test_passes_when_the_verdict_is_not_blocked(monkeypatch, capsys):
    code, fake = _run(monkeypatch, ["example.com"])
    assert code == 0
    assert fake.calls == [("example.com", {})]
    assert "Caution" in capsys.readouterr().out


def test_fails_with_exit_3_on_a_blocked_verdict(monkeypatch):
    code, _ = _run(monkeypatch, ["example.com", "--fail-on", "Caution,Avoid"])
    assert code == 3


def test_fails_on_a_flag_severity_at_or_above_the_threshold(monkeypatch):
    assert _run(monkeypatch, ["example.com", "--fail-on-severity", "medium"])[0] == 3
    assert _run(monkeypatch, ["example.com", "--fail-on-severity", "high"])[0] == 0


def test_force_and_output(monkeypatch, tmp_path):
    out = tmp_path / "scan.json"
    code, fake = _run(monkeypatch, ["example.com", "--force", "--output", str(out)])
    assert code == 0
    assert fake.calls == [("example.com", {"force_scan": True})]
    assert json.loads(out.read_text())["score"] == 35


def test_an_api_error_is_exit_2_not_a_pass(monkeypatch):
    from dralvia_sdk import DralviaApiError

    class _Broken:
        def scan_url(self, url, **payload):
            raise DralviaApiError(500, {"error": "internal"}, "https://x/v1/scan")

    monkeypatch.setattr(cli, "DralviaClient", lambda **_kw: _Broken())
    assert cli.main(["example.com"]) == 2


def test_rejects_an_unknown_severity():
    with pytest.raises(SystemExit):
        cli.main(["example.com", "--fail-on-severity", "severe"])
