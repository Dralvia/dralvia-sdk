// Scan a single URL.
//
// Run: DRALVIA_API_KEY=... node examples/scan_url.js https://example.com
import { DralviaClient, DralviaApiError } from "../src/client.js";

const target = process.argv[2] || "https://example.com";
const client = new DralviaClient({ apiKey: process.env.DRALVIA_API_KEY });

try {
  const result = await client.scanUrl(target);
  console.log(`risk_level=${result.risk_level} score=${result.score}`);
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  if (err instanceof DralviaApiError) {
    console.error(`API error ${err.status} (request ${err.requestId}):`, err.payload);
    process.exit(1);
  }
  throw err;
}
