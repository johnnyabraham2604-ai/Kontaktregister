// Nachbau der Resend-API für lokale Tests: protokolliert jede Anfrage, beachtet Idempotency-Key
import http from "node:http";
import { appendFileSync } from "node:fs";
const seen = new Map();
let n = 0;
http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const key = req.headers["idempotency-key"];
    const auth = req.headers.authorization;
    if (auth !== "Bearer re_local_test") { res.writeHead(401, { "content-type": "application/json" }); return res.end(JSON.stringify({ name: "validation_error", message: "API key is invalid" })); }
    let id = key && seen.get(key);
    const dup = Boolean(id);
    if (!id) { id = `fake_${++n}`; if (key) seen.set(key, id); }
    const parsed = JSON.parse(body || "{}");
    appendFileSync(process.env.SENT_LOG ?? new URL("./.work/sent.jsonl", import.meta.url), JSON.stringify({ at: new Date().toISOString(), id, key, dup, to: parsed.to, subject: parsed.subject, text: parsed.text }) + "\n");
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id }));
  });
}).listen(54330, "127.0.0.1", () => console.log("fake resend on 54330"));
