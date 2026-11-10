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

  if (!pays) {
    return {
      valide: false,
      telephoneE164: '',
      numeroNational: '',
      erreur: 'Pays non pris en charge.'
    };
  }

  let chiffres = extraireChiffres(saisie);

  if (!chiffres) {
    return {
      valide: false,
      telephoneE164: '',
      numeroNational: '',
      erreur: 'Veuillez saisir votre numéro de téléphone.'
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
    // Cas du Cameroun : pas de zéro initial
    if (chiffres.startsWith('0')) {
      chiffres = chiffres.replace(/^0+/, '');
    }
  } else {
    // Cas Côte d'Ivoire (10 chiffres) et Congo (9 chiffres) : le zéro initial fait partie du numéro
    // Si l'utilisateur a omis le 0 par habitude mais a saisi (longueur - 1) chiffres, on le rajoute automatiquement
    if (!chiffres.startsWith('0') && chiffres.length === pays.longueur - 1) {
      chiffres = '0' + chiffres;
    }
  }

  // Vérification de la longueur exacte
  if (chiffres.length !== pays.longueur) {
    const pluriel = pays.longueur > 1 ? 'chiffres' : 'chiffre';
    let detail = '';
    if (codePays === 'CI') {
      detail = ' (nouveau plan à 10 chiffres débutant par 0)';
    } else if (codePays === 'CM') {
      detail = ' (9 chiffres sans 0 initial)';
    }

    return {
      valide: false,
      telephoneE164: '',
      numeroNational: chiffres,
      erreur: `Numéro invalide pour ${pays.nom} : ${pays.longueur} ${pluriel} attendus${detail}.`
    };
  }

  // Format international E.164 sans espaces : ex +237670123456 ou +2250712345678
  const telephoneE164 = `+${pays.indicatif}${chiffres}`;

  return {
    valide: true,
    telephoneE164,
    numeroNational: chiffres,
    erreur: null
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
    fabriquerEmailInterne,
    evaluerForceMotDePasse,
    formaterFCFA,
    formaterDateFr,
    calculerJoursRestants,
    echapperHTML
  };
}
