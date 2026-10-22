-- ==============================================================================
-- NEUER KILL-ABLAUF, FOTO-AUFGABEN & SPEZIALAUFGABEN (tick_game & RPCs)
-- ==============================================================================

-- 1. TABELLE PLAYERS: Status Constraint & pending_death_at Spalte
alter table public.players drop constraint if exists players_status_check;
alter table public.players add constraint players_status_check 
  check (status in ('lebendig', 'tot', 'pending_death', 'tod_ausstehend', 'entfernt', 'pausiert'));

alter table public.players add column if not exists pending_death_at timestamptz;

-- 2. TABELLE PLAYER_PHOTO_TASKS (Serverseitige Foto-Aufgaben mit Zeitfenster & Slot-Unique)
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

create index if not exists idx_player_photo_tasks_player on public.player_photo_tasks (player_id, status);
create index if not exists idx_player_photo_tasks_expires on public.player_photo_tasks (expires_at);

-- 3. TABELLE SPECIAL_TASKS (Mini-Spiele für lebende Menschen)
create table if not exists public.special_tasks (
  id uuid primary key default gen_random_uuid(),
  player_id text not null references public.players(id) on delete cascade,
  type text not null check (type in ('math', 'anagram', 'sequence', 'quiz', 'code', 'qr_code', 'photo_motif')),
  title text not null,
  description text not null,
  points integer not null default 20,
  task_data jsonb not null default '{}'::jsonb,
  reward_player_id text,
  reward_player_name text,
  reward_role text,
  status text not null default 'pending' check (status in ('pending', 'completed', 'expired')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  completed_at timestamptz
);

create index if not exists idx_special_tasks_player_status on public.special_tasks (player_id, status);

-- 4. KILLS TABELLE: Reason-Check & Spalten aktualisieren
alter table public.kills alter column killer_id drop not null;
alter table public.kills alter column killer_name drop not null;
alter table public.kills drop constraint if exists kills_killer_id_fkey;
alter table public.kills add constraint kills_killer_id_fkey 
  foreign key (killer_id) references public.players(id) on delete set null;

-- 5. RLS POLICIES FÜR ALLE TABELLEN
alter table public.player_photo_tasks enable row level security;
drop policy if exists "Allow public all player_photo_tasks" on public.player_photo_tasks;
create policy "Allow public all player_photo_tasks" on public.player_photo_tasks for all to public using (true) with check (true);

alter table public.special_tasks enable row level security;
drop policy if exists "Allow public all special_tasks" on public.special_tasks;
create policy "Allow public all special_tasks" on public.special_tasks for all to public using (true) with check (true);

grant all on table public.player_photo_tasks to anon, authenticated;
grant all on table public.special_tasks to anon, authenticated;
grant all on table public.players to anon, authenticated;
grant all on table public.kills to anon, authenticated;

-- Realtime Registration
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'player_photo_tasks') then
    alter publication supabase_realtime add table public.player_photo_tasks;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'special_tasks') then
    alter publication supabase_realtime add table public.special_tasks;
  end if;
exception when others then null;
end;
$$;

