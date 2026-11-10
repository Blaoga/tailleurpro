-- ============================================================================
-- TAILLEUR PRO - SCHÉMA DE BASE DE DONNÉES ET SÉCURITÉ (SUPABASE / POSTGRESQL)
-- ============================================================================
-- Étape 3 du plan d'implémentation
-- Ce script doit être exécuté dans l'éditeur SQL de votre projet Supabase :
-- Dashboard Supabase > SQL Editor > New query > Coller tout ce fichier > Run
-- ============================================================================

-- 1. EXTENSIONS
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================================
-- 2. TABLE DES PROFILS TAILLEURS (id lié à auth.users.id)
-- ============================================================================
create table if not exists public.profils (
  id uuid primary key references auth.users(id) on delete cascade,
  prenom text not null,
  telephone text unique not null,
  pays text not null check (pays in ('CM', 'CI', 'CG')),
  atelier text default '',
  ville text default '',
  essai_fin timestamptz not null default (now() + interval '15 days'),
  abonnement_fin timestamptz default null,
  rappel_jours integer not null default 2 check (rappel_jours in (1, 2, 3)),
  email_recuperation text default null,
  cree_le timestamptz not null default now()
);

comment on table public.profils is 'Profils des artisans tailleurs avec suivi d''essai et d''abonnement';

-- ============================================================================
-- 3. TABLE DES CLIENTS DES TAILLEURS
-- ============================================================================
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nom text not null,
  telephone text not null,
  mesures jsonb not null default '{}'::jsonb,
  notes text default '',
  cree_le timestamptz not null default now()
);

-- Index pour accélérer la recherche par tailleur, nom et téléphone
create index if not exists idx_clients_user_id on public.clients(user_id);
create index if not exists idx_clients_nom on public.clients(nom);
create index if not exists idx_clients_telephone on public.clients(telephone);

comment on table public.clients is 'Clients enregistrés par chaque tailleur (mesures et coordonnées)';

-- ============================================================================
-- 4. TABLE DES COMMANDES
-- ============================================================================
create table if not exists public.commandes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  vetement text not null,
  tissu text default '',
  prix_total numeric not null default 0 check (prix_total >= 0),
  date_livraison date not null,
  statut text not null default 'recue' check (statut in ('recue', 'coupee', 'en_couture', 'prete', 'livree')),
  photo_url text default null,
  cree_le timestamptz not null default now()
);

create index if not exists idx_commandes_user_id on public.commandes(user_id);
create index if not exists idx_commandes_client_id on public.commandes(client_id);
create index if not exists idx_commandes_date_livraison on public.commandes(date_livraison);
create index if not exists idx_commandes_statut on public.commandes(statut);

comment on table public.commandes is 'Commandes de couture avec tissu, prix, date et statut';

-- ============================================================================
-- 5. TABLE DES PAIEMENTS (AVANCES & SOLDES)
-- ============================================================================
create table if not exists public.paiements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  commande_id uuid not null references public.commandes(id) on delete cascade,
  montant numeric not null check (montant > 0),
  date timestamptz not null default now()
);

create index if not exists idx_paiements_user_id on public.paiements(user_id);
create index if not exists idx_paiements_commande_id on public.paiements(commande_id);

comment on table public.paiements is 'Avances et règlements encaissés pour chaque commande';

-- ============================================================================
-- 6. TABLE DES DÉPENSES D'ATELIER
-- ============================================================================
create table if not exists public.depenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  montant numeric not null check (montant > 0),
  categorie text not null,
  note text default '',
  date date not null default current_date
);

create index if not exists idx_depenses_user_id on public.depenses(user_id);
create index if not exists idx_depenses_date on public.depenses(date);

comment on table public.depenses is 'Dépenses courantes de l''atelier (fils, aiguilles, loyer...)';

-- ============================================================================
-- 7. TABLE DES TARIFS ET OPÉRATEURS PAR PAYS (CONFIGURATION MOBILE MONEY)
-- ============================================================================
create table if not exists public.prix_par_pays (
  pays text primary key,
  nom text not null,
  monnaie text not null default 'FCFA',
  prix_mensuel numeric not null default 2600,
  operateur text not null,
  numero_paiement text not null
);

-- Insertion des 3 pays initiaux
insert into public.prix_par_pays (pays, nom, monnaie, prix_mensuel, operateur, numero_paiement)
values
  ('CM', 'Cameroun', 'FCFA', 2600, 'Orange Money & MTN MoMo', '+237 6 70 00 00 00'),
  ('CI', 'Côte d''Ivoire', 'FCFA', 2600, 'Wave, Orange Money & MTN MoMo', '+225 07 00 00 00 00'),
  ('CG', 'Congo-Brazzaville', 'FCFA', 2600, 'MTN MoMo & Airtel Money', '+242 06 000 00 00')
on conflict (pays) do update set
  operateur = excluded.operateur,
  numero_paiement = excluded.numero_paiement;

