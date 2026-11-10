-- ============================================================================
-- TAILLEUR PRO — MIGRATION DE SÉCURITÉ DES ABONNEMENTS ET ESSAIS (MISSION 2.1)
-- ============================================================================
-- Instructions d'application dans Supabase :
-- 1. Rendez-vous sur votre console Supabase (https://supabase.com).
-- 2. Ouvrez le menu "SQL Editor" dans le panneau latéral.
-- 3. Cliquez sur "New query".
-- 4. Copiez et collez l'intégralité de ce fichier, puis cliquez sur "Run".
--
-- Garantie de sécurité :
-- - Ne supprime et n'écrase AUCUNE table ni AUCUNE donnée existante.
-- - Ne modifie pas les dates d'essai ni les abonnements en cours.
-- - Idempotent : peut être exécuté plusieurs fois sans risque.
-- ============================================================================

-- 1. FONCTION DE CONTRÔLE D'ACCÈS ÉCRITURE (Période d'essai ou Abonnement)
create or replace function public.est_compte_actif(tailleur_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profils
    where id = tailleur_id
      and (
        (essai_fin is not null and now() < essai_fin)
        or
        (abonnement_fin is not null and now() < abonnement_fin)
      )
  );
$$;

-- 2. DÉCLENCHEUR ANTI-FALSIFICATION DU PROFIL
-- Empêche l'utilisateur authentifié de modifier son identifiant (id), ses dates
-- d'essai / abonnement ou sa date d'inscription.
create or replace function public.proteger_champs_profil()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() = 'authenticated' then
    if new.id is distinct from old.id then
      raise exception 'Modification interdite : l''identifiant du compte ne peut pas être modifié.';
    end if;
    new.essai_fin := old.essai_fin;
    new.abonnement_fin := old.abonnement_fin;
    new.cree_le := old.cree_le;
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_proteger_champs_profil on public.profils;
drop trigger if exists trigger_proteger_champs_abonnement on public.profils;
create trigger trigger_proteger_champs_profil
  before update on public.profils
  for each row execute procedure public.proteger_champs_profil();

