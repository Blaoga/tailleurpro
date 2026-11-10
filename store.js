/**
 * TAILLEUR PRO - MODULE STORE & ACCÈS AUX DONNÉES
 * ===============================================
 * Étape 5 : Gestion centralisée des données (Section 9)
 * - Clients, Mesures, Commandes, Paiements, Dépenses, Profil
 * - Montant dû recalculé en temps réel (prix_total - somme(paiements))
 * - Isolation par user_id avec RLS
 * - Export et import JSON de sauvegarde
 */

const Store = {
  // Cache en mémoire pour affichage instantané
  cache: {
    profil: null,
    clients: [],
    commandes: [],
    paiements: [],
    depenses: []
  },

  /**
   * Initialise et charge toutes les données de l'atelier du tailleur connecté
   */
  async chargerTout() {
    if (!Auth.estConfigure()) {
      throw new Error("Supabase n'est pas configuré.");
    }

    const session = await Auth.obtenirSession();
    if (!session?.user) {
      throw new Error("Session introuvable.");
    }

    const userId = session.user.id;

    try {
      // Chargement en parallèle pour une vitesse maximale
      const [profilRes, clientsRes, commandesRes, paiementsRes, depensesRes] = await Promise.all([
        supabaseClient.from('profils').select('*').eq('id', userId).single(),
        supabaseClient.from('clients').select('*').eq('user_id', userId).order('nom', { ascending: true }),
        supabaseClient.from('commandes').select('*').eq('user_id', userId).order('date_livraison', { ascending: true }),
        supabaseClient.from('paiements').select('*').eq('user_id', userId).order('date', { ascending: false }),
        supabaseClient.from('depenses').select('*').eq('user_id', userId).order('date', { ascending: false })
      ]);

      this.cache.profil = profilRes.data || null;
      this.cache.clients = clientsRes.data || [];
      this.cache.commandes = commandesRes.data || [];
      this.cache.paiements = paiementsRes.data || [];
      this.cache.depenses = depensesRes.data || [];

      return this.cache;
    } catch (e) {
      console.error("[Store] Erreur chargement global :", e);
      throw e;
    }
  },

  /* ==========================================================================
     1. GESTION DU PROFIL
     ========================================================================== */
  async getProfil() {
    if (this.cache.profil) return this.cache.profil;
    const session = await Auth.obtenirSession();
    if (!session?.user) return null;

    const { data, error } = await supabaseClient
      .from('profils')
      .select('*')
      .eq('id', session.user.id)
      .single();

    if (!error && data) {
      this.cache.profil = data;
    }
    return this.cache.profil;
  },

  async updateProfil(modifs) {
    const session = await Auth.obtenirSession();
    if (!session?.user) throw new Error("Non connecté");

    // Filtrer pour n'envoyer que les champs autorisés (protection anti-falsification)
    const payloadAutorise = {};
    const champsPermis = ['prenom', 'telephone', 'pays', 'atelier', 'ville', 'rappel_jours', 'email_recuperation'];
    champsPermis.forEach(champ => {
      if (modifs[champ] !== undefined) {
        payloadAutorise[champ] = modifs[champ];
      }
    });

    const { data, error } = await supabaseClient
      .from('profils')
      .update(payloadAutorise)
      .eq('id', session.user.id)
      .select()
      .single();

    if (error) throw error;
    this.cache.profil = data;
    return data;
  },

  /**
   * Vérifie si le compte est actif (période d'essai de 15 jours en cours ou abonnement valide)
   */
  estCompteActif() {
    const profil = this.cache.profil;
    if (!profil) return false;
    const maintenant = new Date();

    const essaiActif = Boolean(profil.essai_fin && new Date(profil.essai_fin) > maintenant);
    const abonnementActif = Boolean(profil.abonnement_fin && new Date(profil.abonnement_fin) > maintenant);

    return essaiActif || abonnementActif;
  },

  /* ==========================================================================
     2. GESTION DES CLIENTS & MESURES
     ========================================================================== */
  getClients() {
    return this.cache.clients;
  },

  getClientParId(id) {
    return this.cache.clients.find(c => c.id === id) || null;
  },

  async saveClient({ id, nom, telephone, mesures, notes }) {
    if (!this.estCompteActif()) {
      throw new Error("ESSAI_EXPIRE : Votre période d'essai gratuit de 15 jours est terminée. Veuillez vous abonner pour ajouter ou modifier des clients.");
    }

    const session = await Auth.obtenirSession();
    if (!session?.user) throw new Error("Non connecté");

    const payload = {
      user_id: session.user.id,
      nom: nom.trim(),
      telephone: telephone ? telephone.trim() : '',
      mesures: mesures || {},
      notes: notes ? notes.trim() : ''
    };

    if (id) {
      // Mise à jour
      const { data, error } = await supabaseClient
        .from('clients')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      const index = this.cache.clients.findIndex(c => c.id === id);
      if (index !== -1) this.cache.clients[index] = data;
      return data;
    } else {
      // Nouveau client
      const { data, error } = await supabaseClient
        .from('clients')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      this.cache.clients.push(data);
      this.cache.clients.sort((a, b) => a.nom.localeCompare(b.nom));
      return data;
    }
  },

  async deleteClient(id) {
    if (!this.estCompteActif()) {
      throw new Error("ESSAI_EXPIRE : Votre période d'essai gratuit de 15 jours est terminée. Veuillez vous abonner pour supprimer un client.");
    }
    const { error } = await supabaseClient.from('clients').delete().eq('id', id);
    if (error) throw error;

    this.cache.clients = this.cache.clients.filter(c => c.id !== id);
    this.cache.commandes = this.cache.commandes.filter(cmd => cmd.client_id !== id);
  },

  /* ==========================================================================
     3. GESTION DES COMMANDES & STATUTS
     ========================================================================== */
  getCommandes() {
    return this.cache.commandes;
  },

  getCommandeParId(id) {
    return this.cache.commandes.find(c => c.id === id) || null;
  },

  /**
   * Récupère toutes les commandes associées à un client spécifique
   * Triées par date de création ou de livraison décroissante (les plus récentes en premier)
   */
  getCommandesParClientId(clientId) {
    if (!clientId) return [];
    return this.cache.commandes
      .filter(c => c.client_id === clientId)
      .sort((a, b) => new Date(b.cree_le || b.date_livraison) - new Date(a.cree_le || a.date_livraison));
  },

  /**
   * Calcule le total des paiements encaissés pour une commande
   */
  getTotalPayePourCommande(commandeId) {
    return this.cache.paiements
      .filter(p => p.commande_id === commandeId)
      .reduce((sum, p) => sum + (Number(p.montant) || 0), 0);
  },

  /**
   * Section 9 : Montant dû toujours recalculé en direct
   * prix_total - somme(paiements)
   */
  getResteDuPourCommande(commandeId) {
    const cmd = this.getCommandeParId(commandeId);
    if (!cmd) return 0;
    const paye = this.getTotalPayePourCommande(commandeId);
    const reste = Number(cmd.prix_total) - paye;
    return reste > 0 ? reste : 0;
  },

  /**
   * Enregistre une commande avec option d'avance initiale
   */
  async saveCommande({ id, client_id, vetement, tissu, prix_total, date_livraison, statut, photo_url }, avanceInitiale = 0) {
    if (!this.estCompteActif()) {
      throw new Error("ESSAI_EXPIRE : Votre période d'essai gratuit de 15 jours est terminée. Veuillez vous abonner pour créer ou modifier des commandes.");
    }

    const session = await Auth.obtenirSession();
    if (!session?.user) throw new Error("Non connecté");

    const existing = id ? this.getCommandeParId(id) : null;

    const payload = {
      user_id: session.user.id,
      client_id,
      vetement: vetement.trim(),
      tissu: tissu ? tissu.trim() : '',
      prix_total: Number(prix_total) || 0,
      date_livraison,
      statut: statut || (existing ? existing.statut : 'recue'),
      photo_url: photo_url !== undefined ? photo_url : (existing ? existing.photo_url : null)
    };

    let commandeEnregistree = null;

    if (id) {
      const { data, error } = await supabaseClient
        .from('commandes')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      commandeEnregistree = data;
      const index = this.cache.commandes.findIndex(c => c.id === id);
      if (index !== -1) this.cache.commandes[index] = data;
    } else {
      const { data, error } = await supabaseClient
        .from('commandes')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      commandeEnregistree = data;
      this.cache.commandes.push(data);

      // Si une avance a été versée à la commande
      if (Number(avanceInitiale) > 0) {
        await this.savePaiement(commandeEnregistree.id, Number(avanceInitiale));
      }
    }

    this.cache.commandes.sort((a, b) => new Date(a.date_livraison) - new Date(b.date_livraison));
    return commandeEnregistree;
  },

  async updateStatutCommande(id, nouveauStatut) {
    if (!this.estCompteActif()) {
      throw new Error("ESSAI_EXPIRE : Votre période d'essai gratuit de 15 jours est terminée. Veuillez vous abonner pour modifier le statut d'une commande.");
    }

    const { data, error } = await supabaseClient
      .from('commandes')
      .update({ statut: nouveauStatut })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    const index = this.cache.commandes.findIndex(c => c.id === id);
    if (index !== -1) this.cache.commandes[index] = data;
    return data;
  },

  async deleteCommande(id) {
    if (!this.estCompteActif()) {
      throw new Error("ESSAI_EXPIRE : Votre période d'essai gratuit de 15 jours est terminée. Veuillez vous abonner pour supprimer une commande.");
    }
    const { error } = await supabaseClient.from('commandes').delete().eq('id', id);
    if (error) throw error;

    this.cache.commandes = this.cache.commandes.filter(c => c.id !== id);
    this.cache.paiements = this.cache.paiements.filter(p => p.commande_id !== id);
  },

  /* ==========================================================================
     4. GESTION DES PAIEMENTS (AVANCES & SOLDES)
     ========================================================================== */
  getPaiements() {
    return this.cache.paiements;
  },

  async savePaiement(commande_id, montant) {
    if (!this.estCompteActif()) {
      throw new Error("ESSAI_EXPIRE : Votre période d'essai gratuit de 15 jours est terminée. Veuillez vous abonner pour enregistrer des paiements.");
    }

    const session = await Auth.obtenirSession();
    if (!session?.user) throw new Error("Non connecté");

    const payload = {
      user_id: session.user.id,
      commande_id,
      montant: Number(montant) || 0,
      date: new Date().toISOString()
    };

    const { data, error } = await supabaseClient
      .from('paiements')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    this.cache.paiements.unshift(data);
    return data;
  },

  /* ==========================================================================
     5. GESTION DES DÉPENSES
     ========================================================================== */
  getDepenses() {
    return this.cache.depenses;
  },

  async saveDepense({ id, montant, categorie, note, date }) {
    if (!this.estCompteActif()) {
      throw new Error("ESSAI_EXPIRE : Votre période d'essai gratuit de 15 jours est terminée. Veuillez vous abonner pour ajouter des dépenses.");
    }

    const session = await Auth.obtenirSession();
    if (!session?.user) throw new Error("Non connecté");

    const payload = {
      user_id: session.user.id,
      montant: Number(montant) || 0,
      categorie: categorie ? categorie.trim() : 'Autre',
      note: note ? note.trim() : '',
      date: date || new Date().toISOString().split('T')[0]
    };

    if (id) {
      const { data, error } = await supabaseClient
        .from('depenses')
        .update(payload)
        .eq('id', id)
        .eq('user_id', session.user.id)
        .select()
        .single();

      if (error) throw error;
      const index = this.cache.depenses.findIndex(d => d.id === id);
      if (index !== -1) this.cache.depenses[index] = data;
      return data;
    } else {
      const { data, error } = await supabaseClient
        .from('depenses')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      this.cache.depenses.unshift(data);
      return data;
    }
  },

  async deleteDepense(id) {
    if (!this.estCompteActif()) {
      throw new Error("ESSAI_EXPIRE : Votre période d'essai gratuit de 15 jours est terminée. Veuillez vous abonner pour supprimer une dépense.");
    }
    const session = await Auth.obtenirSession();
    if (!session?.user) throw new Error("Non connecté");

    const { error } = await supabaseClient
      .from('depenses')
      .delete()
      .eq('id', id)
      .eq('user_id', session.user.id);

    if (error) throw error;
    this.cache.depenses = this.cache.depenses.filter(d => d.id !== id);
    return true;
  },

  /* ==========================================================================
     6. CALCULS STATISTIQUES (ACCUEIL & FINANCES)
     ========================================================================== */
  getDashboardStats() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // 1. Commandes en cours (toutes sauf livrées)
    const enCours = this.cache.commandes.filter(c => c.statut !== 'livree');

    // 2. À livrer cette semaine (dans les 7 prochains jours)
    const finSemaine = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const aLivrerSemaine = enCours.filter(c => {
      const d = new Date(c.date_livraison);
      return d >= now && d <= finSemaine;
    });

    // 3. Argent total restant à encaisser (avances et dettes sur commandes actives)
    let totalAEncaisser = 0;
    enCours.forEach(c => {
      totalAEncaisser += this.getResteDuPourCommande(c.id);
    });

    // 4. Total encaissé ce mois-ci
    const debutMois = new Date(now.getFullYear(), now.getMonth(), 1);
    const encaisseMois = this.cache.paiements
      .filter(p => new Date(p.date) >= debutMois)
      .reduce((sum, p) => sum + (Number(p.montant) || 0), 0);

    // 5. Total dépenses ce mois-ci et total général
    const depensesMois = this.cache.depenses
      .filter(d => new Date(d.date) >= debutMois)
      .reduce((sum, d) => sum + (Number(d.montant) || 0), 0);
    const totalDepenses = this.cache.depenses
      .reduce((sum, d) => sum + (Number(d.montant) || 0), 0);
    const beneficeNetMois = encaisseMois - depensesMois;

    // 6. Alertes : Retards et Imminents
    const enRetard = enCours.filter(c => new Date(c.date_livraison) < now);
    const demain = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const pourDemain = enCours.filter(c => {
      const d = new Date(c.date_livraison);
      return d.toDateString() === demain.toDateString();
    });

    return {
      commandesEnCoursCount: enCours.length,
      aLivrerSemaineCount: aLivrerSemaine.length,
      totalAEncaisser,
      encaisseMois,
      depensesMois,
      totalDepenses,
      beneficeNetMois,
      commandesEnRetard: enRetard,
      commandesDemain: pourDemain
    };
  },

  /**
   * Calcule la liste de tous les clients avec dettes, triée par montant décroissant
   */
  getListeDettesClients() {
    const dettesMap = {};

    this.cache.commandes
      .filter(c => c.statut !== 'livree')
      .forEach(cmd => {
        const reste = this.getResteDuPourCommande(cmd.id);
        if (reste > 0) {
          if (!dettesMap[cmd.client_id]) {
            const client = this.getClientParId(cmd.client_id);
            dettesMap[cmd.client_id] = {
              client: client || { nom: 'Client inconnu', telephone: '' },
              totalDu: 0,
              commandes: []
            };
          }
          dettesMap[cmd.client_id].totalDu += reste;
          dettesMap[cmd.client_id].commandes.push(cmd);
        }
      });

    return Object.values(dettesMap).sort((a, b) => b.totalDu - a.totalDu);
  },

  /* ==========================================================================
     7. EXPORTATION & IMPORTATION DES DONNÉES (RÉGLAGES)
     ========================================================================== */
  exporterDonneesJSON() {
    const sauvegarde = {
      version: CONFIG.APP_VERSION,
      date_export: new Date().toISOString(),
      profil: this.cache.profil,
      clients: this.cache.clients,
      commandes: this.cache.commandes,
      paiements: this.cache.paiements,
      depenses: this.cache.depenses
    };

    const blob = new Blob([JSON.stringify(sauvegarde, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tailleurpro-sauvegarde-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
};

// Export pour bundler / modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Store };
}
