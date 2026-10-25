// Lokaler Nachbau des Supabase-Gateways: /auth/v1 -> GoTrue, /rest/v1 -> PostgREST, minimaler Storage
import http from "node:http";
const routes = [["/auth/v1", 9999], ["/rest/v1", 3001]];
http.createServer((req, res) => {
  const cors = {
    "access-control-allow-origin": req.headers.origin ?? "*",
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, prefer, range, accept-profile, content-profile, x-supabase-api-version",
    "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    "access-control-expose-headers": "content-range, content-location",
  };
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  if (req.url.startsWith("/storage/v1/object/sign/")) {
    res.writeHead(200, { ...cors, "content-type": "application/json" });
    return res.end("[]");
  }
  const r = routes.find(([p]) => req.url.startsWith(p + "/") || req.url === p);
  if (!r) { res.writeHead(404, cors); return res.end(JSON.stringify({ message: "not found" })); }
  const headers = { ...req.headers, host: `127.0.0.1:${r[1]}` };
  if (!headers.authorization && headers.apikey) headers.authorization = `Bearer ${headers.apikey}`;
  const up = http.request({ host: "127.0.0.1", port: r[1], path: req.url.slice(r[0].length) || "/", method: req.method, headers }, (u) => {
    res.writeHead(u.statusCode, { ...u.headers, ...cors });
    u.pipe(res);
  });
  up.on("error", (e) => { res.writeHead(502, cors); res.end(String(e)); });
  req.pipe(up);
}).listen(54321, "127.0.0.1", () => console.log("gateway on 54321"));
