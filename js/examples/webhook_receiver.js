// Minimal webhook receiver for Dralvia delivery events, plus helpers to
// register and test the webhook through the SDK.
//
// This uses only the Node.js standard library so it runs with zero install.
//
//   1. Register the receiver URL:
//        DRALVIA_API_KEY=... node examples/webhook_receiver.js register https://your-app/webhooks/dralvia
//   2. Start the receiver:
//        node examples/webhook_receiver.js serve 8787
//   3. Send a test delivery:
//        DRALVIA_API_KEY=... node examples/webhook_receiver.js test <webhook_id>
import http from "node:http";
import { DralviaClient } from "../src/client.js";

const [command, arg] = process.argv.slice(2);

function client() {
  return new DralviaClient({ apiKey: process.env.DRALVIA_API_KEY });
}

if (command === "register") {
  const url = arg;
  const created = await client().createWebhook({ url, events: ["scan.completed"] });
  console.log("registered webhook:", JSON.stringify(created, null, 2));
} else if (command === "test") {
  const result = await client().testWebhook(arg);
  console.log("test delivery:", JSON.stringify(result, null, 2));
} else if (command === "serve") {
  const port = Number(arg) || 8787;
  http
    .createServer((req, res) => {
      if (req.method !== "POST") {
        res.writeHead(405).end();
        return;
      }
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        // Treat the request body as untrusted input. Only act on deliveries you
        // can confirm are intended for your workspace.
        console.log("received delivery:", body);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
    })
    .listen(port, () => console.log(`listening for Dralvia webhooks on :${port}`));
} else {
  console.error("usage: webhook_receiver.js <register <url> | serve <port> | test <id>>");
  process.exit(2);
}
