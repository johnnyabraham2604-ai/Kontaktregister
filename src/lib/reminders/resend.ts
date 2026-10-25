import { DEFAULT_EMAIL_FROM } from "@/lib/env";
import type { EmailPayload } from "@/lib/types";
import type { SendFailure } from "./schedule";

export type SendResult = { ok: true; id: string } | ({ ok: false } & SendFailure);

export interface SendInput extends EmailPayload {
  to: string;
  idempotencyKey: string;
}

export type SendFn = (input: SendInput) => Promise<SendResult>;

/**
 * Versand über die Resend-API. Der Idempotency-Key sorgt dafür, dass Resend dieselbe
 * E-Mail innerhalb von 24 Stunden nur einmal zustellt, auch wenn wir die Anfrage wiederholen.
 */
export const sendViaResend: SendFn = async (input) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, status: 401, message: "RESEND_API_KEY ist nicht gesetzt" };
  const from = process.env.EMAIL_FROM || DEFAULT_EMAIL_FROM;
  try {
    // RESEND_API_URL nur für lokale Tests mit einem Nachbau der API; in Produktion nicht setzen.
    const res = await fetch(process.env.RESEND_API_URL || "https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey.slice(0, 256),
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; name?: string; message?: string };
    if (res.ok && body.id) return { ok: true, id: body.id };
    return { ok: false, status: res.status, name: body.name, message: body.message ?? res.statusText };
  } catch (e) {
    return { ok: false, status: null, message: e instanceof Error ? e.message : String(e) };
  }
};
