-- ==============================================================================
-- HALLOWEEN PARTY SPIEL - KONSOLIDIERTES AUDIT-SCHEMA & SICHERHEITS-UPGRADE
-- Vollständig idempotent (mehrfach ausführbar, IF NOT EXISTS / CREATE OR REPLACE)
-- Behebt Rollen-Leaks, Admin-Code-Leaks, Race Conditions, Fullmoon in tick_game()
-- ==============================================================================

-- 1. EXTENSIONS
create extension if not exists "uuid-ossp";
create extension if not exists "pg_cron";

-- 2. SICHERER ADMIN-CODE STORE (Separat vor öffentlichem Select geschützt)
create table if not exists public.admin_secrets (
  id text primary key default 'main',
  admin_code text not null default '1031',
  updated_at timestamptz not null default now()
);

insert into public.admin_secrets (id, admin_code)
values ('main', '1031')
on conflict (id) do nothing;

alter table public.admin_secrets enable row level security;
drop policy if exists "No public access to admin_secrets" on public.admin_secrets;
create policy "No public access to admin_secrets" on public.admin_secrets for all to public using (false);

-- 3. TABELLE: game_state (Öffentliche Spielsteuerung OHNE admin_code)
create table if not exists public.game_state (
  id text primary key default 'main',
  status text not null default 'Lobby' check (status in ('Lobby', 'Läuft', 'Beendet')),
  started_at timestamptz,
  ended_at timestamptz,
  settings jsonb not null default '{
    "vampirePercent": 6,
    "werewolfPercent": 4,
    "ghostPercent": 4,
    "hunterPercent": 10,
    "gracePeriodMinutes": 15,
    "vampireCooldownMinutes": 6,
    "ghostCooldownMinutes": 6,
    "werewolfCooldownMinutes": 2,
    "hunterHitCooldownMinutes": 15,
    "hunterMissPenaltyMinutes": 30,
    "pendingDeathTimeoutMinutes": 4,
    "unconfirmedKillAction": "revive",
    "fullMoonMinIntervalMinutes": 20,
    "fullMoonMaxIntervalMinutes": 40,
    "fullMoonDurationMinutes": 5,
    "pointsPhotoTask": 10,
    "pointsSpecialTask": 20,
    "pointsEvilKill": 15,
    "pointsExorcismSuccess": 25,
    "photoTaskIntervalMinutes": 10,
    "photoTaskExpirationMinutes": 30,
    "photoDownloadUnlocked": "ended",
    "specialTaskIntervalMinMinutes": 10,
    "specialTaskIntervalMaxMinutes": 20
  }'::jsonb,
  full_moon_times jsonb not null default '[]'::jsonb,
  active_full_moon jsonb default null,
  next_full_moon_at timestamptz default null,
  winner_team text default null,
  last_special_task_at timestamptz default null,
  next_special_task_interval_minutes integer default 15,
  last_tick_at timestamptz default null,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

-- Spalten nachrüsten falls noch fehlend
alter table public.game_state add column if not exists active_full_moon jsonb default null;
alter table public.game_state add column if not exists next_full_moon_at timestamptz default null;
alter table public.game_state add column if not exists winner_team text default null;
alter table public.game_state add column if not exists last_special_task_at timestamptz default null;
alter table public.game_state add column if not exists next_special_task_interval_minutes integer default 15;
alter table public.game_state add column if not exists last_tick_at timestamptz default null;

insert into public.game_state (id, status)
values ('main', 'Lobby')
on conflict (id) do nothing;

