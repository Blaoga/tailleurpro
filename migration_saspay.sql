-- ============================================================================
-- TAILLEUR PRO — STRUCTURE DE PAIEMENT AUTOMATIQUE SASPAY (MISSION 3 & 3.1)
-- ============================================================================
-- Garantie de sécurité :
-- - Ne supprime et n'écrase aucune donnée existante (profils, clients, commandes,
--   paiements, depenses, anciennes demandes_paiement).
-- - Idempotent : peut être réexécuté sans risque.
-- ============================================================================

-- 1. Table des transactions d'abonnements SasPay
CREATE TABLE IF NOT EXISTS public.abonnements_paiements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Identifiants SasPay distincts et typés (UUID v4)
  saspay_transaction_id uuid UNIQUE,
  saspay_session_id uuid UNIQUE,
  saspay_reference text,
  
  -- Détails du forfait
  plan text NOT NULL CHECK (plan IN ('solo', 'atelier')),
  duree_jours integer NOT NULL DEFAULT 30,
  
  -- Montants et devises (chaînes décimales strictes)
  amount text NOT NULL,             -- "2600.00" ou "5100.00"
  currency text NOT NULL DEFAULT 'XOF',
  fee_charge_mode text DEFAULT 'ADD_ON',
  fee_amount text DEFAULT '0.00',
  charged_amount text,              -- Total réellement débité au client
  net_amount text,                  -- Total net reversé à Tailleur Pro
  
  -- Données géographiques et opérateur
  country text NOT NULL,
  network text,
  customer_phone text,
  
  -- Statuts réels documentés par SasPay
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'EXPIRED')),
  checkout_url text,
  
  -- Clé d'idempotence unique obligatoire
  idempotency_key uuid NOT NULL UNIQUE,
  
  -- Traçabilité et activation
  webhook_payload jsonb,
  active_le timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Index de performance
CREATE INDEX IF NOT EXISTS idx_abonnements_paiements_user ON public.abonnements_paiements(user_id);
CREATE INDEX IF NOT EXISTS idx_abonnements_paiements_status ON public.abonnements_paiements(status);
CREATE INDEX IF NOT EXISTS idx_abonnements_paiements_txn_id ON public.abonnements_paiements(saspay_transaction_id);
CREATE INDEX IF NOT EXISTS idx_abonnements_paiements_session_id ON public.abonnements_paiements(saspay_session_id);

-- 3. Table de déduplication des webhooks entrants
CREATE TABLE IF NOT EXISTS public.saspay_webhook_events (
  delivery_key text PRIMARY KEY, -- SHA-256(timestamp + signature)
  event_type text NOT NULL,
  saspay_transaction_id uuid,
  payload jsonb NOT NULL,
  recu_le timestamptz NOT NULL DEFAULT now()
);

-- 4. Activation et politiques RLS
ALTER TABLE public.abonnements_paiements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saspay_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "abonnements_paiements_select_propre" ON public.abonnements_paiements;
CREATE POLICY "abonnements_paiements_select_propre"
  ON public.abonnements_paiements FOR SELECT
  USING (user_id = auth.uid());

-- 5. Fonction atomique et idempotente d'activation d'abonnement
CREATE OR REPLACE FUNCTION public.activer_abonnement_saspay(
  p_transaction_id uuid,
  p_user_id uuid,
  p_duree_jours integer,
  p_net_amount text,
  p_charged_amount text,
  p_fee_amount text,
  p_reference text,
  p_raw_payload jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_paiement_record record;
  v_abonnement_actuel timestamptz;
  v_nouvelle_fin timestamptz;
BEGIN
  -- 1. Verrouillage exclusif pessimiste de la transaction (FOR UPDATE)
  SELECT * INTO v_paiement_record
  FROM public.abonnements_paiements
  WHERE saspay_transaction_id = p_transaction_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction introuvable ou utilisateur non correspondant.';
  END IF;

  -- 2. Protection contre les doubles activations (Idempotence)
  IF v_paiement_record.active_le IS NOT NULL AND v_paiement_record.status = 'SUCCESS' THEN
    RETURN true;
  END IF;

  -- 3. Calcul de la date d'échéance (+30 jours)
  SELECT abonnement_fin INTO v_abonnement_actuel
  FROM public.profils
  WHERE id = p_user_id;

  IF v_abonnement_actuel IS NOT NULL AND v_abonnement_actuel > now() THEN
    v_nouvelle_fin := v_abonnement_actuel + (p_duree_jours || ' days')::interval;
  ELSE
    v_nouvelle_fin := now() + (p_duree_jours || ' days')::interval;
  END IF;

  -- 4. Prolongation dans le profil
  UPDATE public.profils
  SET abonnement_fin = v_nouvelle_fin
  WHERE id = p_user_id;

  -- 5. Clôture de la transaction locale
  UPDATE public.abonnements_paiements
  SET
    status = 'SUCCESS',
    active_le = now(),
    net_amount = coalesce(p_net_amount, net_amount),
    charged_amount = coalesce(p_charged_amount, charged_amount),
    fee_amount = coalesce(p_fee_amount, fee_amount),
    saspay_reference = coalesce(p_reference, saspay_reference),
    webhook_payload = p_raw_payload,
    updated_at = now()
  WHERE id = v_paiement_record.id;

  RETURN true;
END;
$$;

-- 6. Permissions : seule l'Edge Function (service_role) peut exécuter l'activation
REVOKE EXECUTE ON FUNCTION public.activer_abonnement_saspay(uuid, uuid, integer, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activer_abonnement_saspay(uuid, uuid, integer, text, text, text, text, jsonb) TO service_role, postgres;
