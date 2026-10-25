import { describe, it, expect } from "vitest";
import {
  classifySendFailure,
  individualSendAt,
  individualStillValid,
  individualKey,
  planDigest,
  planIndividual,
  retryDelayMinutes,
  type ScheduleSettings,
} from "@/lib/reminders/schedule";
import { relativeDay, todayIn, dueState } from "@/lib/dates";

const S: ScheduleSettings = {
  user_id: "u1",
  timezone: "Europe/Berlin",
  digest_enabled: true,
  digest_time: "07:30:00",
  individual_enabled: true,
  default_reminder_time: "09:00:00",
  individual_lead_days: 0,
};
const rem = (o: Partial<{ due_date: string; due_time: string | null }> = {}) => ({
  id: "r1",
  due_date: "2026-11-02",
  due_time: null,
  status: "planned" as const,
  email_individual: true,
  ...o,
});

describe("Zeitzonen und Sommerzeit", () => {
  it("rechnet 09:00 Berlin im Winter als 08:00 UTC", () => {
    expect(individualSendAt(rem({ due_date: "2026-11-02" }), S).toISO()).toBe("2026-11-02T08:00:00.000Z");
  });
  it("rechnet 09:00 Berlin im Sommer als 07:00 UTC", () => {
    expect(individualSendAt(rem({ due_date: "2026-07-01" }), S).toISO()).toBe("2026-07-01T07:00:00.000Z");
  });
  it("berücksichtigt den Tag der Zeitumstellung (25.10.2026, Ende der Sommerzeit)", () => {
    expect(individualSendAt(rem({ due_date: "2026-10-25" }), S).toISO()).toBe("2026-10-25T08:00:00.000Z");
    expect(individualSendAt(rem({ due_date: "2026-10-24" }), S).toISO()).toBe("2026-10-24T07:00:00.000Z");
  });
  it("behält die Ortszeit bei Vorlauf über die Zeitumstellung hinweg", () => {
    const s = { ...S, individual_lead_days: 2 };
    // Fällig am 26.10. (Winterzeit), Versand 2 Tage vorher am 24.10. (Sommerzeit) um 09:00 Ortszeit
    expect(individualSendAt(rem({ due_date: "2026-10-26" }), s).toISO()).toBe("2026-10-24T07:00:00.000Z");
  });
  it("verschiebt eine Uhrzeit in der Sommerzeit-Lücke (29.03.2026, 02:30) sinnvoll nach vorn", () => {
    const at = individualSendAt(rem({ due_date: "2026-03-29", due_time: "02:30:00" }), S);
    expect(at.isValid).toBe(true);
    expect(at.toISO()).toBe("2026-03-29T01:30:00.000Z");
  });
  it("nutzt andere Zeitzonen und fällt bei ungültiger Zone auf Berlin zurück", () => {
    expect(individualSendAt(rem({ due_time: "09:00:00" }), { ...S, timezone: "Asia/Shanghai" }).toISO()).toBe("2026-11-02T01:00:00.000Z");
    expect(individualSendAt(rem(), { ...S, timezone: "Mars/Olympus" }).toISO()).toBe("2026-11-02T08:00:00.000Z");
  });
  it("bestimmt das heutige Datum in der Zeitzone des Nutzers", () => {
    expect(todayIn("Europe/Berlin", new Date("2026-10-25T23:30:00Z"))).toBe("2026-10-26");
    expect(todayIn("America/Los_Angeles", new Date("2026-10-25T23:30:00Z"))).toBe("2026-10-25");
  });
});

