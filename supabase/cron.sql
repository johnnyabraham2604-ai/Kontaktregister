-- Register: Scheduler einrichten
-- Erst ausführen, NACHDEM die App auf Vercel läuft (du brauchst deren URL).
--
-- Vorher zwei Platzhalter ersetzen:
--   <APP_URL>      z.B. https://register-johnny.vercel.app (ohne Schrägstrich am Ende)
--   <CRON_SECRET>  derselbe Wert wie die Umgebungsvariable CRON_SECRET in Vercel
--
-- Das Secret liegt verschlüsselt im Supabase Vault, nicht im Klartext im Cron-Job.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Secret und URL im Vault ablegen (bei erneutem Ausführen vorher löschen, siehe unten)
select vault.create_secret('<CRON_SECRET>', 'register_cron_secret');
select vault.create_secret('<APP_URL>', 'register_app_url');

-- Alle 10 Minuten den Dispatcher aufrufen
select cron.schedule(
  'register-dispatch',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'register_app_url') || '/api/cron/dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'register_cron_secret')
    ),
    body := jsonb_build_object('source', 'pg_cron'),
    timeout_milliseconds := 55000
  );
  $$
);

-- Protokolle von pg_cron und pg_net klein halten (täglich 03:15 UTC)
select cron.schedule(
  'register-housekeeping',
  '15 3 * * *',
  $$
  delete from cron.job_run_details where end_time < now() - interval '7 days';
  delete from public.scheduler_runs where started_at < now() - interval '30 days';
  $$
);

-- Prüfen:
--   select * from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 10;
--   select id, status_code, error_msg, created from net._http_response order by created desc limit 10;
--
-- Ändern (z.B. neue URL):
--   delete from vault.secrets where name in ('register_cron_secret', 'register_app_url');
--   danach die beiden vault.create_secret-Zeilen erneut ausführen.
--
-- Abschalten:
--   select cron.unschedule('register-dispatch');
--   select cron.unschedule('register-housekeeping');
