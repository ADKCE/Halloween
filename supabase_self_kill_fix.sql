-- ==============================================================================
-- VOLLSTÄNDIGER SQL-FIX: 
-- 1. "Ich wurde getötet" (Selbstmeldung, Status-Constraint, Nullable Killer & RLS)
-- 2. "Party-Galerie" (Photo-Entität ohne Markierungen, Lese- & Löschrechte)
-- 3. PostgREST Schema Reload
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- TEIL 1: SPIELER & KILLS FIX
-- ------------------------------------------------------------------------------

-- Status-Constraint auf players prüfen & sicherstellen ('tot' ist gültig)
alter table public.players drop constraint if exists players_status_check;
alter table public.players add constraint players_status_check 
  check (status in ('lebendig', 'tot', 'entfernt', 'pausiert'));

-- kills: killer_id und killer_name nullable machen (für Täter 'Unbekannt' / Selbstmeldungen)
alter table public.kills alter column killer_id drop not null;
alter table public.kills alter column killer_name drop not null;

-- Foreign Key auf killer_id: 'on delete set null' statt FK-Fehler
alter table public.kills drop constraint if exists kills_killer_id_fkey;
alter table public.kills add constraint kills_killer_id_fkey 
  foreign key (killer_id) references public.players(id) on delete set null;

-- RLS auf players & kills sicherstellen
alter table public.players enable row level security;
drop policy if exists "Allow public all players" on public.players;
drop policy if exists "Allow anon read players" on public.players;
drop policy if exists "Allow anon update players" on public.players;
drop policy if exists "Allow anon insert players" on public.players;
drop policy if exists "Allow anon delete players" on public.players;
create policy "Allow public all players" on public.players for all to public using (true) with check (true);

alter table public.kills enable row level security;
drop policy if exists "Allow public all kills" on public.kills;
drop policy if exists "Allow anon read kills" on public.kills;
drop policy if exists "Allow anon update kills" on public.kills;
drop policy if exists "Allow anon insert kills" on public.kills;
drop policy if exists "Allow anon delete kills" on public.kills;
create policy "Allow public all kills" on public.kills for all to public using (true) with check (true);

-- Explizite Tabellenzugriffsrechte für anon & authenticated
grant usage on schema public to anon, authenticated;
grant all on table public.players to anon, authenticated;
grant all on table public.kills to anon, authenticated;
grant all on table public.game_state to anon, authenticated;

-- Atomare Funktion: mark_self_dead
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

  -- 1. Spielerstatus sofort auf 'tot' setzen
  update public.players
  set status = 'tot'
  where id = p_player_id;

  -- 2. Prüfen, ob bereits ein offener Kill durch einen Täter gemeldet wurde
  select * into v_open_kill
  from public.kills
  where victim_id = p_player_id and confirmed = false
  order by created_at desc
  limit 1;

  if found then
    -- Offenen Kill bestätigen
    update public.kills
    set confirmed = true,
        confirmed_at = now()
    where id = v_open_kill.id;

    -- Punkte für den Täter gutschreiben, falls Täter vorhanden
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
    -- Keinen offenen Kill gefunden: Neuen Eintrag im Kill-Log anlegen (Täter 'Unbekannt')
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

-- ------------------------------------------------------------------------------
-- TEIL 2: GALERIE & PHOTO-ENTITÄT (KEINE PERSONEN-MARKIERUNG)
-- ------------------------------------------------------------------------------

-- Tabelle photos: Bild, Aufgabe, Zeitstempel, Fotograf (Spieler-ID). Keine Markierungsfelder!
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  photo_url text not null,
  task_id text,
  caption text,
  player_id text references public.players(id) on delete set null,
  photographer_name text not null default 'Gast',
  created_at timestamptz not null default timezone('utc'::text, now())
);

-- Eventuelle alte Markierungsspalten entfernen
alter table public.photos drop column if exists tagged_player_names;
alter table public.task_completions drop column if exists tagged_player_ids;
alter table public.task_completions drop column if exists tagged_player_names;

create index if not exists idx_photos_created_at on public.photos (created_at desc);

-- RLS für photos
alter table public.photos enable row level security;
drop policy if exists "Allow public all photos" on public.photos;
drop policy if exists "Allow read photos" on public.photos;
drop policy if exists "Allow insert photos" on public.photos;
drop policy if exists "Allow delete photos" on public.photos;

-- Alle angemeldeten Spieler dürfen alle Fotos lesen
create policy "Allow read photos" on public.photos 
  for select to public using (true);

-- Foto-Upload für Aufgaben
create policy "Allow insert photos" on public.photos 
  for insert to public with check (true);

-- Löschen über RLS oder definierte Server-Funktion
create policy "Allow delete photos" on public.photos 
  for delete to public using (true);

grant all on table public.photos to anon, authenticated;

-- Serverseitige Lösch-Prüfung: Nur Fotograf selbst oder Admin darf löschen
create or replace function public.delete_photo(
  p_photo_id uuid,
  p_player_id text default null,
  p_admin_code text default null
)
returns boolean
language plpgsql
security definer
as $$
declare
  v_is_admin boolean := false;
  v_photo record;
begin
  if p_admin_code is not null then
    v_is_admin := public.check_admin_code(p_admin_code);
  end if;

  select * into v_photo from public.photos where id = p_photo_id;
  if not found then
    return false;
  end if;

  if v_is_admin or (p_player_id is not null and v_photo.player_id = p_player_id) then
    delete from public.photos where id = p_photo_id;
    return true;
  end if;

  raise exception 'Keine Berechtigung: Nur der Fotograf selbst oder der Admin darf dieses Foto löschen';
end;
$$;

grant execute on function public.delete_photo(uuid, text, text) to anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- TEIL 3: SCHEMA-CACHE AKTUALISIEREN
-- ------------------------------------------------------------------------------
notify pgrst, 'reload schema';
