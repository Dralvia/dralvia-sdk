# Dralvia SDKs

Official SDKs for the [Dralvia](https://dralvia.tech) security API. These are
thin clients that let your application run scans, evaluate Web Access
Protection, score inbound email, scan repositories, and manage webhooks through
the public API.

> These SDKs are **clients for the Dralvia API**. They do not contain and do not
> expose any Dralvia backend, scanner, rule, or dataset. This is not the Dralvia
> product source.

## Packages

| Language | Package | Path | Docs |
| --- | --- | --- | --- |
| JavaScript / TypeScript | `@dralvia/sdk` | [`js/`](./js) | https://dralvia.tech/docs/sdks/javascript |
| Python | `dralvia-sdk` | [`python/`](./python) | https://dralvia.tech/docs/sdks/python |

## Get started in under 10 minutes

1. Create a workspace API key in the console (`https://dralvia.tech/#/api-keys`).
2. Export it: `export DRALVIA_API_KEY=...`
3. Install the SDK for your language (see each package's README).
4. Run your first scan:

   **JavaScript**
   ```js
   import { DralviaClient } from "@dralvia/sdk";
   const client = new DralviaClient({ apiKey: process.env.DRALVIA_API_KEY });
   console.log(await client.scanUrl("https://example.com"));
   ```

   **Python**
   ```python
   import os
   from dralvia_sdk import DralviaClient
   client = DralviaClient(api_key=os.environ["DRALVIA_API_KEY"])
   print(client.scan_url("https://example.com"))
   ```

## Capabilities

- URL scan, unified scan, Web Access Protection (SWG) evaluation.
- Email-protection scoring.
- Repository archive scan.
- Webhook list / create / test / delete.
- Reserved `agent` namespace (`checkAction` / `checkContent`) for a future
  release. It throws today; it does not call a nonexistent endpoint.

## Project files

- [SECURITY.md](./SECURITY.md): how to report a vulnerability.
- [CONTRIBUTING.md](./CONTRIBUTING.md): dev setup and contribution rules.
- [CHANGELOG.md](./CHANGELOG.md): release notes.
- [LICENSE](./LICENSE): MIT.
