// Unified scan: hand the API any supported input (URL, domain, email, ...).
//
// Run: DRALVIA_API_KEY=... node examples/unified_scan.js https://example.com/login
import { DralviaClient } from "../src/client.js";

const input = process.argv[2] || "https://example.com/login";
const client = new DralviaClient({ apiKey: process.env.DRALVIA_API_KEY });

const result = await client.unifiedScan(input, { type: "url" });
console.log(`type=${result.type} risk_level=${result.risk_level}`);
console.log(JSON.stringify(result, null, 2));