-- 3. DÉCLENCHEUR DE PROTECTION DES DEMANDES DE PAIEMENT
-- Empêche toute tentative de modification directe ou de suppression des demandes
-- (seul l'administrateur peut valider via valider_paiement_manuel)
create or replace function public.proteger_demandes_paiement()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() = 'authenticated' then
    raise exception 'Action interdite : les demandes de paiement ne peuvent être ni modifiées ni supprimées par le tailleur.';
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_proteger_demandes_paiement on public.demandes_paiement;
create trigger trigger_proteger_demandes_paiement
  before update or delete on public.demandes_paiement
  for each row execute procedure public.proteger_demandes_paiement();

-- 4. ACTIVATION ET RENFORCEMENT DES POLITIQUES RLS SUR TOUTES LES TABLES

-- 4.1 Table profils
alter table public.profils enable row level security;

drop policy if exists "chacun voit et modifie son profil" on public.profils;
drop policy if exists "profils_select_propre" on public.profils;
drop policy if exists "profils_update_propre" on public.profils;

create policy "profils_select_propre"
  on public.profils for select
  using (id = auth.uid());

create policy "profils_update_propre"
  on public.profils for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- 4.2 Table clients
alter table public.clients enable row level security;

drop policy if exists "chacun voit ses clients" on public.clients;
drop policy if exists "clients_select_propre" on public.clients;
drop policy if exists "clients_insert_si_actif" on public.clients;
drop policy if exists "clients_update_si_actif" on public.clients;
drop policy if exists "clients_delete_propre" on public.clients;
drop policy if exists "clients_delete_si_actif" on public.clients;

-- Consultation toujours autorisée pour ses propres clients (accès historique préservé)
create policy "clients_select_propre"
  on public.clients for select
  using (user_id = auth.uid());

-- Création bloquée si compte expiré
create policy "clients_insert_si_actif"
  on public.clients for insert
  with check (user_id = auth.uid() and public.est_compte_actif(auth.uid()));

-- Modification bloquée si compte expiré
create policy "clients_update_si_actif"
  on public.clients for update
  using (user_id = auth.uid() and public.est_compte_actif(auth.uid()))
  with check (user_id = auth.uid() and public.est_compte_actif(auth.uid()));

-- Suppression bloquée si compte expiré
create policy "clients_delete_si_actif"
  on public.clients for delete
  using (user_id = auth.uid() and public.est_compte_actif(auth.uid()));

-- 4.3 Table commandes
alter table public.commandes enable row level security;

drop policy if exists "chacun voit ses commandes" on public.commandes;
drop policy if exists "commandes_select_propre" on public.commandes;
drop policy if exists "commandes_insert_si_actif" on public.commandes;
drop policy if exists "commandes_update_si_actif" on public.commandes;
drop policy if exists "commandes_delete_propre" on public.commandes;
drop policy if exists "commandes_delete_si_actif" on public.commandes;

-- Consultation toujours autorisée pour ses propres commandes
create policy "commandes_select_propre"
  on public.commandes for select
  using (user_id = auth.uid());

-- Création bloquée si compte expiré
create policy "commandes_insert_si_actif"
  on public.commandes for insert
  with check (user_id = auth.uid() and public.est_compte_actif(auth.uid()));

-- Modification bloquée si compte expiré
create policy "commandes_update_si_actif"
  on public.commandes for update
  using (user_id = auth.uid() and public.est_compte_actif(auth.uid()))
  with check (user_id = auth.uid() and public.est_compte_actif(auth.uid()));

-- Suppression bloquée si compte expiré
create policy "commandes_delete_si_actif"
  on public.commandes for delete
  using (user_id = auth.uid() and public.est_compte_actif(auth.uid()));

-- 4.4 Table paiements
alter table public.paiements enable row level security;

drop policy if exists "chacun voit ses paiements" on public.paiements;
drop policy if exists "paiements_select_propre" on public.paiements;
drop policy if exists "paiements_insert_si_actif" on public.paiements;
drop policy if exists "paiements_update_si_actif" on public.paiements;
drop policy if exists "paiements_delete_propre" on public.paiements;
drop policy if exists "paiements_delete_si_actif" on public.paiements;

-- Consultation toujours autorisée pour ses propres versements
create policy "paiements_select_propre"
  on public.paiements for select
  using (user_id = auth.uid());

-- Enregistrement bloqué si compte expiré
create policy "paiements_insert_si_actif"
  on public.paiements for insert
  with check (user_id = auth.uid() and public.est_compte_actif(auth.uid()));

-- Modification bloquée si compte expiré
create policy "paiements_update_si_actif"
  on public.paiements for update
  using (user_id = auth.uid() and public.est_compte_actif(auth.uid()))
  with check (user_id = auth.uid() and public.est_compte_actif(auth.uid()));

-- Suppression bloquée si compte expiré
create policy "paiements_delete_si_actif"
  on public.paiements for delete
  using (user_id = auth.uid() and public.est_compte_actif(auth.uid()));

-- 4.5 Table depenses
alter table public.depenses enable row level security;

drop policy if exists "chacun voit ses depenses" on public.depenses;
drop policy if exists "depenses_select_propre" on public.depenses;
drop policy if exists "depenses_insert_si_actif" on public.depenses;
drop policy if exists "depenses_update_si_actif" on public.depenses;
drop policy if exists "depenses_delete_propre" on public.depenses;
drop policy if exists "depenses_delete_si_actif" on public.depenses;

-- Consultation toujours autorisée pour ses propres dépenses
create policy "depenses_select_propre"
  on public.depenses for select
  using (user_id = auth.uid());

-- Ajout bloqué si compte expiré
create policy "depenses_insert_si_actif"
  on public.depenses for insert
  with check (user_id = auth.uid() and public.est_compte_actif(auth.uid()));

-- Modification bloquée si compte expiré
create policy "depenses_update_si_actif"
  on public.depenses for update
  using (user_id = auth.uid() and public.est_compte_actif(auth.uid()))
  with check (user_id = auth.uid() and public.est_compte_actif(auth.uid()));

-- Suppression bloquée si compte expiré
create policy "depenses_delete_si_actif"
  on public.depenses for delete
  using (user_id = auth.uid() and public.est_compte_actif(auth.uid()));

-- 4.6 Table demandes_paiement
alter table public.demandes_paiement enable row level security;

drop policy if exists "chacun voit ses demandes_paiement" on public.demandes_paiement;
drop policy if exists "demandes_paiement_select_propre" on public.demandes_paiement;
drop policy if exists "demandes_paiement_insert_propre" on public.demandes_paiement;

create policy "demandes_paiement_select_propre"
  on public.demandes_paiement for select
  using (user_id = auth.uid());

-- L'utilisateur peut insérer une demande avec statut 'en_attente' même si son essai est expiré
create policy "demandes_paiement_insert_propre"
  on public.demandes_paiement for insert
  with check (user_id = auth.uid() and (statut = 'en_attente' or statut is null));

-- 5. FONCTION ADMINISTRATEUR : VALIDATION DE PAIEMENT MANUEL
-- Ajoute 30 jours à abonnement_fin à partir d'aujourd'hui (ou prolonge si déjà actif).
-- Strictement protégée : inaccessible aux utilisateurs ordinaires.
create or replace function public.valider_paiement_manuel(demande_uuid uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid;
  v_abonnement_actuel timestamptz;
  v_nouvelle_fin timestamptz;
begin
  select user_id into v_user_id
  from public.demandes_paiement
  where id = demande_uuid and statut = 'en_attente';

  if v_user_id is null then
    raise exception 'Demande introuvable ou déjà traitée';
  end if;

  select abonnement_fin into v_abonnement_actuel
  from public.profils
  where id = v_user_id;

  if v_abonnement_actuel is not null and v_abonnement_actuel > now() then
    v_nouvelle_fin := v_abonnement_actuel + interval '30 days';
  else
    v_nouvelle_fin := now() + interval '30 days';
  end if;

  update public.profils
  set abonnement_fin = v_nouvelle_fin
  where id = v_user_id;

  update public.demandes_paiement
  set statut = 'validee'
  where id = demande_uuid;
end;
$$;

-- Sécurisation des permissions de la fonction de validation
revoke execute on function public.valider_paiement_manuel(uuid) from public, anon, authenticated;
grant execute on function public.valider_paiement_manuel(uuid) to service_role, postgres;

-- Message de confirmation dans la console Supabase
do $$
begin
  raise notice 'Migration de sécurité Tailleur Pro appliquée avec succès ! Les abonnements et périodes d''essai sont désormais infalsifiables et strictement respectés.';
end;
$$;
