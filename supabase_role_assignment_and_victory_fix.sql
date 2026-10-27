-- ==============================================================================
-- FIX: ROLLENVERTEILUNG & SIEGBEDINGUNGEN (HALLOWEEN PARTY APP)
-- Idempotent & Transaktionssicher für Supabase PostgreSQL
-- ==============================================================================

-- 1. TABELLEN-ERWEITERUNGEN
-- ==============================================================================
alter table public.game_state
  add column if not exists initial_good_count integer not null default 0,
  add column if not exists initial_evil_count integer not null default 0,
  add column if not exists initial_hunter_count integer not null default 0,
  add column if not exists end_reason text default null;

-- Tabelle für die Historie der Siegbedingungs-Prüfungen
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

alter table public.win_check_log enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'win_check_log' and policyname = 'win_check_log_select_policy') then
    create policy win_check_log_select_policy on public.win_check_log
      for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'win_check_log' and policyname = 'win_check_log_insert_policy') then
    create policy win_check_log_insert_policy on public.win_check_log
      for insert with check (true);
  end if;
end $$;

grant all on public.win_check_log to anon, authenticated, service_role;

do $$
begin
  alter publication supabase_realtime add table public.win_check_log;
exception when others then null;
end $$;

-- ==============================================================================
-- 2. ZENTRALE SIEGBEDINGUNGS-FUNKTION check_win(p_trigger text)
-- ==============================================================================
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
  -- 1. Prüfen, ob Spiel überhaupt läuft
  select * into v_game_state from public.game_state where id = 'main';
  if not found or v_game_state.status != 'Läuft' then
    return jsonb_build_object(
      'checked', false,
      'reason', 'game_not_running',
      'current_status', coalesce(v_game_state.status, 'unknown')
    );
  end if;

  -- 2. Lebende Spieler zählen: status in ('lebendig', 'pending_death', 'tod_ausstehend')
  -- Testspieler und 'entfernt' werden ignoriert
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

  -- Anfangszahlen aus game_state beziehen (Fallback auf aktuelle Summe falls nicht gesetzt)
  v_initial_good := coalesce(nullif(v_game_state.initial_good_count, 0), v_living_good + v_dead_good);
  v_initial_evil := coalesce(nullif(v_game_state.initial_evil_count, 0), v_living_evil + v_dead_evil);
  v_initial_hunters := coalesce(nullif(v_game_state.initial_hunter_count, 0), v_living_hunters + v_dead_hunters);

  if v_initial_good > 0 then
    v_good_death_pct := round(((v_initial_good - v_living_good)::numeric / v_initial_good::numeric) * 100.0, 2);
  else
    v_good_death_pct := 0;
  end if;

  -- 3. Siegbedingungen auswerten:
  -- Regel (a): Alle Bösen tot -> GUT gewinnt
  -- Regel (b): Alle Geisterjäger tot -> BÖSE gewinnt
  -- Regel (c): Mehr als 75% der anfänglich guten Spieler tot -> BÖSE gewinnt
  -- Regel (d): Priorität Gut vor Böse bei Gleichzeitigkeit

  if v_initial_evil > 0 and v_living_evil = 0 then
    -- Alle Bösen tot -> GUT GEWINNT (auch wenn gleichzeitig Jäger oder >75% tot sind)
    v_winner := 'Gut';
    v_reason := 'all_evil_dead';
  elsif v_initial_hunters > 0 and v_living_hunters = 0 then
    -- Alle Geisterjäger tot -> BÖSE GEWINNT
    v_winner := 'Böse';
    v_reason := 'all_hunters_dead';
  elsif v_initial_good > 0 and v_good_death_pct > 75.0 then
    -- Mehr als 75% der Guten tot -> BÖSE GEWINNT
    v_winner := 'Böse';
    v_reason := 'good_75_percent_dead';
  end if;

  -- 4. Wenn Sieger ermittelt: In derselben Transaktion Status auf 'Beendet' setzen & Benachrichtigung
  if v_winner is not null then
    update public.game_state
    set status = 'Beendet',
        winner_team = v_winner,
        end_reason = v_reason,
        ended_at = v_now,
        updated_at = v_now
    where id = 'main';

    -- In-App Benachrichtigungen für alle aktiven Spieler generieren
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

  -- 5. Eintrag in win_check_log schreiben
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

