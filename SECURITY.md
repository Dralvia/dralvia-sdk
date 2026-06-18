# Security Policy

This repository contains the official Dralvia SDKs (JavaScript and Python). The
SDKs are thin clients that call the public Dralvia API. They contain no Dralvia
backend, scanner, rule, or dataset logic.

## Reporting a vulnerability

If you believe you have found a security issue in an SDK:

- Email **security@dralvia.tech** with a description, affected version, and
  reproduction steps.
- Do **not** open a public GitHub issue for a suspected vulnerability.
- Please give us a reasonable window to investigate and ship a fix before any
  public disclosure.

We aim to acknowledge reports within 3 business days.

## Scope

In scope:

- The SDK source in `js/` and `python/`.
- Insecure defaults in the client (auth handling, TLS, timeouts).
- Examples or docs that would lead a developer to leak a credential.

Out of scope (report through your account contact or the API support path
instead):

- The Dralvia API, backend, scanner, or web app.
- Findings produced *by* a scan (those are product output, not SDK bugs).

## Credential handling

- Never commit an API key. The SDK reads `DRALVIA_API_KEY` from the environment
  so keys can live in a secret manager.
- API keys grant full programmatic access to a workspace. Rotate a key
  immediately from the workspace console (`https://dralvia.tech/#/api-keys`) if
  it is ever exposed.
- The SDK sends the key only to the configured base URL over HTTPS. Do not point
  `DRALVIA_BASE_URL` at an untrusted host.
