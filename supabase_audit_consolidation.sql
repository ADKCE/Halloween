-- ==============================================================================
-- HALLOWEEN PARTY SPIEL - MASTER AUDIT & DATENBANK-KONSOLIDIERUNG
-- Vollständig idempotent (mehrfach ausführbar, CREATE TABLE IF NOT EXISTS,
-- ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION).
-- Am Ende: NOTIFY pgrst, 'reload schema';
-- ==============================================================================

-- 1. EXTENSIONS
create extension if not exists "uuid-ossp";
create extension if not exists "pg_cron";

-- 2. SICHERER ADMIN-CODE STORE (Vor anonymem Zugriff geschützt)
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
  costume_name text not null default '',
  photo_url text not null default '',
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
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

-- Sicherstellen aller Spalten (insbes. pending_death_at!)
alter table public.players add column if not exists pending_death_at timestamptz;
alter table public.players add column if not exists is_test boolean not null default false;
alter table public.players add column if not exists cooldown_until timestamptz;
alter table public.players add column if not exists last_kill_at timestamptz;
alter table public.players add column if not exists kills_count integer not null default 0;
alter table public.players add column if not exists tasks_completed_count integer not null default 0;
alter table public.players add column if not exists updated_at timestamptz not null default timezone('utc'::text, now());

alter table public.players drop constraint if exists players_status_check;
alter table public.players add constraint players_status_check 
  check (status in ('lebendig', 'tot', 'pending_death', 'tod_ausstehend', 'entfernt', 'pausiert'));

create index if not exists idx_players_points on public.players (points desc);
create index if not exists idx_players_created_at on public.players (created_at asc);
create index if not exists idx_players_status on public.players (status);
create index if not exists idx_players_is_test on public.players (is_test);
create index if not exists idx_players_pending_death on public.players (pending_death_at);

-- 5. TABELLE: player_roles (STRENG VERTRAULICHE ROLLENTABELLE)
-- Verhindert Rollen-Leaks über Network-Tab und Anon-Keys!
create table if not exists public.player_roles (
  player_id text primary key references public.players(id) on delete cascade,
  role text not null,
  team text not null,
  updated_at timestamptz not null default now()
);

alter table public.player_roles enable row level security;
drop policy if exists "No public access to player_roles" on public.player_roles;
create policy "No public access to player_roles" on public.player_roles for all to public using (false);

-- 6. TABELLE: points_log (ANFORDERUNG 3: ZENTRALE PUNKTEBUCHUNG MIT UNIQUE CONSTRAINT)
create table if not exists public.points_log (
  id text primary key default gen_random_uuid()::text,
  player_id text not null references public.players(id) on delete cascade,
  reason text not null, -- 'photo_task', 'special_task', 'evil_kill', 'exorcism'
  amount integer not null,
  ref_id text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint uq_points_log_reason_ref unique (reason, ref_id)
);

create index if not exists idx_points_log_player on public.points_log (player_id, created_at desc);