comment on table public.prix_par_pays is 'Paramètres de paiement Mobile Money par pays';

-- ============================================================================
-- 8. TABLE DES DEMANDES DE VALIDATION DE PAIEMENT MANUEL (PHASE 1)
-- ============================================================================
create table if not exists public.demandes_paiement (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reference text not null,
  montant numeric not null default 2600,
  statut text not null default 'en_attente' check (statut in ('en_attente', 'validee', 'rejetee')),
  cree_le timestamptz not null default now()
);

create index if not exists idx_demandes_paiement_user_id on public.demandes_paiement(user_id);
create index if not exists idx_demandes_paiement_statut on public.demandes_paiement(statut);

comment on table public.demandes_paiement is 'Demandes d''activation manuelle après transfert Mobile Money';

-- ============================================================================
-- 9. FONCTION & TRIGGER : CRÉATION AUTOMATIQUE DU PROFIL À L'INSCRIPTION
-- ============================================================================
-- Ce déclencheur se déclenche à chaque fois qu'un utilisateur est créé dans auth.users
-- Il insère automatiquement son profil avec 15 jours d'essai gratuit.
-- La contrainte UNIQUE sur profils.telephone empêche un même numéro de bénéficier
-- de multiples essais gratuits.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_prenom text;
  v_telephone text;
  v_pays text;
  v_atelier text;
begin
  -- Extraction des métadonnées envoyées lors du signUp
  v_prenom := coalesce(new.raw_user_meta_data->>'prenom', 'Tailleur');
  v_telephone := coalesce(new.raw_user_meta_data->>'telephone', '');
  v_pays := coalesce(new.raw_user_meta_data->>'pays', 'CM');
  v_atelier := coalesce(new.raw_user_meta_data->>'atelier', '');

  -- Insertion dans public.profils avec essai de 15 jours
  insert into public.profils (
    id,
    prenom,
    telephone,
    pays,
    atelier,
    essai_fin,
    abonnement_fin,
    rappel_jours,
    cree_le
  )
  values (
    new.id,
    v_prenom,
    v_telephone,
    v_pays,
    v_atelier,
    now() + interval '15 days',
    null,
    2,
    now()
  );

  return new;
end;
$$;

-- Recréation du trigger propre
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================================
-- 10. SÉCURITÉ SERVEUR : VÉRIFICATION D'ABONNEMENT ET FONCTIONS D'ACCÈS
-- ============================================================================

-- Fonction pour vérifier si l'accès écriture est actif (côté base, infalsifiable)
-- L'utilisateur est actif si :
-- 1) sa période d'essai de 15 jours n'a pas expiré (now() < essai_fin)
--    OU
-- 2) son abonnement payant est actif (now() < abonnement_fin)
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

-- Protection anti-fraude du profil :
-- 1) Interdiction de modifier l'identifiant (id lié à auth.users).
-- 2) Verrouillage des dates d'essai et d'abonnement (seule l'administration peut valider un paiement).
-- 3) Protection de la date de création.
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

-- Protection des demandes de paiement :
-- Un utilisateur ne peut pas modifier ou supprimer ses demandes de paiement
-- (la validation du statut est réservée à l'administrateur via valider_paiement_manuel)
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

-- ============================================================================
-- 11. ROW LEVEL SECURITY (RLS) RENFORCÉ (ISOLATION & RESPECT STRICT DE L'ESSAI)
-- ============================================================================
-- Règles appliquées :
-- 1) Chaque tailleur n'accède qu'à ses propres données (user_id = auth.uid()).
-- 2) La lecture (SELECT) des données existantes (clients, commandes, reçus, dépenses)
--    est TOUJOURS autorisée, même après expiration de l'essai (accès historique).
-- 3) Toute opération d'écriture (INSERT / UPDATE / DELETE) sur les données métier
--    (clients, commandes, paiements, dépenses) est STRICTEMENT BLOQUÉE dès que l'essai
--    est expiré sans abonnement valide.
-- 4) Les demandes d'abonnement restent toujours insérables avec statut 'en_attente'.

-- 11.1 Table profils
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

-- 11.2 Table clients
alter table public.clients enable row level security;

drop policy if exists "chacun voit ses clients" on public.clients;
drop policy if exists "clients_select_propre" on public.clients;
drop policy if exists "clients_insert_si_actif" on public.clients;
drop policy if exists "clients_update_si_actif" on public.clients;
drop policy if exists "clients_delete_propre" on public.clients;
drop policy if exists "clients_delete_si_actif" on public.clients;

-- Consultation toujours autorisée pour ses propres clients
create policy "clients_select_propre"
  on public.clients for select
  using (user_id = auth.uid());

-- Création bloquée après expiration de l'essai sans abonnement
create policy "clients_insert_si_actif"
  on public.clients for insert
  with check (user_id = auth.uid() and public.est_compte_actif(auth.uid()));

