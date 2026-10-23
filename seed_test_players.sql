-- ==============================================================================
-- TESTDATEN: 100 SPIELER FÜR LAST- UND ROLLEN-TESTS (is_test = true)
-- ==============================================================================

insert into public.players (
  id, name, costume_name, photo_url, role, team, status, points, kills_count, tasks_completed_count, is_test, created_at
)
select
  'test_p_' || lpad(i::text, 3, '0') as id,
  'Test ' || lpad(i::text, 3, '0') as name,
  case (i % 8)
    when 0 then 'Gräfin Dracula'
    when 1 then 'Skelett-Krieger'
    when 2 then 'Zombie-Braut'
    when 3 then 'Werwolf vom Schwarzwald'
    when 4 then 'Geister-Pirat'
    when 5 then 'Dunkle Hexe'
    when 6 then 'Kürbis-Monster'
    else 'Mumie von Luxor'
  end as costume_name,
  'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=300&q=80' as photo_url,
  'unassigned' as role,
  'Gut' as team,
  'lebendig' as status,
  0 as points,
  0 as kills_count,
  0 as tasks_completed_count,
  true as is_test,
  now() - (i * interval '10 seconds') as created_at
from generate_series(1, 100) as s(i)
on conflict (id) do update set
  is_test = true,
  status = 'lebendig',
  points = 0,
  role = 'unassigned',
  team = 'Gut';

notify pgrst, 'reload schema';