-- ==============================================================================
-- 3. ATOMARE ROLLENVERTEILUNG: start_game(p_admin_code text)
-- ==============================================================================
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
  -- 1. Admin-Code prüfen
  if not public.check_admin_code(p_admin_code) then
    return jsonb_build_object('success', false, 'error', 'Ungültiger Admin-Code');
  end if;

  -- 2. Prüfen, ob Spiel bereits läuft (Idempotent: Doppeltes Drücken würfelt NICHT neu)
  select * into v_game_state from public.game_state where id = 'main' for update;
  if v_game_state.status = 'Läuft' then
    return jsonb_build_object(
      'success', true,
      'already_started', true,
      'message', 'Das Spiel läuft bereits.'
    );
  end if;

  v_settings := coalesce(v_game_state.settings, '{}'::jsonb);
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

  -- 3. Alle beigetretenen, nicht entfernten Spieler in einer Transaktion sperren (FOR UPDATE)
  select array_agg(id order by random()) into v_player_ids
  from public.players
  where status != 'entfernt';

  v_total := coalesce(array_length(v_player_ids, 1), 0);
  if v_total = 0 then
    return jsonb_build_object('success', false, 'error', 'Keine registrierten Spieler in der Lobby vorhanden');
  end if;

  -- 4. Exakte Rollen-Anzahlen berechnen
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

    -- Schutz: Wenn Sonderrollen mehr als Gesamtspieler-1 ausmachen, proportional deckeln
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

  -- Deck zusammenstellen
  for v_i in 1..v_vampires loop v_deck := array_append(v_deck, 'Vampir'); end loop;
  for v_i in 1..v_werewolves loop v_deck := array_append(v_deck, 'Werwolf'); end loop;
  for v_i in 1..v_ghosts loop v_deck := array_append(v_deck, 'Geist'); end loop;
  for v_i in 1..v_hunters loop v_deck := array_append(v_deck, 'Geisterjäger'); end loop;
  for v_i in 1..v_humans loop v_deck := array_append(v_deck, 'Mensch'); end loop;

  while array_length(v_deck, 1) < v_total loop
    v_deck := array_append(v_deck, 'Mensch');
  end loop;

  -- 5. Rollen atomar an Spieler verteilen
  for v_i in 1..v_total loop
    v_assigned_role := v_deck[v_i];
    v_assigned_team := case when v_assigned_role in ('Vampir', 'Werwolf', 'Geist') then 'Böse' else 'Gut' end;

    -- Rolle streng geheim in player_roles speichern
    insert into public.player_roles (player_id, role, team, updated_at)
    values (v_player_ids[v_i], v_assigned_role, v_assigned_team, v_now)
    on conflict (player_id) do update set
      role = excluded.role,
      team = excluded.team,
      updated_at = excluded.updated_at;

    -- In players: Status auf lebendig setzen, Cooldowns und Punkte zurücksetzen
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

  -- 6. ERST AM ENDE der Transaktion den Status auf 'Läuft' setzen
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

  -- Benachrichtigung für alle Spieler
  insert into public.notifications (player_id, title, message, type, created_at)
  select id,
         'Das Spiel hat begonnen!',
         'Deine geheime Rolle wurde dir zugeteilt. Finde heraus, wer du bist und erfülle deine Mission!',
         'game_started',
         v_now
  from public.players
  where status != 'entfernt';

  -- Sofortige erste Siegbedingungsprüfung
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

-- ==============================================================================
-- 4. ABSICHERUNG: RPC ensure_my_role(p_player_id text)
-- ==============================================================================
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

  -- In der Lobby hat noch niemand eine Rolle
  if v_game_state.status = 'Lobby' then
    return jsonb_build_object(
      'success', true,
      'role', 'unassigned',
      'team', 'Gut',
      'assigned', false,
      'status', 'Lobby'
    );
  end if;

  -- 1. Prüfen, ob in player_roles bereits eine gültige Rolle existiert
  select * into v_existing_role from public.player_roles where player_id = p_player_id;
  if found and v_existing_role.role is not null and v_existing_role.role not in ('unassigned', 'Unbekannt') then
    return jsonb_build_object(
      'success', true,
      'role', v_existing_role.role,
      'team', v_existing_role.team,
      'assigned', false
    );
  end if;

  -- 2. Wenn das Spiel läuft und Rolle fehlt -> Atomar vergeben (Nachzügler-Defizitlogik)
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

  -- Fehlbestand ermitteln
  if v_evil_count = 0 or (v_total_count > 0 and (v_evil_count::numeric / v_total_count::numeric) < ((v_vampire_pct + v_werewolf_pct + v_ghost_pct) / 100.0)) then
    -- Böse Rolle vergeben
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

  -- Rolle geheim in player_roles speichern
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

  -- Anfangszahlen in game_state inkrementieren
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

