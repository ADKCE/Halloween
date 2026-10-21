-- ==============================================================================
-- FIX: Selbst als tot markieren ("Ich wurde getötet")
-- 1. Statuswert-Constraint & Nullable Killer für kills
-- 2. Vollständige Row-Level-Security (RLS) Policies für players & kills
-- 3. Atomare Postgres-Funktion mark_self_dead()
-- ==============================================================================

-- 1. Constraint auf players.status prüfen & sicherstellen ('tot' ist erlaubt)
alter table public.players drop constraint if exists players_status_check;
alter table public.players add constraint players_status_check check (status in ('lebendig', 'tot', 'entfernt', 'pausiert'));

-- 2. kills: killer_id und killer_name nullable machen (für Täter 'Unbekannt' / Selbstmeldungen)
alter table public.kills alter column killer_id drop not null;
alter table public.kills alter column killer_name drop not null;

-- Foreign Key auf killer_id: 'on delete set null' statt striktem FK-Fehler
alter table public.kills drop constraint if exists kills_killer_id_fkey;
alter table public.kills add constraint kills_killer_id_fkey 
  foreign key (killer_id) references public.players(id) on delete set null;

-- 3. Row-Level Security (RLS) & Rechte für anon und authenticated auf players & kills
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

-- 4. Atomare RPC-Funktion: mark_self_dead
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
  -- Opfer in players suchen
  select * into v_victim from public.players where id = p_player_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Spieler nicht gefunden');
  end if;

  -- 1. Spielerstatus auf 'tot' setzen
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

-- 5. PostgREST Schema-Cache sofort neu laden
notify pgrst, 'reload schema';
