-- Register: Datenbankschema Version 1
-- Ausführen im Supabase SQL-Editor (einmalig, in einem neuen Projekt).
-- Alle Tabellen tragen user_id und sind per Row Level Security auf den angemeldeten Nutzer beschränkt.

set check_function_bodies = off;

-- Hilfsfunktion: updated_at automatisch setzen
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Personen ------------------------------------------------------------------

create table public.people (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  first_name     text not null check (char_length(btrim(first_name)) between 1 and 100),
  last_name      text not null default '' check (char_length(last_name) <= 100),
  nickname       text check (char_length(nickname) <= 100),
  photo_path     text check (char_length(photo_path) <= 300),
  email          text check (char_length(email) <= 320),
  phone          text check (char_length(phone) <= 60),
  city           text check (char_length(city) <= 120),
  country        text check (char_length(country) <= 120),
  origin_country text check (char_length(origin_country) <= 120),
  occupation     text check (char_length(occupation) <= 200),
  company        text check (char_length(company) <= 200),
  organization   text check (char_length(organization) <= 200),
  links          text[] not null default '{}',
  languages      text[] not null default '{}',
  met_on         date,
  met_country    text check (char_length(met_country) <= 120),
  met_place      text check (char_length(met_place) <= 300),
  met_context    text check (char_length(met_context) <= 2000),
  about          text check (char_length(about) <= 50000),
  goals          text check (char_length(goals) <= 20000),
  open_items     text check (char_length(open_items) <= 20000),
  custom_fields  jsonb not null default '{}'::jsonb check (jsonb_typeof(custom_fields) = 'object'),
  search_text    text not null default '',
  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index people_user_idx on public.people (user_id) where deleted_at is null;
create index people_user_deleted_idx on public.people (user_id, deleted_at) where deleted_at is not null;
create index people_name_idx on public.people (user_id, lower(last_name), lower(first_name));

create or replace function public.people_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.first_name := btrim(new.first_name);
  new.last_name := btrim(coalesce(new.last_name, ''));
  new.search_text := lower(concat_ws(' ',
    new.first_name, new.last_name, new.nickname, new.email, new.phone,
    new.city, new.country, new.origin_country, new.occupation, new.company,
    new.organization, new.met_country, new.met_place, new.met_context,
    new.about, new.goals, new.open_items,
    array_to_string(new.languages, ' '), array_to_string(new.links, ' '),
    new.custom_fields::text));
  new.updated_at := now();
  return new;
end;
$$;

create trigger people_before_write
  before insert or update on public.people
  for each row execute function public.people_before_write();

-- Kategorien ----------------------------------------------------------------

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  sort_order  integer not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);
create unique index categories_name_uniq on public.categories (user_id, lower(name));

