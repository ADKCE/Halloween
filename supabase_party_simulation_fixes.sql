-- ==============================================================================
-- HALLOWEEN PARTY GAME - FIXES AUS DER 24-SPIELER-SIMULATION
-- ==============================================================================
-- 1. Schonfrist- & Friendly-Fire-Schutz in exorcise()
-- 2. Vollständige Rollenauflösung aller Spieler bei Spielende in check_win()
-- 3. Admin-RPCs für manuellen Rollenwechsel & Punkteanpassung
-- 4. Notfall-Rollenauflösung admin_reveal_all_roles()
-- ==============================================================================

-- 1. exorcise (Geisterjäger bannt böse Rolle - mit Schonfrist & Jäger-Schutz)
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
  v_grace_minutes integer := 15;
begin
  if p_hunter_id = p_target_id then
    return jsonb_build_object('success', false, 'error', 'Du kannst dich nicht selbst bannen!');
  end if;

  select * into v_game_state from public.game_state where id = 'main';
  if not found or v_game_state.status != 'Läuft' then
    return jsonb_build_object('success', false, 'error', 'Das Spiel läuft derzeit nicht');
  end if;
  v_settings := coalesce(v_game_state.settings, '{}'::jsonb);

  -- Schonfrist-Prüfung
  v_grace_minutes := coalesce((v_settings->>'gracePeriodMinutes')::integer, 15);
  if v_game_state.started_at is not null and (v_now < v_game_state.started_at + (v_grace_minutes * interval '1 minute')) then
    return jsonb_build_object('success', false, 'error', 'Schonfrist ist noch aktiv! Exorzismus noch nicht erlaubt.');
  end if;

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

  -- Schutz vor Friendly Fire: Geisterjäger können sich nicht gegenseitig bannen
  if v_target_role = 'Geisterjäger' then
    return jsonb_build_object('success', false, 'error', 'Du kannst keinen Mit-Jäger bannen!');
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

    perform public.check_win('exorcism_hit');

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

-- 2. check_win (mit Rollenauflösung aller Spieler bei Spielende)
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

    -- ROLLENAUFLÖSUNG: Rollen aller Spieler aus player_roles in players aufdecken!
    update public.players p
    set role = coalesce(pr.role, p.role, 'Mensch'),
        team = coalesce(pr.team, p.team, 'Gut'),
        updated_at = v_now
    from public.player_roles pr
    where p.id = pr.player_id;

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

-- 3. admin_set_player_role (Admin kann Rolle manuell ändern)
create or replace function public.admin_set_player_role(
  p_admin_code text,
  p_player_id text,
  p_new_role text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_new_team text;
  v_game_state record;
  v_now timestamptz := now();
begin
  if not public.check_admin_code(p_admin_code) then
    return jsonb_build_object('success', false, 'error', 'Ungültiger Admin-Code');
  end if;

  if p_new_role not in ('Mensch', 'Geisterjäger', 'Vampir', 'Werwolf', 'Geist') then
    return jsonb_build_object('success', false, 'error', 'Ungültige Rolle: ' || coalesce(p_new_role, 'null'));
  end if;

  v_new_team := case when p_new_role in ('Vampir', 'Werwolf', 'Geist') then 'Böse' else 'Gut' end;

  select * into v_game_state from public.game_state where id = 'main';

  insert into public.player_roles (player_id, role, team, updated_at)
  values (p_player_id, p_new_role, v_new_team, v_now)
  on conflict (player_id) do update set
    role = excluded.role,
    team = excluded.team,
    updated_at = excluded.updated_at;

  update public.players
  set role = case when v_game_state.status = 'Beendet' or status = 'tot' then p_new_role else 'unassigned' end,
      team = v_new_team,
      updated_at = v_now
  where id = p_player_id;

  perform public.check_win('admin_set_role');

  return jsonb_build_object(
    'success', true,
    'message', 'Rolle erfolgreich auf ' || p_new_role || ' (' || v_new_team || ') geändert.',
    'role', p_new_role,
    'team', v_new_team
  );
end;
$$;
grant execute on function public.admin_set_player_role(text, text, text) to anon, authenticated, service_role;

-- 4. admin_adjust_player_points (Admin kann Punkte manuell anpassen)
create or replace function public.admin_adjust_player_points(
  p_admin_code text,
  p_player_id text,
  p_points_delta integer,
  p_reason text default 'admin_adjustment'
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_now timestamptz := now();
  v_new_total integer := 0;
begin
  if not public.check_admin_code(p_admin_code) then
    return jsonb_build_object('success', false, 'error', 'Ungültiger Admin-Code');
  end if;

  if not exists (select 1 from public.players where id = p_player_id) then
    return jsonb_build_object('success', false, 'error', 'Spieler nicht gefunden');
  end if;

  insert into public.points_log (player_id, reason, amount, ref_id, created_at)
  values (p_player_id, coalesce(p_reason, 'admin_adjustment'), p_points_delta, 'admin_' || gen_random_uuid()::text, v_now);

  select coalesce(sum(amount), 0) into v_new_total
  from public.points_log where player_id = p_player_id;

  update public.players
  set points = v_new_total,
      updated_at = v_now
  where id = p_player_id;

  return jsonb_build_object(
    'success', true,
    'message', 'Punkte erfolgreich angepasst. Neuer Punktestand: ' || v_new_total,
    'points_delta', p_points_delta,
    'new_total_points', v_new_total
  );
end;
$$;
grant execute on function public.admin_adjust_player_points(text, text, integer, text) to anon, authenticated, service_role;

-- 5. admin_reveal_all_roles (Notfall-Rollenauflösung)
create or replace function public.admin_reveal_all_roles(p_admin_code text default null)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_count integer := 0;
begin
  if p_admin_code is not null and not public.check_admin_code(p_admin_code) then
    return jsonb_build_object('success', false, 'error', 'Ungültiger Admin-Code');
  end if;

  update public.players p
  set role = coalesce(pr.role, p.role, 'Mensch'),
      team = coalesce(pr.team, p.team, 'Gut'),
      updated_at = now()
  from public.player_roles pr
  where p.id = pr.player_id;

  get diagnostics v_count = row_count;

  return jsonb_build_object('success', true, 'revealed_count', v_count, 'message', v_count || ' Rollen erfolgreich aufgedeckt.');
end;
$$;
grant execute on function public.admin_reveal_all_roles(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
