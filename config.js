/**
 * TAILLEUR PRO - Configuration Globale
 * =====================================
 * Sécurité : Les clés réelles sont isolées dans env.local et js/env.local.js
 * (répertoriés dans .gitignore pour ne JAMAIS être poussés sur un dépôt public).
 */

const envLocal = (typeof window !== 'undefined' && window.__ENV__) ? window.__ENV__ : {};

const CONFIG = {
  // Clés Supabase isolées via env.local
  SUPABASE_URL: envLocal.SUPABASE_URL || "",
  SUPABASE_ANON_KEY: envLocal.SUPABASE_ANON_KEY || "",

  // Paramètres WhatsApp et Métier
  WHATSAPP_SUPPORT: envLocal.WHATSAPP_SUPPORT || "237600000000",
  APP_NAME: envLocal.APP_NAME || "Tailleur Pro",
  APP_VERSION: envLocal.APP_VERSION || "1.0.0",
  DUREE_ESSAI_JOURS: Number(envLocal.DUREE_ESSAI_JOURS) || 15,
  PRIX_ESSAI_FCFA: Number(envLocal.PRIX_ESSAI_FCFA) || 0,
  PRIX_SOLO_FCFA: Number(envLocal.PRIX_SOLO_FCFA) || 2600,
  PRIX_ATELIER_FCFA: Number(envLocal.PRIX_ATELIER_FCFA) || 5100,
  PRIX_MENSUEL_FCFA: Number(envLocal.PRIX_MENSUEL_FCFA) || 2600
};

// Initialisation du client Supabase si les clés sont disponibles
let supabaseClient = null;
if (typeof supabase !== 'undefined' && CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY) {
  try {
    supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  } catch (e) {
    console.warn("[Tailleur Pro] Erreur initialisation Supabase :", e);
  }
} else if (typeof window !== 'undefined' && !CONFIG.SUPABASE_URL) {
  console.warn("[Tailleur Pro] ATTENTION : Les variables Supabase sont introuvables. Vérifiez la présence de env.local / js/env.local.js.");
}