-- ==============================================================================
-- 5. ADMIN: assign_missing_roles(p_admin_code text)
-- ==============================================================================
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

-- ==============================================================================
-- 6. INTEGRATION VON check_win IN ALLE ZUSTANDSÄNDERUNGEN
-- ==============================================================================

-- 6.1 confirm_kill (am Ende check_win aufrufen)
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

  -- Siegbedingungen nach Kill prüfen!
  perform public.check_win('confirm_kill');

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

-- 6.2 exorcise (am Ende check_win aufrufen)
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

    -- Siegbedingungen nach Exorzismus prüfen!
    perform public.check_win('exorcise');

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

-- 6.3 expire_pending_deaths (am Ende check_win aufrufen)
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
        reason, confirmed, confirmed_at, created_at
      ) values (
        null, v_expired_pending.id, 'Nicht bestätigt (Reaktiviert)', v_expired_pending.name,
        'Unbekannt', v_expired_pending.role, 'Böse', v_expired_pending.team,
        'unconfirmed_timeout', false, v_now, v_now
      );
    end if;

    v_expired_count := v_expired_count + 1;
  end loop;

  if v_expired_count > 0 then
    perform public.check_win('expire_pending_deaths');
  end if;

  return jsonb_build_object(
    'success', true,
    'expired_count', v_expired_count,
    'message', v_expired_count || ' ausstehende Tode bereinigt.'
  );
end;
$$;
grant execute on function public.expire_pending_deaths() to anon, authenticated, service_role;

-- 6.4 mark_self_dead
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

-- 6.5 admin_confirm_kill
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
      pending_death_at = null,
      updated_at = v_now
  where id = p_victim_id;

  if p_killer_id is not null then
    select * into v_killer from public.players where id = p_killer_id;
  end if;

  insert into public.kills (
    killer_id, victim_id, killer_name, victim_name,
    killer_role, victim_role, killer_team, victim_team,
    reason, confirmed, confirmed_at, created_at
  ) values (
    p_killer_id, v_victim.id, coalesce(v_killer.name, 'Admin-Bestätigung'), v_victim.name,
    coalesce(v_killer.role, 'Admin'), v_victim.role, 'Böse', v_victim.team,
    'admin_confirmed', true, v_now, v_now
  );

  perform public.check_win('admin_confirm_kill');

  return jsonb_build_object('success', true, 'message', 'Kill manuell bestätigt.');
end;
$$;
grant execute on function public.admin_confirm_kill(text, text, text) to anon, authenticated, service_role;

