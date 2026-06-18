# Contributing to the Dralvia SDKs

Thanks for helping improve the official Dralvia SDKs. This repository holds two
thin clients for the public Dralvia API:

- `js/`: `@dralvia/sdk` (JavaScript / TypeScript types)
- `python/`: `dralvia-sdk`

## Ground rules

- **Thin clients only.** These SDKs call the public API and shape requests and
  errors. They must not contain backend, scanner, rule, or dataset logic.
- **No invented endpoints.** Only add a method for an endpoint that already
  exists in the public API. Reserved future surfaces (for example the `agent`
  namespace) must throw `DralviaNotImplementedError` rather than call a path
  that does not exist.
- **No secrets, ever.** Do not add API keys, tokens, internal hostnames, or
  internal infrastructure references to code, tests, examples, or docs.
- **Keep it easy.** A developer should get from install to first scan in under
  ten minutes. Favor sensible defaults over configuration.

## JavaScript

```bash
cd js
npm install
npm test     # node --test
npm run lint # eslint
npm run build
```

## Python

```bash
cd python
python -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
pytest tests
ruff check src tests examples
```

## Pull requests

- Add or update tests for any behavior change. Request construction, auth
  headers, error mapping, and timeout behavior are all covered by tests; keep
  that coverage.
- Update the README(s) and `CHANGELOG.md` under `[Unreleased]`.
- Keep the JavaScript and Python clients feature-equivalent where it makes
  sense.

## Releasing

Releases are cut by Dralvia maintainers: bump the version in
`js/package.json` and `python/pyproject.toml`, move the `[Unreleased]` changelog
entries under the new version, tag, and let CI publish.
