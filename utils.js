/**
 * TAILLEUR PRO - UTILITAIRES & NORMALISATION TÉLÉPHONIQUE
 * =======================================================
 * Étape 4 : Fonctions utilitaires transversales
 * - Normalisation rigoureuse des numéros selon les règles des pays (Section 2 & 7.2)
 * - Formatage monétaire FCFA et dates
 * - Sécurisation XSS (échappement)
 * - Indicateur de force du mot de passe
 */

/**
 * Extrait uniquement les chiffres d'une chaîne
 */
function extraireChiffres(chaine) {
  if (!chaine) return '';
  return chaine.toString().replace(/\D/g, '');
}

/**
 * Normalise et valide un numéro de téléphone selon les règles strictes du pays
 * Section 2 :
 * - Cameroun (CM) : indicatif 237, longueur 9, pas de zéro initial
 * - Côte d'Ivoire (CI) : indicatif 225, longueur 10, zéro initial obligatoire (norme 2021)
 * - Congo-Brazzaville (CG) : indicatif 242, longueur 9, zéro initial conservé
 * 
 * @param {string} saisie - Le numéro entré par l'utilisateur
 * @param {string} codePays - 'CM', 'CI', ou 'CG'
 * @returns {object} { valide: boolean, telephoneE164: string, numeroNational: string, erreur?: string }
 */
function normaliserTelephone(saisie, codePays) {
  const pays = (typeof PAYS !== 'undefined' && PAYS[codePays]) ? PAYS[codePays] : null;
  const estEn = typeof Lang !== 'undefined' && Lang.get() === 'en';

  if (!pays) {
    return {
      valide: false,
      telephoneE164: '',
      numeroNational: '',
      erreur: estEn ? 'Country not supported.' : 'Pays non pris en charge.'
    };
  }

  let chiffres = extraireChiffres(saisie);

  if (!chiffres) {
    return {
      valide: false,
      telephoneE164: '',
      numeroNational: '',
      erreur: estEn ? 'Please enter a phone number.' : 'Veuillez saisir votre numéro de téléphone.'
    };
  }

  // Si l'utilisateur a collé le numéro avec l'indicatif international (ex: 237... ou 00237...)
  if (chiffres.startsWith('00' + pays.indicatif)) {
    chiffres = chiffres.substring(2 + pays.indicatif.length);
  } else if (chiffres.startsWith(pays.indicatif)) {
    chiffres = chiffres.substring(pays.indicatif.length);
  }

  // Règle du zéro initial selon le pays
  if (!pays.garderZero) {
    if (chiffres.startsWith('0')) {
      chiffres = chiffres.replace(/^0+/, '');
    }
  } else if (chiffres.length === pays.longueur - 1 && !chiffres.startsWith('0') && (codePays === 'CI' || codePays === 'CG')) {
    chiffres = '0' + chiffres;
  }

  const longueursOk = Array.isArray(pays.longueursAcceptees) && pays.longueursAcceptees.length > 0
    ? pays.longueursAcceptees
    : [pays.longueur];

  if (!longueursOk.includes(chiffres.length)) {
    const pluriel = pays.longueur > 1 ? 'chiffres' : 'chiffre';
    const nomPays = typeof obtenirNomPays === 'function' ? obtenirNomPays(pays) : pays.nom;
    return {
      valide: false,
      telephoneE164: '',
      numeroNational: chiffres,
      erreur: estEn
        ? `Invalid number for ${nomPays}: ${pays.longueur} digits expected (e.g. ${pays.exemple}).`
        : `Numéro invalide pour ${nomPays} : ${pays.longueur} ${pluriel} attendus (ex: ${pays.exemple}).`
    };
  }

  const telephoneE164 = `+${pays.indicatif}${chiffres}`;

  return {
    valide: true,
    telephoneE164,
    numeroNational: chiffres,
    erreur: null
  };
}

/**
 * Formate automatiquement le contact téléphonique d'un client avec l'indicatif de son pays
 * (détecte automatiquement si le numéro saisi contient déjà un autre indicatif).
 */
