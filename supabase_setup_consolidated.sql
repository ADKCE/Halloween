-- ==============================================================================
-- HALLOWEEN PARTY SPIEL - VOLLSTÄNDIGES MASTER SETUP SKRIPT
-- Für eine komplett leere oder bestehende Supabase-Datenbank.
-- Vollständig idempotent: Mehrfach ausführbar, ohne Duplikate oder Fehler.
-- ==============================================================================

-- ==============================================================================
-- 1. ERWEITERUNGEN
-- ==============================================================================
create extension if not exists "uuid-ossp";
create extension if not exists "pg_cron";
create extension if not exists "pg_net";

-- ==============================================================================
-- 2. TABELLEN IN ENDGÜLTIGER FORM (CONSTRAINTS, INDIZES & DEFAULTS)
-- ==============================================================================

-- 2.1 admin_secrets (Geschützter Speicher für den Admin-Code)
create table if not exists public.admin_secrets (
  id text primary key default 'main',
  admin_code text not null default '1031',
  updated_at timestamptz not null default timezone('utc'::text, now())
);

-- 2.2 game_state (Globaler Spielzustand & Konfiguration)
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
  end_reason text default null,
  initial_good_count integer not null default 0,
  initial_evil_count integer not null default 0,
  initial_hunter_count integer not null default 0,
  last_special_task_at timestamptz default null,
  next_special_task_interval_minutes integer default 15,
  last_tick_at timestamptz default null,
  reset_epoch integer not null default 1,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

