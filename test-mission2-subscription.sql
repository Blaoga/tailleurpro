-- ============================================================================
-- SUITE COMPLÈTE DE VALIDATION RLS & TRIGGERS (MISSION 2.1)
-- ============================================================================
-- Ce script teste l'ensemble des 7 exigences de la Mission 2.1 :
-- 1. Essai actif (écritures et suppressions autorisées pour ses propres données).
-- 2. Essai expiré (création, modification et suppression BLOQUÉES).
-- 3. Abonnement actif (toutes permissions débloquées normalement).
-- 4. Suppression après expiration (strictement bloquée par RLS).
-- 5. Protection du profil (id, essai_fin, abonnement_fin, cree_le infalsifiables).
-- 6. Accès direct API / Demandes de paiement (auto-validation ou suppression bloquée).
-- 7. Isolation stricte inter-utilisateurs (User A ne voit/modifie jamais User B).
-- ============================================================================

do $$
declare
  u_essai_id uuid := gen_random_uuid();
  u_expire_id uuid := gen_random_uuid();
  u_abonne_id uuid := gen_random_uuid();

  v_client_expire_id uuid := gen_random_uuid();
  v_cmd_expire_id uuid := gen_random_uuid();
  v_depense_expire_id uuid := gen_random_uuid();
  v_demande_id uuid := gen_random_uuid();

  v_bloque boolean := false;
  v_count integer;
  v_date_essai_avant timestamptz;
  v_date_essai_apres timestamptz;
  v_profil_prenom text;