-- 7. TABELLE: kills (Kill-Protokoll)
create table if not exists public.kills (
  id text primary key default gen_random_uuid()::text,
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

-- 8. TABELLE: player_photo_tasks (Foto-Aufgaben pro Spieler & Slot)
create table if not exists public.player_photo_tasks (
  id text primary key default gen_random_uuid()::text,
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

-- 9. TABELLE: special_tasks (Mini-Spiele für Menschen)
create table if not exists public.special_tasks (
  id text primary key default gen_random_uuid()::text,
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

-- 10. TABELLE: photos (Party-Galerie, KEINE Personen-Tags)
create table if not exists public.photos (
  id text primary key default gen_random_uuid()::text,
  photo_url text not null,
  task_id text,
  caption text,
  player_id text references public.players(id) on delete set null,
  photographer_name text not null default 'Gast',
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.photos drop column if exists tagged_player_names;
create index if not exists idx_photos_created_at on public.photos (created_at desc);

-- 11. TABELLE: task_completions
create table if not exists public.task_completions (
  id text primary key default gen_random_uuid()::text,
  task_id text not null,
  task_title text not null default '',
  player_id text not null references public.players(id) on delete cascade,
  player_name text not null,
  photo_url text,
  points_awarded integer not null default 10,
  completed_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.task_completions add column if not exists task_title text not null default '';
create index if not exists idx_task_completions_player on public.task_completions (player_id, completed_at desc);

-- 12. TABELLE: tick_log (Protokoll der pg_cron Ausführungen)
create table if not exists public.tick_log (
  id text primary key default gen_random_uuid()::text,
  tick_at timestamptz not null default now(),
  status text not null,
  details jsonb default '{}'::jsonb,
  error_message text
);

create index if not exists idx_tick_log_tick_at on public.tick_log (tick_at desc);

-- ==============================================================================
-- 13. STORAGE BUCKET: photos
-- ==============================================================================
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('photos', 'photos', true, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
  on conflict (id) do update set public = true;
exception when others then null;
end;
$$;

-- ==============================================================================
-- 14. RLS POLICIES
-- ==============================================================================
alter table public.game_state enable row level security;
alter table public.players enable row level security;
alter table public.kills enable row level security;
alter table public.player_photo_tasks enable row level security;
alter table public.special_tasks enable row level security;
alter table public.photos enable row level security;
alter table public.task_completions enable row level security;
alter table public.points_log enable row level security;
alter table public.tick_log enable row level security;

-- game_state
drop policy if exists "Public Read game_state" on public.game_state;
create policy "Public Read game_state" on public.game_state for select to public using (true);
drop policy if exists "No direct write game_state" on public.game_state;
create policy "No direct write game_state" on public.game_state for all to public using (false);

-- players
drop policy if exists "Public Read players" on public.players;
create policy "Public Read players" on public.players for select to public using (true);

drop policy if exists "Public Insert players" on public.players;
create policy "Public Insert players" on public.players for insert to public with check (
  points = 0 and kills_count = 0 and status in ('lebendig', 'unassigned')
);

drop policy if exists "Allow update players self" on public.players;
create policy "Allow update players self" on public.players for update to public using (true) with check (true);

-- kills
drop policy if exists "Public Read kills" on public.kills;
create policy "Public Read kills" on public.kills for select to public using (true);
drop policy if exists "No direct write kills" on public.kills;
create policy "No direct write kills" on public.kills for insert to public with check (false);

-- photos
drop policy if exists "Public Read photos" on public.photos;
create policy "Public Read photos" on public.photos for select to public using (true);
drop policy if exists "Public Insert photos" on public.photos;
create policy "Public Insert photos" on public.photos for insert to public with check (true);
drop policy if exists "Public Delete photos" on public.photos;
create policy "Public Delete photos" on public.photos for delete to public using (true);

-- tasks & completions & points_log
drop policy if exists "Public all player_photo_tasks" on public.player_photo_tasks;
create policy "Public all player_photo_tasks" on public.player_photo_tasks for all to public using (true) with check (true);

drop policy if exists "Public all special_tasks" on public.special_tasks;
create policy "Public all special_tasks" on public.special_tasks for all to public using (true) with check (true);

drop policy if exists "Public all task_completions" on public.task_completions;
create policy "Public all task_completions" on public.task_completions for all to public using (true) with check (true);

drop policy if exists "Public Read points_log" on public.points_log;
create policy "Public Read points_log" on public.points_log for select to public using (true);

drop policy if exists "Public Read tick_log" on public.tick_log;
create policy "Public Read tick_log" on public.tick_log for select to public using (true);

-- GRANTS
grant usage on schema public to anon, authenticated;
grant select on public.game_state to anon, authenticated;
grant select, insert, update on public.players to anon, authenticated;
grant select on public.kills to anon, authenticated;
grant all on public.player_photo_tasks to anon, authenticated;
grant all on public.special_tasks to anon, authenticated;
grant select, insert, delete on public.photos to anon, authenticated;
grant select, insert on public.task_completions to anon, authenticated;
grant select on public.points_log to anon, authenticated;
grant select on public.tick_log to anon, authenticated;

-- ==============================================================================
-- 15. RPC: check_admin_code
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
    return trim(input_code) = '1031';
  end if;
  return v_correct = trim(input_code);
end;
$$;
grant execute on function public.check_admin_code(text) to anon, authenticated, service_role;

-- ==============================================================================
-- 16. RPC: get_my_role & get_fellow_hunters
-- ==============================================================================
create or replace function public.get_my_role(p_player_id text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_role record;
  v_game_state record;
  v_player record;
begin
  select * into v_game_state from public.game_state where id = 'main';
  
  if v_game_state.status = 'Beendet' then
    select role, team into v_role from public.player_roles where player_id = p_player_id;
    if not found then
      select role, team into v_role from public.players where id = p_player_id;
    end if;
    return jsonb_build_object('role', coalesce(v_role.role, 'Unbekannt'), 'team', coalesce(v_role.team, 'Gut'));
  end if;

  select * into v_player from public.players where id = p_player_id;
  if not found then
    return jsonb_build_object('role', 'Unbekannt', 'team', 'Gut');
  end if;

  if v_player.status = 'tot' then
    select role, team into v_role from public.player_roles where player_id = p_player_id;
    if not found then
      select role, team into v_role from public.players where id = p_player_id;
    end if;
    return jsonb_build_object('role', coalesce(v_role.role, 'Unbekannt'), 'team', coalesce(v_role.team, 'Gut'));
  end if;

  select role, team into v_role from public.player_roles where player_id = p_player_id;
  if not found then
    select role, team into v_role from public.players where id = p_player_id;
  end if;

  return jsonb_build_object(
    'role', coalesce(v_role.role, 'unassigned'),
    'team', coalesce(v_role.team, 'Gut')
  );
end;
$$;
grant execute on function public.get_my_role(text) to anon, authenticated, service_role;

create or replace function public.get_fellow_hunters(p_player_id text)
returns table (
  player_id text
)
language plpgsql
security definer
as $$
declare
  v_caller_role text;
begin
  select role into v_caller_role from public.player_roles where player_roles.player_id = p_player_id;
  if v_caller_role is null then
    select role into v_caller_role from public.players where players.id = p_player_id;
  end if;

  if v_caller_role != 'Geisterjäger' then
    return;
  end if;

  return query
  select pr.player_id
  from public.player_roles pr
  where pr.role = 'Geisterjäger';
end;
$$;
grant execute on function public.get_fellow_hunters(text) to anon, authenticated, service_role;

-- ==============================================================================
-- 17. RPC: mark_self_dead & report_pending_death
-- ==============================================================================
create or replace function public.report_pending_death(p_player_id text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_player record;
  v_now timestamptz := now();
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
      pending_death_at = v_now,
      updated_at = v_now
  where id = p_player_id;

  return jsonb_build_object(
    'success', true,
    'message', 'Du hast dich als getötet gemeldet. Warte auf Bestätigung durch den Täter.'
  );
end;
$$;
grant execute on function public.report_pending_death(text) to anon, authenticated, service_role;

create or replace function public.mark_self_dead(p_player_id text)
returns jsonb
language plpgsql
security definer
as $$
begin
  return public.report_pending_death(p_player_id);
end;
$$;
grant execute on function public.mark_self_dead(text) to anon, authenticated, service_role;

-- ==============================================================================
-- 18. RPC: complete_task (ANFORDERUNG 2: ATOMARER AUFGABENABSCHLUSS MIT PUNKTE-LOG)
-- ==============================================================================
create or replace function public.complete_task(
  p_task_id text,
  p_player_id text,
  p_photo_url text,
  p_task_title text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_task record;
  v_player record;
  v_now timestamptz := now();
  v_points integer := 10;
  v_title text;
  v_new_points integer;
begin
  -- 1. Spieler sperren & prüfen
  select * into v_player
  from public.players
  where id = p_player_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Spieler nicht gefunden');
  end if;

  if v_player.status != 'lebendig' then
    return jsonb_build_object('success', false, 'error', 'Nur lebende Spieler können Aufgaben abschließen');
  end if;

  -- 2. Aufgabe in player_photo_tasks sperren
  select * into v_task
  from public.player_photo_tasks
  where id = p_task_id
  for update;

  if found then
    if v_task.player_id != p_player_id then
      return jsonb_build_object('success', false, 'error', 'Diese Aufgabe gehört einem anderen Spieler');
    end if;

    if v_task.status = 'completed' then
      -- Bereits erledigt: Idempotenter Erfolg ohne doppelte Punkte
      return jsonb_build_object(
        'success', true,
        'message', 'Aufgabe war bereits erledigt',
        'already_completed', true,
        'points_awarded', 0,
        'new_total_points', v_player.points
      );
    end if;

    if v_task.expires_at is not null and v_task.expires_at < v_now then
      update public.player_photo_tasks
      set status = 'expired'
      where id = v_task.id;
      return jsonb_build_object('success', false, 'error', 'Die Frist für diese Aufgabe ist abgelaufen!');
    end if;

    v_points := coalesce(v_task.points, 10);
    v_title := v_task.title;

    update public.player_photo_tasks
    set status = 'completed',
        completed_at = v_now,
        photo_url = p_photo_url
    where id = v_task.id;
  else
    -- Fallback für synthetische ID (z.B. initial_slot_0_...)
    v_title := coalesce(p_task_title, 'Foto-Aufgabe');
    begin
      insert into public.player_photo_tasks (
        id, player_id, slot_number, title, description, task_type,
        points, status, created_at, expires_at, completed_at, photo_url
      ) values (
        p_task_id, p_player_id, 0, v_title, v_title, 'group',
        v_points, 'completed', v_now, v_now + interval '30 minutes', v_now, p_photo_url
      );
    exception when others then
      null;
    end;
  end if;

  -- 3. Punkte atomar in points_log eintragen (Unique-Constraint uq_points_log_reason_ref verhindert Doppelklicks!)
  insert into public.points_log (player_id, reason, amount, ref_id, created_at)
  values (p_player_id, 'photo_task', v_points, p_task_id, v_now)
  on conflict (reason, ref_id) do nothing;

  -- 4. Spielerpunkte als Summe aus points_log berechnen
  select coalesce(sum(amount), 0) into v_new_points
  from public.points_log
  where player_id = p_player_id;

  update public.players
  set points = v_new_points,
      tasks_completed_count = coalesce(tasks_completed_count, 0) + 1,
      updated_at = v_now
  where id = p_player_id;

  -- 5. task_completions eintragen
  insert into public.task_completions (
    task_id, task_title, player_id, player_name, photo_url, points_awarded, completed_at
  ) values (
    p_task_id, v_title, p_player_id, v_player.name, p_photo_url, v_points, v_now
  );

  -- 6. In die Party-Galerie eintragen
  if p_photo_url is not null and p_photo_url != '' then
    insert into public.photos (
      photo_url, task_id, caption, player_id, photographer_name, created_at
    ) values (
      p_photo_url, p_task_id, v_title, p_player_id, v_player.name, v_now
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'message', 'Aufgabe erfolgreich abgeschlossen!',
    'points_awarded', v_points,
    'new_total_points', v_new_points,
    'task_id', p_task_id
  );
end;
$$;
grant execute on function public.complete_task(text, text, text, text) to anon, authenticated, service_role;

-- ==============================================================================
-- 19. RPC: reveal_random_role (ANFORDERUNG 1: Zufällige böse Rolle aufdecken)
-- ==============================================================================
create or replace function public.reveal_random_role(p_player_id text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_evil_target record;
  v_revealed_name text := 'Ein dunkler Schatten';
  v_revealed_role text := 'Vampir';
  v_revealed_id text := '';
  v_past_revealed text[];
begin
  -- Vorherige Enthüllungen dieses Spielers ermitteln, um Dopplungen zu vermeiden
  select array_agg(distinct reward_player_id) into v_past_revealed
  from public.special_tasks
  where player_id = p_player_id and status = 'completed' and reward_player_id is not null;

  -- 1. Unbekannte lebende Böse suchen
  select p.id, p.name, pr.role into v_evil_target
  from public.players p
  join public.player_roles pr on pr.player_id = p.id
  where p.id != p_player_id
    and p.status = 'lebendig'
    and pr.role in ('Vampir', 'Werwolf', 'Geist')
    and (v_past_revealed is null or not (p.id = any(v_past_revealed)))
  order by random()
  limit 1;

  -- 2. Falls alle schon bekannt, beliebigen bösen lebenden Spieler wählen
  if v_evil_target.id is null then
    select p.id, p.name, pr.role into v_evil_target
    from public.players p
    join public.player_roles pr on pr.player_id = p.id
    where p.id != p_player_id
      and p.status = 'lebendig'
      and pr.role in ('Vampir', 'Werwolf', 'Geist')
    order by random()
    limit 1;
  end if;

  -- 3. Fallback: beliebiger lebender Spieler falls keine Bösen mehr leben
  if v_evil_target.id is null then
    select p.id, p.name, coalesce(pr.role, p.role) as role into v_evil_target
    from public.players p
    left join public.player_roles pr on pr.player_id = p.id
    where p.id != p_player_id
      and p.status = 'lebendig'
    order by random()
    limit 1;
  end if;

  if v_evil_target.id is not null then
    v_revealed_id := v_evil_target.id;
    v_revealed_name := v_evil_target.name;
    v_revealed_role := v_evil_target.role;
  end if;

  return jsonb_build_object(
    'success', true,
    'reward_player_id', v_revealed_id,
    'reward_player_name', v_revealed_name,
    'reward_role', v_revealed_role
  );
end;
$$;
grant execute on function public.reveal_random_role(text) to anon, authenticated, service_role;

-- ==============================================================================
-- 20. RPC: confirm_kill (Täter bestätigt Kill + Punkte-Log)
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
  v_kill_id text := gen_random_uuid()::text;
  v_new_points integer;
begin
  if p_killer_id = p_victim_id then
    return jsonb_build_object('success', false, 'error', 'Du kannst dich nicht selbst töten!');
  end if;

  select * into v_game_state from public.game_state where id = 'main';
  if not found or v_game_state.status != 'Läuft' then
    return jsonb_build_object('success', false, 'error', 'Das Spiel läuft derzeit nicht');
  end if;
  v_settings := coalesce(v_game_state.settings, '{}'::jsonb);

  select * into v_killer from public.players where id = p_killer_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Täter nicht gefunden');
  end if;

  if v_killer.status != 'lebendig' then
    return jsonb_build_object('success', false, 'error', 'Nur lebende Spieler können Kills bestätigen');
  end if;

  select role, team into v_killer_role, v_killer_team from public.player_roles where player_id = p_killer_id;
  if v_killer_role is null then
    v_killer_role := v_killer.role;
    v_killer_team := v_killer.team;
  end if;

  if v_killer_role not in ('Vampir', 'Werwolf', 'Geist') then
    return jsonb_build_object('success', false, 'error', 'Nur böse Rollen (Vampir, Werwolf, Geist) können Kills bestätigen');
  end if;

  -- Schonfrist
  v_grace_minutes := coalesce((v_settings->>'gracePeriodMinutes')::integer, 15);
  if v_game_state.started_at is not null and (v_now < v_game_state.started_at + (v_grace_minutes * interval '1 minute')) then
    return jsonb_build_object('success', false, 'error', 'Schonfrist ist noch aktiv! Töten noch nicht erlaubt.');
  end if;

  -- Cooldown
  if v_killer.cooldown_until is not null and v_killer.cooldown_until > v_now then
    return jsonb_build_object('success', false, 'error', 'Dein Cooldown ist noch nicht abgelaufen!');
  end if;

  -- Werwolf Vollmond
  if v_killer_role = 'Werwolf' then
    if v_game_state.active_full_moon is not null and (v_game_state.active_full_moon->>'endsAt')::timestamptz > v_now then
      v_is_full_moon := true;
    end if;
    if not v_is_full_moon then
      return jsonb_build_object('success', false, 'error', 'Werwölfe können nur bei aktivem Vollmond töten!');
    end if;
  end if;

  -- Geist Allein-Pflicht
  if v_killer_role = 'Geist' and not p_ghost_solo then
    return jsonb_build_object('success', false, 'error', 'Als Geist musst du bestätigen, dass du mit dem Opfer allein im Raum warst!');
  end if;

  -- Opfer atomar sperren
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

  if v_victim_team = 'Böse' then
    return jsonb_build_object('success', false, 'error', 'Du kannst keine Mitstreiter deines eigenen bösen Teams töten!');
  end if;

  -- Cooldown berechnen
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

  -- Opfer endgültig tot
  update public.players
  set status = 'tot',
      pending_death_at = null,
      updated_at = v_now
  where id = p_victim_id;

  -- Kill-Eintrag
  insert into public.kills (
    id, killer_id, victim_id, killer_name, victim_name,
    killer_role, victim_role, killer_team, victim_team,
    reason, ghost_solo_confirmed, confirmed, confirmed_at, created_at
  ) values (
    v_kill_id, v_killer.id, v_victim.id, v_killer.name, v_victim.name,
    v_killer_role, v_victim_role, 'Böse', v_victim_team,
    'kill', p_ghost_solo, true, v_now, v_now
  );

  -- Punkte in points_log buchen
  insert into public.points_log (player_id, reason, amount, ref_id, created_at)
  values (p_killer_id, 'evil_kill', 15, v_kill_id, v_now)
  on conflict (reason, ref_id) do nothing;

  select coalesce(sum(amount), 0) into v_new_points
  from public.points_log
  where player_id = p_killer_id;

  -- Täter Punkte & Cooldown
  update public.players
  set points = v_new_points,
      kills_count = kills_count + 1,
      last_kill_at = v_now,
      cooldown_until = v_cooldown_until,
      updated_at = v_now
  where id = p_killer_id;

  return jsonb_build_object(
    'success', true,
    'message', 'Kill erfolgreich bestätigt! +15 Punkte.',
    'victimName', v_victim.name,
    'cooldownUntil', v_cooldown_until,
    'new_total_points', v_new_points
  );
end;
$$;
grant execute on function public.confirm_kill(text, text, boolean) to anon, authenticated, service_role;

-- ==============================================================================
-- 21. RPC: exorcise (Geisterjäger Exorzismus + Punkte-Log)
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
  v_kill_id text := gen_random_uuid()::text;
  v_new_points integer;
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
    -- Treffer!
    v_cooldown_minutes := coalesce((v_settings->>'hunterHitCooldownMinutes')::integer, 15);
    v_cooldown_until := v_now + (v_cooldown_minutes * interval '1 minute');

    update public.players
    set status = 'tot',
        pending_death_at = null,
        updated_at = v_now
    where id = p_target_id;

    insert into public.kills (
      id, killer_id, victim_id, killer_name, victim_name,
      killer_role, victim_role, killer_team, victim_team,
      reason, exorcism_hit, confirmed, confirmed_at, created_at
    ) values (
      v_kill_id, v_hunter.id, v_target.id, v_hunter.name, v_target.name,
      'Geisterjäger', v_target_role, 'Gut', 'Böse',
      'exorcism', true, true, v_now, v_now
    );

    insert into public.points_log (player_id, reason, amount, ref_id, created_at)
    values (p_hunter_id, 'exorcism', coalesce((v_settings->>'pointsExorcismSuccess')::integer, 25), v_kill_id, v_now)
    on conflict (reason, ref_id) do nothing;

    select coalesce(sum(amount), 0) into v_new_points
    from public.points_log
    where player_id = p_hunter_id;

    update public.players
    set points = v_new_points,
        kills_count = kills_count + 1,
        cooldown_until = v_cooldown_until,
        updated_at = v_now
    where id = p_hunter_id;

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
    -- Fehlschuss!
    v_cooldown_minutes := coalesce((v_settings->>'hunterMissPenaltyMinutes')::integer, 30);
    v_cooldown_until := v_now + (v_cooldown_minutes * interval '1 minute');

    update public.players
    set cooldown_until = v_cooldown_until,
        updated_at = v_now
    where id = p_hunter_id;

    insert into public.kills (
      id, killer_id, victim_id, killer_name, victim_name,
      killer_role, victim_role, killer_team, victim_team,
      reason, exorcism_hit, confirmed, confirmed_at, created_at
    ) values (
      v_kill_id, v_hunter.id, v_target.id, v_hunter.name, v_target.name,
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
-- 22. RPC: assign_roles (Rollenverteilung)
-- ==============================================================================
create or replace function public.assign_roles()
returns jsonb
language plpgsql
security definer
as $$
declare
  v_player_ids text[];
  v_total integer := 0;
  v_vampires integer := 0;
  v_werewolves integer := 0;
  v_ghosts integer := 0;
  v_hunters integer := 0;
  v_humans integer := 0;
  v_min_humans integer := 0;
  v_max_special integer := 0;
  v_special_sum integer := 0;
  v_deck text[] := array[]::text[];
  v_i integer;
  v_assigned_role text;
  v_assigned_team text;
  v_settings jsonb;
  v_vampire_pct numeric := 6;
  v_werewolf_pct numeric := 4;
  v_ghost_pct numeric := 4;
  v_hunter_pct numeric := 10;
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
        pending_death_at = null,
        updated_at = now()
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
-- 23. RPC: start_game
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

  v_res := public.assign_roles();

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

  perform public.tick_game();

  return jsonb_build_object('success', true, 'message', 'Spiel erfolgreich gestartet!');
end;
$$;
grant execute on function public.start_game(text) to anon, authenticated, service_role;

-- ==============================================================================
-- 24. RPC: tick_game
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

  -- A) VOLLMOND AUTOMATION
  v_moon_min_interval := coalesce((v_settings->>'fullMoonMinIntervalMinutes')::integer, 20);
  v_moon_max_interval := coalesce((v_settings->>'fullMoonMaxIntervalMinutes')::integer, 40);
  v_moon_duration_min := coalesce((v_settings->>'fullMoonDurationMinutes')::integer, 5);

  if v_game_state.active_full_moon is not null then
    if v_now >= (v_game_state.active_full_moon->>'endsAt')::timestamptz then
      update public.game_state
      set active_full_moon = null,
          next_full_moon_at = v_now + ((floor(random() * (v_moon_max_interval - v_moon_min_interval + 1)) + v_moon_min_interval) * interval '1 minute')
      where id = 'main';
      v_moon_action := 'ended';
    end if;
  else
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

  -- B) PENDING DEATHS PRÜFEN (Timeout nach 4 Minuten)
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
          pending_death_at = null,
          updated_at = v_now
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
          pending_death_at = null,
          updated_at = v_now
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

  -- C) FOTO-AUFGABEN (Status = expired nach 30 Min, neue Slots erzeugen)
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
        select target_player_id into v_last_target_id
        from public.player_photo_tasks
        where player_id = v_living_players.id
        order by slot_number desc
        limit 1;

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

  -- D) SPEZIALAUFGABEN (Für lebende Menschen, alle 10-20 Min)
  update public.special_tasks
  set status = 'expired'
  where status = 'pending' and v_now > expires_at;

  v_last_special := v_game_state.last_special_task_at;
  v_special_interval_min := coalesce(v_game_state.next_special_task_interval_minutes, 15);

  if v_last_special is null or (v_now >= v_last_special + (v_special_interval_min * interval '1 minute')) then
    for v_human_id in
      select p.id
      from public.players p
      left join public.player_roles pr on pr.player_id = p.id
      where p.status = 'lebendig'
        and p.pending_death_at is null
        and (coalesce(pr.role, p.role) = 'Mensch')
    loop
      if not exists (
        select 1 from public.special_tasks
        where player_id = v_human_id and status = 'pending' and expires_at > v_now
      ) then
        v_special_type_int := floor(random() * 5) + 1;
        if v_special_type_int = 1 then
          v_special_type := 'math';
          v_special_title := 'Kopfrechnen unter Zeitdruck';
          v_special_desc := 'Löse 3 Mathe-Aufgaben im Kopf innerhalb von 60 Sekunden!';
          v_special_data := jsonb_build_object('timeLimitSeconds', 60);
        elsif v_special_type_int = 2 then
          v_special_type := 'anagram';
          v_special_title := 'Halloween-Anagramm';
          v_special_desc := 'Bringe die durcheinandergewürfelten Buchstaben in die richtige Reihenfolge!';
          v_special_data := jsonb_build_object('timeLimitSeconds', 60);
        elsif v_special_type_int = 3 then
          v_special_type := 'sequence';
          v_special_title := 'Merk-Sequenz';
          v_special_desc := 'Präge dir die Halloween-Symbole ein und gib sie fehlerfrei wieder!';
          v_special_data := jsonb_build_object('timeLimitSeconds', 60);
        elsif v_special_type_int = 4 then
          v_special_type := 'quiz';
          v_special_title := 'Halloween-Horror-Quiz';
          v_special_desc := 'Beantworte die Schätzfrage oder das Grusel-Rätsel!';
          v_special_data := jsonb_build_object('timeLimitSeconds', 45);
        else
          v_special_type := 'code';
          v_special_title := 'Geheimcode knacken';
          v_special_desc := 'Entziffere den 4-stelligen Schloss-Code anhand der Hinweise!';
          v_special_data := jsonb_build_object('timeLimitSeconds', 45);
        end if;

        insert into public.special_tasks (
          player_id, type, title, description, points, task_data, status, created_at, expires_at
        ) values (
          v_human_id, v_special_type, v_special_title, v_special_desc, 20, v_special_data, 'pending', v_now, v_now + interval '10 minutes'
        );

        v_created_special_tasks := v_created_special_tasks + 1;
      end if;
    end loop;

    update public.game_state
    set last_special_task_at = v_now,
        next_special_task_interval_minutes = floor(random() * 11) + 10
    where id = 'main';
  end if;

  update public.game_state
  set last_tick_at = v_now,
      updated_at = v_now
  where id = 'main';

  v_result := jsonb_build_object(
    'status', 'success',
    'tick_at', v_now,
    'moon_action', v_moon_action,
    'expired_pending_count', v_expired_count,
    'created_photo_tasks', v_created_photo_tasks,
    'created_special_tasks', v_created_special_tasks
  );

  insert into public.tick_log (status, details)
  values ('success', v_result);

  return v_result;
exception when others then
  insert into public.tick_log (status, error_message)
  values ('error', SQLERRM);
  return jsonb_build_object('status', 'error', 'error', SQLERRM);
end;
$$;
grant execute on function public.tick_game() to anon, authenticated, service_role;

-- ==============================================================================
-- 25. RPC: admin_confirm_kill, admin_revive_player, admin_restart_game
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
  v_kill_id text := gen_random_uuid()::text;
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
      pending_death_at = null,
      updated_at = v_now
  where id = p_victim_id;

  if p_killer_id is not null then
    select * into v_killer from public.players where id = p_killer_id;
  end if;

  insert into public.kills (
    id, killer_id, victim_id, killer_name, victim_name,
    killer_role, victim_role, reason, confirmed, confirmed_at, created_at
  ) values (
    v_kill_id,
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
      pending_death_at = null,
      updated_at = now()
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

  delete from public.points_log;
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
        team = 'Gut',
        updated_at = v_now;

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
-- 26. CRON JOB: tick_game() jede Minute
-- ==============================================================================
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('halloween_tick_job');
    exception when others then null;
    end;

    perform cron.schedule(
      'halloween_tick_job',
      '* * * * *',
      'select public.tick_game();'
    );
  end if;
exception when others then null;
end;
$$;

-- ==============================================================================
-- 27. REALTIME PUBLICATION & SCHEMA CACHE RELOAD
-- ==============================================================================
do $$
begin
  alter publication supabase_realtime add table public.game_state;
  alter publication supabase_realtime add table public.players;
  alter publication supabase_realtime add table public.kills;
  alter publication supabase_realtime add table public.player_photo_tasks;
  alter publication supabase_realtime add table public.photos;
  alter publication supabase_realtime add table public.special_tasks;
  alter publication supabase_realtime add table public.points_log;
exception when others then null;
end;
$$;

-- PostgREST Schema-Cache sofort neu laden
notify pgrst, 'reload schema';
