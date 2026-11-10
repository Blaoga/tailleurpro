// ============================================================================
// TAILLEUR PRO — EN-TÊTES CORS POUR SUPABASE EDGE FUNCTIONS
// ============================================================================

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, idempotency-key",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