create table public.person_categories (
  person_id   uuid not null references public.people(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (person_id, category_id)
);
create index person_categories_category_idx on public.person_categories (category_id);

-- Tags und Interessen (eine Tabelle, unterschieden durch kind) ---------------

create table public.tags (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind        text not null default 'tag' check (kind in ('tag', 'interest')),
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);
create unique index tags_name_uniq on public.tags (user_id, kind, lower(name));

create table public.person_tags (
  person_id uuid not null references public.people(id) on delete cascade,
  tag_id    uuid not null references public.tags(id) on delete cascade,
  user_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (person_id, tag_id)
);
create index person_tags_tag_idx on public.person_tags (tag_id);

-- Begegnungen und Notizen (Timeline) ------------------------------------------

create table public.encounters (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  person_id     uuid not null references public.people(id) on delete cascade,
  kind          text not null default 'meeting' check (kind in
                  ('first_meeting', 'meeting', 'call', 'video', 'message', 'event', 'trip', 'other', 'note')),
  occurred_on   date not null default current_date,
  occurred_time time,
  location      text check (char_length(location) <= 300),
  notes         text check (char_length(notes) <= 50000),
  topics        text check (char_length(topics) <= 2000),
  agreements    text check (char_length(agreements) <= 5000),
  search_text   text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index encounters_person_idx on public.encounters (person_id, occurred_on desc);
create index encounters_user_date_idx on public.encounters (user_id, occurred_on desc);

create or replace function public.encounters_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.search_text := lower(concat_ws(' ', new.location, new.notes, new.topics, new.agreements));
  new.updated_at := now();
  return new;
end;
$$;

create trigger encounters_before_write
  before insert or update on public.encounters
  for each row execute function public.encounters_before_write();

create table public.encounter_tags (
  encounter_id uuid not null references public.encounters(id) on delete cascade,
  tag_id       uuid not null references public.tags(id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (encounter_id, tag_id)
);

-- Wiedervorlagen ------------------------------------------------------------

create table public.reminders (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  person_id          uuid not null references public.people(id) on delete cascade,
  due_date           date not null,
  due_time           time,
  reason             text not null check (char_length(btrim(reason)) between 1 and 200),
  note               text check (char_length(note) <= 5000),
  email_individual   boolean not null default false,
  status             text not null default 'planned' check (status in ('planned', 'done', 'cancelled')),
  completed_at       timestamptz,
  cancelled_at       timestamptz,
  individual_sent_at timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index reminders_open_idx on public.reminders (user_id, due_date) where status = 'planned';
create index reminders_person_idx on public.reminders (person_id);

create trigger reminders_touch
  before update on public.reminders
  for each row execute function public.touch_updated_at();

-- Verknüpfungen zwischen Personen -------------------------------------------

create table public.person_links (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  person_a    uuid not null references public.people(id) on delete cascade,
  person_b    uuid not null references public.people(id) on delete cascade,
  kind        text not null default 'acquaintances' check (kind in
                ('colleagues', 'friends', 'acquaintances', 'project', 'event', 'family', 'introduced', 'other')),
  description text check (char_length(description) <= 300),
  note        text check (char_length(note) <= 5000),
  created_at  timestamptz not null default now(),
  check (person_a <> person_b)
);
create unique index person_links_uniq on public.person_links (person_a, person_b, kind);
create index person_links_b_idx on public.person_links (person_b);

-- Eigene Felder (Werte liegen in people.custom_fields) ----------------------

create table public.field_definitions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key         text not null check (key ~ '^[a-z0-9_]{1,40}$'),
  label       text not null check (char_length(btrim(label)) between 1 and 60),
  field_type  text not null default 'text' check (field_type in ('text', 'number', 'date', 'url')),
  sort_order  integer not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (user_id, key)
);

-- Einstellungen -------------------------------------------------------------

create table public.settings (
  user_id                uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  recipient_email        text check (recipient_email is null or recipient_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  timezone               text not null default 'Europe/Berlin',
  digest_enabled         boolean not null default true,
  digest_time            time not null default '07:30',
  digest_include_overdue boolean not null default true,
  digest_include_done    boolean not null default false,
  individual_enabled     boolean not null default true,
  default_reminder_time  time not null default '09:00',
  individual_lead_days   integer not null default 0 check (individual_lead_days between 0 and 30),
  email_detail           text not null default 'full' check (email_detail in ('full', 'minimal')),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create trigger settings_touch
  before update on public.settings
  for each row execute function public.touch_updated_at();

-- E-Mail-Outbox (Versandprotokoll). Schreiben nur serverseitig. -------------

create table public.email_outbox (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  kind                text not null check (kind in ('individual', 'digest', 'test')),
  idempotency_key     text not null unique check (char_length(idempotency_key) between 1 and 256),
  reminder_id         uuid references public.reminders(id) on delete set null,
  scheduled_for       timestamptz not null default now(),
  status              text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts            integer not null default 0,
  next_attempt_at     timestamptz not null default now(),
  locked_at           timestamptz,
  subject             text,
  payload             jsonb,
  last_error          text,
  provider_message_id text,
  sent_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index email_outbox_queue_idx on public.email_outbox (status, next_attempt_at);
create index email_outbox_user_idx on public.email_outbox (user_id, created_at desc);

create trigger email_outbox_touch
  before update on public.email_outbox
  for each row execute function public.touch_updated_at();

-- Scheduler-Läufe (Herzschlag). Enthält keine personenbezogenen Daten. -------

create table public.scheduler_runs (
  id          bigint generated always as identity primary key,
  source      text not null default 'unknown' check (char_length(source) <= 30),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  planned     integer not null default 0,
  sent        integer not null default 0,
  failed      integer not null default 0,
  skipped     integer not null default 0,
  error       text
);
create index scheduler_runs_started_idx on public.scheduler_runs (started_at desc);

-- Row Level Security --------------------------------------------------------

alter table public.people            enable row level security;
alter table public.categories        enable row level security;
alter table public.person_categories enable row level security;
alter table public.tags              enable row level security;
alter table public.person_tags       enable row level security;
alter table public.encounters        enable row level security;
alter table public.encounter_tags    enable row level security;
alter table public.reminders         enable row level security;
alter table public.person_links      enable row level security;
alter table public.field_definitions enable row level security;
alter table public.settings          enable row level security;
alter table public.email_outbox      enable row level security;
alter table public.scheduler_runs    enable row level security;

-- Eigene Datensätze: lesen, anlegen, ändern, löschen
create policy people_own on public.people for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy categories_own on public.categories for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy tags_own on public.tags for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy field_definitions_own on public.field_definitions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy settings_own on public.settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Datensätze mit Bezug zu Personen: Bezugsobjekte müssen ebenfalls dem Nutzer gehören
create policy encounters_own on public.encounters for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.people p where p.id = person_id and p.user_id = (select auth.uid())));
create policy reminders_own on public.reminders for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.people p where p.id = person_id and p.user_id = (select auth.uid())));
create policy person_categories_own on public.person_categories for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.people p where p.id = person_id and p.user_id = (select auth.uid()))
    and exists (select 1 from public.categories c where c.id = category_id and c.user_id = (select auth.uid())));
