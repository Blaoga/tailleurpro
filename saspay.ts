// ============================================================================
// TAILLEUR PRO — CLIENT UTILITAIRE & SÉCURITÉ SASPAY (EDGE FUNCTIONS)
// ============================================================================
// Spécification officielle : https://api.saspay.me/api/v1
// Documentation : /llms.txt et /api-reference/openapi.json
// ============================================================================

export const SASPAY_BASE_URL = "https://api.saspay.me/api/v1";

export interface SaspayPlan {
  planId: "solo" | "atelier";
  amount: string; // Montant en chaîne décimale stricte
  dureeJours: number;
  label: string;
}

export const PLANS: Record<string, SaspayPlan> = {
  solo: {
    planId: "solo",
    amount: "2600.00",
    dureeJours: 30,
    label: "Abonnement Un Tailleur",
  },
  atelier: {
    planId: "atelier",
    amount: "5100.00",
    dureeJours: 30,
    label: "Abonnement Atelier",
  },
};

export const DEVISE_PAR_PAYS: Record<string, string> = {
  CM: "XAF", // Cameroun
  CG: "XAF", // Congo-Brazzaville
  CD: "CDF", // République Démocratique du Congo
  GA: "XAF", // Gabon
  CF: "XAF", // République Centrafricaine
  RW: "RWF", // Rwanda
  BI: "BIF", // Burundi
  CI: "XOF", // Côte d'Ivoire
  SN: "XOF", // Sénégal
  BJ: "XOF", // Bénin
  TG: "XOF", // Togo
  BF: "XOF", // Burkina Faso
  ML: "XOF", // Mali
  NE: "XOF", // Niger
  GN: "GNF", // Guinée
};

export function obtenirDevisePays(codePays: string): string {
  const code = (codePays || "").toUpperCase();
  return DEVISE_PAR_PAYS[code] || "XOF";
}

// ----------------------------------------------------------------------------
// 1. VÉRIFICATION SÉCURISÉE DE LA SIGNATURE WEBHOOK (HMAC SHA-256 EN TEMPS CONSTANT)
// ----------------------------------------------------------------------------
export async function verifierSignatureWebhook(
  rawBody: string,
  signatureHeader: string | null,
  timestampHeader: string | null,
  signingSecret: string
): Promise<{ valide: boolean; raison?: string }> {
  if (!signatureHeader || !timestampHeader) {
    return { valide: false, raison: "En-têtes de signature ou timestamp manquants" };
  }

  // Contrôle 1 : Tolérance temporelle (300 secondes = 5 minutes maximum)
  const timestamp = parseInt(timestampHeader, 10);
  if (isNaN(timestamp)) {
    return { valide: false, raison: "Timestamp invalide" };
  }
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) {
    return { valide: false, raison: "Timestamp expiré (écart supérieur à 300s)" };
  }

  if (!signingSecret) {
    return { valide: false, raison: "Clé secrète signing_secret non configurée côté serveur" };
  }

  // Contrôle 2 : Calcul HMAC SHA-256 sur "${timestamp}.${rawBody}"
  const encoder = new TextEncoder();
  const keyData = encoder.encode(signingSecret);
  const messageData = encoder.encode(`${timestampHeader}.${rawBody}`);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  const signatureCalculee = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toLowerCase();

  const signatureRecue = signatureHeader.trim().toLowerCase();

  // Comparaison en temps constant (Timing-safe comparison)
  if (signatureCalculee.length !== signatureRecue.length) {
    return { valide: false, raison: "Longueur de signature divergente" };
  }

  let diff = 0;
  for (let i = 0; i < signatureCalculee.length; i++) {
    diff |= signatureCalculee.charCodeAt(i) ^ signatureRecue.charCodeAt(i);
  }

  if (diff !== 0) {
    return { valide: false, raison: "Signature HMAC invalide" };
  }

  return { valide: true };
}

// ----------------------------------------------------------------------------
// 2. ENCAISSEMENT DIRECT : SOFTPAY (POST /payments/softpay/)
// ----------------------------------------------------------------------------
export async function initierPaiementSoftpay(
  apiKey: string,
  idempotencyKey: string,
  params: {
    amount: string;
    currency: string;
    country: string;
    network: string;
    description: string;
    customer: { email: string; first_name: string; last_name: string; phone: string };
    metadata: Record<string, unknown>;
  }
) {
  const url = `${SASPAY_BASE_URL}/payments/softpay/`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(params),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg = data?.error?.message || data?.message || `Erreur SasPay HTTP ${response.status}`;
    const errorCode = data?.error?.code || `http_${response.status}`;
    throw new Error(JSON.stringify({ message: errorMsg, code: errorCode, status: response.status }));
  }

  return data?.data || data;
}