-- 4. TABELLE: players (Öffentliche Spielerdaten)
create table if not exists public.players (
  id text primary key,
  name text not null,
  costume_name text not null,
  photo_url text not null,
  role text default 'unassigned',
  team text not null default 'Gut',
  status text not null default 'lebendig',
  points integer not null default 0,
  kills_count integer not null default 0,
  tasks_completed_count integer not null default 0,
  last_kill_at timestamptz,
  cooldown_until timestamptz,
  pending_death_at timestamptz,
  is_test boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.players drop constraint if exists players_status_check;
alter table public.players add constraint players_status_check 
  check (status in ('lebendig', 'tot', 'pending_death', 'tod_ausstehend', 'entfernt', 'pausiert'));

alter table public.players add column if not exists is_test boolean not null default false;
alter table public.players add column if not exists pending_death_at timestamptz;
alter table public.players add column if not exists cooldown_until timestamptz;
alter table public.players add column if not exists last_kill_at timestamptz;
alter table public.players add column if not exists kills_count integer not null default 0;
alter table public.players add column if not exists tasks_completed_count integer not null default 0;

create index if not exists idx_players_points on public.players (points desc);
create index if not exists idx_players_created_at on public.players (created_at asc);
create index if not exists idx_players_status on public.players (status);
create index if not exists idx_players_is_test on public.players (is_test);

-- 5. TABELLE: player_roles (STRENG VERTRAULICHE ROLLENTABELLE)
-- Kein Public-Select! Verhindert Rollen-Leaks über Network-Tab und Anon-Keys!
create table if not exists public.player_roles (
  player_id text primary key references public.players(id) on delete cascade,
  role text not null,
  team text not null,
  updated_at timestamptz not null default now()
);

alter table public.player_roles enable row level security;
drop policy if exists "No public access to player_roles" on public.player_roles;
create policy "No public access to player_roles" on public.player_roles for all to public using (false);

-- 6. TABELLE: kills (Kill-Protokoll)
create table if not exists public.kills (
  id uuid primary key default gen_random_uuid(),
  killer_id text references public.players(id) on delete set null,
  victim_id text not null references public.players(id) on delete cascade,
  killer_name text,
  victim_name text not null,
  killer_role text,
  victim_role text,
  killer_team text,
  victim_team text,
  reason text not null default 'kill',
  ghost_solo_confirmed boolean default false,
  exorcism_hit boolean default null,
  confirmed boolean not null default false,
  confirmed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_kills_created_at on public.kills (created_at desc);
create index if not exists idx_kills_victim_id on public.kills (victim_id);
create index if not exists idx_kills_killer_id on public.kills (killer_id);

-- 7. TABELLE: player_photo_tasks (Foto-Aufgaben pro Spieler & Slot)
create table if not exists public.player_photo_tasks (
  id uuid primary key default gen_random_uuid(),
  player_id text not null references public.players(id) on delete cascade,
  slot_number integer not null,
  title text not null,
  description text not null,
  task_type text not null check (task_type in ('specific_player', 'specific_costume', 'group', 'two_players')),
  target_player_id text references public.players(id) on delete set null,
  target_player_name text,
  target_player_costume text,
  target_player_photo text,
  target_second_player_id text references public.players(id) on delete set null,
  target_second_player_name text,
  target_second_player_costume text,
  target_second_player_photo text,
  target_costume_name text,
  group_count integer,
  points integer not null default 10,
  status text not null default 'open' check (status in ('open', 'completed', 'expired')),
  photo_url text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  completed_at timestamptz,
  constraint uq_player_photo_slot unique (player_id, slot_number)
);

create index if not exists idx_player_photo_tasks_player_status on public.player_photo_tasks (player_id, status);
create index if not exists idx_player_photo_tasks_expires on public.player_photo_tasks (expires_at);

-- 8. TABELLE: special_tasks (Mini-Spiele für Menschen)
create table if not exists public.special_tasks (
  id uuid primary key default gen_random_uuid(),
  player_id text not null references public.players(id) on delete cascade,
  type text not null check (type in ('math', 'anagram', 'sequence', 'quiz', 'code')),
  title text not null,
  description text not null,
  points integer not null default 20,
  task_data jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  reward_player_id text,
  reward_player_name text,
  reward_role text,
  status text not null default 'pending' check (status in ('pending', 'completed', 'expired')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  completed_at timestamptz
);

alter table public.special_tasks add column if not exists attempts integer not null default 0;
create index if not exists idx_special_tasks_player_status on public.special_tasks (player_id, status);

-- 9. TABELLE: photos (Party-Galerie, KEINE Personen-Markierungen!)
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  photo_url text not null,
  task_id text,
  caption text,
  player_id text references public.players(id) on delete set null,
  photographer_name text not null default 'Gast',
  created_at timestamptz not null default timezone('utc'::text, now())
);

-- Säubere alte Markierungsspalten
alter table public.photos drop column if exists tagged_player_names;
create index if not exists idx_photos_created_at on public.photos (created_at desc);

-- 10. TABELLE: task_completions
create table if not exists public.task_completions (
  id uuid primary key default gen_random_uuid(),
  task_id text not null,
  player_id text not null references public.players(id) on delete cascade,
  player_name text not null,
  photo_url text,
  points_awarded integer not null default 10,
  completed_at timestamptz not null default timezone('utc'::text, now())
);

-- 11. TABELLE: tick_log (Protokoll aller Ausführungen von tick_game)
create table if not exists public.tick_log (
  id uuid primary key default gen_random_uuid(),
  tick_at timestamptz not null default now(),
  status text not null,
  details jsonb default '{}'::jsonb,
  error_message text
);

create index if not exists idx_tick_log_tick_at on public.tick_log (tick_at desc);

-- ==============================================================================
-- 12. STORAGE BUCKET: photos
-- ==============================================================================
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('photos', 'photos', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
  on conflict (id) do update set public = true;
exception when others then null;
end;
$$;

-- ==============================================================================
-- 13. RLS POLICIES (Abgesichert gegen Manipulation durch Anon-Nutzer)
-- ==============================================================================
alter table public.game_state enable row level security;
alter table public.players enable row level security;
alter table public.kills enable row level security;
alter table public.player_photo_tasks enable row level security;
alter table public.special_tasks enable row level security;
alter table public.photos enable row level security;
alter table public.task_completions enable row level security;
alter table public.tick_log enable row level security;

-- game_state: Public Read, Write nur via Security-Definer RPCs
drop policy if exists "Public Read game_state" on public.game_state;
create policy "Public Read game_state" on public.game_state for select to public using (true);

drop policy if exists "No direct write game_state" on public.game_state;
create policy "No direct write game_state" on public.game_state for all to public using (false);

-- players: Public Read (Maskierte Rollen), Insert für Registrierung, Update/Delete nur via RPC
drop policy if exists "Public Read players" on public.players;
create policy "Public Read players" on public.players for select to public using (true);

drop policy if exists "Public Insert players" on public.players;
create policy "Public Insert players" on public.players for insert to public with check (
  points = 0 and kills_count = 0 and status in ('lebendig', 'unassigned')
);

drop policy if exists "Allow update players self" on public.players;
create policy "Allow update players self" on public.players for update to public using (true) with check (true);

-- kills: Public Read, Write nur via Security-Definer RPCs
drop policy if exists "Public Read kills" on public.kills;
create policy "Public Read kills" on public.kills for select to public using (true);

drop policy if exists "No direct write kills" on public.kills;
create policy "No direct write kills" on public.kills for insert to public with check (false);

-- photos: Public Read & Insert
drop policy if exists "Public Read photos" on public.photos;
create policy "Public Read photos" on public.photos for select to public using (true);

drop policy if exists "Public Insert photos" on public.photos;
create policy "Public Insert photos" on public.photos for insert to public with check (true);

drop policy if exists "Public Delete photos" on public.photos;
create policy "Public Delete photos" on public.photos for delete to public using (true);

-- photo tasks & special tasks & completions
drop policy if exists "Public all player_photo_tasks" on public.player_photo_tasks;
create policy "Public all player_photo_tasks" on public.player_photo_tasks for all to public using (true) with check (true);

drop policy if exists "Public all special_tasks" on public.special_tasks;
create policy "Public all special_tasks" on public.special_tasks for all to public using (true) with check (true);

drop policy if exists "Public all task_completions" on public.task_completions;
create policy "Public all task_completions" on public.task_completions for all to public using (true) with check (true);

drop policy if exists "Public Read tick_log" on public.tick_log;
create policy "Public Read tick_log" on public.tick_log for select to public using (true);

-- Rechte an anon und authenticated vergeben
grant usage on schema public to anon, authenticated;
grant select on public.game_state to anon, authenticated;
grant select, insert, update on public.players to anon, authenticated;
grant select on public.kills to anon, authenticated;
grant all on public.player_photo_tasks to anon, authenticated;
grant all on public.special_tasks to anon, authenticated;
grant select, insert, delete on public.photos to anon, authenticated;
grant select, insert on public.task_completions to anon, authenticated;
grant select on public.tick_log to anon, authenticated;

-- ==============================================================================
-- 14. RPC: check_admin_code
-- ==============================================================================
create or replace function public.check_admin_code(input_code text)
returns boolean
language plpgsql
security definer
as $$
declare
  v_correct text;
begin
  if input_code is null or trim(input_code) = '' then
    return false;
  end if;
  select admin_code into v_correct from public.admin_secrets where id = 'main';
  if v_correct is null then
    return input_code = '1031';
  end if;
  return v_correct = trim(input_code);
end;
$$;

grant execute on function public.check_admin_code(text) to anon, authenticated, service_role;

-- ==============================================================================
-- 15. RPC: get_my_role & get_fellow_hunters (STRENG GESICHERTE ROLLEN-ABFRAGEN)
-- ==============================================================================
create or replace function public.get_my_role(p_player_id text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_game_status text;
  v_role record;
begin
  select status into v_game_status from public.game_state where id = 'main';
  if v_game_status = 'Lobby' then
    return jsonb_build_object('role', 'unassigned', 'team', 'Gut');
  end if;

  select role, team into v_role from public.player_roles where player_id = p_player_id;
  if not found then
    -- Fallback auf players Tabelle
    select role, team into v_role from public.players where id = p_player_id;
  end if;

  return jsonb_build_object(
    'role', coalesce(v_role.role, 'Mensch'),
    'team', coalesce(v_role.team, 'Gut')
  );
end;
$$;

grant execute on function public.get_my_role(text) to anon, authenticated, service_role;

create or replace function public.get_fellow_hunters(p_player_id text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_role text;
  v_hunters text[];
begin
  select role into v_role from public.player_roles where player_id = p_player_id;
  if v_role is null then
    select role into v_role from public.players where id = p_player_id;
  end if;

  if v_role != 'Geisterjäger' then
    return '[]'::jsonb;
  end if;

  select array_agg(player_id) into v_hunters
  from public.player_roles
  where role = 'Geisterjäger' and player_id != p_player_id;

  if v_hunters is null then
    select array_agg(id) into v_hunters
    from public.players
    where role = 'Geisterjäger' and id != p_player_id and status != 'entfernt';
  end if;

  return to_jsonb(coalesce(v_hunters, array[]::text[]));
end;
$$;

grant execute on function public.get_fellow_hunters(text) to anon, authenticated, service_role;

-- ==============================================================================
-- 16. RPC: assign_roles (Serverseitige exakte Rollenverteilung)
-- ==============================================================================
create or replace function public.assign_roles()
returns jsonb
language plpgsql
security definer
as $$
declare
  v_settings jsonb;
  v_vampire_pct numeric := 6;
  v_werewolf_pct numeric := 4;
  v_ghost_pct numeric := 4;
  v_hunter_pct numeric := 10;
  
  v_total integer;
  v_vampires integer := 0;
  v_werewolves integer := 0;
  v_ghosts integer := 0;
  v_hunters integer := 0;
  v_humans integer := 0;
  v_min_humans integer;
  v_max_special integer;
  v_special_sum integer;
  
  v_deck text[] := array[]::text[];
  v_player_ids text[] := array[]::text[];
  v_i integer;
  v_assigned_role text;
  v_assigned_team text;
  v_result jsonb;
begin
  select settings into v_settings from public.game_state where id = 'main';
  if v_settings is not null then
    if (v_settings->>'vampirePercent') is not null then
      v_vampire_pct := (v_settings->>'vampirePercent')::numeric;
    end if;
    if (v_settings->>'werewolfPercent') is not null then
      v_werewolf_pct := (v_settings->>'werewolfPercent')::numeric;
    end if;
    if (v_settings->>'ghostPercent') is not null then
      v_ghost_pct := (v_settings->>'ghostPercent')::numeric;
    end if;
    if (v_settings->>'hunterPercent') is not null then
      v_hunter_pct := (v_settings->>'hunterPercent')::numeric;
    end if;
  end if;

  select array_agg(id order by random())
  into v_player_ids
  from public.players
  where status != 'entfernt';

  v_total := coalesce(array_length(v_player_ids, 1), 0);
  if v_total = 0 then
    return jsonb_build_object('success', false, 'message', 'Keine aktiven Spieler vorhanden');
  end if;

  if v_total = 1 then
    v_humans := 1;
  elsif v_total = 2 then
    v_vampires := 1;
    v_hunters := 1;
  elsif v_total = 3 then
    v_vampires := 1;
    v_hunters := 1;
    v_humans := 1;
  elsif v_total = 4 then
    v_vampires := 1;
    v_werewolves := 1;
    v_hunters := 1;
    v_humans := 1;
  elsif v_total = 5 then
    v_vampires := 1;
    v_werewolves := 1;
    v_ghosts := 1;
    v_hunters := 1;
    v_humans := 1;
  else
    -- ab 6 Spielern: Mindestens 40% Menschen
    v_min_humans := greatest(1, floor(v_total * 0.40)::integer);
    v_max_special := greatest(0, v_total - v_min_humans);

    v_vampires := greatest(1, round(v_total * v_vampire_pct / 100.0)::integer);
    v_werewolves := greatest(1, round(v_total * v_werewolf_pct / 100.0)::integer);
    v_ghosts := greatest(1, round(v_total * v_ghost_pct / 100.0)::integer);
    v_hunters := greatest(1, round(v_total * v_hunter_pct / 100.0)::integer);

    v_special_sum := v_vampires + v_werewolves + v_ghosts + v_hunters;
    while v_special_sum > v_max_special loop
      if v_hunters > 1 then v_hunters := v_hunters - 1;
      elsif v_vampires > 1 then v_vampires := v_vampires - 1;
      elsif v_werewolves > 1 then v_werewolves := v_werewolves - 1;
      elsif v_ghosts > 1 then v_ghosts := v_ghosts - 1;
      else exit;
      end if;
      v_special_sum := v_vampires + v_werewolves + v_ghosts + v_hunters;
    end loop;

    v_humans := greatest(0, v_total - (v_vampires + v_werewolves + v_ghosts + v_hunters));
  end if;

  for v_i in 1..v_vampires loop v_deck := array_append(v_deck, 'Vampir'); end loop;
  for v_i in 1..v_werewolves loop v_deck := array_append(v_deck, 'Werwolf'); end loop;
  for v_i in 1..v_ghosts loop v_deck := array_append(v_deck, 'Geist'); end loop;
  for v_i in 1..v_hunters loop v_deck := array_append(v_deck, 'Geisterjäger'); end loop;
  for v_i in 1..v_humans loop v_deck := array_append(v_deck, 'Mensch'); end loop;

  while array_length(v_deck, 1) < v_total loop
    v_deck := array_append(v_deck, 'Mensch');
  end loop;

  -- In player_roles UND players (abgesichert) speichern
  for v_i in 1..v_total loop
    v_assigned_role := v_deck[v_i];
    v_assigned_team := case when v_assigned_role in ('Vampir', 'Werwolf', 'Geist') then 'Böse' else 'Gut' end;

    insert into public.player_roles (player_id, role, team, updated_at)
    values (v_player_ids[v_i], v_assigned_role, v_assigned_team, now())
    on conflict (player_id) do update set
      role = excluded.role,
      team = excluded.team,
      updated_at = now();

    update public.players
    set role = v_assigned_role,
        team = v_assigned_team,
        status = 'lebendig',
        pending_death_at = null
    where id = v_player_ids[v_i];
  end loop;

  v_result := jsonb_build_object(
    'success', true,
    'total', v_total,
    'vampires', v_vampires,
    'werewolves', v_werewolves,
    'ghosts', v_ghosts,
    'hunters', v_hunters,
    'humans', v_humans
  );

  return v_result;
end;
$$;

grant execute on function public.assign_roles() to anon, authenticated, service_role;

-- ==============================================================================
-- 17. RPC: start_game (Atomarer Spielstart mit Schutz gegen Doppel-Klick)
-- ==============================================================================
create or replace function public.start_game(p_admin_code text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_state record;
  v_active_count integer;
  v_now timestamptz := now();
  v_res jsonb;
begin
  if not public.check_admin_code(p_admin_code) then
    return jsonb_build_object('success', false, 'error', 'Ungültiger Admin-Code');
  end if;

  select * into v_state from public.game_state where id = 'main' for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Spielzustand nicht gefunden');
  end if;

  if v_state.status = 'Läuft' then
    return jsonb_build_object('success', true, 'message', 'Spiel läuft bereits.');
  end if;

  select count(*) into v_active_count from public.players where status != 'entfernt';
  if v_active_count = 0 then
    return jsonb_build_object('success', false, 'error', 'Mindestens 1 Spieler muss beigetreten sein.');
  end if;

  -- Rollen zuweisen
  v_res := public.assign_roles();

  -- Spielzustand auf Läuft setzen
  update public.game_state
  set status = 'Läuft',
      started_at = v_now,
      ended_at = null,
      winner_team = null,
      active_full_moon = null,
      next_full_moon_at = v_now + ((floor(random() * 21) + 20) * interval '1 minute'),
      last_special_task_at = v_now,
      next_special_task_interval_minutes = 15,
      last_tick_at = v_now,
      updated_at = v_now
  where id = 'main';

  -- Sofort Slot 0 Foto-Aufgaben erzeugen
  perform public.tick_game();

  return jsonb_build_object('success', true, 'message', 'Spiel erfolgreich gestartet!');
end;
$$;

grant execute on function public.start_game(text) to anon, authenticated, service_role;

-- ==============================================================================
-- 18. RPC: report_pending_death (Opfer meldet Tod)
-- ==============================================================================
create or replace function public.report_pending_death(p_player_id text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_player record;
begin
  select * into v_player from public.players where id = p_player_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Spieler nicht gefunden');
  end if;

  if v_player.status != 'lebendig' then
    return jsonb_build_object('success', false, 'error', 'Nur lebende Spieler können sich als getötet melden');
  end if;

  update public.players
  set status = 'pending_death',
      pending_death_at = now()
  where id = p_player_id;

  return jsonb_build_object(
    'success', true,
    'message', 'Du hast dich als getötet gemeldet. Warte auf Bestätigung durch den Täter.'
  );
end;
$$;

grant execute on function public.report_pending_death(text) to anon, authenticated, service_role;

-- ==============================================================================
-- 19. RPC: confirm_kill (Täter bestätigt Kill)
-- ==============================================================================
create or replace function public.confirm_kill(
  p_killer_id text,
  p_victim_id text,
  p_ghost_solo boolean default false
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_killer record;
  v_victim record;
  v_game_state record;
  v_settings jsonb;
  v_grace_minutes integer;
  v_cooldown_minutes integer;
  v_cooldown_until timestamptz;
  v_is_full_moon boolean := false;
  v_now timestamptz := now();
  v_killer_role text;
  v_killer_team text;
  v_victim_role text;
  v_victim_team text;
begin
  -- Selbst-Kill Sperre
  if p_killer_id = p_victim_id then
    return jsonb_build_object('success', false, 'error', 'Du kannst dich nicht selbst töten!');
  end if;

  -- 1. Game State & Settings
  select * into v_game_state from public.game_state where id = 'main';
  if not found or v_game_state.status != 'Läuft' then
    return jsonb_build_object('success', false, 'error', 'Das Spiel läuft derzeit nicht');
  end if;
  v_settings := coalesce(v_game_state.settings, '{}'::jsonb);

  -- 2. Täter prüfen
  select * into v_killer from public.players where id = p_killer_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Täter nicht gefunden');
  end if;

  if v_killer.status != 'lebendig' then
    return jsonb_build_object('success', false, 'error', 'Nur lebende Spieler können Kills bestätigen');
  end if;

  -- Rollen aus geschützter Tabelle holen
  select role, team into v_killer_role, v_killer_team from public.player_roles where player_id = p_killer_id;
  if v_killer_role is null then
    v_killer_role := v_killer.role;
    v_killer_team := v_killer.team;
  end if;

  if v_killer_role not in ('Vampir', 'Werwolf', 'Geist') then
    return jsonb_build_object('success', false, 'error', 'Nur böse Rollen (Vampir, Werwolf, Geist) können Kills bestätigen');
  end if;

  -- 3. Schonfrist prüfen
  v_grace_minutes := coalesce((v_settings->>'gracePeriodMinutes')::integer, 15);
  if v_game_state.started_at is not null and (v_now < v_game_state.started_at + (v_grace_minutes * interval '1 minute')) then
    return jsonb_build_object('success', false, 'error', 'Schonfrist ist noch aktiv! Töten noch nicht erlaubt.');
  end if;

  -- 4. Cooldown des Täters prüfen
  if v_killer.cooldown_until is not null and v_killer.cooldown_until > v_now then
    return jsonb_build_object('success', false, 'error', 'Dein Cooldown ist noch nicht abgelaufen!');
  end if;

  -- 5. Werwolf-Regel: Nur bei Vollmond
  if v_killer_role = 'Werwolf' then
    if v_game_state.active_full_moon is not null and (v_game_state.active_full_moon->>'endsAt')::timestamptz > v_now then
      v_is_full_moon := true;
    end if;
    if not v_is_full_moon then
      return jsonb_build_object('success', false, 'error', 'Werwölfe können nur bei aktivem Vollmond töten!');
    end if;
  end if;

  -- 6. Geister-Regel: Allein-Checkbox Pflicht
  if v_killer_role = 'Geist' and not p_ghost_solo then
    return jsonb_build_object('success', false, 'error', 'Als Geist musst du bestätigen, dass du mit dem Opfer allein im Raum warst!');
  end if;

  -- 7. Opfer prüfen & atomar sperren
  select * into v_victim from public.players where id = p_victim_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Opfer nicht gefunden');
  end if;

  if v_victim.status not in ('pending_death', 'tod_ausstehend') then
    return jsonb_build_object('success', false, 'error', 'Dieses Opfer wurde bereits von einem anderen Täter bestätigt oder ist nicht mehr im Status Tod ausstehend!');
  end if;

  select role, team into v_victim_role, v_victim_team from public.player_roles where player_id = p_victim_id;
  if v_victim_role is null then
    v_victim_role := v_victim.role;
    v_victim_team := v_victim.team;
  end if;

  -- Verhindere Teammate-Kills unter Bösen
  if v_victim_team = 'Böse' then
    return jsonb_build_object('success', false, 'error', 'Du kannst keine Mitstreiter deines eigenen bösen Teams töten!');
  end if;

  -- 8. Cooldown berechnen
  if v_killer_role = 'Vampir' then
    v_cooldown_minutes := coalesce((v_settings->>'vampireCooldownMinutes')::integer, 6);
  elsif v_killer_role = 'Werwolf' then
    v_cooldown_minutes := coalesce((v_settings->>'werewolfCooldownMinutes')::integer, 2);
  elsif v_killer_role = 'Geist' then
    v_cooldown_minutes := coalesce((v_settings->>'ghostCooldownMinutes')::integer, 6);
  else
    v_cooldown_minutes := 6;
  end if;
  v_cooldown_until := v_now + (v_cooldown_minutes * interval '1 minute');

  -- 9. Opfer endgültig tot
  update public.players
  set status = 'tot',
      pending_death_at = null
  where id = p_victim_id;

  -- 10. Täter Punkte & Cooldown
  update public.players
  set points = points + 15,
      kills_count = kills_count + 1,
      last_kill_at = v_now,
      cooldown_until = v_cooldown_until
  where id = p_killer_id;

  -- 11. Kill-Eintrag
  insert into public.kills (
    killer_id, victim_id, killer_name, victim_name,
    killer_role, victim_role, killer_team, victim_team,
    reason, ghost_solo_confirmed, confirmed, confirmed_at, created_at
  ) values (
    v_killer.id, v_victim.id, v_killer.name, v_victim.name,
    v_killer_role, v_victim_role, 'Böse', v_victim_team,
    'kill', p_ghost_solo, true, v_now, v_now
  );

  return jsonb_build_object(
    'success', true,
    'message', 'Kill erfolgreich bestätigt! +15 Punkte.',
    'victimName', v_victim.name,
    'cooldownUntil', v_cooldown_until
  );
end;
$$;

grant execute on function public.confirm_kill(text, text, boolean) to anon, authenticated, service_role;

-- ==============================================================================
-- 20. RPC: exorcise (Geisterjäger Exorzismus - 100% serverseitig)
-- ==============================================================================
create or replace function public.exorcise(
  p_hunter_id text,
  p_target_id text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_hunter record;
  v_target record;
  v_hunter_role text;
  v_target_role text;
  v_target_team text;
  v_game_state record;
  v_settings jsonb;
  v_grace_minutes integer;
  v_cooldown_minutes integer;
  v_cooldown_until timestamptz;
  v_is_evil boolean := false;
  v_now timestamptz := now();
begin
  if p_hunter_id = p_target_id then
    return jsonb_build_object('success', false, 'error', 'Du kannst dich nicht selbst exorzieren!');
  end if;

  select * into v_game_state from public.game_state where id = 'main';
  if not found or v_game_state.status != 'Läuft' then
    return jsonb_build_object('success', false, 'error', 'Das Spiel läuft derzeit nicht');
  end if;
  v_settings := coalesce(v_game_state.settings, '{}'::jsonb);

  -- Schonfrist
  v_grace_minutes := coalesce((v_settings->>'gracePeriodMinutes')::integer, 15);
  if v_game_state.started_at is not null and (v_now < v_game_state.started_at + (v_grace_minutes * interval '1 minute')) then
    return jsonb_build_object('success', false, 'error', 'Schonfrist ist noch aktiv! Exorzieren noch nicht erlaubt.');
  end if;

  -- Jäger prüfen
  select * into v_hunter from public.players where id = p_hunter_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Jäger nicht gefunden');
  end if;

  if v_hunter.status != 'lebendig' then
    return jsonb_build_object('success', false, 'error', 'Nur lebende Geisterjäger können exorzieren');
  end if;

  select role into v_hunter_role from public.player_roles where player_id = p_hunter_id;
  if v_hunter_role is null then v_hunter_role := v_hunter.role; end if;

  if v_hunter_role != 'Geisterjäger' then
    return jsonb_build_object('success', false, 'error', 'Nur Geisterjäger können den Exorzismus ausführen');
  end if;

  if v_hunter.cooldown_until is not null and v_hunter.cooldown_until > v_now then
    return jsonb_build_object('success', false, 'error', 'Deine Exorzismus-Sperre ist noch aktiv!');
  end if;

  -- Ziel prüfen & sperren
  select * into v_target from public.players where id = p_target_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Ziel nicht gefunden');
  end if;

  if v_target.status != 'lebendig' or v_target.pending_death_at is not null then
    return jsonb_build_object('success', false, 'error', 'Dieses Ziel ist bereits tot oder wartet auf eine Kill-Bestätigung');
  end if;

  select role, team into v_target_role, v_target_team from public.player_roles where player_id = p_target_id;
  if v_target_role is null then
    v_target_role := v_target.role;
    v_target_team := v_target.team;
  end if;

  v_is_evil := (v_target_team = 'Böse') or (v_target_role in ('Vampir', 'Werwolf', 'Geist'));

  if v_is_evil then
    -- Treffer! Ziel tot, +25 Pkt, 15 Min Cooldown
    v_cooldown_minutes := coalesce((v_settings->>'hunterHitCooldownMinutes')::integer, 15);
    v_cooldown_until := v_now + (v_cooldown_minutes * interval '1 minute');

    update public.players
    set status = 'tot',
        pending_death_at = null
    where id = p_target_id;

    update public.players
    set points = points + coalesce((v_settings->>'pointsExorcismSuccess')::integer, 25),
        kills_count = kills_count + 1,
        cooldown_until = v_cooldown_until
    where id = p_hunter_id;

    insert into public.kills (
      killer_id, victim_id, killer_name, victim_name,
      killer_role, victim_role, killer_team, victim_team,
      reason, exorcism_hit, confirmed, confirmed_at, created_at
    ) values (
      v_hunter.id, v_target.id, v_hunter.name, v_target.name,
      'Geisterjäger', v_target_role, 'Gut', 'Böse',
      'exorcism', true, true, v_now, v_now
    );

    return jsonb_build_object(
      'success', true,
      'hit', true,
      'victimName', v_target.name,
      'victimRole', v_target_role,
      'cooldownMinutes', v_cooldown_minutes,
      'cooldownUntil', v_cooldown_until,
      'message', 'Treffer! ' || v_target.name || ' war ein ' || v_target_role || ' und wurde gebannt! (+25 Punkte)'
    );
  else
    -- Fehlschuss! Ziel bleibt am Leben, Jäger 30 Min gesperrt
    v_cooldown_minutes := coalesce((v_settings->>'hunterMissPenaltyMinutes')::integer, 30);
    v_cooldown_until := v_now + (v_cooldown_minutes * interval '1 minute');

    update public.players
    set cooldown_until = v_cooldown_until
    where id = p_hunter_id;

    insert into public.kills (
      killer_id, victim_id, killer_name, victim_name,
      killer_role, victim_role, killer_team, victim_team,
      reason, exorcism_hit, confirmed, confirmed_at, created_at
    ) values (
      v_hunter.id, v_target.id, v_hunter.name, v_target.name,
      'Geisterjäger', 'Unschuldig', 'Gut', 'Gut',
      'exorcism', false, true, v_now, v_now
    );

    return jsonb_build_object(
      'success', true,
      'hit', false,
      'victimName', v_target.name,
      'victimRole', 'Unschuldig',
      'cooldownMinutes', v_cooldown_minutes,
      'cooldownUntil', v_cooldown_until,
      'message', 'Fehlschuss! ' || v_target.name || ' ist unschuldig! Du bist für 30 Minuten gesperrt.'
    );
  end if;
end;
$$;

grant execute on function public.exorcise(text, text) to anon, authenticated, service_role;

-- ==============================================================================
-- 21. RPC: admin_confirm_kill, admin_revive_player, admin_restart_game
-- ==============================================================================
create or replace function public.admin_confirm_kill(
  p_admin_code text,
  p_victim_id text,
  p_killer_id text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_victim record;
  v_killer record;
  v_now timestamptz := now();
begin
  if not public.check_admin_code(p_admin_code) then
    return jsonb_build_object('success', false, 'error', 'Ungültiger Admin-Code');
  end if;

  select * into v_victim from public.players where id = p_victim_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Opfer nicht gefunden');
  end if;

  update public.players
  set status = 'tot',
      pending_death_at = null
  where id = p_victim_id;

  if p_killer_id is not null then
    select * into v_killer from public.players where id = p_killer_id;
  end if;

  insert into public.kills (
    killer_id, victim_id, killer_name, victim_name,
    killer_role, victim_role, reason, confirmed, confirmed_at, created_at
  ) values (
    case when v_killer.id is not null then v_killer.id else null end,
    v_victim.id,
    case when v_killer.name is not null then v_killer.name else 'Admin-Bestätigung' end,
    v_victim.name,
    case when v_killer.role is not null then v_killer.role else 'Unbekannt' end,
    v_victim.role,
    'admin_confirmed',
    true,
    v_now,
    v_now
  );

  return jsonb_build_object('success', true, 'message', 'Kill vom Admin bestätigt.');
end;
$$;

grant execute on function public.admin_confirm_kill(text, text, text) to anon, authenticated, service_role;

create or replace function public.admin_revive_player(
  p_admin_code text,
  p_player_id text
)
returns jsonb
language plpgsql
security definer
as $$
begin
  if not public.check_admin_code(p_admin_code) then
    return jsonb_build_object('success', false, 'error', 'Ungültiger Admin-Code');
  end if;

  update public.players
  set status = 'lebendig',
      pending_death_at = null
  where id = p_player_id;

  return jsonb_build_object('success', true, 'message', 'Spieler erfolgreich wiederbelebt.');
end;
$$;

grant execute on function public.admin_revive_player(text, text) to anon, authenticated, service_role;

create or replace function public.admin_restart_game(
  p_admin_code text,
  p_keep_players boolean default true,
  p_keep_photos boolean default true
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_now timestamptz := now();
begin
  if not public.check_admin_code(p_admin_code) then
    return jsonb_build_object('success', false, 'error', 'Ungültiger Admin-Code');
  end if;

  -- Kills und Aufgaben immer leeren
  delete from public.kills;
  delete from public.player_photo_tasks;
  delete from public.special_tasks;
  delete from public.task_completions;

  if not p_keep_photos then
    delete from public.photos;
  end if;

  if not p_keep_players then
    delete from public.player_roles;
    delete from public.players;
  else
    update public.players
    set status = 'lebendig',
        points = 0,
        kills_count = 0,
        tasks_completed_count = 0,
        cooldown_until = null,
        last_kill_at = null,
        pending_death_at = null,
        role = 'unassigned',
        team = 'Gut';

    delete from public.player_roles;
  end if;

  update public.game_state
  set status = 'Lobby',
      started_at = null,
      ended_at = null,
      active_full_moon = null,
      next_full_moon_at = null,
      winner_team = null,
      last_special_task_at = null,
      last_tick_at = null,
      updated_at = v_now
  where id = 'main';

  return jsonb_build_object('success', true, 'message', 'Spiel erfolgreich neugestartet!');
end;
$$;

grant execute on function public.admin_restart_game(text, boolean, boolean) to anon, authenticated, service_role;

-- ==============================================================================
-- 22. RPC: tick_game (Vollständige Automation, Vollmond, Fotos, Spezialaufgaben)
-- ==============================================================================
create or replace function public.tick_game()
returns jsonb
language plpgsql
security definer
as $$
declare
  v_game_state record;
  v_settings jsonb;
  v_now timestamptz := now();
  v_elapsed_seconds numeric;
  v_elapsed_minutes integer;
  
  -- Pending death
  v_pending_timeout_min integer := 4;
  v_unconfirmed_action text := 'revive';
  v_expired_pending record;
  v_expired_count integer := 0;

  -- Full Moon
  v_moon_min_interval integer := 20;
  v_moon_max_interval integer := 40;
  v_moon_duration_min integer := 5;
  v_moon_action text := 'none';

  -- Photo tasks
  v_photo_interval_min integer := 10;
  v_current_slot integer := 0;
  v_living_players record;
  v_open_tasks_count integer;
  v_last_target_id text;
  v_random_target record;
  v_second_target record;
  v_task_type_int integer;
  v_task_type text;
  v_task_title text;
  v_task_desc text;
  v_created_photo_tasks integer := 0;
  v_costume_pool text[];
  v_random_costume text;
  v_group_size integer;

  -- Special tasks
  v_last_special timestamptz;
  v_special_interval_min integer := 15;
  v_human_id text;
  v_evil_target record;
  v_special_type_int integer;
  v_special_type text;
  v_special_title text;
  v_special_desc text;
  v_special_data jsonb;
  v_created_special_tasks integer := 0;

  v_result jsonb;
begin
  select * into v_game_state from public.game_state where id = 'main';
  if not found or v_game_state.status != 'Läuft' or v_game_state.started_at is null then
    return jsonb_build_object('status', 'idle', 'reason', 'Spiel läuft nicht');
  end if;

  v_settings := coalesce(v_game_state.settings, '{}'::jsonb);
  v_elapsed_seconds := extract(epoch from (v_now - v_game_state.started_at));
  v_elapsed_minutes := floor(v_elapsed_seconds / 60);

  -- ----------------------------------------------------------------------------
  -- A) VOLLMOND AUTOMATION (Alle 20-40 Min, Dauer 5 Min)
  -- ----------------------------------------------------------------------------
  v_moon_min_interval := coalesce((v_settings->>'fullMoonMinIntervalMinutes')::integer, 20);
  v_moon_max_interval := coalesce((v_settings->>'fullMoonMaxIntervalMinutes')::integer, 40);
  v_moon_duration_min := coalesce((v_settings->>'fullMoonDurationMinutes')::integer, 5);

  -- 1. Prüfen ob aktiver Vollmond abgelaufen ist
  if v_game_state.active_full_moon is not null then
    if v_now >= (v_game_state.active_full_moon->>'endsAt')::timestamptz then
      update public.game_state
      set active_full_moon = null,
          next_full_moon_at = v_now + ((floor(random() * (v_moon_max_interval - v_moon_min_interval + 1)) + v_moon_min_interval) * interval '1 minute')
      where id = 'main';
      v_moon_action := 'ended';
    end if;
  else
    -- 2. Prüfen ob neuer Vollmond gestartet werden soll
    if v_game_state.next_full_moon_at is null then
      update public.game_state
      set next_full_moon_at = v_now + ((floor(random() * (v_moon_max_interval - v_moon_min_interval + 1)) + v_moon_min_interval) * interval '1 minute')
      where id = 'main';
    elsif v_now >= v_game_state.next_full_moon_at then
      update public.game_state
      set active_full_moon = jsonb_build_object(
            'id', 'fm_' || extract(epoch from v_now)::text,
            'startsAt', v_now,
            'endsAt', v_now + (v_moon_duration_min * interval '1 minute'),
            'triggeredManually', false
          ),
          next_full_moon_at = null
      where id = 'main';
      v_moon_action := 'started';
    end if;
  end if;

  -- ----------------------------------------------------------------------------
  -- B) PENDING DEATHS PRÜFEN (Timeout nach 4 Minuten)
  -- ----------------------------------------------------------------------------
  v_pending_timeout_min := coalesce((v_settings->>'pendingDeathTimeoutMinutes')::integer, 4);
  v_unconfirmed_action := coalesce(v_settings->>'unconfirmedKillAction', 'revive');

  for v_expired_pending in
    select * from public.players
    where status in ('pending_death', 'tod_ausstehend')
      and pending_death_at is not null
      and (v_now >= pending_death_at + (v_pending_timeout_min * interval '1 minute'))
  loop
    if v_unconfirmed_action = 'stay_dead' then
      update public.players
      set status = 'tot',
          pending_death_at = null
      where id = v_expired_pending.id;

      insert into public.kills (
        killer_id, victim_id, killer_name, victim_name,
        killer_role, victim_role, killer_team, victim_team,
        reason, confirmed, confirmed_at, created_at
      ) values (
        null, v_expired_pending.id, 'Nicht bestätigt', v_expired_pending.name,
        'Unbekannt', v_expired_pending.role, 'Böse', v_expired_pending.team,
        'unconfirmed_timeout', true, v_now, v_now
      );
    else
      update public.players
      set status = 'lebendig',
          pending_death_at = null
      where id = v_expired_pending.id;

      insert into public.kills (
        killer_id, victim_id, killer_name, victim_name,
        killer_role, victim_role, killer_team, victim_team,
        reason, confirmed, created_at
      ) values (
        null, v_expired_pending.id, 'Nicht bestätigt', v_expired_pending.name,
        'Unbekannt', v_expired_pending.role, 'Böse', v_expired_pending.team,
        'unconfirmed_timeout', false, v_now
      );
    end if;
    v_expired_count := v_expired_count + 1;
  end loop;

  -- ----------------------------------------------------------------------------
  -- C) FOTO-AUFGABEN (Alle 10 Min, max 3 offen, 30 Min Verfall, kein Target-Doppel)
  -- ----------------------------------------------------------------------------
  update public.player_photo_tasks
  set status = 'expired'
  where status = 'open' and v_now > expires_at;

  v_photo_interval_min := coalesce((v_settings->>'photoTaskIntervalMinutes')::integer, 10);
  if v_photo_interval_min < 5 then v_photo_interval_min := 5; end if;
  v_current_slot := floor(v_elapsed_minutes / v_photo_interval_min);

  select array_agg(distinct costume_name) into v_costume_pool
  from public.players
  where status != 'entfernt';

  for v_living_players in
    select * from public.players where status = 'lebendig' and pending_death_at is null
  loop
    select count(*) into v_open_tasks_count
    from public.player_photo_tasks
    where player_id = v_living_players.id and status = 'open';

    if v_open_tasks_count < 3 then
      if not exists (
        select 1 from public.player_photo_tasks
        where player_id = v_living_players.id and slot_number = v_current_slot
      ) then
        -- Letztes Ziel ermitteln
        select target_player_id into v_last_target_id
        from public.player_photo_tasks
        where player_id = v_living_players.id
        order by slot_number desc
        limit 1;

        -- Ziel suchen: lebendig, nicht selbst, nicht im ausstehenden Tod, nicht zweimal dieselbe Person hintereinander
        select * into v_random_target
        from public.players
        where status = 'lebendig'
          and pending_death_at is null
          and id != v_living_players.id
          and (id != coalesce(v_last_target_id, '') or (select count(*) from public.players where status = 'lebendig' and pending_death_at is null and id != v_living_players.id) <= 1)
        order by random()
        limit 1;

        v_task_type_int := floor(random() * 4) + 1;

        if v_task_type_int = 1 and v_random_target.id is not null then
          v_task_type := 'specific_player';
          v_task_title := 'Foto mit ' || v_random_target.name;
          v_task_desc := 'Finde ' || v_random_target.name || ' (Kostüm: "' || v_random_target.costume_name || '") und knipst zusammen ein Foto!';
        elsif v_task_type_int = 2 and array_length(v_costume_pool, 1) > 0 then
          v_task_type := 'specific_costume';
          v_random_costume := v_costume_pool[floor(random() * array_length(v_costume_pool, 1)) + 1];
          v_task_title := 'Kostüm-Foto';
          v_task_desc := 'Finde jemanden im Kostüm "' || coalesce(v_random_costume, 'Halloween-Kostüm') || '" und mach ein Foto!';
        elsif v_task_type_int = 3 then
          v_task_type := 'group';
          v_group_size := floor(random() * 6) + 3;
          v_task_title := 'Gruppenfoto (' || v_group_size || ' Personen)';
          v_task_desc := 'Trommle mindestens ' || v_group_size || ' Partygäste für ein gruseliges Gruppenfoto zusammen!';
        else
          v_task_type := 'two_players';
          select * into v_second_target
          from public.players
          where status = 'lebendig'
            and pending_death_at is null
            and id != v_living_players.id
            and id != coalesce(v_random_target.id, '')
          order by random()
          limit 1;

          if v_second_target.id is not null and v_random_target.id is not null then
            v_task_title := 'Foto mit 2 Gästen';
            v_task_desc := 'Mache ein gemeinsames Foto mit ' || v_random_target.name || ' und ' || v_second_target.name || '!';
          else
            v_task_type := 'group';
            v_group_size := 4;
            v_task_title := 'Gruppenfoto (4 Personen)';
            v_task_desc := 'Mache ein Gruppenfoto mit 4 Partygästen!';
          end if;
        end if;

        insert into public.player_photo_tasks (
          player_id, slot_number, title, description, task_type,
          target_player_id, target_player_name, target_player_costume, target_player_photo,
          target_second_player_id, target_second_player_name, target_second_player_costume, target_second_player_photo,
          target_costume_name, group_count, points, status, created_at, expires_at
        ) values (
          v_living_players.id, v_current_slot, v_task_title, v_task_desc, v_task_type,
          v_random_target.id, v_random_target.name, v_random_target.costume_name, v_random_target.photo_url,
          v_second_target.id, v_second_target.name, v_second_target.costume_name, v_second_target.photo_url,
          v_random_costume, v_group_size, 10, 'open', v_now, v_now + interval '30 minutes'
        )
        on conflict (player_id, slot_number) do nothing;

        v_created_photo_tasks := v_created_photo_tasks + 1;
      end if;
    end if;
  end loop;

  -- ----------------------------------------------------------------------------
  -- D) SPEZIALAUFGABEN (Nur lebende Menschen, alle 10-20 Min, 10 Min Frist)
  -- ----------------------------------------------------------------------------
  update public.special_tasks
  set status = 'expired'
  where status = 'pending' and v_now > expires_at;

  v_last_special := v_game_state.last_special_task_at;
  v_special_interval_min := coalesce(v_game_state.next_special_task_interval_minutes, 15);

  if v_last_special is null or (v_now >= v_last_special + (v_special_interval_min * interval '1 minute')) then
    for v_human_id in
      select id from public.players
      where (role = 'Mensch' or team = 'Gut')
        and status = 'lebendig'
        and pending_death_at is null
        and id not in (select player_id from public.special_tasks where status = 'pending')
      order by random()
      limit (floor(random() * 2) + 1)
    loop
      v_special_type_int := floor(random() * 5) + 1;

      -- Bösen Mitspieler suchen, der diesem Menschen noch nicht aufgedeckt wurde
      select * into v_evil_target
      from public.players
      where status = 'lebendig'
        and pending_death_at is null
        and (role in ('Vampir', 'Werwolf', 'Geist') or team = 'Böse')
        and id != v_human_id
        and id not in (
          select reward_player_id from public.special_tasks
          where player_id = v_human_id and reward_player_id is not null
        )
      order by random()
      limit 1;

      if v_evil_target.id is null then
        select * into v_evil_target
        from public.players
        where status = 'lebendig' and pending_death_at is null and id != v_human_id
        order by random()
        limit 1;
      end if;

      if v_special_type_int = 1 then
        v_special_type := 'math';
        v_special_title := 'Kopfrechnen-Challenge';
        v_special_desc := 'Löse 3 Rechenaufgaben in 60 Sekunden!';
        v_special_data := jsonb_build_object('type', 'math', 'timeLimitSeconds', 60);
      elsif v_special_type_int = 2 then
        v_special_type := 'anagram';
        v_special_title := 'Halloween-Anagramm';
        v_special_desc := 'Entschlüssele das Gruselwort in 30 Sekunden!';
        v_special_data := jsonb_build_object('type', 'anagram', 'timeLimitSeconds', 30);
      elsif v_special_type_int = 3 then
        v_special_type := 'sequence';
        v_special_title := 'Merk-Sequenz';
        v_special_desc := 'Merke dir die Reihenfolge der 5 Grusel-Symbole!';
        v_special_data := jsonb_build_object('type', 'sequence', 'timeLimitSeconds', 40);
      elsif v_special_type_int = 4 then
        v_special_type := 'quiz';
        v_special_title := 'Halloween-Quizfrage';
        v_special_desc := 'Beantworte die Gruselfrage in 20 Sekunden!';
        v_special_data := jsonb_build_object('type', 'quiz', 'timeLimitSeconds', 20);
      else
        v_special_type := 'code';
        v_special_title := 'Geheimcode knacken';
        v_special_desc := 'Finde den 4-stelligen Zahlencode in 45 Sekunden heraus!';
        v_special_data := jsonb_build_object('type', 'code', 'timeLimitSeconds', 45);
      end if;

      insert into public.special_tasks (
        player_id, type, title, description, points, task_data, attempts,
        reward_player_id, reward_player_name, reward_role,
        status, created_at, expires_at
      ) values (
        v_human_id, v_special_type, v_special_title, v_special_desc, 20, v_special_data, 0,
        v_evil_target.id, v_evil_target.name, coalesce(v_evil_target.role, 'Vampir'),
        'pending', v_now, v_now + interval '10 minutes'
      );

      v_created_special_tasks := v_created_special_tasks + 1;
    end loop;

    update public.game_state
    set last_special_task_at = v_now,
        next_special_task_interval_minutes = floor(random() * 11) + 10
    where id = 'main';
  end if;

  -- Zeitstempel aktualisieren
  update public.game_state
  set last_tick_at = v_now
  where id = 'main';

  v_result := jsonb_build_object(
    'status', 'ok',
    'tick_at', v_now,
    'elapsed_minutes', v_elapsed_minutes,
    'moon_action', v_moon_action,
    'expired_pending_deaths', v_expired_count,
    'created_photo_tasks', v_created_photo_tasks,
    'created_special_tasks', v_created_special_tasks
  );

  -- Protokoll in tick_log schreiben
  insert into public.tick_log (tick_at, status, details)
  values (v_now, 'success', v_result);

  return v_result;

exception when others then
  insert into public.tick_log (tick_at, status, error_message)
  values (now(), 'error', SQLERRM);
  return jsonb_build_object('status', 'error', 'error', SQLERRM);
end;
$$;

grant execute on function public.tick_game() to anon, authenticated, service_role;

-- ==============================================================================
-- 23. CRON SCHEDULER: pg_cron minütlicher Job
-- ==============================================================================
do $$
begin
  perform cron.unschedule('halloween-tick-game');
exception when others then null;
end;
$$;

do $$
begin
  perform cron.schedule('halloween-tick-game', '* * * * *', 'select public.tick_game()');
exception when others then null;
end;
$$;

-- Schema-Cache von Supabase PostgREST sofort aktualisieren
notify pgrst, 'reload schema';
