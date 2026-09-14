// Scan a repository archive (.zip) and use the result as a CI gate.
//
// Uploads the archive, waits for the scan to finish, prints the gate decision,
// optionally writes a SARIF file for code-scanning upload, and exits non-zero
// when the gate says the change should be blocked.
//
// Run: DRALVIA_API_KEY=... node examples/repo_scan.js ./repo.zip [results.sarif]
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { DralviaClient } from "../src/client.js";

const [archivePath, sarifPath] = process.argv.slice(2);
if (!archivePath) {
  console.error("usage: node examples/repo_scan.js <path-to-repo.zip> [results.sarif]");
  process.exit(2);
}

const client = new DralviaClient({ apiKey: process.env.DRALVIA_API_KEY });

const upload = await client.scanRepoArchive(basename(archivePath), await readFile(archivePath));
console.log(`scan id=${upload.id} status=${upload.status}`);

const scan = await client.waitForRepoScan(upload.id);
if (!["completed", "done"].includes(scan.status)) {
  console.error(`scan did not complete: status=${scan.status} error=${scan.error}`);
  process.exit(1);
}

const gate = await client.getRepoScanCiGate(upload.id);
console.log(`decision=${gate.decision} risk=${gate.risk_level} (${gate.risk_score})`);
for (const blocker of gate.blockers || []) {
  console.log(`  blocker: ${JSON.stringify(blocker)}`);
}

if (sarifPath) {
  const sarif = await client.exportRepoScan(upload.id, { format: "sarif" });
  await writeFile(sarifPath, JSON.stringify(sarif, null, 2));
  console.log(`wrote ${sarifPath}`);
}

process.exit(gate.should_block_merge ? 1 : 0);
