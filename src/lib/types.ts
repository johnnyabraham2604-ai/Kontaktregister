export type EncounterKind =
  | "first_meeting"
  | "meeting"
  | "call"
  | "video"
  | "message"
  | "event"
  | "trip"
  | "other"
  | "note";

export type ReminderStatus = "planned" | "done" | "cancelled";
export type TagKind = "tag" | "interest";
export type LinkKind = "colleagues" | "friends" | "acquaintances" | "project" | "event" | "family" | "introduced" | "other";
export type FieldType = "text" | "number" | "date" | "url";

export interface Person {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  photo_path: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  origin_country: string | null;
  occupation: string | null;
  company: string | null;
  organization: string | null;
  links: string[];
  languages: string[];
  met_on: string | null;
  met_country: string | null;
  met_place: string | null;
  met_context: string | null;
  about: string | null;
  goals: string | null;
  open_items: string | null;
  custom_fields: Record<string, string>;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PersonListRow {
  id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  photo_path: string | null;
  city: string | null;
  country: string | null;
  occupation: string | null;
  company: string | null;
  organization: string | null;
  met_on: string | null;
  met_place: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  last_contact_on: string | null;
  next_due_date: string | null;
  next_reason: string | null;
  category_ids: string[];
  tag_ids: string[];
  match_rank: number;
  total_count: number;
}

export interface Category {
  id: string;
  name: string;
  sort_order: number;
  archived_at: string | null;
  created_at: string;
}

export interface Tag {
  id: string;
  kind: TagKind;
  name: string;
  archived_at: string | null;
  created_at: string;
}

export interface Encounter {
  id: string;
  person_id: string;
  kind: EncounterKind;
  occurred_on: string;
  occurred_time: string | null;
  location: string | null;
  notes: string | null;
  topics: string | null;
  agreements: string | null;
  created_at: string;
  updated_at: string;
}

export interface Reminder {
  id: string;
  person_id: string;
  due_date: string;
  due_time: string | null;
  reason: string;
  note: string | null;
  email_individual: boolean;
  status: ReminderStatus;
  completed_at: string | null;
  cancelled_at: string | null;
  individual_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PersonLink {
  id: string;
  person_a: string;
  person_b: string;
  kind: LinkKind;
  description: string | null;
  note: string | null;
  created_at: string;
}

export interface FieldDefinition {
  id: string;
  key: string;
  label: string;
  field_type: FieldType;
  sort_order: number;
  archived_at: string | null;
}

export interface Settings {
  user_id: string;
  recipient_email: string | null;
  timezone: string;
  digest_enabled: boolean;
  digest_time: string;
  digest_include_overdue: boolean;
  digest_include_done: boolean;
  individual_enabled: boolean;
  default_reminder_time: string;
  individual_lead_days: number;
  email_detail: "full" | "minimal";
  created_at: string;
  updated_at: string;
}

export type OutboxKind = "individual" | "digest" | "test";
export type OutboxStatus = "pending" | "sending" | "sent" | "failed" | "skipped";

export interface OutboxRow {
  id: string;
  user_id: string;
  kind: OutboxKind;
  idempotency_key: string;
  reminder_id: string | null;
  scheduled_for: string;
  status: OutboxStatus;
  attempts: number;
  next_attempt_at: string;
  locked_at: string | null;
  subject: string | null;
  payload: EmailPayload | null;
  last_error: string | null;
  provider_message_id: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailPayload {
  subject: string;
  html: string;
  text: string;
}

export interface SchedulerRun {
  id: number;
  source: string;
  started_at: string;
  finished_at: string | null;
  planned: number;
  sent: number;
  failed: number;
  skipped: number;
  error: string | null;
}

export type ActionState = { ok: boolean; message?: string; fieldErrors?: Record<string, string> } | null;
