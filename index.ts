// ============================================================================
// TAILLEUR PRO — EDGE FUNCTION : VÉRIFICATION À LA DEMANDE (CLIENT / RETURN)
// ============================================================================
// Endpoint : POST /functions/v1/saspay-verify
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  verifierPaiementSaspay,
  verifierStatutSessionCheckout,
} from "../_shared/saspay.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const saspayApiKey = Deno.env.get("SASPAY_API_KEY") ?? "";

    if (!saspayApiKey) {
      throw new Error("Clé API SasPay non configurée.");
    }

    // Authentification par session utilisateur
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Non authentifié" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace("Bearer ", "").trim();
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Session invalide" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const transactionId = body.transaction_id ? String(body.transaction_id).trim() : null;
    const sessionId = body.session_id ? String(body.session_id).trim() : null;

    let localRecord: any = null;

    if (transactionId || sessionId) {
      // 1. Recherche par identifiant explicite, STRICTEMENT restreinte à user.id
      let query = supabaseAdmin
        .from("abonnements_paiements")
        .select("*")
        .eq("user_id", user.id);

      if (transactionId) query = query.eq("saspay_transaction_id", transactionId);
      if (sessionId) query = query.eq("saspay_session_id", sessionId);

      const { data: record, error: findError } = await query.maybeSingle();
      if (findError) throw findError;
      localRecord = record;

      if (!localRecord) {
        return new Response(
          JSON.stringify({ success: false, error: "Transaction ou session introuvable pour votre compte." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // 2. Repli sécurisé et non ambigu sur les sessions de l'utilisateur authentifié
      const deuxHeuresAvant = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

      // Vérifier les sessions en attente créées récemment (< 2h)
      const { data: pendingRecords, error: pendingError } = await supabaseAdmin
        .from("abonnements_paiements")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "PENDING")
        .gte("created_at", deuxHeuresAvant)
        .order("created_at", { ascending: false });

      if (pendingError) throw pendingError;

      if (pendingRecords && pendingRecords.length === 1) {
        // Recherche NON AMBIGUË : exactement une session PENDING
        localRecord = pendingRecords[0];
      } else if (pendingRecords && pendingRecords.length > 1) {
        // AMBIGUÏTÉ : plusieurs sessions PENDING
        return new Response(
          JSON.stringify({
            success: false,
            error: "Plusieurs paiements en attente ont été trouvés. Veuillez spécifier l'identifiant exact.",
            ambiguous: true,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        // Aucune session PENDING trouvée : vérifier si un paiement a été validé très récemment
        const { data: recentSuccess } = await supabaseAdmin
          .from("abonnements_paiements")
          .select("*")
          .eq("user_id", user.id)
          .eq("status", "SUCCESS")
          .gte("updated_at", deuxHeuresAvant)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (recentSuccess) {
          return new Response(
            JSON.stringify({ success: true, status: "SUCCESS", activated: true, message: "Abonnement déjà actif." }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: false, error: "Aucun paiement récent trouvé pour cet utilisateur." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Si déjà validé en base par le webhook (Idempotence)
    if (localRecord.status === "SUCCESS" && localRecord.active_le) {
      return new Response(
        JSON.stringify({ success: true, status: "SUCCESS", activated: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Vérification active auprès de SasPay
    let verifiedTransactionId = transactionId || localRecord.saspay_transaction_id;

    if (!verifiedTransactionId && (sessionId || localRecord.saspay_session_id)) {
      const activeSessionId = sessionId || localRecord.saspay_session_id;
      // Cas session Checkout : interroger /checkout-sessions/{id}/status/
      const sessionStatus = await verifierStatutSessionCheckout(saspayApiKey, activeSessionId);

      if (sessionStatus.status === "PAID" && sessionStatus.transaction_id) {
        verifiedTransactionId = sessionStatus.transaction_id;
        // Mémorisation de l'id de transaction vérifié
        await supabaseAdmin
          .from("abonnements_paiements")
          .update({
            saspay_transaction_id: verifiedTransactionId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", localRecord.id);
      } else if (sessionStatus.status === "EXPIRED") {
        await supabaseAdmin
          .from("abonnements_paiements")
          .update({
            status: "EXPIRED",
            updated_at: new Date().toISOString(),
          })
          .eq("id", localRecord.id);

        return new Response(
          JSON.stringify({ success: true, status: "EXPIRED", activated: false }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (!verifiedTransactionId) {
      return new Response(
        JSON.stringify({ success: true, status: "PENDING", activated: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Interrogation de la transaction auprès de SasPay
    const verifiedTransaction = await verifierPaiementSaspay(saspayApiKey, verifiedTransactionId);

    if (verifiedTransaction.status === "SUCCESS") {
      // Activation automatique atomique et idempotente
      await supabaseAdmin.rpc("activer_abonnement_saspay", {
        p_transaction_id: verifiedTransactionId,
        p_user_id: user.id,
        p_duree_jours: localRecord.duree_jours || 30,
        p_net_amount: verifiedTransaction.net_amount || null,
        p_charged_amount: verifiedTransaction.debited_amount || verifiedTransaction.charged || null,
        p_fee_amount: verifiedTransaction.client_fee || verifiedTransaction.fee || null,
        p_reference: verifiedTransaction.reference || null,
        p_raw_payload: verifiedTransaction,
      });

      return new Response(
        JSON.stringify({ success: true, status: "SUCCESS", activated: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else if (verifiedTransaction.status === "FAILED") {
      await supabaseAdmin
        .from("abonnements_paiements")
        .update({
          status: "FAILED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", localRecord.id);

      return new Response(
        JSON.stringify({ success: true, status: "FAILED", activated: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, status: verifiedTransaction.status || "PENDING", activated: false }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Erreur de vérification" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
