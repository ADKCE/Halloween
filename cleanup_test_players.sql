-- ==============================================================================
-- CLEANUP: ALLE TEST-SPIELER (is_test = true) ENTFERNEN
-- ==============================================================================

-- 1. Kills von oder an Testspielern löschen
delete from public.kills
where killer_id in (select id from public.players where is_test = true)
   or victim_id in (select id from public.players where is_test = true);

-- 2. Foto-Aufgaben von Testspielern löschen
delete from public.player_photo_tasks
where player_id in (select id from public.players where is_test = true);

-- 3. Spezialaufgaben von Testspielern löschen
delete from public.special_tasks
where player_id in (select id from public.players where is_test = true);

-- 4. Rollen-Einträge von Testspielern löschen
delete from public.player_roles
where player_id in (select id from public.players where is_test = true);

-- 5. Testspieler selbst löschen
delete from public.players
where is_test = true or id like 'test_p_%';

notify pgrst, 'reload schema';