-- 6.6 admin_revive_player
create or replace function public.admin_revive_player(
  p_admin_code text,
  p_player_id text
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

  update public.players
  set status = 'lebendig',
      pending_death_at = null,
      updated_at = v_now
  where id = p_player_id;

  perform public.check_win('admin_revive_player');

  return jsonb_build_object('success', true, 'message', 'Spieler erfolgreich wiederbelebt.');
end;
$$;
grant execute on function public.admin_revive_player(text, text) to anon, authenticated, service_role;

-- 6.7 admin_player_action
create or replace function public.admin_player_action(
  p_admin_code text,
  p_player_id text,
  p_action text
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

  if p_action = 'entfernen' then
    delete from public.players where id = p_player_id;
  elsif p_action = 'toeten' then
    update public.players set status = 'tot', pending_death_at = null, updated_at = v_now where id = p_player_id;
  elsif p_action = 'wiederbeleben' then
    update public.players set status = 'lebendig', pending_death_at = null, updated_at = v_now where id = p_player_id;
  elsif p_action = 'pausieren' then
    update public.players set status = 'pausiert', updated_at = v_now where id = p_player_id;
  else
    return jsonb_build_object('success', false, 'error', 'Unbekannte Aktion: ' || p_action);
  end if;

  perform public.check_win('admin_player_action');

  return jsonb_build_object('success', true, 'message', 'Aktion erfolgreich ausgeführt: ' || p_action);
end;
$$;
grant execute on function public.admin_player_action(text, text, text) to anon, authenticated, service_role;

-- 6.8 tick_game (ruft am Ende check_win('tick') auf)
create or replace function public.tick_game()
returns jsonb
language plpgsql
security definer
as $$
declare
  v_game_state record;
  v_now timestamptz := now();
  v_start_time timestamptz := clock_timestamp();
  v_duration_ms integer;
  v_expired_res jsonb;
  v_expired_count integer := 0;
  v_tasks_created integer := 0;
  v_moon_action text := 'none';
  v_win_res jsonb;
begin
  select * into v_game_state from public.game_state where id = 'main';
  if not found or v_game_state.status != 'Läuft' then
    return jsonb_build_object('status', 'idle', 'message', 'Spiel läuft nicht');
  end if;

  -- 1. Ausstehende Tode bereinigen
  v_expired_res := public.expire_pending_deaths();
  v_expired_count := coalesce((v_expired_res->>'expired_count')::integer, 0);

  -- 2. Vollmond-Logik
  if v_game_state.active_full_moon is not null and (v_game_state.active_full_moon->>'endsAt')::timestamptz <= v_now then
    update public.game_state
    set active_full_moon = null,
        next_full_moon_at = v_now + ((floor(random() * 21) + 20) * interval '1 minute'),
        updated_at = v_now
    where id = 'main';
    v_moon_action := 'ended';
  elsif v_game_state.active_full_moon is null and v_game_state.next_full_moon_at is not null and v_game_state.next_full_moon_at <= v_now then
    update public.game_state
    set active_full_moon = jsonb_build_object(
          'id', 'moon_' || extract(epoch from v_now)::bigint,
          'startsAt', v_now,
          'endsAt', v_now + interval '5 minutes'
        ),
        next_full_moon_at = null,
        updated_at = v_now
    where id = 'main';
    v_moon_action := 'started';
  end if;

  -- 3. Siegbedingungen auswerten!
  v_win_res := public.check_win('tick');

  -- 4. Timestamp & Tick Log
  update public.game_state set last_tick_at = v_now where id = 'main';

  v_duration_ms := floor(extract(epoch from (clock_timestamp() - v_start_time)) * 1000);

  insert into public.tick_log (tick_at, status, duration_ms, details)
  values (
    v_now,
    'success',
    v_duration_ms,
    jsonb_build_object(
      'expired_pending_count', v_expired_count,
      'moon_action', v_moon_action,
      'win_check', v_win_res
    )
  );

  return jsonb_build_object(
    'status', 'success',
    'expired_pending_count', v_expired_count,
    'moon_action', v_moon_action,
    'win_check', v_win_res
  );
end;
$$;
grant execute on function public.tick_game() to anon, authenticated, service_role;

-- ==============================================================================
-- 7. CACHE RELOADEN
-- ==============================================================================
notify pgrst, 'reload schema';

-- ==============================================================================
-- 8. TEST-ABFRAGEN FÜR DEN SQL-EDITOR
-- ==============================================================================
-- (A) Test-Abfrage: Alle Spieler ohne zugewiesene Rolle bei laufendem Spiel:
-- SELECT p.id, p.name, p.status, pr.role, pr.team
-- FROM public.players p
-- LEFT JOIN public.player_roles pr ON pr.player_id = p.id
-- WHERE p.status != 'entfernt'
--   AND (pr.role IS NULL OR pr.role = 'unassigned');

-- (B) Test-Abfrage: Live-Siegmetriken überprüfen:
-- SELECT
--   count(*) filter (where coalesce(pr.team, p.team) = 'Gut' and p.status in ('lebendig', 'pending_death')) as living_good,
--   count(*) filter (where coalesce(pr.team, p.team) = 'Gut' and p.status = 'tot') as dead_good,
--   count(*) filter (where coalesce(pr.team, p.team) = 'Böse' and p.status in ('lebendig', 'pending_death')) as living_evil,
--   count(*) filter (where coalesce(pr.team, p.team) = 'Böse' and p.status = 'tot') as dead_evil,
--   count(*) filter (where coalesce(pr.role, p.role) = 'Geisterjäger' and p.status in ('lebendig', 'pending_death')) as living_hunters
-- FROM public.players p
-- LEFT JOIN public.player_roles pr ON pr.player_id = p.id
-- WHERE p.status != 'entfernt' and p.is_test = false;

-- (C) Test-Abfrage: Letzte Win-Check-Logs einsehen:
-- SELECT checked_at, trigger_action, living_good, living_evil, living_hunters, good_death_pct, winner_team, end_reason
-- FROM public.win_check_log
-- ORDER BY checked_at DESC
-- LIMIT 10;