create policy person_tags_own on public.person_tags for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.people p where p.id = person_id and p.user_id = (select auth.uid()))
    and exists (select 1 from public.tags t where t.id = tag_id and t.user_id = (select auth.uid())));
create policy encounter_tags_own on public.encounter_tags for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.encounters e where e.id = encounter_id and e.user_id = (select auth.uid()))
    and exists (select 1 from public.tags t where t.id = tag_id and t.user_id = (select auth.uid())));
create policy person_links_own on public.person_links for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.people p where p.id = person_a and p.user_id = (select auth.uid()))
    and exists (select 1 from public.people p where p.id = person_b and p.user_id = (select auth.uid())));

-- Outbox: nur lesen. Schreiben ausschließlich über den Server (service_role) oder retry_email().
create policy email_outbox_read on public.email_outbox for select to authenticated
  using (user_id = (select auth.uid()));

-- Scheduler-Läufe: lesbar für angemeldete Nutzer, keine personenbezogenen Daten.
create policy scheduler_runs_read on public.scheduler_runs for select to authenticated
  using (true);

-- Anonyme Rolle bekommt keinerlei Zugriff auf die Tabellen.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Suche und Filter ----------------------------------------------------------
-- Läuft mit den Rechten des Aufrufers (security invoker), RLS greift also vollständig.

