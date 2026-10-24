-- ==============================================================================
-- HALLOWEEN SPIEL - KOMPLETTER RESET ALLER SPIELERDATEN (STANDALONE SQL SKRIPT)
-- Ausführbar direkt im Supabase SQL Editor.
-- Löscht: Alle Spielerprofile, Rollen, Kills, Aufgaben, Punkte-Logs, Fotos,
--         Fehler-Logs und Tick-Logs.
-- Behält: Admin-Code, Spieleinstellungen, Aufgaben-Pools, Tabellen & Funktionen.
-- Inkrementiert: reset_epoch in game_state (zwingt alle Clients zum Re-Login).
-- ==============================================================================

begin;

-- 1. Tabellen mit Spielerdaten und Spielgeschehen leeren
delete from public.points_log;
delete from public.kills;
delete from public.player_photo_tasks;
delete from public.special_tasks;
delete from public.task_completions;
delete from public.player_roles;
delete from public.players;
delete from public.photos;
delete from public.client_errors;
delete from public.tick_log;

-- Optionale Benachrichtigungstabellen leeren falls vorhanden
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'notifications') then
    execute 'delete from public.notifications;';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'push_subscriptions') then
    execute 'delete from public.push_subscriptions;';
  end if;
end;
$$;

-- 2. Storage Bucket "photos" leeren (Dateien & Metadaten)
do $$
begin
  delete from storage.objects where bucket_id = 'photos';
exception when others then
  null; -- Falls Rechte eingeschränkt sind, siehe Dashboard-Schritt
end;
$$;

-- 3. game_state sicherstellen und auf Lobby zurücksetzen
insert into public.game_state (id, status, reset_epoch)
values ('main', 'Lobby', 1)
on conflict (id) do nothing;

alter table public.game_state add column if not exists reset_epoch integer not null default 1;

update public.game_state
set status = 'Lobby',
    started_at = null,
    ended_at = null,
    active_full_moon = null,
    next_full_moon_at = null,
    winner_team = null,
    last_special_task_at = null,
    last_tick_at = null,
    reset_epoch = coalesce(reset_epoch, 0) + 1,
    updated_at = now()
where id = 'main';

commit;

-- PostgREST Schema-Cache aktualisieren
notify pgrst, 'reload schema';

-- Ergebnis anzeigen
select id, status, reset_epoch, updated_at from public.game_state where id = 'main';