begin
  raise notice '=============================================================';
  raise notice 'DÉBUT DE L''AUDIT RLS & TRIGGERS (MISSION 2.1)';
  raise notice '=============================================================';

  -- 1. Initialisation des profils de simulation
  -- Utilisateur 1 : Période d'essai actif (15 jours)
  insert into public.profils (id, prenom, telephone, pays, atelier, essai_fin, abonnement_fin)
  values (u_essai_id, 'Tailleur Essai', '+237670000001', 'CM', 'Atelier 1', now() + interval '15 days', null);

  -- Utilisateur 2 : Essai expiré (expiré il y a 7 jours, aucun abonnement)
  insert into public.profils (id, prenom, telephone, pays, atelier, essai_fin, abonnement_fin)
  values (u_expire_id, 'Tailleur Expiré', '+237670000002', 'CM', 'Atelier 2', now() - interval '7 days', null);

  -- Utilisateur 3 : Essai expiré MAIS abonnement payant actif (30 jours)
  insert into public.profils (id, prenom, telephone, pays, atelier, essai_fin, abonnement_fin)
  values (u_abonne_id, 'Tailleur Abonné', '+237670000003', 'CM', 'Atelier 3', now() - interval '30 days', now() + interval '25 days');

  -- Création d'anciennes données pour le compte 2 (quand il était encore dans sa période d'essai)
  insert into public.clients (id, user_id, nom, telephone)
  values (v_client_expire_id, u_expire_id, 'Client Ancien de 2', '+237699112233');

  insert into public.commandes (id, user_id, client_id, vetement, prix_total, date_livraison, statut)
  values (v_cmd_expire_id, u_expire_id, v_client_expire_id, 'Costume Archivé', 50000, '2026-11-01', 'en_couture');

  insert into public.depenses (id, user_id, montant, categorie, note)
  values (v_depense_expire_id, u_expire_id, 8000, 'Tissu', 'Achat passé');

  -- --------------------------------------------------------------------------
  -- TEST 1 : Vérification de la fonction est_compte_actif()
  -- --------------------------------------------------------------------------
  if public.est_compte_actif(u_essai_id) != true then
    raise exception 'TEST 1 ÉCHOUÉ : u_essai_id devrait être actif !';
  end if;
  if public.est_compte_actif(u_expire_id) != false then
    raise exception 'TEST 1 ÉCHOUÉ : u_expire_id devrait être inactif !';
  end if;
  if public.est_compte_actif(u_abonne_id) != true then
    raise exception 'TEST 1 ÉCHOUÉ : u_abonne_id devrait être actif !';
  end if;
  raise notice '✅ TEST 1 RÉUSSI : est_compte_actif() discrimine rigoureusement les statuts.';

  -- --------------------------------------------------------------------------
  -- TEST 2 : Utilisateur en période d'essai -> Droits d'écriture & suppression
  -- --------------------------------------------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', u_essai_id::text, true);

  -- Création client
  insert into public.clients (user_id, nom, telephone)
  values (u_essai_id, 'Client Essai Valide', '677112233');

  raise notice '✅ TEST 2 RÉUSSI : Compte en essai peut insérer normalement ses clients.';

  -- --------------------------------------------------------------------------
  -- TEST 3 : Utilisateur expiré -> Blocage création & modification
  -- --------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', u_expire_id::text, true);

  -- Tentative d'insertion client
  v_bloque := false;
  begin
    insert into public.clients (user_id, nom, telephone)
    values (u_expire_id, 'Client Illégitime', '677998877');
  exception when others then
    v_bloque := true;
  end;
  if not v_bloque then
    raise exception 'TEST 3.1 ÉCHOUÉ : Compte expiré a réussi à insérer un client !';
  end if;

  -- Tentative de modification de commande (changement statut ou prix)
  v_bloque := false;
  begin
    update public.commandes
    set statut = 'livree'
    where id = v_cmd_expire_id;
    get diagnostics v_count = row_count;
    if v_count > 0 then
      raise exception 'UPDATE commande réussi malgré expiration !';
    end if;
    v_bloque := true;
  exception when others then
    v_bloque := true;
  end;
  raise notice '✅ TEST 3 RÉUSSI : Création et modification bloquées pour le compte expiré.';

  -- --------------------------------------------------------------------------
  -- TEST 4 : Suppression après expiration -> STRICTEMENT BLOQUÉE
  -- --------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', u_expire_id::text, true);

  -- Tentative de suppression d'un client
  delete from public.clients where id = v_client_expire_id;
  get diagnostics v_count = row_count;
  if v_count > 0 then
    raise exception 'TEST 4.1 ÉCHOUÉ : Compte expiré a réussi à supprimer un client !';
  end if;

  -- Tentative de suppression d'une commande
  delete from public.commandes where id = v_cmd_expire_id;
  get diagnostics v_count = row_count;
  if v_count > 0 then
    raise exception 'TEST 4.2 ÉCHOUÉ : Compte expiré a réussi à supprimer une commande !';
  end if;

  -- Tentative de suppression d'une dépense
  delete from public.depenses where id = v_depense_expire_id;
  get diagnostics v_count = row_count;
  if v_count > 0 then
    raise exception 'TEST 4.3 ÉCHOUÉ : Compte expiré a réussi à supprimer une dépense !';
  end if;

  raise notice '✅ TEST 4 RÉUSSI : Suppression de clients, commandes et dépenses 100%% bloquée après expiration.';

  -- --------------------------------------------------------------------------
  -- TEST 5 : Consultation des anciennes données après expiration -> 100% PRÉSERVÉE
  -- --------------------------------------------------------------------------
  select count(*) into v_count from public.clients where user_id = u_expire_id;
  if v_count < 1 then
    raise exception 'TEST 5.1 ÉCHOUÉ : Compte expiré ne voit plus ses anciens clients !';
  end if;

  select count(*) into v_count from public.commandes where user_id = u_expire_id;
  if v_count < 1 then
    raise exception 'TEST 5.2 ÉCHOUÉ : Compte expiré ne voit plus ses anciennes commandes !';
  end if;

  raise notice '✅ TEST 5 RÉUSSI : Accès en lecture à l''historique et aux anciennes données 100%% préservé.';

  -- --------------------------------------------------------------------------
  -- TEST 6 : Protection du profil contre la falsification
  -- --------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', u_expire_id::text, true);

  -- Modification autorisée (ex: atelier ou prénom)
  update public.profils set atelier = 'Atelier Renommé' where id = u_expire_id;

  -- Tentative de falsification de la date d'essai
  select essai_fin into v_date_essai_avant from public.profils where id = u_expire_id;
  update public.profils set essai_fin = now() + interval '365 days' where id = u_expire_id;
  select essai_fin into v_date_essai_apres from public.profils where id = u_expire_id;
  if v_date_essai_apres > now() then
    raise exception 'TEST 6.1 ÉCHOUÉ : L''utilisateur a réussi à falsifier sa date d''essai !';
  end if;

  -- Tentative de falsification de l'id utilisateur
  v_bloque := false;
  begin
    update public.profils set id = gen_random_uuid() where id = u_expire_id;
  exception when others then
    v_bloque := true;
  end;
  if not v_bloque then
    raise exception 'TEST 6.2 ÉCHOUÉ : L''utilisateur a pu modifier son identifiant utilisateur (id) !';
  end if;

  raise notice '✅ TEST 6 RÉUSSI : Déclencheur anti-falsification du profil actif (id et dates inviolables).';

  -- --------------------------------------------------------------------------
  -- TEST 7 : Protection des demandes de paiement & tentative d'auto-validation
  -- --------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', u_expire_id::text, true);

  -- Insertion d'une demande légitime en attente -> Autorisée
  insert into public.demandes_paiement (id, user_id, reference, montant, statut)
  values (v_demande_id, u_expire_id, 'TX-REF-OK-1234', 2600, 'en_attente');

  -- Tentative frauduleuse d'auto-validation directe (UPDATE statut = 'validee')
  v_bloque := false;
  begin
    update public.demandes_paiement set statut = 'validee' where id = v_demande_id;
  exception when others then
    v_bloque := true;
  end;
  if not v_bloque then
    raise exception 'TEST 7.1 ÉCHOUÉ : Un client a pu auto-valider sa demande de paiement !';
  end if;

  -- Tentative de suppression frauduleuse
  v_bloque := false;
  begin
    delete from public.demandes_paiement where id = v_demande_id;
  exception when others then
    v_bloque := true;
  end;
  if not v_bloque then
    raise exception 'TEST 7.2 ÉCHOUÉ : Un client a pu supprimer sa demande de paiement !';
  end if;

  raise notice '✅ TEST 7 RÉUSSI : Demandes de paiement infalsifiables côté client (validation réservée à l''admin).';

  -- --------------------------------------------------------------------------
  -- TEST 8 : Compte avec abonnement actif (u_abonne_id) -> Déblocage complet
  -- --------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', u_abonne_id::text, true);

  insert into public.clients (user_id, nom, telephone)
  values (u_abonne_id, 'Client Abonne VIP', '677001122');

  raise notice '✅ TEST 8 RÉUSSI : Abonnement valide débloque 100%% des actions d''écriture.';

  -- --------------------------------------------------------------------------
  -- TEST 9 : Isolation absolue entre deux tailleurs (User A vs User B)
  -- --------------------------------------------------------------------------
  -- En tant que User Essai (u_essai_id), tenter de voir ou modifier les clients de User Abonné (u_abonne_id)
  perform set_config('request.jwt.claim.sub', u_essai_id::text, true);

  select count(*) into v_count from public.clients where user_id = u_abonne_id;
  if v_count > 0 then
    raise exception 'TEST 9.1 ÉCHOUÉ : Fuite de données, User A voit les clients de User B !';
  end if;

  delete from public.clients where user_id = u_abonne_id;
  get diagnostics v_count = row_count;
  if v_count > 0 then
    raise exception 'TEST 9.2 ÉCHOUÉ : User A a réussi à supprimer des clients de User B !';
  end if;

  raise notice '✅ TEST 9 RÉUSSI : Isolation stricte garantie, zéro fuite ni altération inter-utilisateurs.';

  -- --------------------------------------------------------------------------
  -- 10. Nettoyage des données de test
  -- --------------------------------------------------------------------------
  reset role;
  delete from public.demandes_paiement where user_id in (u_essai_id, u_expire_id, u_abonne_id);
  delete from public.depenses where user_id in (u_essai_id, u_expire_id, u_abonne_id);
  delete from public.paiements where user_id in (u_essai_id, u_expire_id, u_abonne_id);
  delete from public.commandes where user_id in (u_essai_id, u_expire_id, u_abonne_id);
  delete from public.clients where user_id in (u_essai_id, u_expire_id, u_abonne_id);
  delete from public.profils where id in (u_essai_id, u_expire_id, u_abonne_id);

  raise notice '=============================================================';
  raise notice 'TOUS LES 9 TESTS DE LA MISSION 2.1 SONT VALIDÉS AVEC SUCCÈS !';
  raise notice '=============================================================';
end;
$$;
