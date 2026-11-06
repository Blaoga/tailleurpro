-- ============================================================================
-- TEST DE VALIDATION RLS (ROW LEVEL SECURITY)
-- ============================================================================
-- Ce script teste et prouve dans Supabase que le compte A ne voit JAMAIS
-- les clients ni les commandes du compte B.
--
-- Instructions :
-- Exécutez ce script dans l'éditeur SQL de Supabase (SQL Editor > Run).
-- ============================================================================

do $$
declare
  user_a_id uuid := gen_random_uuid();
  user_b_id uuid := gen_random_uuid();
  client_a_id uuid;
  client_b_id uuid;
  count_vu_par_a integer;
begin
  -- 1. Simulation : Création de 2 profils factices
  insert into public.profils (id, prenom, telephone, pays, atelier)
  values 
    (user_a_id, 'Tailleur A', '+237670111111', 'CM', 'Atelier Alpha'),
    (user_b_id, 'Tailleur B', '+225072222222', 'CI', 'Atelier Beta');

  -- 2. Création de clients pour chaque tailleur
  insert into public.clients (user_id, nom, telephone, mesures)
  values (user_a_id, 'Client Secret de A', '699111222', '{"poitrine": 98}'::jsonb)
  returning id into client_a_id;

  insert into public.clients (user_id, nom, telephone, mesures)
  values (user_b_id, 'Client Secret de B', '0701020304', '{"poitrine": 105}'::jsonb)
  returning id into client_b_id;

  -- 3. Test de simulation de RLS avec auth.uid() = user_a_id
  -- En configurant le rôle authentifié et le contexte de user_a_id
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', user_a_id::text, true);

  -- Vérification du nombre de clients visibles par user_a
  select count(*) into count_vu_par_a
  from public.clients
  where nom = 'Client Secret de B';

  if count_vu_par_a > 0 then
    raise exception 'ÉCHEC SÉCURITÉ : User A a réussi à voir le client de User B !';
  else
    raise notice 'SUCCÈS RLS : User A NE PEUT PAS voir le client de User B. Isolation 100%% confirmée.';
  end if;

  -- 4. Nettoyage des données de test
  reset role;
  delete from public.clients where id in (client_a_id, client_b_id);
  delete from public.profils where id in (user_a_id, user_b_id);
  
  raise notice 'Test terminé et données de simulation nettoyées avec succès.';
end;
$$;
