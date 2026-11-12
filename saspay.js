/**
 * TAILLEUR PRO — MODULE CLIENT SASPAY
 * ====================================
 * Gère les interactions sécurisées avec les Edge Functions Supabase pour SasPay :
 * - Initialisation (Softpay direct ou Checkout hébergé)
 * - Gestion des redirections vers checkout_url
 * - Polling intelligent en arrière-plan pendant le push USSD
 */

const SasPayClient = {
  /**
   * Initialise une demande d'abonnement auprès de l'Edge Function
   * @param {Object} options
   * @param {"solo"|"atelier"} options.plan
   * @param {"softpay"|"checkout"} options.mode
   * @param {string} options.country Code ISO pays (ex: 'CM', 'CI', 'SN')
   * @param {string} options.network Code réseau SasPay (ex: 'mtn_cm', 'wave_ci')
   * @param {string} options.phone Numéro de téléphone du payeur
   * @returns {Promise<Object>}
   */
  async initierPaiement({ plan, mode, country, network, phone }) {
    if (!supabaseClient) {
      throw new Error("Client Supabase non initialisé.");
    }

    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError || !session) {
      throw new Error("Vous devez être connecté pour vous abonner.");
    }

    const functionUrl = `${CONFIG.SUPABASE_URL}/functions/v1/saspay-initiate`;
    const origin = window.location.origin || "";
    const estOriginPublicHttps = /^https:\/\/(?!(localhost|127\.0\.0\.1)(:|\/|$))/i.test(origin);
    const phoneClean = String(phone || "").replace(/\s+/g, "").trim();

    const bodyPayload = {
      plan: plan || "solo",
      mode: mode || "softpay",
      country: (country || "CM").toUpperCase(),
      network: network || "mtn_cm",
    };
    if (phoneClean) {
      bodyPayload.phone = phoneClean;
    }
    if (estOriginPublicHttps) {
      bodyPayload.return_url = `${origin}/abonnement.html?retour_saspay=1`;
    }

    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(bodyPayload),
    });

    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.success) {
      const msg = result?.error || `Erreur d'initialisation (HTTP ${response.status})`;
      throw new Error(msg);
    }

    // Sauvegarde immédiate des identifiants dans la session du navigateur avant toute redirection
    try {
      if (result.session_id) {
        sessionStorage.setItem("saspay_active_session_id", result.session_id);
      }
      if (result.transaction_id) {
        sessionStorage.setItem("saspay_active_transaction_id", result.transaction_id);
      }
    } catch (e) {
      console.warn("[SasPay] Erreur d'enregistrement sessionStorage :", e);
    }

    return result;
  },

  /**
   * Récupère les identifiants de transaction ou session sauvegardés
   * @returns {{ session_id: string|null, transaction_id: string|null }}
   */
  getIdentifiantsEnCours() {
    try {
      return {
        session_id: sessionStorage.getItem("saspay_active_session_id") || null,
        transaction_id: sessionStorage.getItem("saspay_active_transaction_id") || null,
      };
    } catch (e) {
      return { session_id: null, transaction_id: null };
    }
  },

  /**
   * Nettoie les identifiants de paiement en cours après traitement final
   */
  nettoyerIdentifiants() {
    try {
      sessionStorage.removeItem("saspay_active_session_id");
      sessionStorage.removeItem("saspay_active_transaction_id");
    } catch (e) {}
  },

  /**
   * Vérifie activement l'état d'un paiement en cours auprès du serveur
   * @param {Object} [options]
   * @param {string} [options.transaction_id]
   * @param {string} [options.session_id]
   * @returns {Promise<Object>}
   */
  async verifierPaiement({ transaction_id, session_id } = {}) {
    if (!supabaseClient) throw new Error("Client Supabase non initialisé.");

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) throw new Error("Session expirée.");

    // Résolution des identifiants (priorité aux arguments explicites, sinon sessionStorage)
    const enCours = SasPayClient.getIdentifiantsEnCours();
    const finalTxnId = transaction_id || enCours.transaction_id || null;
    const finalSessionId = session_id || enCours.session_id || null;

    const functionUrl = `${CONFIG.SUPABASE_URL}/functions/v1/saspay-verify`;

    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        transaction_id: finalTxnId,
        session_id: finalSessionId,
      }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok && !data) {
      throw new Error(`Erreur HTTP ${response.status} lors de la vérification.`);
    }

    return data;
  },

  /**
   * Lance une boucle de vérification périodique (polling)
   * @param {Object} options
   * @param {string} options.transaction_id
   * @param {string} [options.session_id]
   * @param {function} options.onTick Callback à chaque tentative
   * @param {function} options.onSuccess Callback dès que SUCCESS
   * @param {function} options.onFailure Callback si FAILED
   * @param {function} options.onTimeout Callback si délai max dépassé
   */
  demarrerPolling({ transaction_id, session_id, onTick, onSuccess, onFailure, onTimeout }) {
    const dureeMaxMs = 180 * 1000; // 3 minutes maximum
    const intervalleMs = 3500;     // Toutes les 3.5 secondes
    const debut = Date.now();
    let tentatives = 0;

    const timer = setInterval(async () => {
      tentatives++;
      const ecoule = Date.now() - debut;

      if (ecoule >= dureeMaxMs) {
        clearInterval(timer);
        if (typeof onTimeout === "function") onTimeout();
        return;
      }

      try {
        const res = await SasPayClient.verifierPaiement({ transaction_id, session_id });

        if (typeof onTick === "function") {
          onTick({ statut: res?.status || "PENDING", tentatives, secondesRestantes: Math.round((dureeMaxMs - ecoule) / 1000) });
        }

        if (res?.status === "SUCCESS" && res?.activated) {
          clearInterval(timer);
          if (typeof onSuccess === "function") onSuccess(res);
        } else if (res?.status === "FAILED") {
          clearInterval(timer);
          if (typeof onFailure === "function") onFailure(res);
        }
      } catch (e) {
        console.warn("[SasPay Polling] Erreur temporaire :", e);
      }
    }, intervalleMs);

    return () => clearInterval(timer); // Permet d'annuler le timer si l'utilisateur quitte la vue
  },
};

// Export global pour utilisation dans abonnement.html
if (typeof window !== "undefined") {
  window.SasPayClient = SasPayClient;
}