create or replace function public.search_people(
  p_today          date,
  p_q              text default null,
  p_category_ids   uuid[] default null,
  p_tag_ids        uuid[] default null,
  p_country        text default null,
  p_origin_country text default null,
  p_met_country    text default null,
  p_city           text default null,
  p_company        text default null,
  p_occupation     text default null,
  p_met_from       date default null,
  p_met_to         date default null,
  p_reminder       text default null,
  p_sort           text default 'name',
  p_limit          integer default 50,
  p_offset         integer default 0,
  p_deleted        boolean default false
)
returns table (
  id               uuid,
  first_name       text,
  last_name        text,
  nickname         text,
  photo_path       text,
  city             text,
  country          text,
  occupation       text,
  company          text,
  organization     text,
  met_on           date,
  met_place        text,
  created_at       timestamptz,
  updated_at       timestamptz,
  deleted_at       timestamptz,
  last_contact_on  date,
  next_due_date    date,
  next_reason      text,
  category_ids     uuid[],
  tag_ids          uuid[],
  match_rank       integer,
  total_count      bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with words as (
    select array_remove(regexp_split_to_array(lower(btrim(coalesce(p_q, ''))), '\s+'), '') as w
  ),
  base as (
    select
      p.*,
      (select max(e.occurred_on) from encounters e
        where e.person_id = p.id and e.kind <> 'note') as last_contact_on,
      nr.due_date as next_due_date,
      nr.reason as next_reason,
      coalesce((select array_agg(pc.category_id) from person_categories pc where pc.person_id = p.id), '{}') as category_ids,
      coalesce((select array_agg(pt.tag_id) from person_tags pt where pt.person_id = p.id), '{}') as tag_ids
    from people p
    left join lateral (
      select r.due_date, r.reason from reminders r
      where r.person_id = p.id and r.status = 'planned'
      order by r.due_date, r.due_time nulls last
      limit 1
    ) nr on true
    where (case when p_deleted then p.deleted_at is not null else p.deleted_at is null end)
  ),
  filtered as (
    select b.*,
      case
        when cardinality((select w from words)) = 0 then 0
        when not exists (
          select 1 from unnest((select w from words)) as t(word)
          where strpos(lower(concat_ws(' ', b.first_name, b.last_name, b.nickname)), t.word) = 0
        ) then 0
        when not exists (
          select 1 from unnest((select w from words)) as t(word)
          where strpos(b.search_text, t.word) = 0
        ) then 1
        else 2
      end as match_rank
    from base b
    where
      -- Freitext: jedes Wort muss im Profil oder in einer Begegnung vorkommen
      not exists (
        select 1 from unnest((select w from words)) as t(word)
        where strpos(b.search_text, t.word) = 0
          and not exists (
            select 1 from encounters e
            where e.person_id = b.id and strpos(e.search_text, t.word) > 0)
      )
      and (p_category_ids is null or cardinality(p_category_ids) = 0
           or p_category_ids <@ b.category_ids)
      and (p_tag_ids is null or cardinality(p_tag_ids) = 0
           or p_tag_ids <@ b.tag_ids)
      and (nullif(btrim(p_country), '') is null or lower(b.country) = lower(btrim(p_country)))
      and (nullif(btrim(p_origin_country), '') is null or lower(b.origin_country) = lower(btrim(p_origin_country)))
      and (nullif(btrim(p_met_country), '') is null or lower(b.met_country) = lower(btrim(p_met_country)))
      and (nullif(btrim(p_city), '') is null or strpos(lower(coalesce(b.city, '')), lower(btrim(p_city))) > 0)
      and (nullif(btrim(p_company), '') is null
           or strpos(lower(concat_ws(' ', b.company, b.organization)), lower(btrim(p_company))) > 0)
      and (nullif(btrim(p_occupation), '') is null or strpos(lower(coalesce(b.occupation, '')), lower(btrim(p_occupation))) > 0)
      and (p_met_from is null or b.met_on >= p_met_from)
      and (p_met_to is null or b.met_on <= p_met_to)
      and (
        p_reminder is null or p_reminder = ''
        or (p_reminder = 'overdue'  and b.next_due_date < p_today)
        or (p_reminder = 'today'    and b.next_due_date = p_today)
        or (p_reminder = 'upcoming' and b.next_due_date > p_today)
        or (p_reminder = 'open'     and b.next_due_date is not null)
        or (p_reminder = 'none'     and b.next_due_date is null)
      )
  )
  select
    f.id, f.first_name, f.last_name, f.nickname, f.photo_path, f.city, f.country,
    f.occupation, f.company, f.organization, f.met_on, f.met_place,
    f.created_at, f.updated_at, f.deleted_at,
    f.last_contact_on, f.next_due_date, f.next_reason, f.category_ids, f.tag_ids,
    f.match_rank,
    count(*) over () as total_count
  from filtered f
  order by
    case when p_sort = 'relevance' then f.match_rank end asc,
    case when p_sort = 'created' then f.created_at end desc,
    case when p_sort = 'updated' then f.updated_at end desc,
    case when p_sort = 'last_contact' then f.last_contact_on end desc nulls last,
    case when p_sort = 'next_contact' then f.next_due_date end asc nulls last,
    case when p_sort = 'met' then f.met_on end desc nulls last,
    case when p_sort = 'deleted' then f.deleted_at end desc,
    lower(coalesce(nullif(f.last_name, ''), f.first_name)) asc,
    lower(f.first_name) asc,
    f.id
  limit greatest(1, least(coalesce(p_limit, 50), 500))
  offset greatest(0, coalesce(p_offset, 0));
$$;

grant execute on function public.search_people(date, text, uuid[], uuid[], text, text, text, text, text, text, date, date, text, text, integer, integer, boolean) to authenticated;
revoke execute on function public.search_people(date, text, uuid[], uuid[], text, text, text, text, text, text, date, date, text, text, integer, integer, boolean) from anon, public;

-- Unterschiedliche Länder- und Ortswerte für Filtervorschläge
create or replace function public.filter_values()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'countries', coalesce((select jsonb_agg(v order by v) from (
        select distinct country as v from people where deleted_at is null and nullif(country, '') is not null) s), '[]'),
    'origin_countries', coalesce((select jsonb_agg(v order by v) from (
        select distinct origin_country as v from people where deleted_at is null and nullif(origin_country, '') is not null) s), '[]'),
    'met_countries', coalesce((select jsonb_agg(v order by v) from (
        select distinct met_country as v from people where deleted_at is null and nullif(met_country, '') is not null) s), '[]'),
    'cities', coalesce((select jsonb_agg(v order by v) from (
        select distinct city as v from people where deleted_at is null and nullif(city, '') is not null) s), '[]'),
    'companies', coalesce((select jsonb_agg(v order by v) from (
        select distinct company as v from people where deleted_at is null and nullif(company, '') is not null) s), '[]')
  );
