import { createHmac } from "node:crypto";
const secret = process.argv[2], role = process.argv[3];
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const head = b64({ alg: "HS256", typ: "JWT" });
const body = b64({ role, iss: "supabase-local", iat: 1700000000, exp: 2000000000 });
const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
console.log(`${head}.${body}.${sig}`);
