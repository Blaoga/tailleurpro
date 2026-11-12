/**
 * TAILLEUR PRO - Configuration des 15 Pays Afrique Centrale & Francophone (SasPay)
 * =================================================================================
 * Liste alignée avec les pays actifs de l'API SasPay (/api/v1/countries/) :
 * CM, CG, CD, GA, CF, RW, BI, CI, SN, BJ, TG, BF, ML, NE, GN
 */

const PAYS = {
  CM: {
    code: 'CM',
    nom: 'Cameroun',
    nomEn: 'Cameroon',
    indicatif: '237',
    longueur: 9,
    longueursAcceptees: [9],
    garderZero: false,
    drapeau: '🇨🇲',
    monnaie: 'FCFA',
    devise: 'XAF',
    exemple: '6 70 12 34 56'
  },
  CG: {
    code: 'CG',
    nom: 'Congo-Brazzaville',
    nomEn: 'Congo-Brazzaville',
    indicatif: '242',
    longueur: 9,
    longueursAcceptees: [9],
    garderZero: true,
    drapeau: '🇨🇬',
    monnaie: 'FCFA',
    devise: 'XAF',
    exemple: '06 123 45 67'
  },
  CD: {
    code: 'CD',
    nom: 'RD Congo',
    nomEn: 'DR Congo',
    indicatif: '243',
    longueur: 9,
    longueursAcceptees: [9],
    garderZero: false,
    drapeau: '🇨🇩',
    monnaie: 'CDF',
    devise: 'CDF',
    exemple: '81 234 56 78'
  },
  GA: {
    code: 'GA',
    nom: 'Gabon',
    nomEn: 'Gabon',
    indicatif: '241',
    longueur: 8,
    longueursAcceptees: [7, 8, 9],
    garderZero: true,
    drapeau: '🇬🇦',
    monnaie: 'FCFA',
    devise: 'XAF',
    exemple: '06 12 34 56'
  },
  CF: {
    code: 'CF',
    nom: 'Centrafrique',
    nomEn: 'Central African Rep.',
    indicatif: '236',
    longueur: 8,
    longueursAcceptees: [8],
    garderZero: false,
    drapeau: '🇨🇫',
    monnaie: 'FCFA',
    devise: 'XAF',
    exemple: '70 12 34 56'
  },
  RW: {
    code: 'RW',
    nom: 'Rwanda',
    nomEn: 'Rwanda',
    indicatif: '250',
    longueur: 9,
    longueursAcceptees: [9],
    garderZero: false,
    drapeau: '🇷🇼',
    monnaie: 'RWF',
    devise: 'RWF',
    exemple: '78 123 45 67'
  },
  BI: {
    code: 'BI',
    nom: 'Burundi',
    nomEn: 'Burundi',
    indicatif: '257',
    longueur: 8,
    longueursAcceptees: [8],
    garderZero: false,
    drapeau: '🇧🇮',
    monnaie: 'BIF',
    devise: 'BIF',
    exemple: '79 12 34 56'
  },
  CI: {
    code: 'CI',
    nom: "Côte d'Ivoire",
    nomEn: 'Ivory Coast',
    indicatif: '225',
    longueur: 10,
    longueursAcceptees: [10],
    garderZero: true,
    drapeau: '🇨🇮',
    monnaie: 'FCFA',
    devise: 'XOF',
    exemple: '07 12 34 56 78'
  },
  SN: {
    code: 'SN',
    nom: 'Sénégal',
    nomEn: 'Senegal',
    indicatif: '221',
    longueur: 9,
    longueursAcceptees: [9],
    garderZero: false,
    drapeau: '🇸🇳',
    monnaie: 'FCFA',
    devise: 'XOF',
    exemple: '77 123 45 67'
  },
  BJ: {
    code: 'BJ',
    nom: 'Bénin',
    nomEn: 'Benin',
    indicatif: '229',
    longueur: 10,
    longueursAcceptees: [8, 10],
    garderZero: true,
    drapeau: '🇧🇯',
    monnaie: 'FCFA',
    devise: 'XOF',
    exemple: '01 97 12 34 56'
  },
  TG: {
    code: 'TG',
    nom: 'Togo',
    nomEn: 'Togo',
    indicatif: '228',
    longueur: 8,
    longueursAcceptees: [8],
    garderZero: false,
    drapeau: '🇹🇬',
    monnaie: 'FCFA',
    devise: 'XOF',
    exemple: '90 12 34 56'
  },
  BF: {
    code: 'BF',
    nom: 'Burkina Faso',
    nomEn: 'Burkina Faso',
    indicatif: '226',
    longueur: 8,
    longueursAcceptees: [8],
    garderZero: false,
    drapeau: '🇧🇫',
    monnaie: 'FCFA',
    devise: 'XOF',
    exemple: '70 12 34 56'
  },
  ML: {
    code: 'ML',
    nom: 'Mali',
    nomEn: 'Mali',
    indicatif: '223',
    longueur: 8,
    longueursAcceptees: [8],
    garderZero: false,
    drapeau: '🇲🇱',
    monnaie: 'FCFA',
    devise: 'XOF',
    exemple: '70 12 34 56'
  },
  NE: {
    code: 'NE',
    nom: 'Niger',
    nomEn: 'Niger',
    indicatif: '227',
    longueur: 8,
    longueursAcceptees: [8],
    garderZero: false,
    drapeau: '🇳🇪',
    monnaie: 'FCFA',
    devise: 'XOF',
    exemple: '90 12 34 56'
  },
  GN: {
    code: 'GN',
    nom: 'Guinée',
    nomEn: 'Guinea',
    indicatif: '224',
    longueur: 9,
    longueursAcceptees: [9],
    garderZero: false,
    drapeau: '🇬🇳',
    monnaie: 'GNF',
    devise: 'GNF',
    exemple: '620 12 34 56'
  }
};