function normaliserContactClient(saisie, codePaysParDefaut = 'CM') {
  const brut = (saisie || '').toString().trim();
  if (!brut) return { telephone: '', codePays: codePaysParDefaut || 'CM' };

  const detecte = (typeof detecterPaysDepuisNumero === 'function')
    ? detecterPaysDepuisNumero(brut)
    : null;
  const codeFinal = detecte ? detecte.codePays : ((typeof PAYS !== 'undefined' && PAYS[codePaysParDefaut]) ? codePaysParDefaut : 'CM');

  const norm = normaliserTelephone(brut, codeFinal);
  if (norm.valide) {
    return { telephone: norm.telephoneE164, codePays: codeFinal };
  }

  const pays = (typeof PAYS !== 'undefined' && PAYS[codeFinal]) ? PAYS[codeFinal] : null;
  if (!pays) return { telephone: brut, codePays: codeFinal };

  let chiffres = extraireChiffres(brut);
  if (chiffres.startsWith('00' + pays.indicatif)) {
    chiffres = chiffres.substring(2 + pays.indicatif.length);
  } else if (chiffres.startsWith(pays.indicatif) && chiffres.length > pays.indicatif.length + 5) {
    chiffres = chiffres.substring(pays.indicatif.length);
  }
  if (!pays.garderZero && chiffres.startsWith('0') && chiffres.length >= 8) {
    chiffres = chiffres.replace(/^0+/, '');
  }

  return {
    telephone: chiffres ? `+${pays.indicatif}${chiffres}` : '',
    codePays: codeFinal
  };
}

/**
 * Fabrique l'adresse email interne invisible pour Supabase Auth
 * Section 7.3 : telephoneNormalise.replace('+', '') + '@tailleurpro.app'
 */
function fabriquerEmailInterne(telephoneE164) {
  const propre = extraireChiffres(telephoneE164);
  return `${propre}@tailleurpro.app`;
}

/**
 * Calcule la force d'un mot de passe (0 à 100)
 */
function evaluerForceMotDePasse(mdp) {
  if (!mdp) return { score: 0, niveau: 'vide', couleur: '#E2E8F0' };
  
  let score = 0;
  if (mdp.length >= 8) score += 35;
  if (mdp.length >= 10) score += 15;
  if (/[A-Z]/.test(mdp)) score += 15;
  if (/[0-9]/.test(mdp)) score += 20;
  if (/[^A-Za-z0-9]/.test(mdp)) score += 15;

  if (score < 40) {
    return { score: Math.min(score, 35), niveau: 'Faible', couleur: '#EF4444' };
  } else if (score < 70) {
    return { score, niveau: 'Moyen', couleur: '#F59E0B' };
  } else {
    return { score: Math.min(score, 100), niveau: 'Fort', couleur: '#22C55E' };
  }
}

/**
 * Formatage d'un montant en FCFA avec séparateurs d'espaces
 * Ex: 25000 -> "25 000 FCFA"
 */
function formaterFCFA(montant) {
  const nombre = Number(montant) || 0;
  return nombre.toLocaleString('fr-FR').replace(/\u202F/g, ' ') + ' FCFA';
}

/**
 * Formatage d'une date ISO en français court
 * Ex: '2026-02-15' -> '15 févr. 2026'
 */
function formaterDateFr(dateString) {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch (e) {
    return dateString;
  }
}

/**
 * Calcule l'écart en jours entre maintenant et une date cible
 * > 0 : jours restants
 * = 0 : aujourd'hui
 * < 0 : en retard
 */
function calculerJoursRestants(dateCible) {
  if (!dateCible) return null;
  const maintenant = new Date();
  const cible = new Date(dateCible);
  const diffTemps = cible.getTime() - maintenant.getTime();
  return Math.ceil(diffTemps / (1000 * 60 * 60 * 24));
}

/**
 * Échappement anti-XSS pour tout contenu textuel injecté
 * Section 11 : sécurité du rendu
 */
function echapperHTML(texte) {
  if (texte === null || texte === undefined) return '';
  return texte
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Export pour modules si environnement Node/bundler
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    extraireChiffres,
    normaliserTelephone,
    normaliserContactClient,
    fabriquerEmailInterne,
    evaluerForceMotDePasse,
    formaterFCFA,
    formaterDateFr,
    calculerJoursRestants,
    echapperHTML
  };
}
