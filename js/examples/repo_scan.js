// Upload a repository archive (.zip) for a repo scan.
//
// Run: DRALVIA_API_KEY=... node examples/repo_scan.js ./repo.zip
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { DralviaClient } from "../src/client.js";

const archivePath = process.argv[2];
if (!archivePath) {
  console.error("usage: node examples/repo_scan.js <path-to-repo.zip>");
  process.exit(2);
}

const client = new DralviaClient({ apiKey: process.env.DRALVIA_API_KEY });
const bytes = await readFile(archivePath);

const result = await client.scanRepoArchive(basename(archivePath), bytes, { async: "1" });
console.log(`scan id=${result.id} risk_level=${result.risk_level}`);
console.log(JSON.stringify(result, null, 2));
