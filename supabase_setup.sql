-- ====================================================================
-- HALLOWEEN PARTY-SPIEL - SUPABASE SETUP SCRIPT
-- Vollständiges Schema, RLS-Policies, Storage-Bucket & Realtime
-- Im Supabase Dashboard unter "SQL Editor" einfügen und auf "Run" klicken
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
    "hunterCount": 10
  }'::jsonb,
  full_moon_times jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

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
  role text not null default 'Mensch',
  team text not null default 'Gut',
  status text not null default 'lebendig' check (status in ('lebendig', 'tot', 'entfernt', 'pausiert')),
  points integer not null default 0,
  kills_count integer not null default 0,
  created_at timestamptz not null default timezone('utc'::text, now())
);

-- Index für schnelle Sortierung nach Punkten und Beitrittszeit
create index if not exists idx_players_points on public.players (points desc);
create index if not exists idx_players_created_at on public.players (created_at asc);

-- 4. TABELLE: kills (Protokoll der Bisse und Exorzismen)
create table if not exists public.kills (
  id uuid primary key default gen_random_uuid(),
  killer_id text not null references public.players(id) on delete cascade,
  victim_id text not null references public.players(id) on delete cascade,
  killer_name text not null,
  victim_name text not null,
  confirmed boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now())
);

-- 5. TABELLE: tasks (Halloween-Party-Aufgaben)
create table if not exists public.tasks (
  id text primary key,
  title text not null,
  description text not null,
  points integer not null default 10,
  category text not null default 'party',
  created_at timestamptz not null default timezone('utc'::text, now())
);

-- Standard-Party-Aufgaben befüllen
insert into public.tasks (id, title, description, points, category)
values
  ('task_dance', 'Zombie-Tanz', 'Tanze 30 Sekunden wie ein Zombie auf der Tanzfläche.', 15, 'party'),
  ('task_garlic', 'Knoblauch-Selfie', 'Finde Knoblauch oder eine Knoblauch-Deko und mache ein Foto damit.', 20, 'party'),
  ('task_drink', 'Blutrote Erfrischung', 'Stoße mit einem blutroten Party-Getränk an und lade ein Foto hoch.', 10, 'party'),
  ('task_hunter', 'Jäger-Bündnis', 'Mache ein geheimes Foto mit einem Geisterjäger oder Verdächtigen.', 25, 'party'),
  ('task_costume', 'Kostüm-Duell', 'Mache ein Selfie mit dem gruseligsten Kostüm des Abends.', 20, 'party')
on conflict (id) do nothing;

-- 6. TABELLE: task_completions (Erledigte Aufgaben der Spieler)
create table if not exists public.task_completions (
  id uuid primary key default gen_random_uuid(),
  task_id text not null references public.tasks(id) on delete cascade,
  player_id text not null references public.players(id) on delete cascade,
  player_name text not null,
  photo_url text,
  completed_at timestamptz not null default timezone('utc'::text, now())
);

-- 7. TABELLE: photos (Party-Galerie & Aufgabenfotos)
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  photo_url text not null,
  task_id text,
  caption text,
  player_id text references public.players(id) on delete set null,
  photographer_name text not null default 'Gast',
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_photos_created_at on public.photos (created_at desc);

-- 8. POSTGRES FUNKTION: check_admin_code (Serverseitige Admin-Prüfung)
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