-- Modification bloquée après expiration de l'essai sans abonnement
create policy "clients_update_si_actif"
  on public.clients for update
  using (user_id = auth.uid() and public.est_compte_actif(auth.uid()))
  with check (user_id = auth.uid() and public.est_compte_actif(auth.uid()));

-- Suppression bloquée après expiration de l'essai sans abonnement
create policy "clients_delete_si_actif"
  on public.clients for delete
  using (user_id = auth.uid() and public.est_compte_actif(auth.uid()));

-- 11.3 Table commandes
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

-- Création bloquée après expiration de l'essai sans abonnement
create policy "commandes_insert_si_actif"
  on public.commandes for insert
  with check (user_id = auth.uid() and public.est_compte_actif(auth.uid()));

-- Modification bloquée après expiration de l'essai sans abonnement
create policy "commandes_update_si_actif"
  on public.commandes for update
  using (user_id = auth.uid() and public.est_compte_actif(auth.uid()))
  with check (user_id = auth.uid() and public.est_compte_actif(auth.uid()));

-- Suppression bloquée après expiration de l'essai sans abonnement
create policy "commandes_delete_si_actif"
  on public.commandes for delete
  using (user_id = auth.uid() and public.est_compte_actif(auth.uid()));

-- 11.4 Table paiements
alter table public.paiements enable row level security;

drop policy if exists "chacun voit ses paiements" on public.paiements;
drop policy if exists "paiements_select_propre" on public.paiements;
drop policy if exists "paiements_insert_si_actif" on public.paiements;
drop policy if exists "paiements_update_si_actif" on public.paiements;
drop policy if exists "paiements_delete_propre" on public.paiements;
drop policy if exists "paiements_delete_si_actif" on public.paiements;

-- Consultation toujours autorisée pour ses propres paiements
create policy "paiements_select_propre"
  on public.paiements for select
  using (user_id = auth.uid());

-- Enregistrement de versement bloqué après expiration de l'essai sans abonnement
create policy "paiements_insert_si_actif"
  on public.paiements for insert
  with check (user_id = auth.uid() and public.est_compte_actif(auth.uid()));

create policy "paiements_update_si_actif"
  on public.paiements for update
  using (user_id = auth.uid() and public.est_compte_actif(auth.uid()))
  with check (user_id = auth.uid() and public.est_compte_actif(auth.uid()));

-- Suppression de versement bloquée après expiration de l'essai sans abonnement
create policy "paiements_delete_si_actif"
  on public.paiements for delete
  using (user_id = auth.uid() and public.est_compte_actif(auth.uid()));

-- 11.5 Table depenses
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

-- Ajout de dépense bloqué après expiration de l'essai sans abonnement
create policy "depenses_insert_si_actif"
  on public.depenses for insert
  with check (user_id = auth.uid() and public.est_compte_actif(auth.uid()));

create policy "depenses_update_si_actif"
  on public.depenses for update
  using (user_id = auth.uid() and public.est_compte_actif(auth.uid()))
  with check (user_id = auth.uid() and public.est_compte_actif(auth.uid()));

-- Suppression de dépense bloquée après expiration de l'essai sans abonnement
create policy "depenses_delete_si_actif"
  on public.depenses for delete
  using (user_id = auth.uid() and public.est_compte_actif(auth.uid()));

-- 11.6 Table demandes_paiement
alter table public.demandes_paiement enable row level security;

drop policy if exists "chacun voit ses demandes_paiement" on public.demandes_paiement;
drop policy if exists "demandes_paiement_select_propre" on public.demandes_paiement;
drop policy if exists "demandes_paiement_insert_propre" on public.demandes_paiement;

create policy "demandes_paiement_select_propre"
  on public.demandes_paiement for select
  using (user_id = auth.uid());

-- L'utilisateur peut insérer une demande de paiement en attente pour renouveler son abonnement
-- (statut forcé à 'en_attente' ou null pour interdire l'auto-validation frauduleuse)
create policy "demandes_paiement_insert_propre"
  on public.demandes_paiement for insert
  with check (user_id = auth.uid() and (statut = 'en_attente' or statut is null));

-- 11.7 Table prix_par_pays (lecture publique pour l'affichage des tarifs)
alter table public.prix_par_pays enable row level security;

drop policy if exists "lecture publique prix_par_pays" on public.prix_par_pays;
create policy "lecture publique prix_par_pays"
  on public.prix_par_pays
  for select
  using (true);

-- ============================================================================
-- 12. FONCTION ADMINISTRATEUR : VALIDATION DE PAIEMENT MANUEL
-- ============================================================================

-- Fonction pour valider une demande de paiement manuel (réservée à l'administrateur)
-- Ajoute 30 jours à abonnement_fin à partir d'aujourd'hui (ou prolonge si déjà actif)
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

-- Sécurisation des permissions : réservée aux administrateurs (service_role / postgres)
revoke execute on function public.valider_paiement_manuel(uuid) from public, anon, authenticated;
grant execute on function public.valider_paiement_manuel(uuid) to service_role, postgres;

