import type { PGlite } from "@electric-sql/pglite";
import type { DispatchStore, ReminderWithPerson } from "@/lib/reminders/store";
import type { OutboxRow, Settings } from "@/lib/types";

/**
 * Implementierung des Dispatcher-Datenzugriffs gegen PGlite mit dem echten Schema.
 * Läuft als service_role, wie der Dispatcher in Produktion.
 */
const REMINDER_SQL = `
  select r.id, r.user_id, r.due_date::text as due_date, r.due_time::text as due_time, r.reason, r.note, r.status,
         r.email_individual, r.individual_sent_at::text as individual_sent_at, r.completed_at::text as completed_at,
         json_build_object('id', p.id, 'first_name', p.first_name, 'last_name', p.last_name, 'deleted_at', p.deleted_at) as person
  from reminders r join people p on p.id = r.person_id`;

const SETTINGS_SQL = `select user_id, recipient_email, timezone, digest_enabled, digest_time::text as digest_time,
  digest_include_overdue, digest_include_done, individual_enabled, default_reminder_time::text as default_reminder_time,
  individual_lead_days, email_detail, created_at::text, updated_at::text from settings`;

const OUTBOX_COLS = `id, user_id, kind, idempotency_key, reminder_id, scheduled_for::text, status, attempts,
  next_attempt_at::text, locked_at::text, subject, payload, last_error, provider_message_id, sent_at::text,
  created_at::text, updated_at::text`;

export function pgliteStore(db: PGlite): DispatchStore {
  async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    await db.exec("set role service_role");
    try {
      return (await db.query<T>(sql, params)).rows;
    } finally {
      await db.exec("reset role");
    }
  }
  return {
    async startRun(source) {
      const [r] = await q<{ id: number }>(`insert into scheduler_runs (source) values ($1) returning id`, [source]);
      return r.id;
    },
    async finishRun(id, s, error) {
      await q(`update scheduler_runs set planned=$2, sent=$3, failed=$4, skipped=$5, error=$6, finished_at=now() where id=$1`, [
        id, s.planned, s.sent, s.failed, s.skipped, error,
      ]);
    },
    async lastRunAt(source) {
      const [r] = await q<{ t: string }>(`select started_at::text as t from scheduler_runs where source=$1 order by started_at desc limit 1`, [source]);
      return r?.t ?? null;
    },
    async listSettings() {
      return q<Settings>(SETTINGS_SQL);
    },
    async getSettings(userId) {
      const [r] = await q<Settings>(`${SETTINGS_SQL} where user_id = $1`, [userId]);
      return r ?? null;
    },
    async listIndividualCandidates(userId, from, to) {
      return q<ReminderWithPerson>(
        `${REMINDER_SQL} where r.user_id=$1 and r.status='planned' and r.email_individual and r.due_date between $2 and $3 and p.deleted_at is null`,
        [userId, from, to],
      );
    },
    async insertOutbox(rows) {
      let n = 0;
      for (const r of rows) {
        const res = await q(
          `insert into email_outbox (user_id, kind, idempotency_key, reminder_id, scheduled_for, next_attempt_at, status, last_error)
           values ($1,$2,$3,$4,$5,$6,coalesce($7,'pending'),$8) on conflict (idempotency_key) do nothing returning id`,
          [r.user_id, r.kind, r.idempotency_key, r.reminder_id, r.scheduled_for, r.next_attempt_at, r.status ?? null, r.last_error ?? null],
        );
        n += res.length;
      }
      return n;
    },
    async claim(limit, nowIso) {
      return q<OutboxRow>(`select ${OUTBOX_COLS} from claim_outbox($1, $2)`, [limit, nowIso]);
    },
    async savePayload(id, payload) {
      await q(`update email_outbox set payload=$2, subject=$3 where id=$1`, [id, JSON.stringify(payload), payload.subject]);
    },
    async markSent(row, providerId) {
      await q(`update email_outbox set status='sent', provider_message_id=$2, sent_at=now(), payload=null, last_error=null, locked_at=null where id=$1`, [row.id, providerId]);
      if (row.kind === "individual" && row.reminder_id) {
        await q(`update reminders set individual_sent_at=now() where id=$1`, [row.reminder_id]);
      }
    },
    async markRetry(id, next, error) {
      await q(`update email_outbox set status='pending', next_attempt_at=$2, last_error=$3, locked_at=null where id=$1`, [id, next, error]);
    },
    async markFailed(id, error) {
      await q(`update email_outbox set status='failed', last_error=$2, locked_at=null where id=$1`, [id, error]);
    },
    async markSkipped(id, reason) {
      await q(`update email_outbox set status='skipped', last_error=$2, locked_at=null, payload=null where id=$1`, [id, reason]);
    },
    async getReminder(id) {
      const [r] = await q<ReminderWithPerson>(`${REMINDER_SQL} where r.id=$1`, [id]);
      return r ?? null;
    },
    async getLastEncounter(personId) {
      const [r] = await q<never>(
        `select occurred_on::text as occurred_on, kind, topics, notes from encounters where person_id=$1 and kind <> 'note' order by occurred_on desc limit 1`,
        [personId],
      );
      return r ?? null;
    },
    async getOpenRemindersUntil(userId, date) {
      return q<ReminderWithPerson>(
        `${REMINDER_SQL} where r.user_id=$1 and r.status='planned' and r.due_date <= $2 and p.deleted_at is null order by r.due_date`,
        [userId, date],
      );
    },
    async getDoneSince(userId, since) {
      return q<ReminderWithPerson>(
        `${REMINDER_SQL} where r.user_id=$1 and r.status='done' and r.completed_at >= $2 and p.deleted_at is null`,
        [userId, since],
      );
    },
    async purgeTrash(before) {
      const rows = await q(`delete from people where deleted_at < $1 returning id`, [before]);
      return rows.length;
    },
  };
}
