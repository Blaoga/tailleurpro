// ============================================================================
// TAILLEUR PRO — EDGE FUNCTION : INITIALISATION SÉCURISÉE D'UN PAIEMENT SASPAY
// ============================================================================
// Endpoint : POST /functions/v1/saspay-initiate
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  PLANS,
  obtenirDevisePays,
  initierPaiementSoftpay,
  creerSessionCheckout,
} from "../_shared/saspay.ts";

serve(async (req: Request) => {
  // 1. Gestion des requêtes CORS prévol (OPTIONS)
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const saspayApiKey = Deno.env.get("SASPAY_API_KEY") ?? "";
    const appUrl = Deno.env.get("APP_URL") ?? "https://tailleurpro.app";

    if (!saspayApiKey) {
      throw new Error("La variable d'environnement SASPAY_API_KEY est manquante.");
    }

    // 2. Authentification obligatoire de l'utilisateur par JWT Supabase
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "En-tête Authorization manquant." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace("Bearer ", "").trim();
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Session invalide ou expirée." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Lecture et validation stricte du payload
    const body = await req.json().catch(() => ({}));
    const planKey = body.plan === "atelier" ? "atelier" : "solo";
    const selectedPlan = PLANS[planKey];
    const mode = body.mode === "checkout" ? "checkout" : "softpay";
    const countryRaw = (body.country || user.user_metadata?.pays || "CM").toUpperCase();
    const country = /^[A-Z]{2}$/.test(countryRaw) ? countryRaw : "CM";
    const rawCurrency = country === "XX" ? "USD" : obtenirDevisePays(country);
    const currency = (rawCurrency === "XAF" || rawCurrency === "XOF" || rawCurrency === "USD") ? rawCurrency : "XAF";
    const network = body.network || (country === "CM" ? "mtn_cm" : "orange_ci");
    const phone = String(body.phone || user.user_metadata?.telephone || "").replace(/\s+/g, "").trim();

    const estUrlPubliqueValide = (val: string) => {
      try {
        const parsed = new URL(val);
        const isLocal = /^(localhost|127\.0\.0\.1)$/i.test(parsed.hostname);
        return (parsed.protocol === "https:" || parsed.protocol === "http:") && !isLocal;
      } catch {
        return false;
      }
    };
    const fallbackReturnUrl = estUrlPubliqueValide(appUrl)
      ? `${appUrl.replace(/\/+$/, "")}/abonnement.html?retour_saspay=1`
      : "https://tailleurpro.app/abonnement.html?retour_saspay=1";
    const returnUrl = (typeof body.return_url === "string" && estUrlPubliqueValide(body.return_url))
      ? body.return_url
      : fallbackReturnUrl;

    // 4. Génération de la clé d'idempotence unique (UUID v4)
    const idempotencyKey = crypto.randomUUID();

    // 5. Enregistrement préalable de l'intention de transaction en base (Statut PENDING)
    const { data: localRecord, error: insertError } = await supabaseAdmin
      .from("abonnements_paiements")
      .insert({
        user_id: user.id,
        plan: selectedPlan.planId,
        duree_jours: selectedPlan.dureeJours,
        amount: selectedPlan.amount,
        currency: currency,
        country: country,
        network: mode === "softpay" ? network : null,
        customer_phone: phone,
        status: "PENDING",
        idempotency_key: idempotencyKey,
      })
      .select("id")
      .single();

    if (insertError) {
      throw new Error(`Erreur enregistrement transaction locale : ${insertError.message}`);
    }

    // Décomposition nom / prénom client pour SasPay
    const fullName = (user.user_metadata?.prenom || "Artisan").trim();
    const nameParts = fullName.split(" ");
    const firstName = nameParts[0] || "Artisan";
    const lastName = nameParts.slice(1).join(" ") || "Tailleur";
    const email = user.email || `tailleur_${user.id.substring(0, 8)}@tailleurpro.app`;

    const metadata = {
      user_id: user.id,
      local_id: localRecord.id,
      plan: selectedPlan.planId,
      app: "tailleur_pro",
    };

    // 6. Appel de l'API SasPay selon le mode sélectionné
    if (mode === "checkout") {
      // --- FLUX CHECKOUT HÉBERGÉ ---
      const sessionResult = await creerSessionCheckout(saspayApiKey, {
        amount: selectedPlan.amount,
        currency: currency,
        customer_email: email,
        customer_name: fullName || "Artisan Tailleur",
        customer_phone: phone || undefined,
        country: country !== "XX" ? country : undefined,
        description: `${selectedPlan.label} - Tailleur Pro`,
        return_url: returnUrl,
        metadata: metadata,
      });

      const sessionId = sessionResult.id;
      const checkoutUrl = sessionResult.checkout_url;

      // Mise à jour de la transaction locale avec l'ID de session SasPay
      await supabaseAdmin
        .from("abonnements_paiements")
        .update({
          saspay_session_id: sessionId,
          checkout_url: checkoutUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", localRecord.id);

      return new Response(
        JSON.stringify({
          success: true,
          mode: "checkout",
          session_id: sessionId,
          checkout_url: checkoutUrl,
          status: "PENDING",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // --- FLUX SOFTPAY DIRECT (Push USSD ou redirection spécifique) ---
      const softpayResult = await initierPaiementSoftpay(saspayApiKey, idempotencyKey, {
        amount: selectedPlan.amount,
        currency: currency,
        country: country,
        network: network,
        description: `${selectedPlan.label} - Tailleur Pro`,
        customer: {
          email: email,
          first_name: firstName,
          last_name: lastName,
          phone: phone,
        },
        metadata: metadata,
      });

      const transactionId = softpayResult.id;
      const checkoutUrl = softpayResult.checkout_url || "";
      const status = softpayResult.status || "PENDING";

      // Mise à jour de la transaction locale avec le transaction_id SasPay
      await supabaseAdmin
        .from("abonnements_paiements")
        .update({
          saspay_transaction_id: transactionId,
          checkout_url: checkoutUrl || null,
          status: status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", localRecord.id);

      return new Response(
        JSON.stringify({
          success: true,
          mode: "softpay",
          transaction_id: transactionId,
          status: status,
          checkout_url: checkoutUrl,
          requires_redirect: !!checkoutUrl,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (err: any) {
    let parsed = { message: err.message || "Erreur interne", code: "internal_error" };
    try {
      parsed = JSON.parse(err.message);
    } catch {}

    return new Response(
      JSON.stringify({ success: false, error: parsed.message || err.message, code: parsed.code }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