$$;
grant execute on function public.filter_values() to authenticated;
revoke execute on function public.filter_values() from anon, public;

-- Outbox: Aufträge für den Versand reservieren (nur Server) -----------------
-- Holt fällige Aufträge und hängengebliebene Sendungen (> 15 Minuten) und sperrt sie
-- mit SKIP LOCKED, damit parallele Läufe nie denselben Auftrag bearbeiten.

create or replace function public.claim_outbox(p_limit integer default 20, p_now timestamptz default now())
returns setof public.email_outbox
language sql
security definer
set search_path = public
as $$
  update public.email_outbox o
     set status = 'sending', locked_at = p_now, attempts = o.attempts + 1
   where o.id in (
     select q.id from public.email_outbox q
      where (q.status = 'pending' and q.next_attempt_at <= p_now)
         or (q.status = 'sending' and q.locked_at < p_now - interval '15 minutes')
      order by q.scheduled_for
      limit greatest(1, least(p_limit, 100))
      for update skip locked)
  returning o.*;
$$;
revoke all on function public.claim_outbox(integer, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_outbox(integer, timestamptz) to service_role;

-- Fehlgeschlagene Sendung erneut einplanen (vom Nutzer auslösbar)
create or replace function public.retry_email(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.email_outbox
     set status = 'pending', next_attempt_at = now(), attempts = 0, locked_at = null
   where id = p_id and user_id = auth.uid() and status = 'failed';
$$;
revoke all on function public.retry_email(uuid) from public, anon;
grant execute on function public.retry_email(uuid) to authenticated;
