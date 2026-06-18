// Score an inbound email message with the email-protection helper.
//
// Run: DRALVIA_API_KEY=... node examples/email_protect.js
import { DralviaClient } from "../src/client.js";

const client = new DralviaClient({ apiKey: process.env.DRALVIA_API_KEY });

const result = await client.protectEmail({
  subject: "Urgent: invoice overdue",
  sender: "billing@suspicious-vendor.example",
  recipients: ["finance@your-workspace.com"],
  html: "<p>Please wire payment using the new bank details attached.</p>",
});

console.log(`verdict=${result.risk_level} score=${result.score}`);
console.log(JSON.stringify(result, null, 2));