-- 2.3 players (Öffentliche Spielerdaten)
create table if not exists public.players (
  id text primary key,
  name text not null,
  costume_name text not null default '',
  photo_url text not null default '',
  role text not null default 'unassigned',
  team text not null default 'Gut',
  status text not null default 'lebendig' check (status in ('lebendig', 'tot', 'pending_death', 'tod_ausstehend', 'entfernt')),
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

create index if not exists idx_players_points on public.players (points desc);
create index if not exists idx_players_created_at on public.players (created_at asc);
create index if not exists idx_players_status on public.players (status);
create index if not exists idx_players_is_test on public.players (is_test);
create index if not exists idx_players_pending_death on public.players (pending_death_at);

-- 2.4 player_roles (STRENG VERTRAULICHE ROLLEN - Verhindert Rollen-Leaks)
create table if not exists public.player_roles (
  player_id text primary key references public.players(id) on delete cascade,
  role text not null,
  team text not null,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

-- 2.5 points_log (ZENTRALE PUNKTEBUCHUNG MIT UNIQUE CONSTRAINT)
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

-- 2.6 kills (Morde & Exorzismen)
create table if not exists public.kills (
  id text primary key default gen_random_uuid()::text,
  killer_id text references public.players(id) on delete set null,
  victim_id text not null references public.players(id) on delete cascade,
  killer_name text not null,
  victim_name text not null,
  killer_role text not null default 'Unbekannt',
  victim_role text not null default 'Unbekannt',
  killer_team text not null default 'Böse',
  victim_team text not null default 'Gut',
  reason text not null default 'manual',
  exorcism_hit boolean default null,
  confirmed boolean not null default false,
  confirmed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_kills_killer on public.kills (killer_id);
create index if not exists idx_kills_victim on public.kills (victim_id);
create index if not exists idx_kills_created_at on public.kills (created_at desc);
create index if not exists idx_kills_confirmed on public.kills (confirmed);

-- 2.7 player_photo_tasks (Aufgaben pro Spieler & Slot)
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

-- 2.8 special_tasks (Mini-Spiele für menschliche Spieler)
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

create index if not exists idx_special_tasks_player_status on public.special_tasks (player_id, status);

-- 2.9 photos (Party-Galerie)
create table if not exists public.photos (
  id text primary key default gen_random_uuid()::text,
  photo_url text not null,
  task_id text,
  caption text,
  player_id text references public.players(id) on delete set null,
  photographer_name text not null default 'Gast',
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_photos_created_at on public.photos (created_at desc);
create index if not exists idx_photos_player on public.photos (player_id);

-- 2.10 task_completions (Historie der erledigten Foto-Aufgaben)
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

create index if not exists idx_task_completions_player on public.task_completions (player_id, completed_at desc);

-- 2.11 notifications (In-App Benachrichtigungen)
create table if not exists public.notifications (
  id text primary key default gen_random_uuid()::text,
  player_id text references public.players(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null default 'info',
  read boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_notifications_player_created on public.notifications (player_id, created_at desc);

-- 2.12 push_subscriptions (WebPush Endpunkte)
create table if not exists public.push_subscriptions (
  id text primary key default gen_random_uuid()::text,
  player_id text references public.players(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint uq_push_player_endpoint unique (player_id, endpoint)
);

create index if not exists idx_push_player on public.push_subscriptions (player_id);

-- 2.13 tick_log (Protokoll der periodischen Engine-Ticks)
create table if not exists public.tick_log (
  id text primary key default gen_random_uuid()::text,
  tick_at timestamptz not null default now(),
  status text not null,
  duration_ms integer not null default 0,
  details jsonb default '{}'::jsonb,
  error_message text
);

create index if not exists idx_tick_log_tick_at on public.tick_log (tick_at desc);

-- 2.14 client_errors (Zentrales Client-Crash & Fehler-Protokoll)
create table if not exists public.client_errors (
  id text primary key default gen_random_uuid()::text,
  player_id text,
  player_name text,
  error_message text not null,
  error_stack text,
  source text,
  user_agent text,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_client_errors_created_at on public.client_errors (created_at desc);

-- 2.15 win_check_log (Historie der automatischen Siegbedingungsprüfungen)
create table if not exists public.win_check_log (
  id text primary key default gen_random_uuid()::text,
  checked_at timestamptz not null default timezone('utc'::text, now()),
  trigger_action text not null,
  living_good integer not null default 0,
  dead_good integer not null default 0,
  living_evil integer not null default 0,
  dead_evil integer not null default 0,
  living_hunters integer not null default 0,
  dead_hunters integer not null default 0,
  initial_good integer not null default 0,
  initial_evil integer not null default 0,
  initial_hunters integer not null default 0,
  good_death_pct numeric(5,2) not null default 0,
  winner_team text default null,
  end_reason text default null
);

create index if not exists idx_win_check_log_checked_at on public.win_check_log (checked_at desc);

-- 2.15 task_pool (Vorlagen-Pool für Foto-Aufgaben)
create table if not exists public.task_pool (
  id text primary key,
  title text not null,
  description text not null,
  task_type text not null,
  required_count integer,
  created_at timestamptz not null default timezone('utc'::text, now())
);

-- 2.16 quiz_pool (Vorlagen-Pool für Halloween-Quizfragen)
create table if not exists public.quiz_pool (
  id text primary key,
  question text not null,
  options jsonb not null,
  correct_index integer not null,
  explanation text not null default '',
  created_at timestamptz not null default timezone('utc'::text, now())
);


-- ==============================================================================
-- 3. FUNKTIONEN (ALLE RPCS, ATOMARE SYSTEMPROZESSE & NOTFALL-ROUTINEN)
-- ==============================================================================

-- 3.1 check_admin_code
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
    select (settings->>'adminCode') into v_correct from public.game_state where id = 'main';
  end if;
  if v_correct is null then
    v_correct := '1031';
  end if;

  return trim(input_code) = trim(v_correct);
end;
$$;
grant execute on function public.check_admin_code(text) to anon, authenticated, service_role;

-- 3.2 server_now (Ermittelt Serverzeit gegen Handy-Uhrzeit-Drift)
create or replace function public.server_now()
returns timestamptz
language sql
security definer
stable
as $$
  select now();
$$;
grant execute on function public.server_now() to anon, authenticated, service_role;

-- 3.3 log_client_error (Logging für unhandledrejection / window.onerror)
create or replace function public.log_client_error(
  p_error_message text,
  p_player_id text default null,
  p_player_name text default null,
  p_error_stack text default null,
  p_source text default null,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.client_errors (
    player_id, player_name, error_message, error_stack, source, user_agent, created_at
  ) values (
    p_player_id, p_player_name, p_error_message, p_error_stack, p_source, p_user_agent, now()
  );
end;
$$;
grant execute on function public.log_client_error(text, text, text, text, text, text) to anon, authenticated, service_role;

-- 3.4 get_my_role (Sichere Rollenabfrage für den eingeloggten Spieler)
create or replace function public.get_my_role(p_player_id text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_game_state record;
  v_role record;
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

-- 3.5 get_fellow_hunters (Ermittelt Mit-Jäger für Geisterjäger-Team)
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

-- 3.6 admin_get_all_roles (Nur mit Admin-Code aufrufbar)
create or replace function public.admin_get_all_roles(p_admin_code text)
returns table (
  player_id text,
  player_name text,
  role text,
  team text,
  status text
)
language plpgsql
security definer
as $$
begin
  if not public.check_admin_code(p_admin_code) then
    raise exception 'Ungültiger Admin-Code';
  end if;

  return query
  select p.id, p.name, coalesce(pr.role, p.role), coalesce(pr.team, p.team), p.status
  from public.players p
  left join public.player_roles pr on pr.player_id = p.id;
end;
$$;
grant execute on function public.admin_get_all_roles(text) to anon, authenticated, service_role;

-- 3.7 mark_self_dead & report_pending_death
create or replace function public.mark_self_dead(p_player_id text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_player record;
  v_now timestamptz := now();
begin
  if not exists (select 1 from public.game_state where id = 'main' and status = 'Läuft') then
    return jsonb_build_object('success', false, 'error', 'Das Spiel läuft derzeit nicht oder ist beendet!');
  end if;

  select * into v_player from public.players where id = p_player_id for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Spieler nicht gefunden');
  end if;

  if v_player.status = 'tot' then
    return jsonb_build_object('success', false, 'error', 'Du bist bereits tot');
  end if;

  if v_player.status in ('pending_death', 'tod_ausstehend') then
    return jsonb_build_object('success', true, 'message', 'Tod ist bereits ausstehend');
  end if;

  update public.players
  set status = 'pending_death',
      pending_death_at = v_now,
      updated_at = v_now
  where id = p_player_id;

  return jsonb_build_object(
    'success', true,
    'message', 'Tod gemeldet. Warte auf Bestätigung durch den Täter...',
    'pending_death_at', v_now
  );
end;
$$;
grant execute on function public.mark_self_dead(text) to anon, authenticated, service_role;

create or replace function public.report_pending_death(p_player_id text)
returns jsonb
language plpgsql
security definer
as $$
begin
  return public.mark_self_dead(p_player_id);
end;
$$;
grant execute on function public.report_pending_death(text) to anon, authenticated, service_role;

-- 3.8 complete_task (Atomarer Aufgabenabschluss mit points_log Transaktion)
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
  if not exists (select 1 from public.game_state where id = 'main' and status = 'Läuft') then
    return jsonb_build_object('success', false, 'error', 'Das Spiel ist beendet oder läuft nicht!');
  end if;

  select * into v_player from public.players where id = p_player_id for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Spieler nicht gefunden');
  end if;

  if v_player.status != 'lebendig' then
    return jsonb_build_object('success', false, 'error', 'Nur lebende Spieler können Aufgaben abschließen');
  end if;

  select * into v_task from public.player_photo_tasks where id = p_task_id for update;

  if found then
    if v_task.player_id != p_player_id then
      return jsonb_build_object('success', false, 'error', 'Diese Aufgabe gehört einem anderen Spieler');
    end if;

    if v_task.status = 'completed' then
      return jsonb_build_object(
        'success', true,
        'message', 'Aufgabe war bereits erledigt',
        'already_completed', true,
        'points_awarded', 0,
        'new_total_points', v_player.points
      );
    end if;

    if v_task.expires_at is not null and v_task.expires_at < v_now then
      update public.player_photo_tasks set status = 'expired' where id = v_task.id;
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
    v_title := coalesce(p_task_title, 'Foto-Aufgabe');
    begin
      insert into public.player_photo_tasks (
        id, player_id, slot_number, title, description, task_type,
        points, status, created_at, expires_at, completed_at, photo_url
      ) values (
        p_task_id, p_player_id, 0, v_title, v_title, 'group',
        10, 'completed', v_now, v_now + interval '30 minutes', v_now, p_photo_url
      );
    exception when others then
      update public.player_photo_tasks
      set status = 'completed', completed_at = v_now, photo_url = p_photo_url
      where id = p_task_id;
    end;
    v_points := 10;
  end if;

  -- Points log idempotent eintragen
  begin
    insert into public.points_log (player_id, reason, amount, ref_id, created_at)
    values (p_player_id, 'photo_task', v_points, p_task_id, v_now);
  exception when unique_violation then
    return jsonb_build_object(
      'success', true,
      'message', 'Punkte wurden für diese Aufgabe bereits gutgeschrieben.',
      'already_completed', true,
      'points_awarded', 0,
      'new_total_points', v_player.points
    );
  end;

  select coalesce(sum(amount), 0) into v_new_points
  from public.points_log where player_id = p_player_id;

  update public.players
  set points = v_new_points,
      tasks_completed_count = tasks_completed_count + 1,
      updated_at = v_now
  where id = p_player_id;

  insert into public.task_completions (
    task_id, task_title, player_id, player_name, photo_url, points_awarded, completed_at
  ) values (
    p_task_id, v_title, p_player_id, v_player.name, p_photo_url, v_points, v_now
  );

  if p_photo_url is not null and trim(p_photo_url) != '' then
    insert into public.photos (photo_url, task_id, caption, player_id, photographer_name, created_at)
    values (p_photo_url, p_task_id, v_title, p_player_id, v_player.name, v_now);
  end if;

  return jsonb_build_object(
    'success', true,
    'message', 'Aufgabe erfolgreich abgeschlossen! +' || v_points || ' Punkte!',
    'points_awarded', v_points,
    'new_total_points', v_new_points
  );
end;
$$;
grant execute on function public.complete_task(text, text, text, text) to anon, authenticated, service_role;

-- 3.9 reveal_random_role (Zufällige böse Rolle bei Spezialaufgabe aufdecken)
create or replace function public.reveal_random_role(p_player_id text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_already_revealed_ids text[];
  v_evil_target record;
  v_any_target record;
begin
  select array_agg(reward_player_id) into v_already_revealed_ids
  from public.special_tasks
  where player_id = p_player_id and status = 'completed' and reward_player_id is not null;

  select p.id, p.name, coalesce(pr.role, p.role) as role, coalesce(pr.team, p.team) as team
  into v_evil_target
  from public.players p
  join public.player_roles pr on pr.player_id = p.id
  where p.id != p_player_id
    and p.status = 'lebendig'
    and pr.role in ('Vampir', 'Werwolf', 'Geist')
    and (v_already_revealed_ids is null or not (p.id = any(v_already_revealed_ids)))
  order by random()
  limit 1;

  if v_evil_target.id is not null then
    return jsonb_build_object(
      'success', true,
      'revealed', true,
      'playerId', v_evil_target.id,
      'playerName', v_evil_target.name,
      'role', v_evil_target.role,
      'team', v_evil_target.team
    );
  end if;

  select p.id, p.name, coalesce(pr.role, p.role) as role, coalesce(pr.team, p.team) as team
  into v_any_target
  from public.players p
  left join public.player_roles pr on pr.player_id = p.id
  where p.id != p_player_id and p.status = 'lebendig'
  order by random()
  limit 1;

  if v_any_target.id is not null then
    return jsonb_build_object(
      'success', true,
      'revealed', true,
      'playerId', v_any_target.id,
      'playerName', v_any_target.name,
      'role', v_any_target.role,
      'team', v_any_target.team
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'revealed', false,
    'message', 'Keine weiteren lebenden Spieler zum Aufdecken vorhanden.'
  );
end;
$$;
grant execute on function public.reveal_random_role(text) to anon, authenticated, service_role;

-- 3.10 confirm_kill (Böser Spieler bestätigt Opfer)
create or replace function public.confirm_kill(
  p_killer_id text,
  p_victim_id text,
  p_solo_witness_checked boolean default false
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_game_state record;
  v_settings jsonb;
  v_killer record;
  v_victim record;
  v_killer_role text;
  v_killer_team text;
  v_victim_role text;
  v_victim_team text;
  v_now timestamptz := now();
  v_kill_id text := gen_random_uuid()::text;
  v_cooldown_minutes integer := 6;
  v_cooldown_until timestamptz;
  v_grace_minutes integer := 15;
  v_points_kill integer := 15;
  v_new_points integer;
  v_is_full_moon boolean := false;
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
    return jsonb_build_object('success', false, 'error', 'Nur böse Rollen können Kills bestätigen');
  end if;

  v_grace_minutes := coalesce((v_settings->>'gracePeriodMinutes')::integer, 15);
  if v_game_state.started_at is not null and (v_now < v_game_state.started_at + (v_grace_minutes * interval '1 minute')) then
    return jsonb_build_object('success', false, 'error', 'Schonfrist ist noch aktiv! Töten noch nicht erlaubt.');
  end if;

  if v_killer.cooldown_until is not null and v_killer.cooldown_until > v_now then
    return jsonb_build_object('success', false, 'error', 'Dein Cooldown ist noch nicht abgelaufen!');
  end if;

  if v_killer_role = 'Werwolf' then
    if v_game_state.active_full_moon is not null and (v_game_state.active_full_moon->>'endsAt')::timestamptz > v_now then
      v_is_full_moon := true;
    end if;
    if not v_is_full_moon then
      return jsonb_build_object('success', false, 'error', 'Werwölfe können nur bei aktivem Vollmond töten!');
    end if;
  end if;

  if v_killer_role = 'Geist' and not p_solo_witness_checked then
    return jsonb_build_object('success', false, 'error', 'Geister müssen bestätigen, dass das Opfer zum Todeszeitpunkt völlig allein war!');
  end if;

  select * into v_victim from public.players where id = p_victim_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Opfer nicht gefunden');
  end if;

  if v_victim.status = 'tot' then
    return jsonb_build_object('success', false, 'error', 'Dieser Spieler ist bereits tot!');
  end if;

  select role, team into v_victim_role, v_victim_team from public.player_roles where player_id = p_victim_id;
  if v_victim_role is null then
    v_victim_role := v_victim.role;
    v_victim_team := v_victim.team;
  end if;

  if v_killer_role = 'Vampir' then
    v_cooldown_minutes := coalesce((v_settings->>'vampireCooldownMinutes')::integer, 6);
  elsif v_killer_role = 'Werwolf' then
    v_cooldown_minutes := coalesce((v_settings->>'werewolfCooldownMinutes')::integer, 2);
  else
    v_cooldown_minutes := coalesce((v_settings->>'ghostCooldownMinutes')::integer, 6);
  end if;
  v_cooldown_until := v_now + (v_cooldown_minutes * interval '1 minute');

  update public.players
  set status = 'tot',
      pending_death_at = null,
      role = coalesce(v_victim_role, 'Mensch'),
      updated_at = v_now
  where id = p_victim_id;

  v_points_kill := coalesce((v_settings->>'pointsEvilKill')::integer, 15);
  begin
    insert into public.points_log (player_id, reason, amount, ref_id, created_at)
    values (p_killer_id, 'evil_kill', v_points_kill, v_kill_id, v_now);
  exception when unique_violation then null;
  end;

  select coalesce(sum(amount), 0) into v_new_points
  from public.points_log where player_id = p_killer_id;

  update public.players
  set kills_count = kills_count + 1,
      points = v_new_points,
      last_kill_at = v_now,
      cooldown_until = v_cooldown_until,
      updated_at = v_now
  where id = p_killer_id;

  insert into public.kills (
    id, killer_id, victim_id, killer_name, victim_name,
    killer_role, victim_role, killer_team, victim_team,
    reason, confirmed, confirmed_at, created_at
  ) values (
    v_kill_id, v_killer.id, v_victim.id, v_killer.name, v_victim.name,
    v_killer_role, v_victim_role, v_killer_team, v_victim_team,
    'manual', true, v_now, v_now
  );

  return jsonb_build_object(
    'success', true,
    'message', 'Kill erfolgreich bestätigt! ' || v_victim.name || ' wurde eliminiert.',
    'victimName', v_victim.name,
    'cooldownMinutes', v_cooldown_minutes,
    'cooldownUntil', v_cooldown_until,
    'pointsAwarded', v_points_kill
  );
end;
$$;
grant execute on function public.confirm_kill(text, text, boolean) to anon, authenticated, service_role;

-- 3.11 exorcise (Geisterjäger bannt Spieler)
create or replace function public.exorcise(
  p_hunter_id text,
  p_target_id text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_game_state record;
  v_settings jsonb;
  v_hunter record;
  v_target record;
  v_hunter_role text;
  v_target_role text;
  v_target_team text;
  v_now timestamptz := now();
  v_cooldown_minutes integer;
  v_cooldown_until timestamptz;
  v_is_evil boolean := false;
  v_points_exorcism integer := 25;
  v_new_points integer;
  v_kill_id text := gen_random_uuid()::text;
begin
  if p_hunter_id = p_target_id then
    return jsonb_build_object('success', false, 'error', 'Du kannst dich nicht selbst bannen!');
  end if;

  select * into v_game_state from public.game_state where id = 'main';
  if not found or v_game_state.status != 'Läuft' then
    return jsonb_build_object('success', false, 'error', 'Das Spiel läuft derzeit nicht');
  end if;
  v_settings := coalesce(v_game_state.settings, '{}'::jsonb);

  select * into v_hunter from public.players where id = p_hunter_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Jäger nicht gefunden');
  end if;

  if v_hunter.status != 'lebendig' then
    return jsonb_build_object('success', false, 'error', 'Nur lebende Jäger können bannen');
  end if;

  select role into v_hunter_role from public.player_roles where player_id = p_hunter_id;
  if v_hunter_role is null then v_hunter_role := v_hunter.role; end if;

  if v_hunter_role != 'Geisterjäger' then
    return jsonb_build_object('success', false, 'error', 'Nur Geisterjäger können diesen Exorzismus durchführen');
  end if;

  if v_hunter.cooldown_until is not null and v_hunter.cooldown_until > v_now then
    return jsonb_build_object('success', false, 'error', 'Dein Bann-Cooldown ist noch nicht abgelaufen!');
  end if;

  select * into v_target from public.players where id = p_target_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Zielperson nicht gefunden');
  end if;

  if v_target.status = 'tot' then
    return jsonb_build_object('success', false, 'error', 'Diese Person ist bereits gebannt oder tot');
  end if;

  select role, team into v_target_role, v_target_team from public.player_roles where player_id = p_target_id;
  if v_target_role is null then
    v_target_role := v_target.role;
    v_target_team := v_target.team;
  end if;

  if v_target_role in ('Vampir', 'Werwolf', 'Geist') then
    v_is_evil := true;
  end if;

  if v_is_evil then
    v_cooldown_minutes := coalesce((v_settings->>'hunterHitCooldownMinutes')::integer, 15);
    v_cooldown_until := v_now + (v_cooldown_minutes * interval '1 minute');

    update public.players
    set status = 'tot',
        pending_death_at = null,
        role = v_target_role,
        updated_at = v_now
    where id = p_target_id;

    v_points_exorcism := coalesce((v_settings->>'pointsExorcismSuccess')::integer, 25);
    begin
      insert into public.points_log (player_id, reason, amount, ref_id, created_at)
      values (p_hunter_id, 'exorcism', v_points_exorcism, v_kill_id, v_now);
    exception when unique_violation then null;
    end;

    select coalesce(sum(amount), 0) into v_new_points
    from public.points_log where player_id = p_hunter_id;

    update public.players
    set kills_count = kills_count + 1,
      points = v_new_points,
      cooldown_until = v_cooldown_until,
      updated_at = v_now
    where id = p_hunter_id;

    insert into public.kills (
      id, killer_id, victim_id, killer_name, victim_name,
      killer_role, victim_role, killer_team, victim_team,
      reason, exorcism_hit, confirmed, confirmed_at, created_at
    ) values (
      v_kill_id, v_hunter.id, v_target.id, v_hunter.name, v_target.name,
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

-- 3.12 delete_photo
create or replace function public.delete_photo(
  p_photo_id text,
  p_player_id text default null,
  p_admin_code text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_photo record;
  v_is_admin boolean := false;
begin
  if p_admin_code is not null and public.check_admin_code(p_admin_code) then
    v_is_admin := true;
  end if;

  select * into v_photo from public.photos where id = p_photo_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Foto nicht gefunden');
  end if;

  if not v_is_admin then
    if p_player_id is null or v_photo.player_id != p_player_id then
      return jsonb_build_object('success', false, 'error', 'Keine Berechtigung zum Löschen dieses Fotos');
    end if;
  end if;

  delete from public.photos where id = p_photo_id;
  return jsonb_build_object('success', true, 'message', 'Foto erfolgreich gelöscht');
end;
$$;
grant execute on function public.delete_photo(text, text, text) to anon, authenticated, service_role;

-- 3.13 assign_roles (Rollenverteilung mit Geheimhaltung in player_roles)
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

  select array_agg(id order by random()) into v_player_ids
  from public.players
  where status != 'entfernt';

  v_total := coalesce(array_length(v_player_ids, 1), 0);

  if v_total = 0 then
    return jsonb_build_object('success', false, 'error', 'Keine registrierten Spieler vorhanden');
  end if;

  if v_total < 4 then
    v_vampires := 1;
    v_werewolves := 0;
    v_ghosts := 0;
    v_hunters := 1;
    v_humans := greatest(0, v_total - 2);
  else
    v_vampires := greatest(1, round(v_total * (v_vampire_pct / 100.0)));
    v_werewolves := greatest(1, round(v_total * (v_werewolf_pct / 100.0)));
    v_ghosts := greatest(1, round(v_total * (v_ghost_pct / 100.0)));
    v_hunters := greatest(1, round(v_total * (v_hunter_pct / 100.0)));

    while (v_vampires + v_werewolves + v_ghosts + v_hunters) > (v_total - 1) and (v_vampires + v_werewolves + v_ghosts + v_hunters) > 0 loop
      if v_hunters > 1 then v_hunters := v_hunters - 1;
      elsif v_ghosts > 1 then v_ghosts := v_ghosts - 1;
      elsif v_werewolves > 1 then v_werewolves := v_werewolves - 1;
      elsif v_vampires > 1 then v_vampires := v_vampires - 1;
      else exit;
      end if;
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

    -- Rolle geheim in player_roles speichern
    insert into public.player_roles (player_id, role, team, updated_at)
    values (v_player_ids[v_i], v_assigned_role, v_assigned_team, now())
    on conflict (player_id) do update set
      role = excluded.role,
      team = excluded.team,
      updated_at = now();

    -- In players bleibt die Rolle geheim ('unassigned'), damit kein Client schummeln kann
    update public.players
    set role = 'unassigned',
        team = 'Gut',
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

-- 3.14 check_win (Zentrale Siegbedingungs-Prüfung)
create or replace function public.check_win(p_trigger text default 'manual')
returns jsonb
language plpgsql
security definer
as $$
declare
  v_game_state record;
  v_living_good integer := 0;
  v_dead_good integer := 0;
  v_living_evil integer := 0;
  v_dead_evil integer := 0;
  v_living_hunters integer := 0;
  v_dead_hunters integer := 0;
  v_initial_good integer := 0;
  v_initial_evil integer := 0;
  v_initial_hunters integer := 0;
  v_good_death_pct numeric(5,2) := 0;
  v_winner text := null;
  v_reason text := null;
  v_now timestamptz := now();
  v_log_id text := gen_random_uuid()::text;
begin
  select * into v_game_state from public.game_state where id = 'main';
  if not found or v_game_state.status != 'Läuft' then
    return jsonb_build_object(
      'checked', false,
      'reason', 'game_not_running',
      'current_status', coalesce(v_game_state.status, 'unknown')
    );
  end if;

  select
    coalesce(count(*) filter (where coalesce(pr.team, p.team) = 'Gut' and p.status in ('lebendig', 'pending_death', 'tod_ausstehend')), 0),
    coalesce(count(*) filter (where coalesce(pr.team, p.team) = 'Gut' and p.status = 'tot'), 0),
    coalesce(count(*) filter (where coalesce(pr.team, p.team) = 'Böse' and p.status in ('lebendig', 'pending_death', 'tod_ausstehend')), 0),
    coalesce(count(*) filter (where coalesce(pr.team, p.team) = 'Böse' and p.status = 'tot'), 0),
    coalesce(count(*) filter (where coalesce(pr.role, p.role) = 'Geisterjäger' and p.status in ('lebendig', 'pending_death', 'tod_ausstehend')), 0),
    coalesce(count(*) filter (where coalesce(pr.role, p.role) = 'Geisterjäger' and p.status = 'tot'), 0)
  into
    v_living_good,
    v_dead_good,
    v_living_evil,
    v_dead_evil,
    v_living_hunters,
    v_dead_hunters
  from public.players p
  left join public.player_roles pr on pr.player_id = p.id
  where p.status != 'entfernt' and p.is_test = false;

  v_initial_good := coalesce(nullif(v_game_state.initial_good_count, 0), v_living_good + v_dead_good);
  v_initial_evil := coalesce(nullif(v_game_state.initial_evil_count, 0), v_living_evil + v_dead_evil);
  v_initial_hunters := coalesce(nullif(v_game_state.initial_hunter_count, 0), v_living_hunters + v_dead_hunters);

  if v_initial_good > 0 then
    v_good_death_pct := round(((v_initial_good - v_living_good)::numeric / v_initial_good::numeric) * 100.0, 2);
  else
    v_good_death_pct := 0;
  end if;

  if v_initial_evil > 0 and v_living_evil = 0 then
    v_winner := 'Gut';
    v_reason := 'all_evil_dead';
  elsif v_initial_hunters > 0 and v_living_hunters = 0 then
    v_winner := 'Böse';
    v_reason := 'all_hunters_dead';
  elsif v_initial_good > 0 and v_good_death_pct > 75.0 then
    v_winner := 'Böse';
    v_reason := 'good_75_percent_dead';
  end if;

  if v_winner is not null then
    update public.game_state
    set status = 'Beendet',
        winner_team = v_winner,
        end_reason = v_reason,
        ended_at = v_now,
        updated_at = v_now
    where id = 'main';

    insert into public.notifications (player_id, title, message, type, created_at)
    select id,
           'Spiel beendet! Team ' || v_winner || ' gewinnt!',
           case
             when v_reason = 'all_evil_dead' then 'Alle Kreaturen der Nacht (Vampire, Werwölfe, Geister) wurden vernichtet! Das Gute triumphiert.'
             when v_reason = 'all_hunters_dead' then 'Alle Geisterjäger wurden eliminiert. Die Mächte der Finsternis haben die Party übernommen!'
             when v_reason = 'good_75_percent_dead' then 'Mehr als 75% der Unschuldigen sind gefallen. Das Böse hat die absolute Mehrheit!'
             else 'Das Spiel wurde beendet! Team ' || v_winner || ' siegt.'
           end,
           'game_ended',
           v_now
    from public.players
    where status != 'entfernt' and is_test = false;
  end if;

  insert into public.win_check_log (
    id, checked_at, trigger_action,
    living_good, dead_good,
    living_evil, dead_evil,
    living_hunters, dead_hunters,
    initial_good, initial_evil, initial_hunters,
    good_death_pct, winner_team, end_reason
  ) values (
    v_log_id, v_now, p_trigger,
    v_living_good, v_dead_good,
    v_living_evil, v_dead_evil,
    v_living_hunters, v_dead_hunters,
    v_initial_good, v_initial_evil, v_initial_hunters,
    v_good_death_pct, v_winner, v_reason
  );

  return jsonb_build_object(
    'checked', true,
    'trigger', p_trigger,
    'winner', v_winner,
    'end_reason', v_reason,
    'living_good', v_living_good,
    'dead_good', v_dead_good,
    'living_evil', v_living_evil,
    'dead_evil', v_dead_evil,
    'living_hunters', v_living_hunters,
    'dead_hunters', v_dead_hunters,
    'initial_good', v_initial_good,
    'initial_evil', v_initial_evil,
    'initial_hunters', v_initial_hunters,
    'good_death_pct', v_good_death_pct
  );
end;
$$;
grant execute on function public.check_win(text) to anon, authenticated, service_role;

-- 3.15 start_game (Atomar mit Transaktion, Anfangszahlen & Idempotenz)
create or replace function public.start_game(p_admin_code text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_game_state record;
  v_player_ids text[];
  v_total integer := 0;
  v_vampires integer := 0;
  v_werewolves integer := 0;
  v_ghosts integer := 0;
  v_hunters integer := 0;
  v_humans integer := 0;
  v_deck text[] := array[]::text[];
  v_i integer;
  v_assigned_role text;
  v_assigned_team text;
  v_settings jsonb;
  v_vampire_pct numeric := 6;
  v_werewolf_pct numeric := 4;
  v_ghost_pct numeric := 4;
  v_hunter_pct numeric := 10;
  v_now timestamptz := now();
  v_initial_good integer := 0;
  v_initial_evil integer := 0;
  v_initial_hunter integer := 0;
begin
  if not public.check_admin_code(p_admin_code) then
    return jsonb_build_object('success', false, 'error', 'Ungültiger Admin-Code');
  end if;

  select * into v_game_state from public.game_state where id = 'main' for update;
  if v_game_state.status = 'Läuft' then
    return jsonb_build_object(
      'success', true,
      'already_started', true,
      'message', 'Das Spiel läuft bereits.'
    );
  end if;

  v_settings := coalesce(v_game_state.settings, '{}'::jsonb);
  if (v_settings->>'vampirePercent') is not null then v_vampire_pct := (v_settings->>'vampirePercent')::numeric; end if;
  if (v_settings->>'werewolfPercent') is not null then v_werewolf_pct := (v_settings->>'werewolfPercent')::numeric; end if;
  if (v_settings->>'ghostPercent') is not null then v_ghost_pct := (v_settings->>'ghostPercent')::numeric; end if;
  if (v_settings->>'hunterPercent') is not null then v_hunter_pct := (v_settings->>'hunterPercent')::numeric; end if;

  select array_agg(id order by random()) into v_player_ids
  from public.players
  where status != 'entfernt';

  v_total := coalesce(array_length(v_player_ids, 1), 0);
  if v_total = 0 then
    return jsonb_build_object('success', false, 'error', 'Keine registrierten Spieler in der Lobby vorhanden');
  end if;

  if v_total < 4 then
    v_vampires := 1;
    v_werewolves := 0;
    v_ghosts := 0;
    v_hunters := 1;
    v_humans := greatest(0, v_total - 2);
  else
    v_vampires := greatest(1, round(v_total * (v_vampire_pct / 100.0)));
    v_werewolves := greatest(1, round(v_total * (v_werewolf_pct / 100.0)));
    v_ghosts := greatest(1, round(v_total * (v_ghost_pct / 100.0)));
    v_hunters := greatest(1, round(v_total * (v_hunter_pct / 100.0)));

    while (v_vampires + v_werewolves + v_ghosts + v_hunters) > (v_total - 1) and (v_vampires + v_werewolves + v_ghosts + v_hunters) > 0 loop
      if v_hunters > 1 then v_hunters := v_hunters - 1;
      elsif v_ghosts > 1 then v_ghosts := v_ghosts - 1;
      elsif v_werewolves > 1 then v_werewolves := v_werewolves - 1;
      elsif v_vampires > 1 then v_vampires := v_vampires - 1;
      else exit;
      end if;
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
    values (v_player_ids[v_i], v_assigned_role, v_assigned_team, v_now)
    on conflict (player_id) do update set
      role = excluded.role,
      team = excluded.team,
      updated_at = excluded.updated_at;

    update public.players
    set role = 'unassigned',
        team = v_assigned_team,
        status = 'lebendig',
        points = 0,
        kills_count = 0,
        tasks_completed_count = 0,
        cooldown_until = null,
        pending_death_at = null,
        last_kill_at = null,
        updated_at = v_now
    where id = v_player_ids[v_i];
  end loop;

  v_initial_good := v_hunters + v_humans;
  v_initial_evil := v_vampires + v_werewolves + v_ghosts;
  v_initial_hunter := v_hunters;

  update public.game_state
  set status = 'Läuft',
      started_at = v_now,
      ended_at = null,
      winner_team = null,
      end_reason = null,
      initial_good_count = v_initial_good,
      initial_evil_count = v_initial_evil,
      initial_hunter_count = v_initial_hunter,
      active_full_moon = null,
      next_full_moon_at = v_now + ((floor(random() * 21) + 20) * interval '1 minute'),
      last_special_task_at = v_now,
      next_special_task_interval_minutes = 15,
      last_tick_at = v_now,
      updated_at = v_now
  where id = 'main';

  insert into public.notifications (player_id, title, message, type, created_at)
  select id,
         'Das Spiel hat begonnen!',
         'Deine geheime Rolle wurde dir zugeteilt. Finde heraus, wer du bist und erfülle deine Mission!',
         'game_started',
         v_now
  from public.players
  where status != 'entfernt';

  perform public.check_win('game_start');

  return jsonb_build_object(
    'success', true,
    'message', 'Spiel erfolgreich gestartet! Alle Rollen wurden atomar zugeteilt.',
    'total', v_total,
    'vampires', v_vampires,
    'werewolves', v_werewolves,
    'ghosts', v_ghosts,
    'hunters', v_hunters,
    'humans', v_humans,
    'initial_good', v_initial_good,
    'initial_evil', v_initial_evil
  );
end;
$$;
grant execute on function public.start_game(text) to anon, authenticated, service_role;

-- 3.16 ensure_my_role(p_player_id text)
create or replace function public.ensure_my_role(p_player_id text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_game_state record;
  v_player record;
  v_existing_role record;
  v_role text;
  v_team text;
  v_settings jsonb;
  v_good_count integer := 0;
  v_evil_count integer := 0;
  v_hunter_count integer := 0;
  v_total_count integer := 0;
  v_vampire_pct numeric := 6;
  v_werewolf_pct numeric := 4;
  v_ghost_pct numeric := 4;
  v_hunter_pct numeric := 10;
  v_now timestamptz := now();
begin
  select * into v_game_state from public.game_state where id = 'main';
  if not found then
    return jsonb_build_object('success', false, 'error', 'Spielzustand nicht gefunden');
  end if;

  select * into v_player from public.players where id = p_player_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Spieler nicht gefunden');
  end if;

  if v_game_state.status = 'Lobby' then
    return jsonb_build_object(
      'success', true,
      'role', 'unassigned',
      'team', 'Gut',
      'assigned', false,
      'status', 'Lobby'
    );
  end if;

  select * into v_existing_role from public.player_roles where player_id = p_player_id;
  if found and v_existing_role.role is not null and v_existing_role.role not in ('unassigned', 'Unbekannt') then
    return jsonb_build_object(
      'success', true,
      'role', v_existing_role.role,
      'team', v_existing_role.team,
      'assigned', false
    );
  end if;

  v_settings := coalesce(v_game_state.settings, '{}'::jsonb);
  if (v_settings->>'vampirePercent') is not null then v_vampire_pct := (v_settings->>'vampirePercent')::numeric; end if;
  if (v_settings->>'werewolfPercent') is not null then v_werewolf_pct := (v_settings->>'werewolfPercent')::numeric; end if;
  if (v_settings->>'ghostPercent') is not null then v_ghost_pct := (v_settings->>'ghostPercent')::numeric; end if;
  if (v_settings->>'hunterPercent') is not null then v_hunter_pct := (v_settings->>'hunterPercent')::numeric; end if;

  select
    coalesce(count(*) filter (where coalesce(pr.team, p.team) = 'Gut'), 0),
    coalesce(count(*) filter (where coalesce(pr.team, p.team) = 'Böse'), 0),
    coalesce(count(*) filter (where coalesce(pr.role, p.role) = 'Geisterjäger'), 0),
    coalesce(count(*), 0)
  into
    v_good_count,
    v_evil_count,
    v_hunter_count,
    v_total_count
  from public.players p
  left join public.player_roles pr on pr.player_id = p.id
  where p.status != 'entfernt';

  if v_evil_count = 0 or (v_total_count > 0 and (v_evil_count::numeric / v_total_count::numeric) < ((v_vampire_pct + v_werewolf_pct + v_ghost_pct) / 100.0)) then
    if not exists (select 1 from public.player_roles pr join public.players p on p.id = pr.player_id where pr.role = 'Vampir' and p.status != 'entfernt') then
      v_role := 'Vampir';
    elsif not exists (select 1 from public.player_roles pr join public.players p on p.id = pr.player_id where pr.role = 'Werwolf' and p.status != 'entfernt') then
      v_role := 'Werwolf';
    elsif not exists (select 1 from public.player_roles pr join public.players p on p.id = pr.player_id where pr.role = 'Geist' and p.status != 'entfernt') then
      v_role := 'Geist';
    else
      v_role := (array['Vampir', 'Werwolf', 'Geist'])[floor(random() * 3 + 1)];
    end if;
    v_team := 'Böse';
  elsif v_hunter_count = 0 or (v_total_count > 0 and (v_hunter_count::numeric / v_total_count::numeric) < (v_hunter_pct / 100.0)) then
    v_role := 'Geisterjäger';
    v_team := 'Gut';
  else
    v_role := 'Mensch';
    v_team := 'Gut';
  end if;

  insert into public.player_roles (player_id, role, team, updated_at)
  values (p_player_id, v_role, v_team, v_now)
  on conflict (player_id) do update set
    role = excluded.role,
    team = excluded.team,
    updated_at = excluded.updated_at;

  update public.players
  set team = v_team,
      role = 'unassigned',
      updated_at = v_now
  where id = p_player_id;

  if v_team = 'Gut' then
    update public.game_state set initial_good_count = initial_good_count + 1 where id = 'main';
    if v_role = 'Geisterjäger' then
      update public.game_state set initial_hunter_count = initial_hunter_count + 1 where id = 'main';
    end if;
  else
    update public.game_state set initial_evil_count = initial_evil_count + 1 where id = 'main';
  end if;

  perform public.check_win('ensure_role');

  return jsonb_build_object(
    'success', true,
    'role', v_role,
    'team', v_team,
    'assigned', true,
    'message', 'Rolle erfolgreich nachverteilt'
  );
end;
$$;
grant execute on function public.ensure_my_role(text) to anon, authenticated, service_role;

-- 3.17 assign_missing_roles(p_admin_code text)
create or replace function public.assign_missing_roles(p_admin_code text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_unassigned record;
  v_count integer := 0;
  v_res jsonb;
begin
  if not public.check_admin_code(p_admin_code) then
    return jsonb_build_object('success', false, 'error', 'Ungültiger Admin-Code');
  end if;

  for v_unassigned in
    select p.id
    from public.players p
    left join public.player_roles pr on pr.player_id = p.id
    where p.status != 'entfernt'
      and (pr.role is null or pr.role in ('unassigned', 'Unbekannt'))
  loop
    v_res := public.ensure_my_role(v_unassigned.id);
    if (v_res->>'success')::boolean then
      v_count := v_count + 1;
    end if;
  end loop;

  perform public.check_win('assign_missing_roles');

  return jsonb_build_object(
    'success', true,
    'message', v_count || ' fehlende Rolle(n) erfolgreich zugewiesen.',
    'assigned_count', v_count
  );
end;
$$;
grant execute on function public.assign_missing_roles(text) to anon, authenticated, service_role;


-- 3.15 expire_pending_deaths (Timeout nach 4 Minuten, idempotent & sicher)
create or replace function public.expire_pending_deaths()
returns jsonb
language plpgsql
security definer
as $$
declare
  v_game_state record;
  v_settings jsonb;
  v_pending_timeout_min integer := 4;
  v_unconfirmed_action text := 'revive';
  v_now timestamptz := now();
  v_expired_count integer := 0;
  v_expired_pending record;
begin
  select * into v_game_state from public.game_state where id = 'main';
  if not found or v_game_state.status != 'Läuft' then
    return jsonb_build_object('success', true, 'expired_count', 0, 'message', 'Spiel läuft nicht');
  end if;

  v_settings := coalesce(v_game_state.settings, '{}'::jsonb);
  v_pending_timeout_min := coalesce((v_settings->>'pendingDeathTimeoutMinutes')::integer, 4);
  v_unconfirmed_action := coalesce(v_settings->>'unconfirmedKillAction', 'revive');

  for v_expired_pending in
    select * from public.players
    where status in ('pending_death', 'tod_ausstehend')
      and pending_death_at is not null
      and (v_now >= pending_death_at + (v_pending_timeout_min * interval '1 minute'))
    for update skip locked
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

  return jsonb_build_object('success', true, 'expired_count', v_expired_count);
end;
$$;
grant execute on function public.expire_pending_deaths() to anon, authenticated, service_role;

-- 3.16 tick_game (Mit isolierten Teil-Aufgaben & Logging)
create or replace function public.tick_game()
returns jsonb
language plpgsql
security definer
as $$
declare
  v_start_time timestamptz := clock_timestamp();
  v_now timestamptz := now();
  v_game_state record;
  v_settings jsonb;
  v_elapsed_seconds numeric;
  v_elapsed_minutes integer;
  
  v_sub_errors text[] := array[]::text[];
  v_moon_action text := 'none';
  v_expired_count integer := 0;
  v_created_photo_tasks integer := 0;
  v_created_special_tasks integer := 0;
  v_duration_ms integer := 0;
  v_result jsonb;

  -- Variables Vollmond
  v_moon_min_interval integer;
  v_moon_max_interval integer;
  v_moon_duration_min integer;

  -- Variables Foto-Aufgaben
  v_photo_interval_min integer;
  v_current_slot integer;
  v_living_players record;
  v_open_tasks_count integer;
  v_last_target_id text;
  v_random_target record;
  v_second_target record;
  v_task_type_int integer;
  v_task_type text;
  v_task_title text;
  v_task_desc text;
  v_costume_pool text[];
  v_random_costume text;
  v_group_size integer;

  -- Variables Spezialaufgaben
  v_last_special timestamptz;
  v_special_interval_min integer;
  v_human_id text;
  v_special_type_int integer;
  v_special_type text;
  v_special_title text;
  v_special_desc text;
  v_special_data jsonb;
begin
  select * into v_game_state from public.game_state where id = 'main';
  if not found or v_game_state.status != 'Läuft' or v_game_state.started_at is null then
    v_duration_ms := round(extract(epoch from (clock_timestamp() - v_start_time)) * 1000);
    return jsonb_build_object('status', 'idle', 'reason', 'Spiel läuft nicht', 'duration_ms', v_duration_ms);
  end if;

  v_settings := coalesce(v_game_state.settings, '{}'::jsonb);
  v_elapsed_seconds := extract(epoch from (v_now - v_game_state.started_at));
  v_elapsed_minutes := floor(v_elapsed_seconds / 60);

  -- SUB-TASK 1: VOLLMOND AUTOMATION (Isoliert)
  begin
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
  exception when others then
    v_sub_errors := array_append(v_sub_errors, 'moon: ' || SQLERRM);
  end;

  -- SUB-TASK 2: AUSSTEHENDE TODE ABLAUFEN LASSEN (Isoliert)
  begin
    declare
      v_res_exp jsonb;
    begin
      v_res_exp := public.expire_pending_deaths();
      v_expired_count := coalesce((v_res_exp->>'expired_count')::integer, 0);
    end;
  exception when others then
    v_sub_errors := array_append(v_sub_errors, 'pending_deaths: ' || SQLERRM);
  end;

  -- SUB-TASK 3: FOTO-AUFGABEN VERTEILEN (Isoliert)
  begin
    update public.player_photo_tasks
    set status = 'expired'
    where status = 'open' and v_now > expires_at;

    v_photo_interval_min := coalesce((v_settings->>'photoTaskIntervalMinutes')::integer, 10);
    if v_photo_interval_min < 5 then v_photo_interval_min := 5; end if;
    v_current_slot := floor(v_elapsed_minutes / v_photo_interval_min);

    select array_agg(distinct costume_name) into v_costume_pool
    from public.players
    where status != 'entfernt' and costume_name is not null and trim(costume_name) != '';

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
          elsif v_task_type_int = 2 and v_costume_pool is not null and array_length(v_costume_pool, 1) > 0 then
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
  exception when others then
    v_sub_errors := array_append(v_sub_errors, 'photo_tasks: ' || SQLERRM);
  end;

  -- SUB-TASK 4: SPEZIALAUFGABEN VERTEILEN (Isoliert)
  begin
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
  exception when others then
    v_sub_errors := array_append(v_sub_errors, 'special_tasks: ' || SQLERRM);
  end;

  update public.game_state
  set last_tick_at = v_now,
      updated_at = v_now
  where id = 'main';

  v_duration_ms := round(extract(epoch from (clock_timestamp() - v_start_time)) * 1000);

  v_result := jsonb_build_object(
    'status', case when array_length(v_sub_errors, 1) > 0 then 'partial_error' else 'success' end,
    'tick_at', v_now,
    'duration_ms', v_duration_ms,
    'moon_action', v_moon_action,
    'expired_pending_count', v_expired_count,
    'created_photo_tasks', v_created_photo_tasks,
    'created_special_tasks', v_created_special_tasks,
    'sub_errors', to_jsonb(v_sub_errors)
  );

  insert into public.tick_log (status, duration_ms, details, error_message)
  values (
    case when array_length(v_sub_errors, 1) > 0 then 'partial_error' else 'success' end,
    v_duration_ms,
    v_result,
    case when array_length(v_sub_errors, 1) > 0 then array_to_string(v_sub_errors, '; ') else null end
  );

  return v_result;
exception when others then
  v_duration_ms := round(extract(epoch from (clock_timestamp() - v_start_time)) * 1000);
  insert into public.tick_log (status, duration_ms, error_message)
  values ('error', v_duration_ms, SQLERRM);
  return jsonb_build_object('status', 'error', 'duration_ms', v_duration_ms, 'error', SQLERRM);
end;
$$;
grant execute on function public.tick_game() to anon, authenticated, service_role;

-- 3.17 admin_confirm_kill
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

-- 3.18 admin_revive_player
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

-- 3.19 admin_clear_pending_deaths
create or replace function public.admin_clear_pending_deaths(p_admin_code text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_cleared_count integer := 0;
begin
  if not public.check_admin_code(p_admin_code) then
    return jsonb_build_object('success', false, 'error', 'Ungültiger Admin-Code');
  end if;

  update public.players
  set status = 'lebendig',
      pending_death_at = null,
      updated_at = now()
  where status in ('pending_death', 'tod_ausstehend') or pending_death_at is not null;

  get diagnostics v_cleared_count = row_count;

  return jsonb_build_object('success', true, 'cleared_count', v_cleared_count, 'message', v_cleared_count || ' ausstehende Tode aufgehoben.');
end;
$$;
grant execute on function public.admin_clear_pending_deaths(text) to anon, authenticated, service_role;

-- 3.20 admin_set_player_status
create or replace function public.admin_set_player_status(
  p_admin_code text,
  p_player_id text,
  p_new_status text
)
returns jsonb
language plpgsql
security definer
as $$
begin
  if not public.check_admin_code(p_admin_code) then
    return jsonb_build_object('success', false, 'error', 'Ungültiger Admin-Code');
  end if;

  if p_new_status not in ('lebendig', 'tot', 'pending_death', 'entfernt') then
    return jsonb_build_object('success', false, 'error', 'Ungültiger Status: ' || coalesce(p_new_status, 'null'));
  end if;

  update public.players
  set status = p_new_status,
      pending_death_at = case when p_new_status = 'pending_death' then coalesce(pending_death_at, now()) else null end,
      updated_at = now()
  where id = p_player_id;

  return jsonb_build_object('success', true, 'message', 'Spieler-Status auf "' || p_new_status || '" gesetzt.');
end;
$$;
grant execute on function public.admin_set_player_status(text, text, text) to anon, authenticated, service_role;

-- 3.21 admin_repair_game_state
create or replace function public.admin_repair_game_state(p_admin_code text)
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

  insert into public.game_state (id, status, reset_epoch)
  values ('main', 'Lobby', 1)
  on conflict (id) do update
  set updated_at = v_now;

  update public.game_state
  set status = case when status in ('Lobby', 'Läuft', 'Beendet') then status else 'Lobby' end,
      reset_epoch = coalesce(reset_epoch, 1),
      updated_at = v_now
  where id = 'main';

  return jsonb_build_object('success', true, 'message', 'Spielstatus erfolgreich geprüft und repariert.');
end;
$$;
grant execute on function public.admin_repair_game_state(text) to anon, authenticated, service_role;

-- 3.22 admin_reset_all_cooldowns
create or replace function public.admin_reset_all_cooldowns(p_admin_code text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_affected integer := 0;
begin
  if not public.check_admin_code(p_admin_code) then
    return jsonb_build_object('success', false, 'error', 'Ungültiger Admin-Code');
  end if;

  update public.players
  set cooldown_until = null,
      last_kill_at = null,
      updated_at = now();

  get diagnostics v_affected = row_count;

  return jsonb_build_object('success', true, 'affected_players', v_affected, 'message', 'Cooldowns für ' || v_affected || ' Spieler zurückgesetzt.');
end;
$$;
grant execute on function public.admin_reset_all_cooldowns(text) to anon, authenticated, service_role;

-- 3.23 admin_restart_game
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
      reset_epoch = coalesce(reset_epoch, 0) + 1,
      updated_at = v_now
  where id = 'main';

  return jsonb_build_object('success', true, 'message', 'Spiel erfolgreich neugestartet!');
end;
$$;
grant execute on function public.admin_restart_game(text, boolean, boolean) to anon, authenticated, service_role;

-- 3.24 reset_game_full (Kompletter Hard-Reset aller Spielerdaten)
create or replace function public.reset_game_full(p_admin_code text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_now timestamptz := now();
  v_new_epoch integer := 1;
begin
  if not public.check_admin_code(p_admin_code) then
    return jsonb_build_object('success', false, 'error', 'Ungültiger Admin-Code');
  end if;

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

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'notifications') then
    execute 'delete from public.notifications;';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'push_subscriptions') then
    execute 'delete from public.push_subscriptions;';
  end if;

  begin
    delete from storage.objects where bucket_id = 'photos';
  exception when others then null;
  end;

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
      updated_at = v_now
  where id = 'main'
  returning reset_epoch into v_new_epoch;

  return jsonb_build_object(
    'success', true,
    'message', 'Kompletter Reset erfolgreich. Alle Spieler wurden gelöscht.',
    'reset_epoch', v_new_epoch
  );
end;
$$;
grant execute on function public.reset_game_full(text) to anon, authenticated, service_role;

-- 3.25 admin_reopen_game (Status zurück auf 'Läuft', ohne Daten zu löschen)
create or replace function public.admin_reopen_game(p_admin_code text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_game_state record;
begin
  if not public.check_admin_code(p_admin_code) then
    return jsonb_build_object('success', false, 'error', 'Ungültiger Admin-Code');
  end if;

  select * into v_game_state from public.game_state where id = 'main';
  if not found then
    return jsonb_build_object('success', false, 'error', 'Spielstatus nicht gefunden');
  end if;

  update public.game_state
  set status = 'Läuft',
      ended_at = null,
      winner_team = null,
      updated_at = now()
  where id = 'main';

  return jsonb_build_object('success', true, 'message', 'Spiel wurde erfolgreich wieder geöffnet (Status: Läuft)!');
end;
$$;
grant execute on function public.admin_reopen_game(text) to anon, authenticated, service_role;


-- ==============================================================================
-- 4. ROW LEVEL SECURITY (GENAU EINE SAUBERE POLICY PRO TABELLE & AKTION)
-- ==============================================================================

-- 4.1 admin_secrets (RLS: Völlig isoliert vor öffentlichem Zugriff)
alter table public.admin_secrets enable row level security;
drop policy if exists "admin_secrets_no_public_access" on public.admin_secrets;
create policy "admin_secrets_no_public_access" on public.admin_secrets for all to public using (false);

-- 4.2 player_roles (RLS: Geheime Rollen nicht direkt lesbar für Clients)
alter table public.player_roles enable row level security;
drop policy if exists "player_roles_no_public_access" on public.player_roles;
create policy "player_roles_no_public_access" on public.player_roles for all to public using (false);

-- 4.3 game_state
alter table public.game_state enable row level security;
drop policy if exists "game_state_select_policy" on public.game_state;
create policy "game_state_select_policy" on public.game_state for select to public using (true);

drop policy if exists "game_state_update_policy" on public.game_state;
create policy "game_state_update_policy" on public.game_state for update to public using (true) with check (true);

drop policy if exists "game_state_insert_policy" on public.game_state;
create policy "game_state_insert_policy" on public.game_state for insert to public with check (true);

-- 4.4 players
alter table public.players enable row level security;
drop policy if exists "players_select_policy" on public.players;
create policy "players_select_policy" on public.players for select to public using (true);

drop policy if exists "players_insert_policy" on public.players;
create policy "players_insert_policy" on public.players for insert to public with check (true);

drop policy if exists "players_update_policy" on public.players;
create policy "players_update_policy" on public.players for update to public using (true) with check (true);

drop policy if exists "players_delete_policy" on public.players;
create policy "players_delete_policy" on public.players for delete to public using (true);

-- 4.5 kills
alter table public.kills enable row level security;
drop policy if exists "kills_select_policy" on public.kills;
create policy "kills_select_policy" on public.kills for select to public using (true);

drop policy if exists "kills_insert_policy" on public.kills;
create policy "kills_insert_policy" on public.kills for insert to public with check (true);

drop policy if exists "kills_update_policy" on public.kills;
create policy "kills_update_policy" on public.kills for update to public using (true) with check (true);

drop policy if exists "kills_delete_policy" on public.kills;
create policy "kills_delete_policy" on public.kills for delete to public using (true);

-- 4.6 player_photo_tasks
alter table public.player_photo_tasks enable row level security;
drop policy if exists "player_photo_tasks_select_policy" on public.player_photo_tasks;
create policy "player_photo_tasks_select_policy" on public.player_photo_tasks for select to public using (true);

drop policy if exists "player_photo_tasks_insert_policy" on public.player_photo_tasks;
create policy "player_photo_tasks_insert_policy" on public.player_photo_tasks for insert to public with check (true);

drop policy if exists "player_photo_tasks_update_policy" on public.player_photo_tasks;
create policy "player_photo_tasks_update_policy" on public.player_photo_tasks for update to public using (true) with check (true);

drop policy if exists "player_photo_tasks_delete_policy" on public.player_photo_tasks;
create policy "player_photo_tasks_delete_policy" on public.player_photo_tasks for delete to public using (true);

-- 4.7 special_tasks
alter table public.special_tasks enable row level security;
drop policy if exists "special_tasks_select_policy" on public.special_tasks;
create policy "special_tasks_select_policy" on public.special_tasks for select to public using (true);

drop policy if exists "special_tasks_insert_policy" on public.special_tasks;
create policy "special_tasks_insert_policy" on public.special_tasks for insert to public with check (true);

drop policy if exists "special_tasks_update_policy" on public.special_tasks;
create policy "special_tasks_update_policy" on public.special_tasks for update to public using (true) with check (true);

drop policy if exists "special_tasks_delete_policy" on public.special_tasks;
create policy "special_tasks_delete_policy" on public.special_tasks for delete to public using (true);

-- 4.8 photos
alter table public.photos enable row level security;
drop policy if exists "photos_select_policy" on public.photos;
create policy "photos_select_policy" on public.photos for select to public using (true);

drop policy if exists "photos_insert_policy" on public.photos;
create policy "photos_insert_policy" on public.photos for insert to public with check (true);

drop policy if exists "photos_delete_policy" on public.photos;
create policy "photos_delete_policy" on public.photos for delete to public using (true);

-- 4.9 task_completions
alter table public.task_completions enable row level security;
drop policy if exists "task_completions_select_policy" on public.task_completions;
create policy "task_completions_select_policy" on public.task_completions for select to public using (true);

drop policy if exists "task_completions_insert_policy" on public.task_completions;
create policy "task_completions_insert_policy" on public.task_completions for insert to public with check (true);

drop policy if exists "task_completions_delete_policy" on public.task_completions;
create policy "task_completions_delete_policy" on public.task_completions for delete to public using (true);

-- 4.10 points_log
alter table public.points_log enable row level security;
drop policy if exists "points_log_select_policy" on public.points_log;
create policy "points_log_select_policy" on public.points_log for select to public using (true);

drop policy if exists "points_log_insert_policy" on public.points_log;
create policy "points_log_insert_policy" on public.points_log for insert to public with check (true);

drop policy if exists "points_log_delete_policy" on public.points_log;
create policy "points_log_delete_policy" on public.points_log for delete to public using (true);

-- 4.11 notifications
alter table public.notifications enable row level security;
drop policy if exists "notifications_select_policy" on public.notifications;
create policy "notifications_select_policy" on public.notifications for select to public using (true);

drop policy if exists "notifications_insert_policy" on public.notifications;
create policy "notifications_insert_policy" on public.notifications for insert to public with check (true);

drop policy if exists "notifications_update_policy" on public.notifications;
create policy "notifications_update_policy" on public.notifications for update to public using (true) with check (true);

drop policy if exists "notifications_delete_policy" on public.notifications;
create policy "notifications_delete_policy" on public.notifications for delete to public using (true);

-- 4.12 push_subscriptions
alter table public.push_subscriptions enable row level security;
drop policy if exists "push_subscriptions_select_policy" on public.push_subscriptions;
create policy "push_subscriptions_select_policy" on public.push_subscriptions for select to public using (true);

drop policy if exists "push_subscriptions_insert_policy" on public.push_subscriptions;
create policy "push_subscriptions_insert_policy" on public.push_subscriptions for insert to public with check (true);

drop policy if exists "push_subscriptions_delete_policy" on public.push_subscriptions;
create policy "push_subscriptions_delete_policy" on public.push_subscriptions for delete to public using (true);

-- 4.13 tick_log
alter table public.tick_log enable row level security;
drop policy if exists "tick_log_select_policy" on public.tick_log;
create policy "tick_log_select_policy" on public.tick_log for select to public using (true);

drop policy if exists "tick_log_delete_policy" on public.tick_log;
create policy "tick_log_delete_policy" on public.tick_log for delete to public using (true);

-- 4.14 client_errors
alter table public.client_errors enable row level security;
drop policy if exists "client_errors_select_policy" on public.client_errors;
create policy "client_errors_select_policy" on public.client_errors for select to public using (true);

drop policy if exists "client_errors_insert_policy" on public.client_errors;
create policy "client_errors_insert_policy" on public.client_errors for insert to public with check (true);

drop policy if exists "client_errors_delete_policy" on public.client_errors;
create policy "client_errors_delete_policy" on public.client_errors for delete to public using (true);

-- 4.15 task_pool & quiz_pool
alter table public.task_pool enable row level security;
drop policy if exists "task_pool_select_policy" on public.task_pool;
create policy "task_pool_select_policy" on public.task_pool for select to public using (true);

alter table public.quiz_pool enable row level security;
drop policy if exists "quiz_pool_select_policy" on public.quiz_pool;
create policy "quiz_pool_select_policy" on public.quiz_pool for select to public using (true);

-- GRANTS FÜR ANON & AUTHENTICATED
grant usage on schema public to anon, authenticated;
grant select, insert, update on public.game_state to anon, authenticated;
grant select, insert, update, delete on public.players to anon, authenticated;
grant select, insert, update, delete on public.kills to anon, authenticated;
grant all on public.player_photo_tasks to anon, authenticated;
grant all on public.special_tasks to anon, authenticated;
grant select, insert, delete on public.photos to anon, authenticated;
grant select, insert, delete on public.task_completions to anon, authenticated;
grant select, insert, delete on public.points_log to anon, authenticated;
grant select, insert, update, delete on public.notifications to anon, authenticated;
grant select, insert, delete on public.push_subscriptions to anon, authenticated;
grant select, delete on public.tick_log to anon, authenticated;
grant select, insert, delete on public.client_errors to anon, authenticated;
grant select on public.task_pool to anon, authenticated;
grant select on public.quiz_pool to anon, authenticated;


-- ==============================================================================
-- 5. REALTIME-PUBLICATION
-- ==============================================================================
do $$
begin
  alter publication supabase_realtime add table public.game_state;
  alter publication supabase_realtime add table public.players;
  alter publication supabase_realtime add table public.kills;
  alter publication supabase_realtime add table public.player_photo_tasks;
  alter publication supabase_realtime add table public.photos;
  alter publication supabase_realtime add table public.task_completions;
  alter publication supabase_realtime add table public.special_tasks;
  alter publication supabase_realtime add table public.points_log;
  alter publication supabase_realtime add table public.notifications;
  alter publication supabase_realtime add table public.client_errors;
  alter publication supabase_realtime add table public.tick_log;
exception when others then null;
end;
$$;


-- ==============================================================================
-- 6. STORAGE-BUCKET "photos" MIT ZUGRIFFSREGELN
-- ==============================================================================
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('photos', 'photos', true, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
  on conflict (id) do update set
    public = true,
    file_size_limit = 15728640,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
exception when others then null;
end;
$$;

do $$
begin
  drop policy if exists "photos_storage_select" on storage.objects;
  create policy "photos_storage_select" on storage.objects for select to public using (bucket_id = 'photos');

  drop policy if exists "photos_storage_insert" on storage.objects;
  create policy "photos_storage_insert" on storage.objects for insert to public with check (bucket_id = 'photos');

  drop policy if exists "photos_storage_delete" on storage.objects;
  create policy "photos_storage_delete" on storage.objects for delete to public using (bucket_id = 'photos');
exception when others then null;
end;
$$;


-- ==============================================================================
-- 7. PG_CRON-JOB FÜR tick_game() JEDE MINUTE
-- ==============================================================================
do $$
declare
  r record;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Entferne vorher bestehende Jobs gleichen Namens
    for r in (select jobid from cron.job where jobname = 'halloween_tick_job') loop
      perform cron.unschedule(r.jobid);
    end loop;

    -- Genau einen neuen Job anlegen
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
-- 8. STARTWERTE (ADMIN-CODE, EINSTELLUNGEN, AUFGABEN- & QUIZ-POOLS)
-- ==============================================================================

-- 8.1 Admin Code
insert into public.admin_secrets (id, admin_code)
values ('main', '1031')
on conflict (id) do update set admin_code = excluded.admin_code;

-- 8.2 Game State Default Row
insert into public.game_state (id, status, reset_epoch)
values ('main', 'Lobby', 1)
on conflict (id) do update set
  status = coalesce(public.game_state.status, 'Lobby'),
  reset_epoch = coalesce(public.game_state.reset_epoch, 1);

-- 8.3 Foto-Aufgaben Vorlagen-Pool (25+ Aufgaben)
insert into public.task_pool (id, title, description, task_type, required_count) values
('pt_group_5', 'Großes Gruppenfoto', 'Gruppenfoto mit mindestens 5 Partygästen!', 'group', 5),
('pt_group_3', 'Grimassen-Trio', 'Gruppenfoto mit 3 Leuten, die alle gruselig in die Kamera schreien!', 'group', 3),
('pt_group_4', 'Grusel-Vierer', 'Gruseliges Gruppenfoto mit 4 Gästen!', 'group', 4),
('pt_garlic_drinker', 'Blutroter Drink', 'Foto von jemandem, der an einem blutroten Drink nippt.', 'group', 1),
('pt_vampire_bite', 'Vampirbiss-Pose', 'Ein Gast tut so, als würde er einen anderen sanft in den Hals beißen!', 'two_players', 2),
('pt_witch_cackle', 'Hexen-Lachen', 'Selfie mit der lautesten Hexe oder dem lautesten Zauberer der Party.', 'group', 1),
('pt_zombie_walk', 'Zombie-Walk', 'Foto von 2 Gästen im perfekten Zombie-Walk.', 'two_players', 2),
('pt_pumpkin_smile', 'Kürbis-Selfie', 'Selfie mit einer Kürbis-Deko oder einem Kürbis-Kostüm.', 'group', 1),
('pt_cobweb', 'Spinnennetz-Gefangen', 'Foto von dir und einem Mitspieler verfangen im Spinnennetz.', 'two_players', 2),
('pt_monster_dance', 'Thriller-Tanz', 'Foto mitten auf der Tanzfläche beim Thriller Dance.', 'group', 1),
('pt_werewolf_howl', 'Mondgeheul', 'Foto von einem Gast, der wie ein Werwolf zum Mond heult.', 'group', 1),
('pt_ghost_face', 'Geistergesicht', 'Grimassen-Duell! Wer macht das furchterregendste Geistergesicht?', 'two_players', 2),
('pt_best_makeup', 'Grusel-Schminke', 'Nahaufnahme von der detailreichsten Grusel-Schminke des Abends.', 'group', 1),
('pt_duo_cheers', 'Anstoßen mit Fremden', 'Foto beim Anstoßen mit einem Gast, dessen Namen du noch nicht kanntest.', 'two_players', 2),
('pt_coffin_pose', 'Sarg-Pose', 'Foto in entspannter Vampir-Sarg-Pose auf einer Couch oder Bank.', 'group', 1),
('pt_candy_thief', 'Süßigkeiten-Dieb', 'Schnappschuss von jemandem, der heimlich Süßigkeiten nascht.', 'group', 1),
('pt_bloody_hand', 'Blutige Hände', 'Foto mit zwei Händen, die gruselig nach der Kamera greifen.', 'group', 1),
('pt_bat_wings', 'Fledermaus-Flügel', 'Foto mit ausgebreiteten Fledermaus-Armen mit mindestens 2 Gästen.', 'two_players', 2),
('pt_scary_duo', 'Schrecklich schönes Paar', 'Ein schrecklich schönes Paar-Foto mit einem beliebigen Gast.', 'two_players', 2),
('pt_shadow_play', 'Schattenspiel', 'Foto mit einem geheimnisvollen Schattenwurf an der Wand.', 'group', 1),
('pt_creepy_laugh', 'Teuflisches Trio', 'Foto von 3 Gästen, die ein teuflisches Lachen inszenieren.', 'group', 3),
('pt_spider_pose', 'Riesenspinne', 'Jemand krabbelt wie eine Riesenspinne über den Boden.', 'group', 1),
('pt_dracula_cape', 'Dracula-Cape', 'Foto mit jemandem, der einen Umhang oder ein Cape trägt.', 'group', 1)
on conflict (id) do nothing;

-- 8.4 Halloween Quizfragen Vorlagen-Pool (30 Fragen)
insert into public.quiz_pool (id, question, options, correct_index, explanation) values
('q1', 'Aus welchem Land stammt der ursprüngliche Brauch von Halloween ("Samhain")?', '["Irland", "USA", "Deutschland", "Mexiko"]'::jsonb, 0, 'Samhain war ein keltisches Erntefest im antiken Irland.'),
('q2', 'Welches Gemüse wurde in Irland ursprünglich für Halloween-Laternen geschnitzt?', '["Kürbis", "Steckrübe", "Kartoffel", "Wassermelone"]'::jsonb, 1, 'In Irland wurden ursprünglich Rüben geschnitzt; in Amerika nutzte man die größeren Kürbisse.'),
('q3', 'Wie heißt der legendäre Geizkragen, nach dem die geschnitzte Kürbislaterne benannt ist?', '["Jack O Lantern", "Frankenstein", "Bram Stoker", "Sleepy Hollow"]'::jsonb, 0, 'Die Laterne geht auf die irische Sage vom Hufschmied Jack Oldfield zurück.'),
('q4', 'Wann soll sich der Legende nach ein Mensch in einen Werwolf verwandeln?', '["Neumond", "Vollmond", "Sonnenfinsternis", "Freitag der 13."]'::jsonb, 1, 'Der Vollmond löst der Sage nach die Verwandlung aus.'),
('q5', 'Welches Metall ist der klassische Schwachpunkt von Werwölfen?', '["Gold", "Silber", "Bronze", "Eisen"]'::jsonb, 1, 'Silberkugeln gelten seit dem 19. Jahrhundert als tödlich für Werwölfe.'),
('q6', 'Welches Gewächs soll Vampire laut Volksglauben zuverlässig vertreiben?', '["Rosmarin", "Knoblauch", "Basilikum", "Pfefferminze"]'::jsonb, 1, 'Knoblauch gilt weltweit als Abwehrmittel gegen Untote.'),
('q7', 'Welches Holz wird traditionell für den Pflock verwendet, um Vampire zu stoppen?', '["Eiche", "Esche / Weißdorn", "Kiefer", "Birke"]'::jsonb, 1, 'In osteuropäischen Legenden werden Weißdorn, Esche oder Espe genannt.'),
('q8', 'Wie lautet der berühmte Titel des Halloween-Kultsongs von Michael Jackson?', '["Ghostbusters", "Thriller", "Monster Mash", "Bad"]'::jsonb, 1, 'Thriller erschien 1982 und ist das meistverkaufte Musikvideo aller Zeiten.'),
('q9', 'Welche Farbe hat das Fruchtfleisch des bekannten Hokkaido-Kürbisses?', '["Grün", "Orange", "Weiß", "Gelb"]'::jsonb, 1, 'Das Fruchtfleisch des Hokkaido ist leuchtend orange und die Schale essbar.'),
('q10', 'Wie nennt man die Angst vor Halloween in der Psychologie?', '["Arachnophobie", "Samhainophobie", "Klaustrophobie", "Nyktophobie"]'::jsonb, 1, 'Samhainophobie bezeichnet die krankhafte Furcht vor Halloween.'),
('q11', 'Aus welcher historischen Region stammte Graf Dracula im Roman von Bram Stoker?', '["Bayern", "Transsilvanien", "Toskana", "Schottland"]'::jsonb, 1, 'Transsilvanien (Siebenbürgen) im heutigen Rumänien.'),
('q12', 'Welches historische Vorbild diente Bram Stoker vermutlich für Dracula?', '["Vlad III. der Pfähler", "Kaiser Nero", "Jack the Ripper", "König Artus"]'::jsonb, 0, 'Vlad Tepes, Woiwode der Walachei.'),
('q13', 'Was rufen Kinder in den USA, wenn sie an Halloween an Haustüren klopfen?', '["Merry Halloween", "Trick or Treat", "Give me Candy", "Boo!"]'::jsonb, 1, 'Trick or Treat bedeutet Süßes sonst gibt es Saures.'),
('q14', 'In welchem mexikanischen Feiertag werden die Toten mit bunten Altären gefeiert?', '["Dia de los Muertos", "Cinco de Mayo", "Carnaval", "Fiesta de San Juan"]'::jsonb, 0, 'Der Tag der Toten vom 31. Oktober bis 2. November.'),
('q15', 'Welches Tier wird im Volksglauben traditionell Hexen als Gefährte zugeschrieben?', '["Schwarze Katze", "Goldfisch", "Taube", "Schildkröte"]'::jsonb, 0, 'Schwarze Katzen galten im Mittelalter als Hexenbegleiter.'),
('q16', 'Wie heißt die Tochter der Gruselfamilie Addams Family mit den Zöpfen?', '["Wednesday", "Morticia", "Luna", "Sabrina"]'::jsonb, 0, 'Wednesday Addams.'),
('q17', 'Aus welchem Roman von Mary Shelley stammt das künstlich erschaffene Wesen von Dr. Frankenstein?', '["Dracula", "Frankenstein", "Der Golem", "Jekyll & Hyde"]'::jsonb, 1, 'Frankenstein oder Der moderne Prometheus (1818).'),
('q18', 'Welches Symbol auf einem Grabstein oder Piratenschiff steht weltweit für Gefahr und Tod?', '["Herz", "Totenkopf mit gekreuzten Knochen", "Anker", "Stern"]'::jsonb, 1, 'Der Jolly Roger / Totenkopf.'),
('q19', 'Welches Tier verwandelt sich der Vampir der Legende nach am liebsten, um lautlos zu fliegen?', '["Fledermaus", "Eule", "Rabe", "Mücke"]'::jsonb, 0, 'Die Vampirfledermaus.'),
('q20', 'In welcher US-Stadt fand 1692 eine der berüchtigtsten Hexenverfolgungen statt?', '["Salem", "Boston", "New York", "Chicago"]'::jsonb, 0, 'Die Hexenprozesse von Salem in Massachusetts.'),
('q21', 'Welcher Feiertag folgt im christlichen Kalender direkt auf Halloween (1. November)?', '["Allerheiligen", "Erntedank", "Karfreitag", "Pfingsten"]'::jsonb, 0, 'Allerheiligen (All Hallows Day), wovon All Hallows Eve abstammt.'),
('q22', 'Welches Ritual-Spielzeug besteht aus einem Holzbrett mit Buchstaben und einer Planchette?', '["Ouija-Brett", "Monopoly", "Tarot-Deck", "Schachbrett"]'::jsonb, 0, 'Das Ouija- oder Hexenbrett.'),
('q23', 'Wie viele Beine hat eine Spinne normalerweise?', '["6", "8", "10", "12"]'::jsonb, 1, 'Spinnentiere (Arachnida) besitzen stets acht Beine.'),
('q24', 'Welche Farbe hat das Blut von Insekten und manchen Krustentieren oft statt Rot?', '["Grün / Blau", "Schwarz", "Lila", "Weiß"]'::jsonb, 0, 'Wegen Hämocyanin mit Kupfer anstelle von Eisen ist es oft bläulich-grün.'),
('q25', 'Welcher Tim Burton Animationsfilm spielt in Halloween Town?', '["Nightmare Before Christmas", "Corpse Bride", "Beetlejuice", "Edward mit den Scherenhänden"]'::jsonb, 0, 'Jack Skellington ist der Kürbiskönig von Halloween Town.'),
('q26', 'Welcher fiktive Horror-Bösewicht trägt einen Handschuh mit rasiermesserscharfen Klingen?', '["Freddy Krueger", "Jason Voorhees", "Chucky", "Ghostface"]'::jsonb, 0, 'Freddy Krueger aus Nightmare on Elm Street.'),
('q27', 'Welches bekannte Gewürz wird im "Pumpkin Spice" neben Zimt und Nelken typischerweise verwendet?', '["Muskatnuss & Ingwer", "Curry", "Paprikapulver", "Oregano"]'::jsonb, 0, 'Muskatnuss, Nelken, Zimt und getrockneter Ingwer.'),
('q28', 'Welche Maske trägt Michael Myers in der Filmreihe "Halloween"?', '["Captain Kirk Maske (angemalt)", "Hockeymaske", "Clownsmaske", "Totenkopfmaske"]'::jsonb, 0, 'Es war eine modifizierte Captain-Kirk-Maske von William Shatner.'),
('q29', 'Warum spiegeln sich Vampire der Legende nach nicht im Spiegel?', '["Spiegel enthielten Silber", "Sie haben kein Licht", "Sie sind zu schnell", "Spiegel gab es damals nicht"]'::jsonb, 0, 'Frühe Glasspiegel waren mit Silber beschichtet, welches als rein und unbestechlich galt.'),
('q30', 'Welche berühmte Romanfigur wurde durch Blitzschlag auf einem Friedhof zum Leben erweckt?', '["Frankensteins Monster", "Die Mumie", "Der unsichtbare Mann", "Der Wolfsmensch"]'::jsonb, 0, 'Frankensteins Monster.')
on conflict (id) do nothing;


-- ==============================================================================
-- 9. NOTIFY POSTGREST SCHEMA CACHE RELOAD
-- ==============================================================================
notify pgrst, 'reload schema';


-- ==============================================================================
-- 10. VERIFIKATIONS-ABFRAGEN (NACH DER AUSFÜHRUNG PRÜFEN)
-- ==============================================================================

-- A) Liste der erstellten Tabellen in schema public:
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;

-- B) Liste aller relevanten Funktionen:
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'check_admin_code', 'server_now', 'get_my_role', 'get_fellow_hunters',
    'mark_self_dead', 'report_pending_death', 'complete_task', 'reveal_random_role',
    'confirm_kill', 'exorcise', 'assign_roles', 'start_game', 'expire_pending_deaths',
    'tick_game', 'admin_confirm_kill', 'admin_revive_player', 'admin_clear_pending_deaths',
    'admin_set_player_status', 'admin_repair_game_state', 'admin_reset_all_cooldowns',
    'admin_restart_game', 'reset_game_full', 'log_client_error'
  )
order by routine_name;

-- C) pg_cron Jobs:
select jobid, schedule, command, nodename, active, jobname
from cron.job;

-- D) Spielzustand 'main':
select id, status, reset_epoch, (settings->>'gracePeriodMinutes') as grace_min, updated_at
from public.game_state
where id = 'main';