const PAYS_PAR_DEFAUT = 'CM';
const STORAGE_CLE_PAYS = 'tailleurpro_dernier_pays';

/**
 * Retourne le nom localisé (FR ou EN) d'un pays.
 */
function obtenirNomPays(paysObj, lang) {
  if (!paysObj) return '';
  const l = lang || (typeof Lang !== 'undefined' ? Lang.get() : 'fr');
  return l === 'en' && paysObj.nomEn ? paysObj.nomEn : paysObj.nom;
}

/**
 * Récupère le pays actif mémorisé ou le pays par défaut.
 */
function obtenirPaysActif() {
  try {
    const codeMem = localStorage.getItem(STORAGE_CLE_PAYS);
    if (codeMem && PAYS[codeMem]) {
      return PAYS[codeMem];
    }
  } catch (e) {}
  return PAYS[PAYS_PAR_DEFAUT];
}

/**
 * Mémorise le pays choisi par l'utilisateur.
 */
function memoriserPaysActif(codePays) {
  if (PAYS[codePays]) {
    try {
      localStorage.setItem(STORAGE_CLE_PAYS, codePays);
    } catch (e) {}
  }
}

/**
 * Détecte automatiquement un pays parmi les 15 à partir d'un numéro saisi
 * avec indicatif (+237..., 00241..., 242...).
 */
function detecterPaysDepuisNumero(saisie) {
  if (!saisie) return null;
  const texte = String(saisie).trim();
  const aPrefixeIntl = texte.startsWith('+') || texte.startsWith('00');
  const chiffres = texte.replace(/\D/g, '');
  if (!chiffres) return null;

  const sans00 = chiffres.startsWith('00') ? chiffres.substring(2) : chiffres;
  const paysListe = Object.values(PAYS);

  for (const p of paysListe) {
    if (sans00.startsWith(p.indicatif)) {
      const reste = sans00.substring(p.indicatif.length);
      if ((aPrefixeIntl && reste.length >= 2) || (!aPrefixeIntl && reste.length >= 8)) {
        return { codePays: p.code, pays: p, numeroNational: reste };
      }
    }
  }
  return null;
}

/**
 * Remplit proprement un <select> avec la liste complète des 15 pays.
 */
function remplirSelectPays(selectEl, formatOption = 'full', valeurActive = null) {
  if (!selectEl) return;
  const lang = typeof Lang !== 'undefined' ? Lang.get() : 'fr';
  const cible = valeurActive && PAYS[valeurActive] ? valeurActive : (selectEl.value && PAYS[selectEl.value] ? selectEl.value : obtenirPaysActif().code);

  selectEl.innerHTML = Object.values(PAYS).map(p => {
    const nom = obtenirNomPays(p, lang);
    const label = formatOption === 'compact'
      ? `${p.drapeau} +${p.indicatif} · ${nom}`
      : `${p.drapeau} ${nom} (+${p.indicatif})`;
    return `<option value="${p.code}">${label}</option>`;
  }).join('');

  selectEl.value = cible;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PAYS,
    PAYS_PAR_DEFAUT,
    obtenirPaysActif,
    memoriserPaysActif,
    obtenirNomPays,
    detecterPaysDepuisNumero,
    remplirSelectPays
  };
}
