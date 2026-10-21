-- ====================================================================
-- HALLOWEEN PARTY-SPIEL - VOLLSTÄNDIGES SUPABASE SCHEMA & UPGRADE
-- Alle Spielregeln, Rollen, Cooldowns, Vollmond, Kills & Aufgaben
-- Im Supabase SQL Editor ausführen
-- ====================================================================

-- 1. EXTENSIONS
create extension if not exists "uuid-ossp";

-- 2. TABELLE: game_state (Globale Spielsteuerung, genau 1 Zeile mit id 'main')
create table if not exists public.game_state (
  id text primary key default 'main',
  status text not null default 'Lobby' check (status in ('Lobby', 'Läuft', 'Beendet')),
  started_at timestamptz,
  ended_at timestamptz,
  admin_code text not null default '1031',
  settings jsonb not null default '{
    "adminCode": "1031",
    "vampireCount": 6,
    "werewolfCount": 4,
    "ghostCount": 4,
    "hunterCount": 10,
    "gracePeriodMinutes": 15,
    "vampireCooldownMinutes": 6,
    "ghostCooldownMinutes": 6,
    "werewolfCooldownMinutes": 2,
    "hunterHitCooldownMinutes": 15,
    "hunterMissPenaltyMinutes": 30,
    "killConfirmationTimeoutMinutes": 5,
    "fullMoonMinIntervalMinutes": 20,
    "fullMoonMaxIntervalMinutes": 40,
    "fullMoonDurationMinutes": 5,
    "pointsPhotoTask": 10,
    "pointsSpecialTask": 20,
    "pointsTaggedCoPlayer": 2,
    "pointsEvilKill": 15,
    "pointsExorcismSuccess": 25,
    "specialTaskIntervalMinMinutes": 10,
    "specialTaskIntervalMaxMinutes": 20
  }'::jsonb,
  full_moon_times jsonb not null default '[]'::jsonb,
  active_full_moon jsonb default null,
  winner_team text,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

-- Upgrade existing game_state if columns do not exist
alter table public.game_state add column if not exists active_full_moon jsonb default null;
alter table public.game_state add column if not exists winner_team text;

-- Initialzeile 'main' anlegen, falls noch nicht vorhanden
insert into public.game_state (id, status, admin_code)
values ('main', 'Lobby', '1031')
on conflict (id) do nothing;