-- ==============================================================================
-- 6. RPC: report_pending_death (Opfer meldet sich als getötet)
-- ==============================================================================
create or replace function public.report_pending_death(
  p_player_id text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_player record;
begin
  select * into v_player from public.players where id = p_player_id;
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
-- 7. RPC: confirm_kill (Täter bestätigt Kill an einem pending_death Opfer)
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
begin
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

  if v_killer.role not in ('Vampir', 'Werwolf', 'Geist') then
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
  if v_killer.role = 'Werwolf' then
    if v_game_state.active_full_moon is not null and (v_game_state.active_full_moon->>'endsAt')::timestamptz > v_now then
      v_is_full_moon := true;
    end if;
    if not v_is_full_moon then
      return jsonb_build_object('success', false, 'error', 'Werwölfe können nur bei aktivem Vollmond töten!');
    end if;
  end if;

  -- 6. Geister-Regel: Allein im Raum Pflicht-Checkbox
  if v_killer.role = 'Geist' and not p_ghost_solo then
    return jsonb_build_object('success', false, 'error', 'Als Geist musst du bestätigen, dass du mit dem Opfer allein im Raum warst!');
  end if;

  -- 7. Opfer prüfen & atomar sperren (FOR UPDATE verhindert Doppel-Kills durch zwei Täter gleichzeitig!)
  select * into v_victim 
  from public.players 
  where id = p_victim_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Opfer nicht gefunden');
  end if;

  if v_victim.status not in ('pending_death', 'tod_ausstehend') then
    return jsonb_build_object('success', false, 'error', 'Dieses Opfer wurde bereits von einem anderen Täter bestätigt oder ist nicht mehr im Status Tod ausstehend!');
  end if;

  -- 8. Cooldown berechnen
  if v_killer.role = 'Vampir' then
    v_cooldown_minutes := coalesce((v_settings->>'vampireCooldownMinutes')::integer, 6);
  elsif v_killer.role = 'Werwolf' then
    v_cooldown_minutes := coalesce((v_settings->>'werewolfCooldownMinutes')::integer, 2);
  elsif v_killer.role = 'Geist' then
    v_cooldown_minutes := coalesce((v_settings->>'ghostCooldownMinutes')::integer, 6);
  else
    v_cooldown_minutes := 6;
  end if;
  v_cooldown_until := v_now + (v_cooldown_minutes * interval '1 minute');

  -- 9. Opfer endgültig auf 'tot' setzen
  update public.players
  set status = 'tot',
      pending_death_at = null
  where id = p_victim_id;

  -- 10. Täter Punkte & Cooldown gutschreiben
  update public.players
  set points = points + 15,
      kills_count = kills_count + 1,
      last_kill_at = v_now,
      cooldown_until = v_cooldown_until
  where id = p_killer_id;

  -- 11. Kill-Eintrag anlegen
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
    ghost_solo_confirmed,
    confirmed,
    confirmed_at,
    created_at
  ) values (
    v_killer.id,
    v_victim.id,
    v_killer.name,
    v_victim.name,
    v_killer.role,
    v_victim.role,
    'Böse',
    v_victim.team,
    'kill',
    p_ghost_solo,
    true,
    v_now,
    v_now
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
-- 8. RPC: admin_confirm_kill & admin_revive_player
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
  v_is_valid boolean;
  v_now timestamptz := now();
begin
  v_is_valid := public.check_admin_code(p_admin_code);
  if not v_is_valid then
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
    killer_id,
    victim_id,
    killer_name,
    victim_name,
    killer_role,
    victim_role,
    reason,
    confirmed,
    confirmed_at
  ) values (
    case when v_killer.id is not null then v_killer.id else null end,
    v_victim.id,
    case when v_killer.name is not null then v_killer.name else 'Admin-Bestätigung' end,
    v_victim.name,
    case when v_killer.role is not null then v_killer.role else 'Unbekannt' end,
    v_victim.role,
    'admin_confirmed',
    true,
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
declare
  v_is_valid boolean;
begin
  v_is_valid := public.check_admin_code(p_admin_code);
  if not v_is_valid then
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

-- ==============================================================================
-- 9. FUNKTION: tick_game() (Minütlicher zeitgesteuerter Spielablauf)
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
  
  -- Pending death timeout
  v_pending_timeout_min integer := 4;
  v_unconfirmed_action text := 'revive';
  v_expired_pending record;
  v_expired_count integer := 0;

  -- Photo tasks
  v_photo_interval_min integer := 10;
  v_current_slot integer := 0;
  v_living_players record;
  v_open_tasks_count integer;
  v_other_players text[];
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
  v_living_humans record;
  v_chosen_humans text[];
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
  -- 1. Game State prüfen
  select * into v_game_state from public.game_state where id = 'main';
  if not found or v_game_state.status != 'Läuft' or v_game_state.started_at is null then
    return jsonb_build_object('status', 'idle', 'reason', 'Spiel läuft nicht');
  end if;

  v_settings := coalesce(v_game_state.settings, '{}'::jsonb);
  v_elapsed_seconds := extract(epoch from (v_now - v_game_state.started_at));
  v_elapsed_minutes := floor(v_elapsed_seconds / 60);

  -- ----------------------------------------------------------------------------
  -- A) PENDING DEATHS PRÜFEN (Keine Bestätigung innerhalb von 4 Min)
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
      -- Als tot lassen
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
      -- Standard: Wiederbeleben (Status lebendig)
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
        'unconfirmed', false, v_now
      );
    end if;
    v_expired_count := v_expired_count + 1;
  end loop;

  -- ----------------------------------------------------------------------------
  -- B) FOTO-AUFGABEN GENERIERUNG (Alle 10 Min, max 3 offen, 30 Min Frist)
  -- ----------------------------------------------------------------------------
  -- 1. Veraltete offene Aufgaben nach 30 Min verfallen lassen
  update public.player_photo_tasks
  set status = 'expired'
  where status = 'open' and v_now > expires_at;

  v_photo_interval_min := coalesce((v_settings->>'photoTaskIntervalMinutes')::integer, 10);
  if v_photo_interval_min < 5 then v_photo_interval_min := 5; end if;
  v_current_slot := floor(v_elapsed_minutes / v_photo_interval_min);

  -- Kostümpool aller aktiven Spieler sammeln
  select array_agg(distinct costume_name) into v_costume_pool
  from public.players
  where status != 'entfernt';

  for v_living_players in
    select * from public.players where status = 'lebendig'
  loop
    -- Prüfen wie viele Aufgaben aktuell offen sind (max 3 gleichzeitig)
    select count(*) into v_open_tasks_count
    from public.player_photo_tasks
    where player_id = v_living_players.id and status = 'open';

    if v_open_tasks_count < 3 then
      -- Prüfen ob für diesen Zeitslot bereits eine Aufgabe existiert
      if not exists (
        select 1 from public.player_photo_tasks
        where player_id = v_living_players.id and slot_number = v_current_slot
      ) then
        -- Zufälligen Aufgabentyp wählen (1 bis 4)
        v_task_type_int := floor(random() * 4) + 1;

        -- Zufälligen Mitspieler suchen (lebendig, nicht man selbst)
        select * into v_random_target
        from public.players
        where status = 'lebendig' and id != v_living_players.id
        order by random()
        limit 1;

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
          v_group_size := floor(random() * 6) + 3; -- 3 bis 8 Leute
          v_task_title := 'Gruppenfoto (' || v_group_size || ' Personen)';
          v_task_desc := 'Trommle mindestens ' || v_group_size || ' Partygäste für ein gruseliges Gruppenfoto zusammen!';
        else
          v_task_type := 'two_players';
          select * into v_second_target
          from public.players
          where status = 'lebendig' and id != v_living_players.id and id != coalesce(v_random_target.id, '')
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
          player_id,
          slot_number,
          title,
          description,
          task_type,
          target_player_id,
          target_player_name,
          target_player_costume,
          target_player_photo,
          target_second_player_id,
          target_second_player_name,
          target_second_player_costume,
          target_second_player_photo,
          target_costume_name,
          group_count,
          points,
          status,
          created_at,
          expires_at
        ) values (
          v_living_players.id,
          v_current_slot,
          v_task_title,
          v_task_desc,
          v_task_type,
          v_random_target.id,
          v_random_target.name,
          v_random_target.costume_name,
          v_random_target.photo_url,
          v_second_target.id,
          v_second_target.name,
          v_second_target.costume_name,
          v_second_target.photo_url,
          v_random_costume,
          v_group_size,
          10,
          'open',
          v_now,
          v_now + interval '30 minutes'
        )
        on conflict (player_id, slot_number) do nothing;

        v_created_photo_tasks := v_created_photo_tasks + 1;
      end if;
    end if;
  end loop;

  -- ----------------------------------------------------------------------------
  -- C) SPEZIALAUFGABEN (Nur lebende Menschen, alle 10-20 Min, 10 Min Frist)
  -- ----------------------------------------------------------------------------
  -- 1. Veraltete Spezialaufgaben nach 10 Min verfallen lassen
  update public.special_tasks
  set status = 'expired'
  where status = 'pending' and v_now > expires_at;

  v_last_special := v_game_state.last_special_task_at;
  v_special_interval_min := coalesce(v_game_state.next_special_task_interval_minutes, 15);

  if v_last_special is null or (v_now >= v_last_special + (v_special_interval_min * interval '1 minute')) then
    -- Zufällig 1 bis 2 lebende Menschen auswählen, die keine offene Spezialaufgabe haben
    for v_human_id in
      select id from public.players
      where role = 'Mensch' and status = 'lebendig'
        and id not in (select player_id from public.special_tasks where status = 'pending')
      order by random()
      limit (floor(random() * 2) + 1)
    loop
      -- Zufälliges Mini-Spiel (1: Math, 2: Anagram, 3: Sequence, 4: Quiz, 5: Code)
      v_special_type_int := floor(random() * 5) + 1;

      -- Zufälligen bösen Mitspieler für Enthüllungs-Belohnung suchen
      select * into v_evil_target
      from public.players
      where status = 'lebendig' and role in ('Vampir', 'Werwolf', 'Geist')
      order by random()
      limit 1;

      if v_evil_target.id is null then
        select * into v_evil_target
        from public.players
        where status != 'entfernt' and id != v_human_id
        order by random()
        limit 1;
      end if;

      if v_special_type_int = 1 then
        v_special_type := 'math';
        v_special_title := 'Kopfrechnen-Challenge';
        v_special_desc := 'Löse 3 Rechenaufgaben in 60 Sekunden!';
        v_special_data := jsonb_build_object(
          'type', 'math',
          'timeLimitSeconds', 60
        );
      elsif v_special_type_int = 2 then
        v_special_type := 'anagram';
        v_special_title := 'Halloween-Anagramm';
        v_special_desc := 'Entschlüssele das durcheinandergewürfelte Gruselwort!';
        v_special_data := jsonb_build_object(
          'type', 'anagram',
          'timeLimitSeconds', 30
        );
      elsif v_special_type_int = 3 then
        v_special_type := 'sequence';
        v_special_title := 'Merk-Sequenz';
        v_special_desc := 'Merke dir die Reihenfolge der 5 Grusel-Symbole!';
        v_special_data := jsonb_build_object(
          'type', 'sequence',
          'timeLimitSeconds', 40
        );
      elsif v_special_type_int = 4 then
        v_special_type := 'quiz';
        v_special_title := 'Halloween-Quizfrage';
        v_special_desc := 'Beantworte die Gruselfrage in 20 Sekunden!';
        v_special_data := jsonb_build_object(
          'type', 'quiz',
          'timeLimitSeconds', 20
        );
      else
        v_special_type := 'code';
        v_special_title := 'Geheimcode knacken';
        v_special_desc := 'Finde den 4-stelligen Zahlencode in 45 Sekunden heraus!';
        v_special_data := jsonb_build_object(
          'type', 'code',
          'timeLimitSeconds', 45
        );
      end if;

      insert into public.special_tasks (
        player_id,
        type,
        title,
        description,
        points,
        task_data,
        reward_player_id,
        reward_player_name,
        reward_role,
        status,
        created_at,
        expires_at
      ) values (
        v_human_id,
        v_special_type,
        v_special_title,
        v_special_desc,
        20,
        v_special_data,
        v_evil_target.id,
        v_evil_target.name,
        v_evil_target.role,
        'pending',
        v_now,
        v_now + interval '10 minutes'
      );

      v_created_special_tasks := v_created_special_tasks + 1;
    end loop;

    -- Nächstes zufälliges Intervall (10 bis 20 Minuten) festlegen
    update public.game_state
    set last_special_task_at = v_now,
        next_special_task_interval_minutes = floor(random() * 11) + 10
    where id = 'main';
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'tick_at', v_now,
    'elapsed_minutes', v_elapsed_minutes,
    'current_slot', v_current_slot,
    'expired_pending_deaths', v_expired_count,
    'created_photo_tasks', v_created_photo_tasks,
    'created_special_tasks', v_created_special_tasks
  );
end;
$$;

grant execute on function public.tick_game() to anon, authenticated, service_role;

-- ==============================================================================
-- 10. CRON SCHEDULER: pg_cron einbinden falls verfügbar
-- ==============================================================================
create extension if not exists pg_cron;
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

-- Schema-Cache von Supabase PostgREST aktualisieren
notify pgrst, 'reload schema';