describe("Einplanung", () => {
  it("plant Einzel-E-Mails erst ab dem Versandzeitpunkt", () => {
    expect(planIndividual(rem(), S, new Date("2026-11-02T07:59:00Z"))).toBeNull();
    const p = planIndividual(rem(), S, new Date("2026-11-02T08:00:00Z"));
    expect(p?.key).toBe("ind:r1:20261102T0800Z");
  });
  it("holt verpasste Einzel-E-Mails höchstens 36 Stunden nach", () => {
    expect(planIndividual(rem(), S, new Date("2026-11-03T19:00:00Z"))).not.toBeNull();
    expect(planIndividual(rem(), S, new Date("2026-11-03T21:00:00Z"))).toBeNull();
  });
  it("plant nichts, wenn Einzel-E-Mail aus oder Erinnerung nicht offen ist", () => {
    const now = new Date("2026-11-02T09:00:00Z");
    expect(planIndividual({ ...rem(), email_individual: false }, S, now)).toBeNull();
    expect(planIndividual({ ...rem(), status: "done" }, S, now)).toBeNull();
    expect(planIndividual(rem(), { ...S, individual_enabled: false }, now)).toBeNull();
  });
  it("plant die Sammel-E-Mail einmal pro Ortstag ab der eingestellten Uhrzeit", () => {
    expect(planDigest(S, new Date("2026-10-25T06:29:00Z"))).toBeNull(); // 07:29 Winterzeit
    expect(planDigest(S, new Date("2026-10-25T06:30:00Z"))?.key).toBe("dig:u1:2026-10-25");
    expect(planDigest(S, new Date("2026-10-25T18:00:00Z"))?.key).toBe("dig:u1:2026-10-25");
    expect(planDigest(S, new Date("2026-10-25T19:00:00Z"))).toBeNull(); // mehr als 12 h zu spät
    expect(planDigest({ ...S, digest_enabled: false }, new Date("2026-10-25T08:00:00Z"))).toBeNull();
  });
  it("erkennt verschobene, erledigte und gelöschte Erinnerungen beim Versand", () => {
    const r = { ...rem(), personDeleted: false };
    const key = individualKey("r1", individualSendAt(r, S));
    expect(individualStillValid(key, r, S)).toBeNull();
    expect(individualStillValid(key, { ...r, due_date: "2026-11-05" }, S)).toBe("Termin wurde verschoben");
    expect(individualStillValid(key, { ...r, status: "done" }, S)).toMatch(/erledigt/);
    expect(individualStillValid(key, { ...r, status: "cancelled" }, S)).toMatch(/abgebrochen/);
    expect(individualStillValid(key, null, S)).toMatch(/gelöscht/);
    expect(individualStillValid(key, { ...r, personDeleted: true }, S)).toMatch(/Papierkorb/);
  });
});

describe("Fehlerbehandlung", () => {
  it("wiederholt nur vorübergehende Fehler", () => {
    expect(classifySendFailure({ status: null, message: "timeout" }).retryable).toBe(true);
    expect(classifySendFailure({ status: 429, message: "" }).retryable).toBe(true);
    expect(classifySendFailure({ status: 503, message: "" }).retryable).toBe(true);
    expect(classifySendFailure({ status: 409, name: "concurrent_idempotent_requests", message: "" }).retryable).toBe(true);
    expect(classifySendFailure({ status: 401, message: "" }).retryable).toBe(false);
    expect(classifySendFailure({ status: 403, message: "testing" }).message).toMatch(/Resend-Kontos/);
    expect(classifySendFailure({ status: 422, message: "bad" }).retryable).toBe(false);
  });
  it("wartet zunehmend länger zwischen Versuchen", () => {
    expect([1, 2, 3, 4, 5].map(retryDelayMinutes)).toEqual([5, 15, 60, 180, 180]);
  });
});

describe("Anzeige", () => {
  it("formuliert relative Tage verständlich", () => {
    expect(relativeDay("2026-10-25", "2026-10-25")).toBe("heute");
    expect(relativeDay("2026-10-26", "2026-10-25")).toBe("morgen");
    expect(relativeDay("2026-10-20", "2026-10-25")).toBe("vor 5 Tagen");
    expect(relativeDay("2026-12-25", "2026-10-25")).toBe("in 2 Monaten");
    expect(dueState("2026-10-24", "2026-10-25")).toBe("overdue");
    expect(dueState("2026-10-25", "2026-10-25")).toBe("today");
  });
});