-- 3. TABELLE: players (Alle Gäste im selben globalen Spiel)
create table if not exists public.players (
  id text primary key,
  name text not null,
  costume_name text not null,
  photo_url text not null,
  role text default 'unassigned',
  team text not null default 'Gut',
  status text not null default 'lebendig' check (status in ('lebendig', 'tot', 'entfernt', 'pausiert')),
  points integer not null default 0,
  kills_count integer not null default 0,
  tasks_completed_count integer not null default 0,
  last_kill_at timestamptz,
  cooldown_until timestamptz,
  active_tasks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.players alter column role set default 'unassigned';
alter table public.players alter column role drop not null;
alter table public.players add column if not exists kills_count integer not null default 0;
alter table public.players add column if not exists tasks_completed_count integer not null default 0;
alter table public.players add column if not exists last_kill_at timestamptz;
alter table public.players add column if not exists cooldown_until timestamptz;
alter table public.players add column if not exists active_tasks jsonb not null default '[]'::jsonb;

-- Schema-Cache von Supabase PostgREST sofort aktualisieren
notify pgrst, 'reload schema';

create index if not exists idx_players_points on public.players (points desc);
create index if not exists idx_players_created_at on public.players (created_at asc);

-- 4. TABELLE: kills (Protokoll aller Kills & Exorzismen)
create table if not exists public.kills (
  id uuid primary key default gen_random_uuid(),
  killer_id text not null references public.players(id) on delete cascade,
  victim_id text not null references public.players(id) on delete cascade,
  killer_name text not null,
  victim_name text not null,
  killer_role text,
  victim_role text,
  killer_team text,
  victim_team text,
  reason text not null default 'kill',
  exorcism_hit boolean default null,
  ghost_solo_confirmed boolean default false,
  confirmed boolean not null default false,
  confirmed_at timestamptz,
  auto_confirmed boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.kills alter column killer_id drop not null;
alter table public.kills alter column killer_name drop not null;
alter table public.kills drop constraint if exists kills_killer_id_fkey;
alter table public.kills add constraint kills_killer_id_fkey foreign key (killer_id) references public.players(id) on delete set null;

alter table public.kills add column if not exists killer_role text;
alter table public.kills add column if not exists victim_role text;
alter table public.kills add column if not exists killer_team text;
alter table public.kills add column if not exists victim_team text;
alter table public.kills add column if not exists reason text not null default 'kill';
alter table public.kills add column if not exists exorcism_hit boolean default null;
alter table public.kills add column if not exists ghost_solo_confirmed boolean default false;
alter table public.kills add column if not exists confirmed_at timestamptz;
alter table public.kills add column if not exists auto_confirmed boolean not null default false;

create index if not exists idx_kills_created_at on public.kills (created_at desc);
create index if not exists idx_kills_victim_id on public.kills (victim_id);
create index if not exists idx_kills_killer_id on public.kills (killer_id);

-- 5. TABELLE: tasks (Pool der Party-Aufgaben)
create table if not exists public.tasks (
  id text primary key,
  title text not null,
  description text not null,
  points integer not null default 10,
  category text not null default 'party',
  created_at timestamptz not null default timezone('utc'::text, now())
);

-- 6. TABELLE: special_tasks (Zufällige Spezialaufgaben für lebende Menschen)
create table if not exists public.special_tasks (
  id uuid primary key default gen_random_uuid(),
  player_id text not null references public.players(id) on delete cascade,
  type text not null check (type in ('qr_code', 'quiz', 'photo_motif')),
  title text not null,
  description text not null,
  points integer not null default 20,
  qr_code_expected text,
  quiz_data jsonb,
  motif_description text,
  reward_player_id text,
  reward_player_name text,
  reward_role text,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_special_tasks_player on public.special_tasks (player_id);

-- 7. TABELLE: task_completions (Erledigte Aufgaben mit Tagging)
create table if not exists public.task_completions (
  id uuid primary key default gen_random_uuid(),
  task_id text not null,
  player_id text not null references public.players(id) on delete cascade,
  player_name text not null,
  photo_url text,
  tagged_player_ids jsonb default '[]'::jsonb,
  tagged_player_names jsonb default '[]'::jsonb,
  points_awarded integer not null default 10,
  completed_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.task_completions add column if not exists tagged_player_ids jsonb default '[]'::jsonb;
alter table public.task_completions add column if not exists tagged_player_names jsonb default '[]'::jsonb;
alter table public.task_completions add column if not exists points_awarded integer not null default 10;

-- 8. TABELLE: photos (Party-Galerie mit getaggten Mitspielern)
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  photo_url text not null,
  task_id text,
  caption text,
  player_id text references public.players(id) on delete set null,
  photographer_name text not null default 'Gast',
  tagged_player_names jsonb default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.photos add column if not exists tagged_player_names jsonb default '[]'::jsonb;
create index if not exists idx_photos_created_at on public.photos (created_at desc);

-- 9. POSTGRES FUNKTION: check_admin_code
create or replace function public.check_admin_code(input_code text)
returns boolean
language plpgsql
security definer
as $$
declare
  correct_code text;
begin
  select admin_code into correct_code from public.game_state where id = 'main';
  if correct_code is null then
    return input_code = '1031';
  end if;
  return correct_code = input_code;
end;
$$;

-- 10. STORAGE BUCKET: photos
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('photos', 'photos', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
  on conflict (id) do update set public = true;
exception when others then null;
end;
$$;

do $$
begin
  drop policy if exists "Photos Public Read" on storage.objects;
  create policy "Photos Public Read" on storage.objects for select to public using (bucket_id = 'photos');
exception when others then null;
end;
$$;

do $$
begin
  drop policy if exists "Photos Public Upload" on storage.objects;
  create policy "Photos Public Upload" on storage.objects for insert to public with check (bucket_id = 'photos');
exception when others then null;
end;
$$;

do $$
begin
  drop policy if exists "Photos Public Update" on storage.objects;
  create policy "Photos Public Update" on storage.objects for update to public using (bucket_id = 'photos');
exception when others then null;
end;
$$;

do $$
begin
  drop policy if exists "Photos Public Delete" on storage.objects;
  create policy "Photos Public Delete" on storage.objects for delete to public using (bucket_id = 'photos');
exception when others then null;
end;
$$;

-- 11. ROW LEVEL SECURITY (RLS) & ANON POLICIES
alter table public.game_state enable row level security;
alter table public.players enable row level security;
alter table public.kills enable row level security;
alter table public.tasks enable row level security;
alter table public.special_tasks enable row level security;
alter table public.task_completions enable row level security;
alter table public.photos enable row level security;

-- game_state
drop policy if exists "Allow public all game_state" on public.game_state;
create policy "Allow public all game_state" on public.game_state for all to public using (true) with check (true);

-- players
drop policy if exists "Allow public all players" on public.players;
create policy "Allow public all players" on public.players for all to public using (true) with check (true);

-- kills
drop policy if exists "Allow public all kills" on public.kills;
create policy "Allow public all kills" on public.kills for all to public using (true) with check (true);

-- tasks
drop policy if exists "Allow public all tasks" on public.tasks;
create policy "Allow public all tasks" on public.tasks for all to public using (true) with check (true);

-- special_tasks
drop policy if exists "Allow public all special_tasks" on public.special_tasks;
create policy "Allow public all special_tasks" on public.special_tasks for all to public using (true) with check (true);

-- task_completions
drop policy if exists "Allow public all task_completions" on public.task_completions;
create policy "Allow public all task_completions" on public.task_completions for all to public using (true) with check (true);

-- photos
drop policy if exists "Allow public all photos" on public.photos;
create policy "Allow public all photos" on public.photos for all to public using (true) with check (true);

-- 12. REALTIME ELEVATION
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'players') then
    alter publication supabase_realtime add table public.players;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'game_state') then
    alter publication supabase_realtime add table public.game_state;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'kills') then
    alter publication supabase_realtime add table public.kills;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'photos') then
    alter publication supabase_realtime add table public.photos;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'task_completions') then
    alter publication supabase_realtime add table public.task_completions;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'special_tasks') then
    alter publication supabase_realtime add table public.special_tasks;
  end if;
