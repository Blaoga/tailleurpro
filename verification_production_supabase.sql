-- ============================================================================
-- TAILLEUR PRO — SCRIPT DE CONTRÔLE ET VÉRIFICATION SUPABASE EN PRODUCTION
-- MISSION 2.2 : AUDIT ET VALIDATION DU DÉPLOIEMENT DE SÉCURITÉ
-- ============================================================================
-- MODE D'EMPLOI :
-- 1. Connectez-vous à votre console Supabase (https://supabase.com).
-- 2. Ouvrez votre projet "Tailleur Pro".
-- 3. Accédez à la section "SQL Editor" dans le menu de gauche.
-- 4. Ouvrez un nouvel onglet ("New query").
-- 5. Exécutez l'une ou l'ensemble des requêtes ci-dessous.
--
-- GARANTIE :
-- Ce script est 100% en LECTURE SEULE. Il n'altère aucune donnée et n'interrompt
-- aucun service en production.
-- ============================================================================

-- ============================================================================
-- REQUÊTE GLOBALE 1-CLIC : TABLEAU DE BORD DE CONFORMITÉ DE PRODUCTION
-- ============================================================================
-- Exécutez ce bloc pour obtenir un diagnostic instantané et synthétique :

with
-- 1. Vérification RLS
rls_check as (
  select
    count(*) filter (where rowsecurity = true) as nb_rls_ok,
    count(*) as nb_tables_total
  from pg_tables
  where schemaname = 'public'
    and tablename in ('profils', 'clients', 'commandes', 'paiements', 'depenses', 'demandes_paiement')
),
-- 2. Vérification Politiques RLS (20 attendues au total)
policies_check as (
  select
    count(*) filter (where policyname in (
      'profils_select_propre', 'profils_update_propre',
      'clients_select_propre', 'clients_insert_si_actif', 'clients_update_si_actif', 'clients_delete_si_actif',
      'commandes_select_propre', 'commandes_insert_si_actif', 'commandes_update_si_actif', 'commandes_delete_si_actif',
      'paiements_select_propre', 'paiements_insert_si_actif', 'paiements_update_si_actif', 'paiements_delete_si_actif',
      'depenses_select_propre', 'depenses_insert_si_actif', 'depenses_update_si_actif', 'depenses_delete_si_actif',
      'demandes_paiement_select_propre', 'demandes_paiement_insert_propre'
    )) as nb_policies_ok
  from pg_policies
  where schemaname = 'public'
),
-- 3. Vérification Fonctions de sécurité (4 attendues)
functions_check as (
  select
    count(*) filter (where proname in (
      'est_compte_actif',
      'proteger_champs_profil',
      'proteger_demandes_paiement',
      'valider_paiement_manuel'
    ) and prosecdef = true) as nb_fonctions_ok
  from pg_proc p
  join pg_namespace n on p.pronamespace = n.oid
  where n.nspname = 'public'
),
-- 4. Vérification Déclencheurs anti-fraude (2 attendus)
triggers_check as (
  select
    count(*) filter (where tgname in (
      'trigger_proteger_champs_profil',
      'trigger_proteger_demandes_paiement'
    ) and tgenabled = 'O') as nb_triggers_ok
  from pg_trigger t
  join pg_class c on t.tgrelid = c.oid
  join pg_namespace n on c.relnamespace = n.oid
  where n.nspname = 'public'
)
select
  '1. Activation RLS (6 tables métier)' as controle,
  nb_rls_ok || ' / 6 tables protégées' as detail,
  case when nb_rls_ok = 6 then '✅ CONFORME' else '❌ INCOMPLET' end as statut
from rls_check
union all
select
  '2. Politiques RLS (Sécurité Essai & Isolation)',
  nb_policies_ok || ' / 20 politiques actives',
  case when nb_policies_ok = 20 then '✅ CONFORME' else '❌ MIGRATION REQUISE' end
from policies_check
union all
select
  '3. Fonctions serveur (SECURITY DEFINER)',
  nb_fonctions_ok || ' / 4 fonctions prêtes',
  case when nb_fonctions_ok = 4 then '✅ CONFORME' else '❌ FONCTIONS MANQUANTES' end
from functions_check
union all
select
  '4. Déclencheurs anti-fraude (Triggers)',
  nb_triggers_ok || ' / 2 déclencheurs actifs',
  case when nb_triggers_ok = 2 then '✅ CONFORME' else '❌ DÉCLENCHEURS MANQUANTS' end
from triggers_check
union all
select
  '==================== VERDICT FINAL ====================',
  case
    when (select nb_rls_ok from rls_check) = 6
     and (select nb_policies_ok from policies_check) = 20
     and (select nb_fonctions_ok from functions_check) = 4
     and (select nb_triggers_ok from triggers_check) = 2
    then 'TOUTES LES PROTECTIONS SONT ACTIVES EN PRODUCTION'
    else 'ATTENTION : LA MIGRATION DOIT ÊTRE EXÉCUTÉE DANS SUPABASE'
  end,
  case
    when (select nb_rls_ok from rls_check) = 6
     and (select nb_policies_ok from policies_check) = 20
     and (select nb_fonctions_ok from functions_check) = 4
     and (select nb_triggers_ok from triggers_check) = 2
    then '🟢 PRODUCTION 100% SÉCURISÉE'
    else '🔴 NON SÉCURISÉ (APPLIQUER migration_securite_abonnement.sql)'
  end;


-- ============================================================================
-- REQUÊTE DÉTAILLÉE 1 : STATUT RLS PAR TABLE
-- ============================================================================
-- Vérifie que le Row Level Security est activé sur chaque table métier.
select
  tablename as "Table",
  rowsecurity as "RLS Actif",
  case
    when rowsecurity then '✅ ACTIF'
    else '❌ VULNÉRABLE (RLS DÉSACTIVÉ)'
  end as "Statut Sécurité"
from pg_tables
where schemaname = 'public'
  and tablename in ('profils', 'clients', 'commandes', 'paiements', 'depenses', 'demandes_paiement', 'prix_par_pays')
order by tablename;


-- ============================================================================
-- REQUÊTE DÉTAILLÉE 2 : POLITIQUES RLS PAR TABLE ET OPÉRATION
-- ============================================================================
-- Liste chacune des politiques RLS actives avec l'opération couverte.
select
  tablename as "Table",
  cmd as "Opération",
  policyname as "Nom de la Politique",
  case
    when cmd = 'SELECT' and policyname like '%propre%' then '✅ Lecture propre préservée'
    when cmd = 'INSERT' and policyname like '%si_actif%' then '✅ Création conditionnée à l''essai actif'
    when cmd = 'UPDATE' and policyname like '%si_actif%' then '✅ Modification conditionnée à l''essai actif'
    when cmd = 'DELETE' and policyname like '%si_actif%' then '✅ Suppression conditionnée à l''essai actif'
    when tablename = 'demandes_paiement' and cmd = 'INSERT' then '✅ Demande paiement autorisée en attente'
    when tablename = 'profils' and cmd = 'UPDATE' then '✅ Profil modifiable par son propriétaire'
    else '⚠️ Politique existante à vérifier'
  end as "Rôle de Sécurité"
from pg_policies
where schemaname = 'public'
  and tablename in ('profils', 'clients', 'commandes', 'paiements', 'depenses', 'demandes_paiement')
order by tablename, cmd, policyname;


-- ============================================================================
-- REQUÊTE DÉTAILLÉE 3 : VÉRIFICATION DES FONCTIONS SERVEUR
-- ============================================================================
-- Vérifie la présence, les arguments et le mode SECURITY DEFINER des fonctions.
select
  p.proname as "Fonction",
  pg_get_function_arguments(p.oid) as "Arguments",
  case when p.prosecdef then '✅ OUI' else '❌ NON' end as "Security Definer",
  coalesce(array_to_string(p.proconfig, ', '), 'défaut') as "Search Path",
  case
    when p.proname = 'est_compte_actif' then 'Vérifie si essai ou abonnement actif'
    when p.proname = 'valider_paiement_manuel' then 'Valide les paiements (Admin uniquement)'
    when p.proname = 'proteger_champs_profil' then 'Verrouille id, dates d''essai et cree_le'
    when p.proname = 'proteger_demandes_paiement' then 'Interdit modif/suppr des demandes côté client'
    else 'Autre fonction'
  end as "Rôle"
from pg_proc p
join pg_namespace n on p.pronamespace = n.oid
where n.nspname = 'public'
  and p.proname in (
    'est_compte_actif',
    'valider_paiement_manuel',
    'proteger_champs_profil',
    'proteger_demandes_paiement'
  )
order by p.proname;


-- ============================================================================
-- REQUÊTE DÉTAILLÉE 4 : VÉRIFICATION DES DÉCLENCHEURS (TRIGGERS)
-- ============================================================================
-- Vérifie que les triggers de verrouillage anti-fraude sont bien attachés et actifs.
select
  c.relname as "Table Cible",
  t.tgname as "Nom du Trigger",
  p.proname as "Fonction Exécutée",
  case when t.tgenabled = 'O' then '✅ ACTIF' else '❌ DÉSACTIVÉ' end as "Statut",
  case
    when t.tgname = 'trigger_proteger_champs_profil' then 'Bloque toute falsification de l''id et dates d''essai'
    when t.tgname = 'trigger_proteger_demandes_paiement' then 'Bloque toute modification/suppression de demande'
    else 'Déclencheur'
  end as "Protection Assurée"
from pg_trigger t
join pg_class c on t.tgrelid = c.oid
join pg_namespace n on c.relnamespace = n.oid
join pg_proc p on t.tgfoid = p.oid
where n.nspname = 'public'
  and t.tgname in ('trigger_proteger_champs_profil', 'trigger_proteger_demandes_paiement')
order by c.relname, t.tgname;