function extraireErreurSaspay(data: unknown, status: number): string {
  if (!data || typeof data !== "object") {
    return `Erreur SasPay HTTP ${status}`;
  }
  const obj = data as Record<string, unknown>;
  const nestedErr = obj.error && typeof obj.error === "object"
    ? (obj.error as Record<string, unknown>)
    : null;
  const directMsg =
    (typeof nestedErr?.message === "string" && nestedErr.message) ||
    (typeof obj.message === "string" && obj.message) ||
    (typeof obj.detail === "string" && obj.detail);
  if (directMsg) return directMsg;

  const detailsObj =
    nestedErr?.details && typeof nestedErr.details === "object"
      ? (nestedErr.details as Record<string, unknown>)
      : obj;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(detailsObj)) {
    if (k === "code" || k === "status") continue;
    if (Array.isArray(v) && v.length > 0) {
      parts.push(`${k}: ${v.join(", ")}`);
    } else if (typeof v === "string" && v.trim()) {
      parts.push(`${k}: ${v}`);
    }
  }
  return parts.length > 0 ? parts.join(" | ") : `Erreur SasPay HTTP ${status}`;
}

// ----------------------------------------------------------------------------
// 3. CHECKOUT HÉBERGÉ : CRÉER UNE SESSION (POST /checkout-sessions/)
// ----------------------------------------------------------------------------
export async function creerSessionCheckout(
  apiKey: string,
  params: {
    amount: string;
    currency: string;
    customer_email: string;
    customer_name: string;
    customer_phone?: string;
    country?: string;
    description: string;
    return_url?: string;
    metadata: Record<string, unknown>;
  }
) {
  const url = `${SASPAY_BASE_URL}/checkout-sessions/`;
  const payload: Record<string, unknown> = {
    amount: params.amount,
    currency: params.currency,
    customer_email: params.customer_email,
    customer_name: params.customer_name,
    description: params.description,
    metadata: params.metadata,
  };
  if (params.customer_phone && params.customer_phone.trim()) {
    payload.customer_phone = params.customer_phone.trim();
  }
  if (params.country && params.country.trim()) {
    payload.country = params.country.trim().toUpperCase();
  }
  if (params.return_url && params.return_url.trim()) {
    payload.return_url = params.return_url.trim();
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg = extraireErreurSaspay(data, response.status);
    const errorCode = (data as Record<string, Record<string, unknown>>)?.error?.code || `http_${response.status}`;
    throw new Error(JSON.stringify({ message: errorMsg, code: errorCode, status: response.status }));
  }

  return data?.data || data;
}

// ----------------------------------------------------------------------------
// 4. VÉRIFICATION ACTIVE : GET /payments/{payment_id}/verify/
// ----------------------------------------------------------------------------
export async function verifierPaiementSaspay(apiKey: string, paymentId: string) {
  const url = `${SASPAY_BASE_URL}/payments/${paymentId}/verify/`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg = data?.error?.message || data?.message || `Erreur SasPay Verify HTTP ${response.status}`;
    const errorCode = data?.error?.code || `http_${response.status}`;
    throw new Error(JSON.stringify({ message: errorMsg, code: errorCode, status: response.status }));
  }

  return data?.data || data;
}

// ----------------------------------------------------------------------------
// 5. STATUT SESSION CHECKOUT : GET /checkout-sessions/{id}/status/
// ----------------------------------------------------------------------------
export async function verifierStatutSessionCheckout(apiKey: string, sessionId: string) {
  const url = `${SASPAY_BASE_URL}/checkout-sessions/${sessionId}/status/`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg = data?.error?.message || data?.message || `Erreur SasPay Checkout Status HTTP ${response.status}`;
    const errorCode = data?.error?.code || `http_${response.status}`;
    throw new Error(JSON.stringify({ message: errorMsg, code: errorCode, status: response.status }));
  }

  return data?.data || data;
}