end;
$$;

-- 13. SERVERSEITIGE ROLLENVERTEILUNG: assign_roles()
-- Exakte Zielanzahlen, Mindestquoten für Tests, Fisher-Yates Zufallsmischung
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
  -- 1. Einstellungen aus game_state lesen
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

  -- 2. Alle anwesenden aktiven Spieler in zufälliger Reihenfolge holen
  select array_agg(id order by random())
  into v_player_ids
  from public.players
  where status != 'entfernt';

  v_total := coalesce(array_length(v_player_ids, 1), 0);
  if v_total = 0 then
    return jsonb_build_object('success', false, 'message', 'Keine aktiven Spieler vorhanden');
  end if;

  -- 3. Exakte Zielanzahlen berechnen
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
    -- ab 6 Spielern:
    -- Menschen dürfen nie weniger als 40% ausmachen:
    v_min_humans := greatest(1, floor(v_total * 0.40)::integer);
    v_max_special := greatest(0, v_total - v_min_humans);

    -- Sonderrollen mit Mindestanzahl 1:
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

  -- 4. Rollen-Deck zusammenstellen
  for v_i in 1..v_vampires loop v_deck := array_append(v_deck, 'Vampir'); end loop;
  for v_i in 1..v_werewolves loop v_deck := array_append(v_deck, 'Werwolf'); end loop;
  for v_i in 1..v_ghosts loop v_deck := array_append(v_deck, 'Geist'); end loop;
  for v_i in 1..v_hunters loop v_deck := array_append(v_deck, 'Geisterjäger'); end loop;
  for v_i in 1..v_humans loop v_deck := array_append(v_deck, 'Mensch'); end loop;

  -- Auffüllen falls Rundungsdifferenz
  while array_length(v_deck, 1) < v_total loop
    v_deck := array_append(v_deck, 'Mensch');
  end loop;

  -- 5. Rollen den zufällig sortierten Spielern zuweisen
  for v_i in 1..v_total loop
    v_assigned_role := v_deck[v_i];
    v_assigned_team := case when v_assigned_role in ('Vampir', 'Werwolf', 'Geist') then 'Böse' else 'Gut' end;

    update public.players
    set role = v_assigned_role,
        team = v_assigned_team
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

-- 14. FUNKTION: mark_self_dead (Selbst als tot markieren & offene Kills abgleichen)
create or replace function public.mark_self_dead(
  p_player_id text,
  p_killer_role text default 'Unbekannt'
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_victim record;
  v_open_kill record;
  v_result jsonb;
begin
  select * into v_victim from public.players where id = p_player_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Spieler nicht gefunden');
  end if;

  update public.players
  set status = 'tot'
  where id = p_player_id;

  select * into v_open_kill
  from public.kills
  where victim_id = p_player_id and confirmed = false
  order by created_at desc
  limit 1;

  if found then
    update public.kills
    set confirmed = true,
        confirmed_at = now()
    where id = v_open_kill.id;

    if v_open_kill.killer_id is not null then
      update public.players
      set points = points + 15,
          kills_count = kills_count + 1
      where id = v_open_kill.killer_id;
    end if;

    v_result := jsonb_build_object(
      'success', true,
      'confirmed_existing_kill', true,
      'kill_id', v_open_kill.id
    );
  else
    insert into public.kills (
      killer_id,
      victim_id,
      killer_name,
      victim_name,
      killer_role,
      victim_role,
      killer_team,
      victim_team,
      reason,
      confirmed,
      confirmed_at
    ) values (
      null,
      p_player_id,
      'Unbekannt',
      v_victim.name,
      coalesce(nullif(p_killer_role, ''), 'Unbekannt'),
      v_victim.role,
      'Böse',
      v_victim.team,
      'self_reported',
      true,
      now()
    );

    v_result := jsonb_build_object(
      'success', true,
      'created_new_kill', true
    );
  end if;

  return v_result;
end;
$$;

grant execute on function public.mark_self_dead(text, text) to anon, authenticated, service_role;

-- Schema-Cache von Supabase PostgREST aktualisieren
notify pgrst, 'reload schema';
