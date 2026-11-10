/**
 * TAILLEUR PRO - Configuration des Pays au lancement
 * ==================================================
 * Section 2 du cahier des charges :
 * - Cameroun (+237) : 9 chiffres, pas de zéro initial
 * - Côte d'Ivoire (+225) : 10 chiffres (depuis 2021), zéro initial conservé
 * - Congo-Brazzaville (+242) : 9 chiffres, zéro initial conservé
 * 
 * Extensibilité : Pour ajouter un nouveau pays (ex: Gabon, Tchad, Sénégal),
 * il suffit d'ajouter une ligne dans cet objet, sans modifier le reste du code.
 */

const PAYS = {
  CM: {
    code: 'CM',
    nom: 'Cameroun',
    indicatif: '237',
    longueur: 9,
    garderZero: false,
    drapeau: '🇨🇲',
    monnaie: 'FCFA',
    exemple: '6 70 12 34 56'
  },
  CI: {
    code: 'CI',
    nom: "Côte d'Ivoire",
    indicatif: '225',
    longueur: 10,
    garderZero: true,
    drapeau: '🇨🇮',
    monnaie: 'FCFA',
    exemple: '07 12 34 56 78'
  },
  CG: {
    code: 'CG',
    nom: 'Congo-Brazzaville',
    indicatif: '242',
    longueur: 9,
    garderZero: true,
    drapeau: '🇨🇬',
    monnaie: 'FCFA',
    exemple: '06 123 45 67'
  }
};

// Pays par défaut au premier chargement
const PAYS_PAR_DEFAUT = 'CM';

// Clé de stockage pour mémoriser le dernier pays utilisé par le tailleur
const STORAGE_CLE_PAYS = 'tailleurpro_dernier_pays';

/**
 * Récupère le pays actif mémorisé ou le pays par défaut
 */
function obtenirPaysActif() {
  try {
    const codeMem = localStorage.getItem(STORAGE_CLE_PAYS);
    if (codeMem && PAYS[codeMem]) {
      return PAYS[codeMem];
    }
  } catch (e) {
    // localStorage peut être inaccessible en mode navigation privée très restreinte
  }
  return PAYS[PAYS_PAR_DEFAUT];
}

/**
 * Mémorise le pays choisi par l'utilisateur
 */
function memoriserPaysActif(codePays) {
  if (PAYS[codePays]) {
    try {
      localStorage.setItem(STORAGE_CLE_PAYS, codePays);
    } catch (e) {}
  }
}

// Export pour utilisation navigateur ou modules JS
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PAYS, PAYS_PAR_DEFAUT, obtenirPaysActif, memoriserPaysActif };
}
