// ============================================================================
// TAILLEUR PRO — EDGE FUNCTION : TRAITEMENT SÉCURISÉ DES WEBHOOKS SASPAY
// ============================================================================
// Endpoint : POST /functions/v1/saspay-webhook
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  verifierSignatureWebhook,
  verifierPaiementSaspay,
} from "../_shared/saspay.ts";

serve(async (req: Request) => {
  // 1. Prévol CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Méthode non autorisée", { status: 405 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const saspayApiKey = Deno.env.get("SASPAY_API_KEY") ?? "";
    const saspayWebhookSecret = Deno.env.get("SASPAY_WEBHOOK_SECRET") ?? "";

    if (!saspayWebhookSecret) {
      console.error("[SasPay Webhook] Secret de signature manquant dans les variables d'environnement.");
      return new Response(JSON.stringify({ error: "Configuration serveur incomplète" }), { status: 500 });
    }

    // 2. Extraction des en-têtes officiels SasPay
    const signatureHeader = req.headers.get("x-webhook-signature");
    const timestampHeader = req.headers.get("x-webhook-timestamp");
    const eventHeader = req.headers.get("x-webhook-event");

    // 3. Récupération du corps BRUT (Strictement nécessaire pour le calcul HMAC)
    const rawBody = await req.text();

    // 4. Vérification cryptographique HMAC SHA-256 et contrôle de l'horodatage (< 300s)
    const verification = await verifierSignatureWebhook(
      rawBody,
      signatureHeader,
      timestampHeader,
      saspayWebhookSecret
    );

    if (!verification.valide) {
      console.warn(`[SasPay Webhook] Rejet sécurité : ${verification.raison}`);
      return new Response(
        JSON.stringify({ success: false, error: verification.raison }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload = JSON.parse(rawBody);
    const eventType = payload.event || eventHeader;
    const eventData = payload.data || {};

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 5. Protection contre les doubles traitements (Déduplication)
    // Calcul de l'empreinte unique de livraison
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(`${timestampHeader}:${signatureHeader}`)
    );
    const deliveryKey = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const { error: deduplicationError } = await supabaseAdmin
      .from("saspay_webhook_events")
      .insert({
        delivery_key: deliveryKey,
        event_type: eventType,
        saspay_transaction_id: eventData.id || null,
        payload: payload,
      });

    if (deduplicationError && deduplicationError.code === "23505") {
      // 23505 = Contrainte de clé primaire violée (événement déjà reçu et traité)
      console.info(`[SasPay Webhook] Événement déjà traité (${deliveryKey}). Accusé de réception renvoyé.`);
      return new Response(
        JSON.stringify({ success: true, message: "Événement déjà traité précédemment." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Traitement des événements métier
    if (eventType === "transaction.success") {
      const transactionId = eventData.id;

      if (!transactionId) {
        throw new Error("Identifiant de transaction manquant dans le payload de webhook.");
      }

      // Règle d'or SasPay : Vérification active auprès de l'API (Seul SUCCESS autorise l'activation)
      // Ne jamais enregistrer un identifiant de transaction provenant uniquement d'un webhook non vérifié.
      const verifiedTransaction = await verifierPaiementSaspay(saspayApiKey, transactionId);

      if (verifiedTransaction.status !== "SUCCESS") {
        console.warn(`[SasPay Webhook] Transaction ${transactionId} en statut ${verifiedTransaction.status} lors de la vérification.`);
        return new Response(
          JSON.stringify({ success: false, message: "Paiement non confirmé auprès de la passerelle." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Récupération de l'enregistrement local associé :
      // 1. D'abord par saspay_transaction_id (cas Softpay ou transaction déjà liée)
      let { data: localRecord } = await supabaseAdmin
        .from("abonnements_paiements")
        .select("*")
        .eq("saspay_transaction_id", transactionId)
        .maybeSingle();

      // 2. Si non trouvé, recherche par metadata.local_id (cas Checkout hébergé)
      const localId = verifiedTransaction.metadata?.local_id;
      if (!localRecord && localId) {
        const { data: byLocalId } = await supabaseAdmin
          .from("abonnements_paiements")
          .select("*")
          .eq("id", localId)
          .maybeSingle();
        localRecord = byLocalId;
      }

      if (!localRecord) {
        throw new Error(`Transaction locale introuvable pour la transaction SasPay ${transactionId}.`);
      }

      // Contrôle de l'utilisateur : le paiement doit appartenir à l'utilisateur de la transaction locale
      const targetUserId = verifiedTransaction.metadata?.user_id || localRecord.user_id;
      if (localRecord.user_id !== targetUserId) {
        console.error(`[SasPay Webhook] ALERTE SÉCURITÉ : Discordance utilisateur. Local: ${localRecord.user_id}, Reçu: ${targetUserId}`);
        return new Response(
          JSON.stringify({ success: false, error: "Discordance entre l'utilisateur payeur et la session locale." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Contrôle de conformité du montant
      const requestedAmount = verifiedTransaction.requested_amount || verifiedTransaction.amount;
      if (requestedAmount !== "2600.00" && requestedAmount !== "5100.00") {
        console.error(`[SasPay Webhook] ALERTE MONTANT FRAUDULEUX : ${requestedAmount} reçu au lieu de 2600.00 ou 5100.00`);
        return new Response(
          JSON.stringify({ success: false, error: "Montant incompatible avec les forfaits officiels." }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (localRecord.amount !== requestedAmount) {
        console.error(`[SasPay Webhook] ALERTE MONTANT DIVERGENT : Enregistré ${localRecord.amount}, Reçu ${requestedAmount}`);
        return new Response(
          JSON.stringify({ success: false, error: "Le montant payé ne correspond pas au montant de la transaction locale." }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Contrôle de la devise
      if (localRecord.currency && verifiedTransaction.currency && localRecord.currency !== verifiedTransaction.currency) {
        console.error(`[SasPay Webhook] ALERTE DEVISE : Enregistrée ${localRecord.currency}, Reçue ${verifiedTransaction.currency}`);
        return new Response(
          JSON.stringify({ success: false, error: "Devise incompatible avec la transaction locale." }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Vérification du statut déjà actif (Idempotence)
      if (localRecord.status === "SUCCESS" && localRecord.active_le) {
        console.info(`[SasPay Webhook] Transaction locale ${localRecord.id} déjà active. Traitement idempotent.`);
        return new Response(
          JSON.stringify({ success: true, message: "Abonnement déjà activé.", activated: true, transaction_id: transactionId }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Enregistrement sécurisé de saspay_transaction_id vérifié sur la transaction locale
      if (localRecord.saspay_transaction_id !== transactionId) {
        const { error: linkError } = await supabaseAdmin
          .from("abonnements_paiements")
          .update({
            saspay_transaction_id: transactionId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", localRecord.id);

        if (linkError) {
          console.warn(`[SasPay Webhook] Note mise à jour saspay_transaction_id : ${linkError.message}`);
        }
      }

      // Appel de la fonction SQL atomique et idempotente d'activation
      const { data: activationResult, error: activationError } = await supabaseAdmin.rpc(
        "activer_abonnement_saspay",
        {
          p_transaction_id: transactionId,
          p_user_id: targetUserId,
          p_duree_jours: localRecord.duree_jours || 30,
          p_net_amount: verifiedTransaction.net_amount || null,
          p_charged_amount: verifiedTransaction.debited_amount || verifiedTransaction.charged || null,
          p_fee_amount: verifiedTransaction.client_fee || verifiedTransaction.fee || null,
          p_reference: verifiedTransaction.reference || null,
          p_raw_payload: verifiedTransaction,
        }
      );

      if (activationError) {
        throw new Error(`Erreur lors de l'activation en base : ${activationError.message}`);
      }

      console.info(`[SasPay Webhook] Abonnement activé avec succès pour le tailleur ${targetUserId}.`);
      return new Response(
        JSON.stringify({ success: true, activated: true, transaction_id: transactionId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else if (eventType === "transaction.failed") {
      const transactionId = eventData.id;
      if (transactionId) {
        const { data: updated } = await supabaseAdmin
          .from("abonnements_paiements")
          .update({
            status: "FAILED",
            updated_at: new Date().toISOString(),
          })
          .eq("saspay_transaction_id", transactionId)
          .select("id");

        if ((!updated || updated.length === 0) && eventData.metadata?.local_id) {
          await supabaseAdmin
            .from("abonnements_paiements")
            .update({
              status: "FAILED",
              saspay_transaction_id: transactionId,
              updated_at: new Date().toISOString(),
            })
            .eq("id", eventData.metadata.local_id);
        }
      }
      return new Response(
        JSON.stringify({ success: true, message: "Échec journalisé." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else if (eventType === "webhook.test") {
      // Événement de test manuel depuis le tableau de bord SasPay
      console.info("[SasPay Webhook] Événement de test webhook.test validé avec succès.");
      return new Response(
        JSON.stringify({ success: true, message: "Webhook de test validé avec succès." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: `Événement ${eventType} ignoré.` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[SasPay Webhook] Erreur traitement :", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Erreur interne webhook" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