-- 9. STORAGE BUCKET: photos (Für komprimierte Kostüm- & Eventfotos)
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('photos', 'photos', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
  on conflict (id) do update set public = true;
exception when others then
  -- Falls Ausführung im SQL Editor eingeschränkte Rechte auf storage.buckets hat
  null;
end;
$$;

-- Storage-Zugriffsregeln für anon (Öffentlicher Upload und Lesezugriff)
do $$
begin
  drop policy if exists "Photos Public Read" on storage.objects;
  create policy "Photos Public Read"
  on storage.objects for select
  to public
  using (bucket_id = 'photos');
exception when others then null;
end;
$$;

do $$
begin
  drop policy if exists "Photos Public Upload" on storage.objects;
  create policy "Photos Public Upload"
  on storage.objects for insert
  to public
  with check (bucket_id = 'photos');
exception when others then null;
end;
$$;

do $$
begin
  drop policy if exists "Photos Public Update" on storage.objects;
  create policy "Photos Public Update"
  on storage.objects for update
  to public
  using (bucket_id = 'photos');
exception when others then null;
end;
$$;

-- 10. ROW LEVEL SECURITY (RLS) AKTIVIEREN & ANON-POLICIES
alter table public.game_state enable row level security;
alter table public.players enable row level security;
alter table public.kills enable row level security;
alter table public.tasks enable row level security;
alter table public.task_completions enable row level security;
alter table public.photos enable row level security;

-- Policies für game_state
drop policy if exists "Allow public read game_state" on public.game_state;
create policy "Allow public read game_state" on public.game_state
  for select to public using (true);

drop policy if exists "Allow public update game_state" on public.game_state;
create policy "Allow public update game_state" on public.game_state
  for update to public using (true);

drop policy if exists "Allow public insert game_state" on public.game_state;
create policy "Allow public insert game_state" on public.game_state
  for insert to public with check (true);

-- Policies für players
drop policy if exists "Allow public read players" on public.players;
create policy "Allow public read players" on public.players
  for select to public using (true);

drop policy if exists "Allow public insert players" on public.players;
create policy "Allow public insert players" on public.players
  for insert to public with check (true);

drop policy if exists "Allow public update players" on public.players;
create policy "Allow public update players" on public.players
  for update to public using (true);

drop policy if exists "Allow public delete players" on public.players;
create policy "Allow public delete players" on public.players
  for delete to public using (true);

-- Policies für kills
drop policy if exists "Allow public read kills" on public.kills;
create policy "Allow public read kills" on public.kills
  for select to public using (true);

drop policy if exists "Allow public insert kills" on public.kills;
create policy "Allow public insert kills" on public.kills
  for insert to public with check (true);

drop policy if exists "Allow public delete kills" on public.kills;
create policy "Allow public delete kills" on public.kills
  for delete to public using (true);

-- Policies für tasks
drop policy if exists "Allow public read tasks" on public.tasks;
create policy "Allow public read tasks" on public.tasks
  for select to public using (true);

drop policy if exists "Allow public all tasks" on public.tasks;
create policy "Allow public all tasks" on public.tasks
  for all to public using (true);

-- Policies für task_completions
drop policy if exists "Allow public read task_completions" on public.task_completions;
create policy "Allow public read task_completions" on public.task_completions
  for select to public using (true);

drop policy if exists "Allow public insert task_completions" on public.task_completions;
create policy "Allow public insert task_completions" on public.task_completions
  for insert to public with check (true);

drop policy if exists "Allow public delete task_completions" on public.task_completions;
create policy "Allow public delete task_completions" on public.task_completions
  for delete to public using (true);

-- Policies für photos
drop policy if exists "Allow public read photos" on public.photos;
create policy "Allow public read photos" on public.photos
  for select to public using (true);

drop policy if exists "Allow public insert photos" on public.photos;
create policy "Allow public insert photos" on public.photos
  for insert to public with check (true);

drop policy if exists "Allow public delete photos" on public.photos;
create policy "Allow public delete photos" on public.photos
  for delete to public using (true);

-- 11. SUPABASE REALTIME AKTIVIEREN
-- Schaltet Live-Updates für alle Tabellen frei
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'players'
  ) then
    alter publication supabase_realtime add table public.players;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'game_state'
  ) then
    alter publication supabase_realtime add table public.game_state;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'kills'
  ) then
    alter publication supabase_realtime add table public.kills;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'photos'
  ) then
    alter publication supabase_realtime add table public.photos;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_completions'
  ) then
    alter publication supabase_realtime add table public.task_completions;
  end if;
end;
$$;
