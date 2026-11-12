/**
 * TAILLEUR PRO - ORCHESTRATEUR DU DASHBOARD (APP.JS)
 * ==================================================
 * Étape 5 : Contrôleur complet pour app.html
 * - Gestion des 5 onglets (Accueil, Clients, Commandes, Finances, Réglages)
 * - Rendu dynamique ultra-rapide depuis Store.cache
 * - Alertes de livraisons et rappels
 * - Modales d'ajout et fiches détaillées
 * - Messages WhatsApp préremplis (prêt, relance dette)
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Protection de la route obligatoire (Section 7.7)
  const session = await Auth.protegerRoute();
  if (!session) return;

  // 2. Initialisation globale de l'application
  App.init(session);
});

const App = {
  session: null,
  activeTab: 'accueil',
  activeOrderFilter: 'toutes',
  activeClientSearch: '',
  activeNotifFilter: 'toutes',
  _notifsCourantes: [],

  async init(session) {
    this.session = session;
    this.bindGlobalEvents();

    try {
      // Chargement initial des données
      await Store.chargerTout();
      this.actualiserEntete();
      this.gererBienvenue();
      this.afficherOnglet('accueil');
    } catch (err) {
      console.error("[App] Erreur init :", err);
      this.showToast("Erreur de chargement des données.");
    }
  },

  /**
   * Liaison des événements globaux (Navigation, FAB, etc.)
   */
  bindGlobalEvents() {
    // Thème sombre bleu nuit unique (aligné sur le landing page)
    document.body.classList.remove('theme-light');
    try {
      localStorage.removeItem('tailleurpro_theme');
    } catch (_) {
      // Stockage local indisponible
    }

    // Onglets de navigation basse
    document.querySelectorAll('.nav-tab-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        this.afficherOnglet(tab);
      });
    });

    // Recherche client (enregistrée une seule fois)
    document.getElementById('clientSearchInput')?.addEventListener('input', (e) => {
      this.activeClientSearch = e.target.value.toLowerCase().trim();
      this.renderClients();
    });

    // Détection automatique de l'indicatif pays sur le téléphone client
    document.getElementById('clientTelInput')?.addEventListener('input', (e) => {
      if (typeof detecterPaysDepuisNumero !== 'function') return;
      const detecte = detecterPaysDepuisNumero(e.target.value);
      const sel = document.getElementById('clientPaysTelSelect');
      if (detecte && sel && sel.value !== detecte.code) {
        sel.value = detecte.code;
        this.mettreAJourPlaceholderTelClient();
      }
    });

    document.getElementById('clientPaysTelSelect')?.addEventListener('change', () => {
      this.mettreAJourPlaceholderTelClient();
    });

    // Langue FR / EN
    if (window.Lang) Lang.init();
    window.addEventListener('tailleurpro:langchange', () => {
      this.actualiserEntete();
      this.renderAccueil();
      this.renderClients();
      this.renderCommandes();
      this.renderFinances();
      this.renderReglages();
      this.mettreAJourPlaceholderTelClient();
    });

    // FAB Action Sheet
    const fab = document.getElementById('fabQuickActionBtn');
    const sheetOverlay = document.getElementById('actionSheetOverlay');
    fab?.addEventListener('click', () => sheetOverlay?.classList.add('active'));
    sheetOverlay?.addEventListener('click', (e) => {
      if (e.target === sheetOverlay) sheetOverlay.classList.remove('active');
    });

    // Déconnexion (dans le tiroir paramètres)
    document.getElementById('btnDeconnexion')?.addEventListener('click', () => {
      this.deconnecterAtelier();
    });

    // Fermeture du tiroir paramètres 3 traits sur clic arrière-plan
    const settingsDrawer = document.getElementById('drawerParametresMenu');
    settingsDrawer?.addEventListener('click', (e) => {
      if (e.target === settingsDrawer) this.fermerMenuParametres();
    });

    // Fermeture des modales sur clic arrière-plan ou bouton croix
    document.querySelectorAll('.app-modal-overlay').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.classList.contains('app-modal-close-btn')) {
          modal.classList.remove('active');
        }
      });
    });

    // Touche Échap pour fermer les tiroirs et modales actifs
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      sheetOverlay?.classList.remove('active');
      this.fermerMenuParametres();
      this.fermerNotifications();
      document.querySelectorAll('.app-modal-overlay.active').forEach(m => m.classList.remove('active'));
    });
  },

  /**
   * Bascule entre les 5 onglets
   */
  afficherOnglet(tabNom) {
    this.activeTab = tabNom;

    // Mise à jour de la barre du bas
    document.querySelectorAll('.nav-tab-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabNom);
    });

    // Affichage de la bonne section
    document.querySelectorAll('.app-tab-section').forEach(sec => {
      sec.classList.remove('active');
    });
    const sectionCible = document.getElementById(`tabSection_${tabNom}`);
    if (sectionCible) sectionCible.classList.add('active');

    // Rendu spécifique à chaque onglet
    if (tabNom === 'accueil') this.renderAccueil();
    if (tabNom === 'clients') this.renderClients();
    if (tabNom === 'commandes') this.renderCommandes();
    if (tabNom === 'finances') this.renderFinances();
    if (tabNom === 'reglages') {
      this.fermerPageReglage();
      this.renderReglages();
    }
    this.mettreAJourBadgeNotifications();
  },

  async deconnecterAtelier() {
    this.fermerMenuParametres();
    if (confirm("Voulez-vous vous déconnecter de Tailleur Pro ?")) {
      await Auth.deconnecter();
    }
  },

  formaterNomAtelierAffichage(profil, prenomOverride = '') {
    const prenom = (prenomOverride || profil?.prenom || this.session?.user?.user_metadata?.prenom || 'Tailleur').trim();
    const brut = profil?.atelier ? String(profil.atelier).trim() : '';
    if (!brut || brut.toLowerCase() === 'mon atelier') {
      return `Atelier de ${prenom}`;
    }
    return brut;
  },

  formaterStatutCommande(statut) {
    const statutsMap = {
      'recue': 'Reçue',
      'coupee': 'Coupée',
      'en_couture': 'En couture',
      'prete': 'Prête',
      'livree': 'Livrée'
    };
    return statutsMap[statut] || (statut ? statut.replace('_', ' ') : '');
  },

  /**
   * En-tête et salutation utilisateur
   */
  actualiserEntete() {
    const profil = Store.cache.profil;
    const prenom = profil?.prenom || this.session?.user?.user_metadata?.prenom || 'Tailleur';
    const atelier = this.formaterNomAtelierAffichage(profil, prenom);

    const nameEl = document.getElementById('userNameDisplay');
    const atelierEl = document.getElementById('userAtelierDisplay');
    const avatarEl = document.getElementById('userAvatarInitials');

    if (nameEl) nameEl.textContent = `Bonjour, ${prenom}`;
    if (atelierEl) atelierEl.textContent = atelier;
    if (avatarEl) {
      const initiales = prenom.substring(0, 2).toUpperCase();
      const span = avatarEl.querySelector('span');
      if (span) span.textContent = initiales;
    }

    this.synchroniserMenuParametres();
  },

  /**
   * Notification discrète d'inscription réussie sur le Dashboard
   */
  gererBienvenue() {
    const estNouveau = sessionStorage.getItem('tailleurpro_bienvenue_nouveau') === 'true';
    const banner = document.getElementById('welcomeSuccessBanner');

    if (estNouveau && banner) {
      banner.style.display = 'flex';
      this.showToast("Inscription réussie ! Bienvenue dans votre atelier.");
    }
  },

  fermerBanniereBienvenue() {
    const banner = document.getElementById('welcomeSuccessBanner');
    if (banner) {
      banner.style.opacity = '0';
      banner.style.transform = 'translateY(-8px)';
      setTimeout(() => {
        banner.style.display = 'none';
        sessionStorage.removeItem('tailleurpro_bienvenue_nouveau');
      }, 250);
    }
  },

  /* ==========================================================================
     1. RENDU DE L'ACCUEIL & GESTION DU STATUT D'ESSAI / ABONNEMENT (Section 8.1)
     ========================================================================== */
  renderAccueil() {
    const stats = Store.getDashboardStats();
    const profil = Store.cache.profil;

    // 1. Masquer les bannières d'abonnement sur l'Accueil (n'afficher la capsule que si l'essai est expiré)
    const trialDaysText = document.getElementById('trialDaysText');
    const trialBanner = document.getElementById('trialBanner');
    const trialCtaBtn = trialBanner ? trialBanner.querySelector('.trial-cta-btn') : null;
    const trialSubText = trialBanner ? trialBanner.querySelector('.trial-sub-text') : null;

    if (profil && trialBanner) {
      const maintenant = new Date();
      const essaiFin = profil.essai_fin ? new Date(profil.essai_fin) : null;
      const abonnementFin = profil.abonnement_fin ? new Date(profil.abonnement_fin) : null;

      const aAbonnementActif = Boolean(abonnementFin && abonnementFin > maintenant);
      const aEssaiActif = Boolean(essaiFin && essaiFin > maintenant);

      if (aAbonnementActif || aEssaiActif) {
        trialBanner.style.display = 'none';
        trialBanner.classList.remove('warning', 'expired', 'pro-active');
      } else {
        trialBanner.style.display = '';
        if (trialDaysText) trialDaysText.textContent = "Période d'essai terminée (15 jours expirés)";
        if (trialSubText) trialSubText.textContent = "Activez votre abonnement depuis les réglages pour continuer";
        if (trialCtaBtn) trialCtaBtn.textContent = "Activer →";
        trialBanner.classList.remove('pro-active');
        trialBanner.classList.add('warning', 'expired');
      }
    }

    // 2. Bandeau d'alerte livraisons (Retards ou Demain) + mise à jour du badge cloche
    this.mettreAJourBadgeNotifications();

    const alertBox = document.getElementById('homeAlertBannerBox');
    if (alertBox) {
      if (stats.commandesEnRetard.length > 0) {
        alertBox.innerHTML = `
          <div class="alert-glow-card danger" onclick="App.filtrerCommandes('en_retard')">
            <span class="alert-glow-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </span>
            <div class="alert-glow-text"><strong>${stats.commandesEnRetard.length} commande(s) en retard</strong> <span>Voir &rarr;</span></div>
          </div>
        `;
      } else if (stats.commandesDemain.length > 0) {
        const premiere = stats.commandesDemain[0];
        const client = Store.getClientParId(premiere.client_id);
        const nomClient = client ? client.nom : 'Client';
        alertBox.innerHTML = `
          <div class="alert-glow-card warning" onclick="App.ouvrirDetailCommande('${premiere.id}')">
            <span class="alert-glow-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </span>
            <div class="alert-glow-text"><strong>Livraison demain :</strong> ${echapperHTML(premiere.vetement)} &middot; ${echapperHTML(nomClient)}</div>
          </div>
        `;
      } else {
        alertBox.innerHTML = '';
      }
    }

    // 3. Les 4 cartes de statistiques (2x2)
    const elEnCours = document.getElementById('statEnCours');
    const elSemaine = document.getElementById('statSemaine');
    const elAEncaisser = document.getElementById('statAEncaisser');
    const elMois = document.getElementById('statMois');

    if (elEnCours) elEnCours.textContent = stats.commandesEnCoursCount;
    if (elSemaine) elSemaine.textContent = stats.aLivrerSemaineCount;
    if (elAEncaisser) elAEncaisser.textContent = formaterFCFA(stats.totalAEncaisser);
    if (elMois) elMois.textContent = formaterFCFA(stats.encaisseMois);

    // 4. Activité récente (dernières commandes créées)
    const recentList = document.getElementById('homeRecentActivityList');
    if (recentList) {
      const recentes = Store.cache.commandes.slice(0, 4);
      if (recentes.length === 0) {
        recentList.innerHTML = `
          <div class="home-empty-card">
            <div class="home-empty-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
            </div>
            <p class="home-empty-text">Aucune commande enregistrée pour l'instant.</p>
            <button type="button" class="btn btn-outline-violet home-empty-btn" onclick="App.ouvrirModalNouvelleCommande()">+ Créer une commande</button>
          </div>
        `;
      } else {
        recentList.innerHTML = recentes.map(cmd => {
          const client = Store.getClientParId(cmd.client_id);
          const nomClient = client ? client.nom : 'Client';
          const statutLabel = this.formaterStatutCommande(cmd.statut);
          return `
            <div class="order-card-item order-card-item--compact" onclick="App.ouvrirDetailCommande('${cmd.id}')">
              <div class="order-card-top">
                <div class="order-card-identity">
                  <div class="order-card-client-name">${echapperHTML(nomClient)}</div>
                  <div class="order-card-garment">${echapperHTML(cmd.vetement)}</div>
                </div>
                <span class="status-pill-badge ${cmd.statut}">${echapperHTML(statutLabel)}</span>
              </div>
            </div>
          `;
        }).join('');
      }
    }
  },

  /* ==========================================================================
     CENTRE DE NOTIFICATIONS & MENU PARAMÈTRES « TROIS TRAITS »
     ========================================================================== */
  ecartJoursCalendaires(dateStr) {
    if (!dateStr) return null;
    const match = /^\d{4}-\d{2}-\d{2}/.exec(String(dateStr));
    const aujourdHui = new Date();
    aujourdHui.setHours(0, 0, 0, 0);

    let cible;
    if (match) {
      const [y, m, d] = match[0].split('-').map(Number);
      cible = new Date(y, m - 1, d);
    } else {
      cible = new Date(dateStr);
      if (isNaN(cible.getTime())) return null;
      cible.setHours(0, 0, 0, 0);
    }
    return Math.round((cible.getTime() - aujourdHui.getTime()) / (1000 * 60 * 60 * 24));
  },

  getNotificationsLues() {
    try {
      const brut = localStorage.getItem('tailleurpro_notifs_lues');
      const liste = brut ? JSON.parse(brut) : [];
      return Array.isArray(liste) ? liste : [];
    } catch (_) {
      return [];
    }
  },

  enregistrerNotificationsLues(ids) {
    try {
      const uniques = Array.from(new Set(ids)).slice(-120);
      localStorage.setItem('tailleurpro_notifs_lues', JSON.stringify(uniques));
    } catch (_) {
      // Stockage local indisponible
    }
  },

  construireNotifications() {
    const notifications = [];
    const profil = Store.cache.profil;
    const rappelJours = Number(profil?.rappel_jours) || 2;
    const commandes = Array.isArray(Store.cache.commandes) ? Store.cache.commandes : [];
    const lues = new Set(this.getNotificationsLues());

    // 1. Alertes de retard ou échéances dans la fenêtre de rappel configurée
    commandes.forEach(cmd => {
      if (cmd.statut === 'livree') return;
      const client = Store.getClientParId(cmd.client_id);
      const nomClient = client ? client.nom : 'Client';
      const ecart = this.ecartJoursCalendaires(cmd.date_livraison);

      if (ecart !== null && ecart < 0) {
        const retard = Math.abs(ecart);
        const id = `late-${cmd.id}-${cmd.date_livraison || ''}`;
        notifications.push({
          id,
          type: 'urgent',
          categorie: 'urgentes',
          tag: `Retard ${retard} j`,
          titre: `Livraison en retard · ${nomClient}`,
          message: `${cmd.vetement} était prévue le ${formaterDateFr(cmd.date_livraison)}.`,
          meta: `Statut : ${this.formaterStatutCommande(cmd.statut)}`,
          priorite: 1,
          lue: lues.has(id),
          actionType: 'commande',
          cibleId: cmd.id
        });
      } else if (ecart !== null && ecart <= rappelJours) {
        const tag = ecart === 0 ? "Aujourd'hui" : ecart === 1 ? 'Demain' : `Dans ${ecart} j`;
        const id = `due-${cmd.id}-${cmd.date_livraison || ''}`;
        notifications.push({
          id,
          type: 'warning',
          categorie: 'urgentes',
          tag,
          titre: `Échéance proche · ${nomClient}`,
          message: `${cmd.vetement} à livrer ${ecart === 0 ? "aujourd'hui" : ecart === 1 ? 'demain' : `dans ${ecart} jours`} (${formaterDateFr(cmd.date_livraison)}).`,
          meta: `Rappel J-${rappelJours} actif`,
          priorite: 2,
          lue: lues.has(id),
          actionType: 'commande',
          cibleId: cmd.id
        });
      }

      // 2. Commandes terminées prêtes à être remises
      if (cmd.statut === 'prete') {
        const reste = Store.getResteDuPourCommande(cmd.id);
        const id = `ready-${cmd.id}`;
        notifications.push({
          id,
          type: 'info',
          categorie: 'atelier',
          tag: 'Prête',
          titre: `Prête à livrer · ${nomClient}`,
          message: `${cmd.vetement} terminée${reste > 0 ? ` · Solde restant : ${formaterFCFA(reste)}` : ' · Intégralement soldée'}.`,
          meta: 'Appuyez pour ouvrir la fiche commande',
          priorite: 3,
          lue: lues.has(id),
          actionType: 'commande',
          cibleId: cmd.id
        });
      }

      // 3. Soldes clients restants à encaisser
      const reste = Store.getResteDuPourCommande(cmd.id);
      if (reste > 0) {
        const id = `debt-${cmd.id}-${reste}`;
        notifications.push({
          id,
          type: 'payment',
          categorie: 'paiements',
          tag: 'À encaisser',
          titre: `Reste dû · ${nomClient}`,
          message: `${formaterFCFA(reste)} en attente sur « ${cmd.vetement} ».`,
          meta: 'Enregistrer un versement',
          priorite: 4,
          lue: lues.has(id),
          actionType: 'commande',
          cibleId: cmd.id
        });
      }
    });

    // 4. Alerte essai gratuit expiré ou proche de la fin
    if (profil) {
      const maintenant = new Date();
      const abonnementFin = profil.abonnement_fin ? new Date(profil.abonnement_fin) : null;
      const essaiFin = profil.essai_fin ? new Date(profil.essai_fin) : null;
      const aAbonnementActif = Boolean(abonnementFin && abonnementFin > maintenant);

      if (!aAbonnementActif) {
        const joursEssai = essaiFin ? calculerJoursRestants(profil.essai_fin) : 0;
        if (joursEssai !== null && joursEssai <= 0) {
          const id = 'trial-expired';
          notifications.push({
            id,
            type: 'account',
            categorie: 'urgentes',
            tag: 'Essai expiré',
            titre: "Période d'essai terminée",
            message: "Activez votre abonnement pour continuer à enregistrer de nouveaux clients et commandes.",
            meta: 'Formules dès 2 600 FCFA / mois',
            priorite: 1,
            lue: lues.has(id),
            actionType: 'abonnement',
            cibleId: null
          });
        } else if (joursEssai !== null && joursEssai <= 3) {
          const id = `trial-soon-${joursEssai}`;
          notifications.push({
            id,
            type: 'account',
            categorie: 'urgentes',
            tag: `${joursEssai} j restants`,
            titre: 'Essai gratuit bientôt terminé',
            message: `Il reste ${joursEssai} jour${joursEssai > 1 ? 's' : ''} sur votre essai offert. Passez Pro pour éviter toute interruption.`,
            meta: 'Accès abonnement',
            priorite: 2,
            lue: lues.has(id),
            actionType: 'abonnement',
            cibleId: null
          });
        }
      }
    }

    notifications.sort((a, b) => (Number(a.lue) - Number(b.lue)) || (a.priorite - b.priorite));
    this._notifsCourantes = notifications;
    return notifications;
  },

  mettreAJourBadgeNotifications() {
    const notifications = this.construireNotifications();
    const nonLues = notifications.filter(n => !n.lue);
    const dot = document.getElementById('headerAlertDot');
    const drawerBadge = document.getElementById('drawerNotifBadge');
    const modalBadge = document.getElementById('notifUnreadBadge');

    if (dot) {
      dot.style.display = nonLues.length > 0 ? 'block' : 'none';
    }
    if (drawerBadge) {
      drawerBadge.textContent = String(nonLues.length);
      drawerBadge.classList.toggle('is-zero', nonLues.length === 0);
    }
    if (modalBadge) {
      modalBadge.textContent = String(nonLues.length);
      modalBadge.classList.toggle('is-zero', nonLues.length === 0);
    }
  },

  getNotificationIconSvg(type) {
    const icons = {
      urgent: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      payment: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>',
      account: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>'
    };
    return icons[type] || icons.info;
  },

  ouvrirNotifications() {
    this.fermerMenuParametres();
    this.renderNotifications();
    document.getElementById('modalNotifications')?.classList.add('active');
  },

  fermerNotifications() {
    document.getElementById('modalNotifications')?.classList.remove('active');
  },

  filtrerNotifications(filtre) {
    this.activeNotifFilter = filtre;
    document.querySelectorAll('#notifFilterTabs .notif-filter-pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.notifFilter === filtre);
    });
    this.renderNotifications();
  },

  renderNotifications() {
    this.mettreAJourBadgeNotifications();
    const container = document.getElementById('notificationsListContainer');
    const markAllBtn = document.getElementById('btnMarkAllNotifsRead');
    if (!container) return;

    const toutes = this._notifsCourantes;
    const nonLuesCount = toutes.filter(n => !n.lue).length;
    if (markAllBtn) {
      markAllBtn.disabled = nonLuesCount === 0;
    }

    const filtrees = this.activeNotifFilter === 'toutes'
      ? toutes
      : toutes.filter(n => n.categorie === this.activeNotifFilter);

    if (filtrees.length === 0) {
      container.innerHTML = `
        <div class="notif-empty-state">
          <div class="notif-empty-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </div>
          <strong>Aucune notification</strong>
          <p>${this.activeNotifFilter === 'toutes' ? 'Toutes vos livraisons et suivis sont à jour.' : 'Aucune alerte dans cette catégorie.'}</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtrees.map(item => {
      const idx = toutes.indexOf(item);
      return `
        <button type="button" class="notif-card-item ${item.lue ? '' : 'unread'}" onclick="App.executerNotification(${idx})">
          <div class="notif-icon-box ${item.type}" aria-hidden="true">
            ${this.getNotificationIconSvg(item.type)}
          </div>
          <div class="notif-card-body">
            <div class="notif-card-top">
              <div class="notif-card-title">${!item.lue ? '<span class="notif-unread-dot" aria-hidden="true"></span>' : ''}${echapperHTML(item.titre)}</div>
              <span class="notif-severity-tag ${item.type}">${echapperHTML(item.tag)}</span>
            </div>
            <div class="notif-card-msg">${echapperHTML(item.message)}</div>
            <div class="notif-card-meta">
              <span>${echapperHTML(item.meta)}</span>
              <span>Ouvrir &rarr;</span>
            </div>
          </div>
        </button>
      `;
    }).join('');
  },

  executerNotification(idx) {
    const item = this._notifsCourantes[idx];
    if (!item) return;

    const lues = this.getNotificationsLues();
    if (!lues.includes(item.id)) {
      lues.push(item.id);
      this.enregistrerNotificationsLues(lues);
    }

    this.fermerNotifications();
    this.mettreAJourBadgeNotifications();

    if (item.actionType === 'commande' && item.cibleId) {
      this.ouvrirDetailCommande(item.cibleId);
    } else if (item.actionType === 'abonnement') {
      window.location.href = 'abonnement.html';
    }
  },

  toutMarquerNotificationsLues() {
    if (!this._notifsCourantes.length) return;
    const lues = this.getNotificationsLues();
    this._notifsCourantes.forEach(n => lues.push(n.id));
    this.enregistrerNotificationsLues(lues);
    this.renderNotifications();
    this.showToast("Toutes les notifications sont marquées comme lues.");
  },

  ouvrirMenuParametres() {
    this.fermerNotifications();
    this.synchroniserMenuParametres();
    this.mettreAJourBadgeNotifications();
    document.getElementById('drawerParametresMenu')?.classList.add('active');
  },

  fermerMenuParametres() {
    document.getElementById('drawerParametresMenu')?.classList.remove('active');
  },

  synchroniserMenuParametres() {
    const profil = Store.cache.profil;
    const prenom = profil?.prenom || this.session?.user?.user_metadata?.prenom || 'Tailleur';
    const atelier = this.formaterNomAtelierAffichage(profil, prenom);
    const ville = profil?.ville ? ` · ${profil.ville}` : '';

    const avatarEl = document.getElementById('drawerAvatarInitials');
    const nameEl = document.getElementById('drawerAtelierNom');
    const metaEl = document.getElementById('drawerAtelierMeta');
    const planEl = document.getElementById('drawerPlanBadge');
    const rappelEl = document.getElementById('drawerRappelJours');

    if (avatarEl) avatarEl.textContent = prenom.substring(0, 2).toUpperCase();
    if (nameEl) nameEl.textContent = atelier;
    if (metaEl) metaEl.textContent = `${prenom}${ville}`;
    if (rappelEl) rappelEl.value = String(Number(profil?.rappel_jours) || 2);

    if (planEl && profil) {
      const maintenant = new Date();
      const abonnementFin = profil.abonnement_fin ? new Date(profil.abonnement_fin) : null;
      const essaiFin = profil.essai_fin ? new Date(profil.essai_fin) : null;
      if (abonnementFin && abonnementFin > maintenant) {
        planEl.textContent = 'Abonnement Pro actif';
      } else if (essaiFin && essaiFin > maintenant) {
        const j = calculerJoursRestants(profil.essai_fin);
        planEl.textContent = `Essai gratuit (${j} j restant${j > 1 ? 's' : ''})`;
      } else {
        planEl.textContent = 'Essai expiré · Activer';
      }
    }
  },

  async changerRappelRapide(jours) {
    const valeur = Number(jours) || 2;
    const reglageSelect = document.getElementById('reglageRappelJours');
    if (reglageSelect) reglageSelect.value = String(valeur);

    try {
      await Store.updateProfil({ rappel_jours: valeur });
      this.renderAccueil();
      this.showToast(`Rappel réglé à ${valeur} jour${valeur > 1 ? 's' : ''} avant livraison.`);
    } catch (err) {
      this.showToast("Erreur lors de la mise à jour du rappel.");
      console.error('[App] changerRappelRapide :', err);
    }
  },

  /**
   * Alerte élégante bloquant les actions d'écriture après expiration de l'essai
   */
  afficherModalEssaiExpire(actionNom = "effectuer cette action") {
    // Fermer les autres fenêtres d'action rapide pour éviter tout conflit visuel
    document.getElementById('actionSheetOverlay')?.classList.remove('active');
    document.getElementById('modalNouveauClient')?.classList.remove('active');
    document.getElementById('modalNouvelleCommande')?.classList.remove('active');
    document.getElementById('modalAjoutPaiement')?.classList.remove('active');
    document.getElementById('modalNouvelleDepense')?.classList.remove('active');

    const modal = document.getElementById('modalEssaiExpire');
    const msg = document.getElementById('msgModalEssaiExpire');
    if (msg) {
      msg.innerHTML = `Votre période d'essai gratuit de 15 jours est arrivée à expiration.<br><br>Pour continuer à <strong>${echapperHTML(actionNom)}</strong> et profiter de toutes les fonctionnalités de Tailleur Pro, veuillez activer votre formule d'abonnement.`;
    }
    modal?.classList.add('active');
  },

  /* ==========================================================================
     2. RENDU DES CLIENTS & MESURES (Section 8.2)
     ========================================================================== */
  renderClients() {
    const listEl = document.getElementById('clientsListContainer');
    const countBadge = document.getElementById('clientsCountBadge');
    if (!listEl) return;

    const tousClients = Store.getClients();
    if (countBadge) countBadge.textContent = String(tousClients.length);

    let clients = tousClients;
    if (this.activeClientSearch) {
      clients = tousClients.filter(c =>
        c.nom.toLowerCase().includes(this.activeClientSearch) ||
        (c.telephone || '').toLowerCase().includes(this.activeClientSearch)
      );
    }

    if (clients.length === 0) {
      listEl.innerHTML = `
        <div class="home-empty-card">
          <div class="home-empty-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <p class="home-empty-text">
            ${this.activeClientSearch ? 'Aucun client trouvé pour cette recherche.' : 'Aucun client enregistré pour le moment.'}
          </p>
          ${this.activeClientSearch
            ? `<button type="button" class="btn btn-outline-violet home-empty-btn" onclick="document.getElementById('clientSearchInput').value=''; App.activeClientSearch=''; App.renderClients();">Effacer la recherche</button>`
            : `<button type="button" class="btn btn-outline-violet home-empty-btn" onclick="App.ouvrirModalNouveauClient()">+ Ajouter un client</button>`
          }
        </div>
      `;
      return;
    }

    listEl.innerHTML = clients.map(client => {
      const initiales = client.nom
        .trim()
        .split(/\s+/)
        .map(n => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase() || 'CL';

      const nbMesures = this.extraireMesuresClient(client.mesures).length;
      const mesuresMeta = nbMesures > 0 ? `${nbMesures} mesure${nbMesures > 1 ? 's' : ''}` : 'Sans mesures';

      // Calcul dette client
      let dette = 0;
      Store.cache.commandes.filter(c => c.client_id === client.id && c.statut !== 'livree').forEach(cmd => {
        dette += Store.getResteDuPourCommande(cmd.id);
      });

      return `
        <div class="client-card-item" onclick="App.ouvrirFicheClient('${client.id}')">
          <div class="client-avatar-name">
            <div class="client-avatar-circle">${echapperHTML(initiales)}</div>
            <div class="client-info-meta">
              <span class="client-name-text">${echapperHTML(client.nom)}</span>
              <span class="client-phone-text">${echapperHTML(client.telephone || 'Sans numéro')} &middot; ${mesuresMeta}</span>
            </div>
          </div>
          ${dette > 0
            ? `<span class="debt-pill-badge">Doit ${formaterFCFA(dette)}</span>`
            : `<span class="paid-pill-badge">À jour</span>`
          }
        </div>
      `;
    }).join('');
  },

  /* ==========================================================================
     3. RENDU DES COMMANDES (Section 8.3)
     ========================================================================== */
  renderCommandes() {
    const listEl = document.getElementById('ordersListContainer');
    if (!listEl) return;

    let commandes = Store.getCommandes();
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Filtres
    if (this.activeOrderFilter === 'en_cours') {
      commandes = commandes.filter(c => c.statut !== 'livree');
    } else if (this.activeOrderFilter === 'a_livrer') {
      const finSem = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      commandes = commandes.filter(c => {
        const d = new Date(c.date_livraison);
        return c.statut !== 'livree' && d >= now && d <= finSem;
      });
    } else if (this.activeOrderFilter === 'livrees') {
      commandes = commandes.filter(c => c.statut === 'livree');
    } else if (this.activeOrderFilter === 'impayees') {
      commandes = commandes.filter(c => Store.getResteDuPourCommande(c.id) > 0);
    } else if (this.activeOrderFilter === 'en_retard') {
      commandes = commandes.filter(c => c.statut !== 'livree' && new Date(c.date_livraison) < now);
    }

    if (commandes.length === 0) {
      listEl.innerHTML = `
        <div style="text-align: center; padding: 32px 12px; color: var(--texte-doux);">
          Aucune commande dans cette catégorie.
          <div style="margin-top: 12px;">
            <button class="btn btn-primary" onclick="App.ouvrirModalNouvelleCommande()">+ Nouvelle commande</button>
          </div>
        </div>
      `;
      return;
    }

    listEl.innerHTML = commandes.map(cmd => {
      const client = Store.getClientParId(cmd.client_id);
      const nomClient = client ? client.nom : 'Client inconnu';
      const paye = Store.getTotalPayePourCommande(cmd.id);
      const prixTotal = Number(cmd.prix_total) || 0;
      const reste = Store.getResteDuPourCommande(cmd.id);
      const pct = prixTotal > 0 ? Math.min(Math.round((paye / prixTotal) * 100), 100) : 100;

      // Calcul compte à rebours date
      const jours = calculerJoursRestants(cmd.date_livraison);
      let countdownClass = 'green';
      let countdownLabel = `${jours} j restants`;
      if (cmd.statut === 'livree') {
        countdownClass = 'green';
        countdownLabel = 'Livrée ✓';
      } else if (jours < 0) {
        countdownClass = 'red';
        countdownLabel = `${Math.abs(jours)} j de retard !`;
      } else if (jours === 0) {
        countdownClass = 'orange';
        countdownLabel = "Aujourd'hui !";
      } else if (jours <= 3) {
        countdownClass = 'orange';
        countdownLabel = `${jours} j restants`;
      }

      return `
        <div class="order-card-item" onclick="App.ouvrirDetailCommande('${cmd.id}')">
          <div class="order-card-top">
            <div>
              <div class="order-card-client-name">${echapperHTML(nomClient)}</div>
              <div class="order-card-garment">${echapperHTML(cmd.vetement)} ${cmd.tissu ? `· ${echapperHTML(cmd.tissu)}` : ''}</div>
            </div>
            <span class="countdown-badge ${countdownClass}">${countdownLabel}</span>
          </div>

          <div class="payment-progress-wrapper">
            <div class="payment-progress-track">
              <div class="payment-progress-fill" style="width: ${pct}%"></div>
            </div>
            <div class="payment-progress-labels">
              <span>Payé : <strong>${formaterFCFA(paye)}</strong></span>
              <span>${reste > 0 ? `<span style="color:var(--danger)">Reste : <strong>${formaterFCFA(reste)}</strong></span>` : '<span style="color:var(--succes)">Soldé ✓</span>'}</span>
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:2px;">
            <span class="status-pill-badge ${cmd.statut}">${cmd.statut.replace('_', ' ')}</span>
            <span style="font-size:0.75rem; color:var(--texte-doux);">Livraison : ${formaterDateFr(cmd.date_livraison)}</span>
          </div>
        </div>
      `;
    }).join('');
  },

  filtrerCommandes(filtre) {
    this.activeOrderFilter = filtre;
    document.querySelectorAll('#ordersPillsBar .filter-pill').forEach(pill => {
      pill.classList.toggle('active', pill.dataset.filter === filtre);
    });
    this.afficherOnglet('commandes');
    this.renderCommandes();
  },

  /* ==========================================================================
     4. RENDU DES FINANCES & QUI ME DOIT DE L'ARGENT (Section 8.4)
     ========================================================================== */
  renderFinances() {
    const stats = Store.getDashboardStats();
    const dettes = Store.getListeDettesClients();

    const elTotalEncaisse = document.getElementById('financesTotalEncaisse');
    const elDepenses = document.getElementById('financesTotalDepenses');
    const elBenefice = document.getElementById('financesBeneficeNet');
    const elResteAEncaisser = document.getElementById('financesResteAEncaisser');

    if (elTotalEncaisse) elTotalEncaisse.textContent = formaterFCFA(stats.encaisseMois);
    if (elDepenses) elDepenses.textContent = formaterFCFA(stats.depensesMois);
    if (elBenefice) {
      elBenefice.textContent = formaterFCFA(stats.beneficeNetMois);
      elBenefice.style.color = stats.beneficeNetMois >= 0 ? '#38BDF8' : '#F87171';
    }
    if (elResteAEncaisser) elResteAEncaisser.textContent = formaterFCFA(stats.totalAEncaisser);

    // Liste des dépenses d'atelier
    const depensesContainer = document.getElementById('depensesListContainer');
    if (depensesContainer) {
      const depenses = Store.getDepenses();
      if (depenses.length === 0) {
        depensesContainer.innerHTML = `
          <div style="text-align: center; padding: 22px 12px; color: var(--texte-doux); font-size: 0.88rem; background: rgba(30,17,71,0.4); border-radius: 16px; border: 1px dashed rgba(167,139,250,0.2);">
            Aucune dépense enregistrée ce mois-ci.<br>
            <button class="btn btn-outline-violet" style="margin-top: 10px; min-height: 36px; font-size:0.8rem;" onclick="App.ouvrirModalNouvelleDepense()">+ Noter un achat de mercerie</button>
          </div>
        `;
      } else {
        const getIconForCategory = (cat) => {
          if (!cat) return '📦';
          if (cat.includes('Fil')) return '🧵';
          if (cat.includes('Tissu')) return '✂️';
          if (cat.includes('Aiguille')) return '🪡';
          if (cat.includes('Électricité') || cat.includes('Carburant')) return '⚡';
          if (cat.includes('Loyer')) return '🏠';
          if (cat.includes('Transport')) return '🛵';
          if (cat.includes('Alimentation')) return '🍱';
          return '📦';
        };

        depensesContainer.innerHTML = depenses.map(dep => `
          <div class="expense-card-item">
            <div class="expense-left">
              <div class="expense-icon-badge">${getIconForCategory(dep.categorie)}</div>
              <div class="expense-details">
                <span class="expense-category-title">${echapperHTML(dep.categorie)}</span>
                ${dep.note ? `<span class="expense-note">${echapperHTML(dep.note)}</span>` : ''}
                <span class="expense-date">${formaterDateFr(dep.date)}</span>
              </div>
            </div>
            <div class="expense-right">
              <span class="expense-amount-tag">-${formaterFCFA(dep.montant)}</span>
              <button type="button" class="expense-delete-btn" onclick="App.supprimerDepense('${dep.id}')" title="Supprimer">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </div>
        `).join('');
      }
    }

    // Liste des débiteurs
    const dettesContainer = document.getElementById('debtsListContainer');
    if (dettesContainer) {
      if (dettes.length === 0) {
        dettesContainer.innerHTML = `
          <div style="text-align: center; padding: 24px; color: var(--succes); font-size: 0.95rem;">
            🎉 Bravo ! Aucun client ne vous doit de l'argent pour l'instant.
          </div>
        `;
      } else {
        const profil = Store.cache.profil;
        const atelier = profil?.atelier || 'votre tailleur';

        dettesContainer.innerHTML = dettes.map(item => {
          const client = item.client;
          const msg = encodeURIComponent(`Bonjour ${client.nom}, ${atelier} vous rappelle cordialement qu'il reste ${formaterFCFA(item.totalDu)} à régler pour vos confections en cours. Merci de votre confiance !`);
          const waUrl = client.telephone ? `https://wa.me/${extraireChiffres(client.telephone)}?text=${msg}` : '#';

          return `
            <div class="client-card-item" style="cursor: default;">
              <div class="client-avatar-name">
                <div class="client-avatar-circle" style="background:#EF4444;">F</div>
                <div class="client-info-meta">
                  <span class="client-name-text">${echapperHTML(client.nom)}</span>
                  <span style="font-size: 0.85rem; font-weight:800; color:var(--danger);">${formaterFCFA(item.totalDu)} dû</span>
                </div>
              </div>
              ${client.telephone ? `
                <a href="${waUrl}" target="_blank" class="btn-whatsapp-nudge" title="Relancer sur WhatsApp">
                  Relancer 💬
                </a>
              ` : '<span style="font-size:0.75rem; color:var(--texte-doux);">Pas de tel</span>'}
            </div>
          `;
        }).join('');
      }
    }
  },

  /* ==========================================================================
     5. RENDU DES RÉGLAGES (RUBRIQUES REPLIABLES)
     ========================================================================== */
  fermerPageReglage() {
    const mainMenu = document.getElementById('settingsMainMenuView');
    const detailView = document.getElementById('settingsDetailPageView');
    if (mainMenu) mainMenu.style.display = '';
    if (detailView) detailView.style.display = 'none';
    document.querySelectorAll('#settingsDetailPageView .settings-subpage-panel').forEach(panel => {
      panel.classList.remove('active');
    });
  },

  ouvrirPageReglage(cle) {
    if (cle === 'abonnement') {
      window.location.href = 'abonnement.html';
      return;
    }

    const titres = {
      profil: 'Profil personnel',
      atelier: "Nom de l'atelier",
      rappels: 'Rappels de livraison',
      mesures: 'Mesures personnalisées',
      notifications: 'Notifications et alertes',
      sauvegarde: 'Sauvegarde des données',
      compte: 'Compte & mentions légales'
    };

    const mainMenu = document.getElementById('settingsMainMenuView');
    const detailView = document.getElementById('settingsDetailPageView');
    const titleEl = document.getElementById('settingsSubpageTitle');
    const targetPanel = document.querySelector(`#settingsDetailPageView .settings-subpage-panel[data-settings-page="${cle}"]`);
    if (!targetPanel) return;

    document.querySelectorAll('#settingsDetailPageView .settings-subpage-panel').forEach(panel => {
      panel.classList.remove('active');
    });
    targetPanel.classList.add('active');

    if (titleEl) titleEl.textContent = titres[cle] || 'Paramètre';
    if (mainMenu) mainMenu.style.display = 'none';
    if (detailView) detailView.style.display = '';

    if (cle === 'mesures') {
      this.renderModeleMesuresDansReglages();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  renderModeleMesuresDansReglages() {
    const listEl = document.getElementById('reglagesModeleListe');
    const subEl = document.getElementById('subReglageMesures');
    const modele = this.getModeleMesuresAtelier();

    if (subEl) {
      subEl.textContent = modele.length > 0
        ? `Modèle personnel · ${modele.length} mesure${modele.length > 1 ? 's' : ''}`
        : 'Aucune mesure enregistrée en modèle';
    }

    if (!listEl) return;
    if (modele.length === 0) {
      listEl.innerHTML = `<span class="settings-body-desc">Votre modèle est vide. Ajoutez vos mesures habituelles ci-dessus si vous souhaitez les réutiliser en un clic.</span>`;
      return;
    }

    listEl.innerHTML = modele.map((nom, idx) => `
      <span class="settings-template-tag">
        <span>${echapperHTML(nom)}</span>
        <button type="button" aria-label="Retirer ${echapperHTML(nom)}" onclick="App.supprimerMesureModeleDepuisReglages(${idx})">&times;</button>
      </span>
    `).join('');
  },

  ajouterMesureModeleDepuisReglages() {
    const input = document.getElementById('reglageNouvelleMesureInput');
    const nom = input?.value.trim();
    if (!nom) {
      this.showToast("Saisissez d'abord le nom d'une mesure.");
      input?.focus();
      return;
    }

    const modele = this.getModeleMesuresAtelier();
    if (modele.some(m => m.toLowerCase() === nom.toLowerCase())) {
      this.showToast("Cette mesure est déjà dans votre modèle.");
      return;
    }

    modele.push(nom);
    try {
      localStorage.setItem('tailleurpro_mesures_modele', JSON.stringify(modele));
      if (input) input.value = '';
      this.renderModeleMesuresDansReglages();
      this.mettreAJourEtatMesuresUI();
      this.showToast(`« ${nom} » ajoutée à votre modèle.`);
    } catch (_) {
      this.showToast("Impossible d'enregistrer sur cet appareil.");
    }
  },

  supprimerMesureModeleDepuisReglages(index) {
    const modele = this.getModeleMesuresAtelier();
    if (index < 0 || index >= modele.length) return;
    modele.splice(index, 1);
    try {
      localStorage.setItem('tailleurpro_mesures_modele', JSON.stringify(modele));
      this.renderModeleMesuresDansReglages();
      this.mettreAJourEtatMesuresUI();
      this.showToast("Mesure retirée du modèle.");
    } catch (_) {
      // Stockage indisponible
    }
  },

  reinitialiserAlertesLues() {
    try {
      localStorage.removeItem('tailleurpro_notifs_lues');
    } catch (_) {
      // Stockage indisponible
    }
    this.mettreAJourBadgeNotifications();
    this.showToast("Toutes les alertes sont à nouveau actives.");
  },

  renderReglages() {
    const profil = Store.cache.profil;
    if (profil) {
      const prenom = profil.prenom || this.session?.user?.user_metadata?.prenom || 'Tailleur';
      const atelierAffiche = this.formaterNomAtelierAffichage(profil, prenom);
      const rappel = Number(profil.rappel_jours) || 2;

      const prenomInput = document.getElementById('reglagePrenom');
      const atelierInput = document.getElementById('reglageAtelier');
      const villeInput = document.getElementById('reglageVille');
      const emailRecup = document.getElementById('reglageEmailRecup');
      const paysSelect = document.getElementById('reglagePays');
      const rappelSelect = document.getElementById('reglageRappelJours');

      if (prenomInput) prenomInput.value = profil.prenom || '';
      if (atelierInput) {
        const brut = profil.atelier ? String(profil.atelier).trim() : '';
        atelierInput.value = brut.toLowerCase() === 'mon atelier' ? '' : brut;
      }
      if (villeInput) villeInput.value = profil.ville || '';
      if (emailRecup) emailRecup.value = profil.email_recuperation || '';
      if (paysSelect && typeof remplirSelectPays === 'function') {
        const codePays = this.obtenirPaysParDefautAtelier();
        remplirSelectPays(paysSelect, 'complet', codePays);
      }
      if (rappelSelect) rappelSelect.value = String(rappel);

      // En-tête résumé et sous-titres des rubriques repliées
      const cardAvatar = document.getElementById('reglageCardAvatar');
      const cardAtelier = document.getElementById('reglageCardAtelier');
      const cardMeta = document.getElementById('reglageCardMeta');
      const subProfil = document.getElementById('subReglageProfil');
      const subAtelier = document.getElementById('subReglageAtelier');
      const subRappels = document.getElementById('subReglageRappels');
      const subPlan = document.getElementById('subReglagePlan');

      if (cardAvatar) cardAvatar.textContent = prenom.substring(0, 2).toUpperCase();
      if (cardAtelier) cardAtelier.textContent = atelierAffiche;
      if (cardMeta) cardMeta.textContent = profil.ville ? `${prenom} · ${profil.ville}` : `${prenom} · Touchez une rubrique pour l'ouvrir`;
      if (subProfil) subProfil.textContent = profil.ville ? `${prenom} · ${profil.ville}` : `${prenom} · Profil & récupération`;
      if (subAtelier) subAtelier.textContent = atelierAffiche;
      if (subRappels) subRappels.textContent = `Alerte ${rappel} jour${rappel > 1 ? 's' : ''} avant la livraison`;

      const maintenant = new Date();
      const abonnementFin = profil.abonnement_fin ? new Date(profil.abonnement_fin) : null;
      const essaiFin = profil.essai_fin ? new Date(profil.essai_fin) : null;
      if (abonnementFin && abonnementFin > maintenant) {
        const dateFin = formaterDateFr(profil.abonnement_fin);
        if (subPlan) subPlan.textContent = `Abonnement Pro actif jusqu'au ${dateFin}`;
      } else if (essaiFin && essaiFin > maintenant) {
        const j = calculerJoursRestants(profil.essai_fin);
        if (subPlan) subPlan.textContent = `Essai gratuit · ${j} jour${j > 1 ? 's' : ''} restant${j > 1 ? 's' : ''}`;
      } else {
        if (subPlan) subPlan.textContent = 'Essai expiré · Activer un abonnement';
      }
    }

    this.renderModeleMesuresDansReglages();
  },

  async enregistrerReglages() {
    const prenom = document.getElementById('reglagePrenom')?.value.trim();
    const atelierSaisi = document.getElementById('reglageAtelier')?.value.trim();
    const ville = document.getElementById('reglageVille')?.value.trim();
    const email_recuperation = document.getElementById('reglageEmailRecup')?.value.trim();
    const pays = document.getElementById('reglagePays')?.value || this.obtenirPaysParDefautAtelier();
    const rappel_jours = Number(document.getElementById('reglageRappelJours')?.value) || 2;

    if (!prenom) {
      this.showToast("Le prénom ne peut pas être vide.");
      document.getElementById('reglagePrenom')?.focus();
      return;
    }

    try {
      if (typeof memoriserPaysActif === 'function') memoriserPaysActif(pays);
      await Store.updateProfil({
        prenom,
        atelier: atelierSaisi || 'Mon Atelier',
        ville,
        pays,
        email_recuperation,
        rappel_jours
      });
      this.actualiserEntete();
      this.renderReglages();
      this.renderAccueil();
      this.showToast("Réglages enregistrés avec succès.");
    } catch (err) {
      alert("Erreur lors de l'enregistrement : " + err.message);
    }
  },

  /* ==========================================================================
     6. FENÊTRES MODALES (CLIENTS & MESURES 100 % PERSONNALISABLES)
     ========================================================================== */
  extraireMesuresClient(mesuresObj, inclureVidesPersonnalisees = false) {
    const m = mesuresObj || {};
    const resultat = [];
    const vus = new Set();

    const anciensChamps = [
      { key: 'epaules', label: 'Épaule' },
      { key: 'poitrine', label: 'Poitrine' },
      { key: 'taille_haut', fallback: 'taille', label: 'Taille' },
      { key: 'bassin', fallback: 'hanches', label: 'Bassin / Hanches' },
      { key: 'longueur_haut', fallback: 'longueur', label: 'Longueur' },
      { key: 'longueur_manche', fallback: 'bras', label: 'Manche' },
      { key: 'tour_bras', label: 'Tour de bras' },
      { key: 'poignet', label: 'Poignet' },
      { key: 'cou', label: 'Cou / Col' },
      { key: 'rein', label: 'Tour de rein' },
      { key: 'taille_bas', label: 'Taille (bas)' },
      { key: 'longueur_pantalon', label: 'Pantalon' },
      { key: 'cuisse', label: 'Cuisse' },
      { key: 'genou', label: 'Genou' },
      { key: 'tour_jambe', label: 'Bas pantalon' },
      { key: 'fourche', label: 'Entrejambe' }
    ];

    // Compatibilité avec d'éventuelles anciennes fiches déjà enregistrées
    anciensChamps.forEach(item => {
      const val = m[item.key] || (item.fallback ? m[item.fallback] : '');
      const propre = val !== null && val !== undefined ? String(val).trim() : '';
      if (propre) {
        const cleNorm = item.label.toLowerCase();
        if (!vus.has(cleNorm)) {
          vus.add(cleNorm);
          resultat.push({ label: item.label, valeur: propre });
        }
      }
    });

    if (Array.isArray(m.personnalisees)) {
      m.personnalisees.forEach(p => {
        const nom = p?.nom ? String(p.nom).trim() : '';
        const valeur = p?.valeur !== null && p?.valeur !== undefined ? String(p.valeur).trim() : '';
        if (nom && (inclureVidesPersonnalisees || valeur !== '')) {
          const cleNorm = nom.toLowerCase();
          if (!vus.has(cleNorm)) {
            vus.add(cleNorm);
            resultat.push({ label: nom, valeur });
          }
        }
      });
    }

    return resultat;
  },

  mettreAJourEtatMesuresUI() {
    const rows = Array.from(document.querySelectorAll('#mesuresPersonnaliseesContainer .custom-measure-row'));
    const emptyHint = document.getElementById('mesuresEmptyHint');
    if (emptyHint) {
      emptyHint.style.display = rows.length === 0 ? 'block' : 'none';
    }

    const nomsSaisis = new Set(
      rows
        .map(r => r.querySelector('.custom-measure-name')?.value.trim().toLowerCase())
        .filter(Boolean)
    );

    document.querySelectorAll('#mesuresQuickChips .measure-chip-btn').forEach(btn => {
      const label = (btn.dataset.measureChip || '').toLowerCase();
      btn.classList.toggle('is-used', nomsSaisis.has(label));
    });

    const btnCharger = document.getElementById('btnChargerModeleMesures');
    if (btnCharger) {
      btnCharger.style.display = this.getModeleMesuresAtelier().length > 0 ? 'inline-block' : 'none';
    }
  },

  getModeleMesuresAtelier() {
    try {
      const brut = localStorage.getItem('tailleurpro_mesures_modele');
      const liste = brut ? JSON.parse(brut) : [];
      return Array.isArray(liste) ? liste.filter(n => typeof n === 'string' && n.trim()) : [];
    } catch (_) {
      return [];
    }
  },

  enregistrerModeleMesures() {
    const noms = Array.from(document.querySelectorAll('#mesuresPersonnaliseesContainer .custom-measure-name'))
      .map(el => el.value.trim())
      .filter(Boolean);

    if (noms.length === 0) {
      this.showToast("Ajoutez d'abord au moins une mesure à garder en modèle.");
      return;
    }

    try {
      const uniques = Array.from(new Set(noms));
      localStorage.setItem('tailleurpro_mesures_modele', JSON.stringify(uniques));
      this.mettreAJourEtatMesuresUI();
      this.showToast(`Modèle enregistré (${uniques.length} mesure${uniques.length > 1 ? 's' : ''}).`);
    } catch (_) {
      this.showToast("Impossible d'enregistrer ce modèle sur cet appareil.");
    }
  },

  appliquerModeleMesures() {
    const modele = this.getModeleMesuresAtelier();
    if (modele.length === 0) {
      this.showToast("Aucun modèle personnel enregistré pour le moment.");
      return;
    }

    const existants = new Set(
      Array.from(document.querySelectorAll('#mesuresPersonnaliseesContainer .custom-measure-name'))
        .map(el => el.value.trim().toLowerCase())
        .filter(Boolean)
    );

    let ajouts = 0;
    modele.forEach(nom => {
      if (!existants.has(nom.toLowerCase())) {
        this.ajouterLigneMesureLibre(nom, '', false);
        ajouts += 1;
      }
    });

    this.mettreAJourEtatMesuresUI();
    this.showToast(ajouts > 0 ? `${ajouts} mesure${ajouts > 1 ? 's' : ''} ajoutée${ajouts > 1 ? 's' : ''} depuis votre modèle.` : 'Votre modèle est déjà affiché.');
  },

  ajouterMesureDepuisRaccourci(nomMesure) {
    const rows = Array.from(document.querySelectorAll('#mesuresPersonnaliseesContainer .custom-measure-row'));
    const existante = rows.find(r => r.querySelector('.custom-measure-name')?.value.trim().toLowerCase() === nomMesure.toLowerCase());

    if (existante) {
      const valInput = existante.querySelector('.custom-measure-val');
      valInput?.focus();
      valInput?.select?.();
      return;
    }

    // Remplit d'abord une éventuelle ligne encore vide si l'utilisateur vient de cliquer sur + Ajouter
    const ligneVide = rows.find(r => !r.querySelector('.custom-measure-name')?.value.trim() && !r.querySelector('.custom-measure-val')?.value.trim());
    if (ligneVide) {
      const nomEl = ligneVide.querySelector('.custom-measure-name');
      const valEl = ligneVide.querySelector('.custom-measure-val');
      if (nomEl) nomEl.value = nomMesure;
      this.mettreAJourEtatMesuresUI();
      valEl?.focus();
      return;
    }

    this.ajouterLigneMesureLibre(nomMesure, '', true);
  },

  collecterMesuresPersonnalisees() {
    const customRows = document.querySelectorAll('#mesuresPersonnaliseesContainer .custom-measure-row');
    const personnalisees = [];
    for (const row of customRows) {
      const nameEl = row.querySelector('.custom-measure-name');
      const valEl = row.querySelector('.custom-measure-val');
      const nomMesure = nameEl?.value.trim() || '';
      const valMesure = valEl?.value.trim() || '';

      if (!nomMesure && valMesure) {
        this.showToast("Donnez un nom à chaque mesure saisie.");
        nameEl?.focus();
        return null;
      }

      if (nomMesure) {
        personnalisees.push({ nom: nomMesure, valeur: valMesure });
      }
    }
    return personnalisees;
  },

  async confirmerLigneMesureLibre(row) {
    if (!row) return;
    const nameEl = row.querySelector('.custom-measure-name');
    const valEl = row.querySelector('.custom-measure-val');
    const saveBtn = row.querySelector('.btn-save-custom-measure');
    const nomMesure = nameEl?.value.trim() || '';
    const valMesure = valEl?.value.trim() || '';

    if (!nomMesure) {
      this.showToast("Indiquez le nom de la mesure avant d'enregistrer.");
      nameEl?.focus();
      return;
    }
    if (!valMesure) {
      this.showToast("Indiquez la valeur en cm pour confirmer cette mesure.");
      valEl?.focus();
      return;
    }

    row.classList.add('is-confirmed');
    if (saveBtn) {
      saveBtn.classList.add('is-saved');
      saveBtn.textContent = '✓ Enregistrée';
    }

    const id = document.getElementById('clientIdInput')?.value || '';
    const nomClient = document.getElementById('clientNomInput')?.value?.trim() || '';

    if (id && nomClient && Store.estCompteActif()) {
      const personnalisees = this.collecterMesuresPersonnalisees();
      if (!personnalisees) return;
      try {
        await Store.saveClient({
          id,
          nom: nomClient,
          telephone: document.getElementById('clientTelInput')?.value || '',
          mesures: {
            personnalisees,
            mode: 'personnalise',
            datePrise: new Date().toISOString()
          },
          notes: document.getElementById('clientNotesInput')?.value || ''
        });
        this.renderClients();
        this.renderAccueil();
        this.showToast(`✓ Mesure "${nomMesure}" enregistrée (${valMesure} cm).`);
        return;
      } catch (err) {
        this.showToast("Erreur d'enregistrement : " + (err.message || "Réessayez."));
        return;
      }
    }

    this.showToast(`✓ Mesure "${nomMesure}" confirmée (${valMesure} cm).`);
  },

  ajouterLigneMesureLibre(nom = '', valeur = '', autoFocus = false, estDejaEnregistree = false) {
    const container = document.getElementById('mesuresPersonnaliseesContainer');
    if (!container) return;

    const estConfirmee = Boolean(estDejaEnregistree && String(nom).trim());
    const row = document.createElement('div');
    row.className = estConfirmee ? 'custom-measure-row is-confirmed' : 'custom-measure-row';
    row.innerHTML = `
      <input type="text" class="form-input modal-dark-input custom-measure-name" placeholder="Nom (ex: Épaule, Manche...)" value="${echapperHTML(nom)}">
      <div class="measure-val-unit-wrap">
        <input type="number" step="0.5" min="0" inputmode="decimal" class="form-input modal-dark-input custom-measure-val" placeholder="0" value="${echapperHTML(valeur)}">
        <span class="measure-unit-tag" aria-hidden="true">cm</span>
      </div>
      <button type="button" class="btn-save-custom-measure${estConfirmee ? ' is-saved' : ''}" aria-label="Enregistrer cette mesure" title="Confirmer cette mesure">${estConfirmee ? '✓ Enregistrée' : 'Enregistrer'}</button>
      <button type="button" class="btn-remove-custom-measure" aria-label="Supprimer cette mesure" title="Supprimer">&times;</button>
    `;

    const nameInput = row.querySelector('.custom-measure-name');
    const valInput = row.querySelector('.custom-measure-val');
    const saveBtn = row.querySelector('.btn-save-custom-measure');

    const marquerCommeAModifier = () => {
      if (row.classList.contains('is-confirmed')) {
        row.classList.remove('is-confirmed');
      }
      if (saveBtn) {
        saveBtn.classList.remove('is-saved');
        saveBtn.textContent = 'Enregistrer';
      }
    };

    nameInput?.addEventListener('input', () => {
      marquerCommeAModifier();
      this.mettreAJourEtatMesuresUI();
    });
    valInput?.addEventListener('input', () => {
      marquerCommeAModifier();
    });
    saveBtn?.addEventListener('click', () => this.confirmerLigneMesureLibre(row));
    row.querySelector('.btn-remove-custom-measure')?.addEventListener('click', () => {
      row.remove();
      this.mettreAJourEtatMesuresUI();
    });

    container.appendChild(row);
    this.mettreAJourEtatMesuresUI();

    if (autoFocus) {
      if (nom) {
        valInput?.focus();
      } else {
        nameInput?.focus();
      }
    }
  },

  obtenirPaysParDefautAtelier() {
    const code = (
      Store.cache?.profil?.pays ||
      this.session?.user?.user_metadata?.pays ||
      (typeof obtenirPaysActif === 'function' ? obtenirPaysActif().code : 'CM')
    ).toUpperCase();
    return (typeof PAYS !== 'undefined' && PAYS[code]) ? code : 'CM';
  },

  mettreAJourPlaceholderTelClient() {
    const sel = document.getElementById('clientPaysTelSelect');
    const inp = document.getElementById('clientTelInput');
    if (!sel || !inp || typeof PAYS === 'undefined') return;
    const p = PAYS[sel.value] || PAYS_PAR_DEFAUT;
    inp.placeholder = `Ex: ${p.exemple}`;
  },

  ouvrirModalNouveauClient() {
    if (!Store.estCompteActif()) {
      this.afficherModalEssaiExpire("enregistrer de nouveaux clients");
      return;
    }
    document.getElementById('actionSheetOverlay')?.classList.remove('active');
    const modal = document.getElementById('modalNouveauClient');
    const form = document.getElementById('formNouveauClient');
    if (form) form.reset();

    const idInput = document.getElementById('clientIdInput');
    if (idInput) idInput.value = '';

    const paysSel = document.getElementById('clientPaysTelSelect');
    if (paysSel && typeof remplirSelectPays === 'function') {
      remplirSelectPays(paysSel, 'compact', this.obtenirPaysParDefautAtelier());
    }
    this.mettreAJourPlaceholderTelClient();

    const titre = document.getElementById('titreModalClient');
    if (titre) titre.textContent = window.Lang ? Lang.t('Nouveau client', 'New Client') : 'Nouveau client';

    const btnSubmit = document.getElementById('btnSubmitClient');
    if (btnSubmit) btnSubmit.textContent = window.Lang ? Lang.t('Enregistrer le client', 'Save client') : 'Enregistrer le client';

    // Toujours vide par défaut : aucune mesure automatique imposée
    const container = document.getElementById('mesuresPersonnaliseesContainer');
    if (container) container.innerHTML = '';
    this.mettreAJourEtatMesuresUI();

    modal?.classList.add('active');
  },

  async soumettreNouveauClient(e) {
    e.preventDefault();
    const id = document.getElementById('clientIdInput')?.value || null;
    const nom = document.getElementById('clientNomInput')?.value;
    const telephoneBrut = document.getElementById('clientTelInput')?.value || '';
    const codePaysClient = document.getElementById('clientPaysTelSelect')?.value || this.obtenirPaysParDefautAtelier();
    let telephone = telephoneBrut.trim();
    if (telephone && typeof normaliserContactClient === 'function') {
      const contactNorm = normaliserContactClient(telephone, codePaysClient);
      telephone = contactNorm.telephone || telephone;
    }
    const notes = document.getElementById('clientNotesInput')?.value;

    // Récupération des mesures libres saisies par l'utilisateur
    const personnalisees = this.collecterMesuresPersonnalisees();
    if (!personnalisees) return;

    const mesures = {
      personnalisees,
      mode: 'personnalise',
      datePrise: new Date().toISOString()
    };

    try {
      if (!Store.estCompteActif()) {
        this.afficherModalEssaiExpire(id ? "modifier ce client et ses mesures" : "enregistrer de nouveaux clients");
        return;
      }
      await Store.saveClient({ id, nom, telephone, mesures, notes });
      document.getElementById('modalNouveauClient')?.classList.remove('active');
      this.showToast(id ? "Client et mesures mis à jour." : "Client enregistré avec succès.");
      this.renderClients();
      this.renderAccueil();
    } catch (err) {
      if (err.message?.includes('ESSAI_EXPIRE')) {
        this.afficherModalEssaiExpire(id ? "modifier ce client et ses mesures" : "enregistrer de nouveaux clients");
      } else {
        alert("Erreur lors de l'enregistrement : " + err.message);
      }
    }
  },

  ouvrirFicheClient(clientId) {
    const client = Store.getClientParId(clientId);
    if (!client) return;

    const modal = document.getElementById('modalFicheClient');
    const titre = document.getElementById('ficheClientNom');
    const phone = document.getElementById('ficheClientPhone');
    const btnAppel = document.getElementById('btnFicheAppel');
    const btnWA = document.getElementById('btnFicheWA');
    const mesuresBox = document.getElementById('ficheClientMesures');
    const notesBox = document.getElementById('ficheClientNotes');
    const btnCopier = document.getElementById('btnCopierMesures');
    const btnModifier = document.getElementById('btnModifierClientFiche');
    const btnSupprimer = document.getElementById('btnSupprimerClientFiche');

    if (titre) titre.textContent = client.nom;
    if (phone) phone.textContent = client.telephone || 'Numéro non renseigné';

    const numNettoye = extraireChiffres(client.telephone);
    if (btnAppel) btnAppel.href = numNettoye ? `tel:${numNettoye}` : '#';
    if (btnWA) btnWA.href = numNettoye ? `https://wa.me/${numNettoye}` : '#';

    // Rendu unifié des mesures personnalisées (et anciennes mesures éventuelles)
    const listeMesures = this.extraireMesuresClient(client.mesures);

    if (mesuresBox) {
      if (listeMesures.length === 0) {
        mesuresBox.innerHTML = `
          <div class="measurement-empty-guide">
            Aucune mesure enregistrée pour ce client.<br>
            <button type="button" class="btn btn-outline-violet fiche-mini-btn" style="margin-top:8px;" onclick="App.editerClient('${client.id}')">+ Ajouter des mesures</button>
          </div>
        `;
      } else {
        mesuresBox.innerHTML = `
          <div class="measurements-grid">
            ${listeMesures.map(item => `
              <div class="measurement-pill-box">
                <label>${echapperHTML(item.label)}</label>
                <strong>${echapperHTML(item.valeur)} cm</strong>
              </div>
            `).join('')}
          </div>
        `;
      }
    }

    if (notesBox) notesBox.textContent = client.notes || 'Aucune note particulière.';

    // Bouton copier les mesures
    if (btnCopier) {
      btnCopier.onclick = () => this.copierMesuresClient(client.id);
    }

    // Bouton modifier
    if (btnModifier) {
      btnModifier.onclick = () => this.editerClient(client.id);
    }

    // Bouton supprimer
    if (btnSupprimer) {
      btnSupprimer.onclick = () => this.supprimerClient(client.id);
    }

    // Bouton nouvelle commande depuis la fiche
    const btnNouvelleCmd = document.getElementById('btnNouvelleCmdDepuisFiche');
    if (btnNouvelleCmd) {
      btnNouvelleCmd.onclick = () => this.ouvrirNouvelleCommandePourClient(client.id);
    }

    // Rendu de l'historique complet des commandes du client
    this.renderHistoriqueCommandesClient(client.id);

    modal?.classList.add('active');
  },

  /**
   * Section Historique des Commandes dans la Fiche Détaillée Client
   */
  renderHistoriqueCommandesClient(clientId) {
    const badgeEl = document.getElementById('ficheClientCmdBadgeCount');
    const recapEl = document.getElementById('ficheClientRecapFinancier');
    const listEl = document.getElementById('ficheClientCommandesList');

    if (!listEl) return;

    const commandes = Store.getCommandesParClientId(clientId);
    const totalCmds = commandes.length;

    if (badgeEl) {
      badgeEl.textContent = totalCmds;
    }

    // Cas où le client n'a aucune commande
    if (totalCmds === 0) {
      if (recapEl) {
        recapEl.style.display = 'none';
        recapEl.innerHTML = '';
      }
      listEl.innerHTML = `
        <div class="measurement-empty-guide">
          <strong style="display:block; margin-bottom:4px; color:var(--tp-white);">Aucune commande enregistrée</strong>
          <span>Ce client n'a pas encore de commande de confection.</span><br>
          <button type="button" class="btn btn-outline-violet fiche-mini-btn" style="margin-top:10px;" onclick="App.ouvrirNouvelleCommandePourClient('${clientId}')">
            + Enregistrer une première commande
          </button>
        </div>
      `;
      return;
    }

    // Calculs financiers récapitulatifs pour ce client
    let totalFacture = 0;
    let totalPaye = 0;
    let totalDette = 0;

    commandes.forEach(c => {
      totalFacture += (Number(c.prix_total) || 0);
      totalPaye += Store.getTotalPayePourCommande(c.id);
      totalDette += Store.getResteDuPourCommande(c.id);
    });

    if (recapEl) {
      recapEl.style.display = 'block';
      recapEl.innerHTML = `
        <div class="client-mini-recap-grid">
          <div class="client-mini-recap-item">
            <span class="client-mini-recap-label">Commandes</span>
            <span class="client-mini-recap-val">${totalCmds}</span>
          </div>
          <div class="client-mini-recap-item">
            <span class="client-mini-recap-label">Déjà payé</span>
            <span class="client-mini-recap-val ok">${formaterFCFA(totalPaye)}</span>
          </div>
          <div class="client-mini-recap-item">
            <span class="client-mini-recap-label">${totalDette > 0 ? 'Reste dû' : 'Solde'}</span>
            <span class="client-mini-recap-val ${totalDette > 0 ? 'debt' : 'ok'}">
              ${totalDette > 0 ? formaterFCFA(totalDette) : 'À jour'}
            </span>
          </div>
        </div>
      `;
    }

    // Séparation des commandes : En cours vs Terminées/Livrées
    const enCours = commandes.filter(c => c.statut !== 'livree');
    const terminees = commandes.filter(c => c.statut === 'livree');

    const mapperCarteCommande = (cmd) => {
      const paye = Store.getTotalPayePourCommande(cmd.id);
      const prixTotal = Number(cmd.prix_total) || 0;
      const reste = Store.getResteDuPourCommande(cmd.id);
      const pct = prixTotal > 0 ? Math.min(Math.round((paye / prixTotal) * 100), 100) : 100;
      const estLivree = cmd.statut === 'livree';

      const statutLabel = this.formaterStatutCommande(cmd.statut);

      // Calcul compte à rebours date de livraison
      const jours = calculerJoursRestants(cmd.date_livraison);
      let countdownClass = 'green';
      let countdownLabel = `${jours} j restants`;
      let borderModifierClass = estLivree ? 'is-livree' : 'is-active';

      if (estLivree) {
        countdownClass = 'green';
        countdownLabel = 'Livrée';
      } else if (jours < 0) {
        countdownClass = 'red';
        countdownLabel = `${Math.abs(jours)} j de retard`;
        borderModifierClass = 'is-retard';
      } else if (jours === 0) {
        countdownClass = 'red';
        countdownLabel = "Aujourd'hui";
        borderModifierClass = 'is-retard';
      } else if (jours === 1) {
        countdownClass = 'orange';
        countdownLabel = 'Demain';
      } else if (jours <= 3) {
        countdownClass = 'orange';
        countdownLabel = `${jours} j restants`;
      }

      // Dates formatées
      const dateCreeeStr = cmd.cree_le ? formaterDateFr(cmd.cree_le) : '-';
      const dateLivraisonStr = cmd.date_livraison ? formaterDateFr(cmd.date_livraison) : '-';

      return `
        <div class="client-order-history-card ${borderModifierClass}" onclick="App.ouvrirDetailCommandeDepuisFiche('${cmd.id}')" title="Afficher les détails et versements">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
            <div style="min-width:0; flex:1;">
              <div class="order-card-garment-title">
                <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${echapperHTML(cmd.vetement)}</span>
              </div>
              ${cmd.tissu ? `
                <div style="margin-top:4px;">
                  <span class="order-card-fabric-tag">${echapperHTML(cmd.tissu)}</span>
                </div>
              ` : ''}
            </div>
            <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px; flex-shrink:0;">
              <span class="status-pill-badge ${cmd.statut}">${echapperHTML(statutLabel)}</span>
              <span class="countdown-badge ${countdownClass}" style="font-size:0.68rem; padding:2px 8px;">${countdownLabel}</span>
            </div>
          </div>

          <!-- Métadonnées de dates -->
          <div class="order-card-dates-meta" style="margin-top:2px;">
            <div>Passée le : <strong>${dateCreeeStr}</strong></div>
            <div>Prévue le : <strong>${dateLivraisonStr}</strong></div>
          </div>

          <!-- Barre de progression financière -->
          <div class="payment-progress-wrapper" style="margin-top:2px;">
            <div class="payment-progress-track">
              <div class="payment-progress-fill" style="width: ${pct}%"></div>
            </div>
            <div class="payment-progress-labels">
              <span>Total : <strong>${formaterFCFA(prixTotal)}</strong></span>
              <span>Payé : <strong style="color:#6EE7B7;">${formaterFCFA(paye)}</strong></span>
            </div>
          </div>

          <!-- Puce de solde et invitation au clic -->
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:2px; padding-top:6px; border-top:1px solid rgba(255,255,255,0.06);">
            ${reste > 0
              ? `<span class="unpaid-alert-chip">Reste : ${formaterFCFA(reste)}</span>`
              : `<span class="paid-success-chip">Soldée</span>`
            }
            <span class="view-detail-hint">Détails &amp; versements &rarr;</span>
          </div>
        </div>
      `;
    };

    let html = '';

    if (enCours.length > 0) {
      html += `
        <div class="client-history-group-header">
          <span>En cours (${enCours.length})</span>
        </div>
        ${enCours.map(mapperCarteCommande).join('')}
      `;
    }

    if (terminees.length > 0) {
      html += `
        <div class="client-history-group-header" style="${enCours.length > 0 ? 'margin-top:10px;' : ''}">
          <span>Livrées &amp; terminées (${terminees.length})</span>
        </div>
        ${terminees.map(mapperCarteCommande).join('')}
      `;
    }

    listEl.innerHTML = html;
  },

  ouvrirDetailCommandeDepuisFiche(commandeId) {
    document.getElementById('modalFicheClient')?.classList.remove('active');
    this.ouvrirDetailCommande(commandeId);
  },

  ouvrirNouvelleCommandePourClient(clientId) {
    document.getElementById('modalFicheClient')?.classList.remove('active');
    this.ouvrirModalNouvelleCommande(null, clientId);
  },

  editerClient(clientId) {
    if (!Store.estCompteActif()) {
      this.afficherModalEssaiExpire("modifier ce client et ses mesures");
      return;
    }

    const client = Store.getClientParId(clientId);
    if (!client) return;

    // Fermer fiche client
    document.getElementById('modalFicheClient')?.classList.remove('active');

    // Ouvrir modal d'édition
    const modal = document.getElementById('modalNouveauClient');
    const titre = document.getElementById('titreModalClient');
    const btnSubmit = document.getElementById('btnSubmitClient');

    if (titre) titre.textContent = 'Modifier le client et ses mesures';
    if (btnSubmit) btnSubmit.textContent = 'Enregistrer les modifications';

    // Remplir infos de base
    const idInput = document.getElementById('clientIdInput');
    if (idInput) idInput.value = client.id;
    document.getElementById('clientNomInput').value = client.nom || '';

    const paysSel = document.getElementById('clientPaysTelSelect');
    const telBrut = client.telephone || '';
    const paysDetecte = (typeof detecterPaysDepuisNumero === 'function') ? detecterPaysDepuisNumero(telBrut) : null;
    const codeActif = paysDetecte ? paysDetecte.code : this.obtenirPaysParDefautAtelier();
    if (paysSel && typeof remplirSelectPays === 'function') {
      remplirSelectPays(paysSel, 'compact', codeActif);
    }
    let telAffichage = telBrut;
    if (paysDetecte) {
      const chiffres = typeof extraireChiffres === 'function' ? extraireChiffres(telBrut) : telBrut.replace(/\D/g, '');
      telAffichage = chiffres.startsWith(paysDetecte.indicatif)
        ? chiffres.slice(paysDetecte.indicatif.length)
        : telBrut;
    }
    document.getElementById('clientTelInput').value = telAffichage;
    this.mettreAJourPlaceholderTelClient();
    document.getElementById('clientNotesInput').value = client.notes || '';

    // Lignes de mesures personnalisées (et récupération transparente des anciens champs)
    const container = document.getElementById('mesuresPersonnaliseesContainer');
    if (container) {
      container.innerHTML = '';
      const listeMesures = this.extraireMesuresClient(client.mesures, true);
      listeMesures.forEach(item => {
        this.ajouterLigneMesureLibre(item.label, item.valeur, false, true);
      });
    }

    this.mettreAJourEtatMesuresUI();
    modal?.classList.add('active');
  },

  async copierMesuresClient(clientId) {
    const client = Store.getClientParId(clientId);
    if (!client) return;

    const profil = Store.cache.profil;
    const atelier = profil?.atelier ? ` - Atelier ${profil.atelier}` : '';
    const listeMesures = this.extraireMesuresClient(client.mesures);

    let texte = `MESURES DE ${client.nom.toUpperCase()}${atelier}\n`;
    if (client.telephone) texte += `Tél : ${client.telephone}\n`;
    texte += `------------------------------------\n`;

    if (listeMesures.length > 0) {
      texte += listeMesures.map(item => `• ${item.label} : ${item.valeur} cm`).join('\n') + '\n';
    } else {
      texte += `Aucune mesure enregistrée.\n`;
    }

    if (client.notes) {
      texte += `\nNotes : ${client.notes}\n`;
    }

    texte += `\nEnregistré avec Tailleur Pro`;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(texte);
      } else {
        const ta = document.createElement('textarea');
        ta.value = texte;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      this.showToast("Mesures copiées dans le presse-papier.");
    } catch (err) {
      alert("Impossible de copier automatiquement : " + err.message);
    }
  },

  async supprimerClient(clientId) {
    if (!Store.estCompteActif()) {
      this.afficherModalEssaiExpire("supprimer ce client");
      return;
    }

    const client = Store.getClientParId(clientId);
    if (!client) return;

    if (!confirm(`Supprimer définitivement "${client.nom}" et toutes ses commandes ? Cette action ne peut pas être annulée.`)) {
      return;
    }

    try {
      await Store.deleteClient(clientId);
      document.getElementById('modalFicheClient')?.classList.remove('active');
      this.showToast("Client supprimé avec succès ✓");
      this.renderClients();
      this.renderAccueil();
    } catch (err) {
      if (err.message?.includes('ESSAI_EXPIRE')) {
        this.afficherModalEssaiExpire("supprimer ce client");
      } else {
        alert("Erreur lors de la suppression : " + err.message);
      }
    }
  },

  ouvrirModalNouvelleCommande(commandeId = null, preselectedClientId = null) {
    if (!Store.estCompteActif()) {
      this.afficherModalEssaiExpire(commandeId ? "modifier cette commande" : "créer une nouvelle commande");
      return;
    }
    document.getElementById('actionSheetOverlay')?.classList.remove('active');
    const modal = document.getElementById('modalNouvelleCommande');
    const selectClient = document.getElementById('commandeSelectClient');
    const titreEl = document.getElementById('titreModalCommande');
    const btnSubmit = document.getElementById('btnSubmitCommande');
    const idInput = document.getElementById('commandeIdInput');
    const groupAvance = document.getElementById('groupCommandeAvance');

    // Remplir la liste des clients
    if (selectClient) {
      const clients = Store.getClients();
      if (clients.length === 0) {
        alert("Ajoutez d'abord au moins un client avant de créer une commande.");
        this.ouvrirModalNouveauClient();
        return;
      }
      selectClient.innerHTML = clients.map(c => `<option value="${c.id}">${echapperHTML(c.nom)} (${c.telephone || 'sans numéro'})</option>`).join('');
    }

    if (commandeId) {
      // MODE ÉDITION
      const cmd = Store.getCommandeParId(commandeId);
      if (!cmd) return;

      if (titreEl) titreEl.textContent = "Modifier la Commande";
      if (btnSubmit) btnSubmit.textContent = "Enregistrer les modifications";
      if (idInput) idInput.value = cmd.id;

      if (selectClient) selectClient.value = cmd.client_id;
      document.getElementById('commandeVetementInput').value = cmd.vetement || '';
      document.getElementById('commandeTissuInput').value = cmd.tissu || '';
      document.getElementById('commandePrixInput').value = cmd.prix_total || '';
      document.getElementById('commandeDateLivraison').value = cmd.date_livraison || '';

      // L'avance initiale ne s'affiche qu'à la création (les paiements ultérieurs ont leur propre modale)
      if (groupAvance) groupAvance.style.display = 'none';

    } else {
      // MODE CRÉATION
      if (titreEl) titreEl.textContent = "Nouvelle Commande";
      if (btnSubmit) btnSubmit.textContent = "Enregistrer la commande";
      if (idInput) idInput.value = '';

      document.getElementById('formNouvelleCommande')?.reset();
      if (groupAvance) groupAvance.style.display = 'block';

      // Présélection éventuelle d'un client (ex: depuis sa fiche détaillée)
      if (preselectedClientId && selectClient) {
        selectClient.value = preselectedClientId;
      }

      // Date de livraison par défaut : dans 7 jours
      const dateInput = document.getElementById('commandeDateLivraison');
      if (dateInput) {
        const d = new Date();
        d.setDate(d.getDate() + 7);
        dateInput.value = d.toISOString().split('T')[0];
      }
    }

    modal?.classList.add('active');
  },

  async soumettreNouvelleCommande(e) {
    e.preventDefault();
    const id = document.getElementById('commandeIdInput')?.value || null;
    const client_id = document.getElementById('commandeSelectClient')?.value;
    const vetement = document.getElementById('commandeVetementInput')?.value;
    const tissu = document.getElementById('commandeTissuInput')?.value;
    const prix_total = document.getElementById('commandePrixInput')?.value;
    const avance = id ? 0 : (document.getElementById('commandeAvanceInput')?.value || 0);
    const date_livraison = document.getElementById('commandeDateLivraison')?.value;

    try {
      if (!Store.estCompteActif()) {
        this.afficherModalEssaiExpire(id ? "modifier cette commande" : "créer une nouvelle commande");
        return;
      }
      const commandeSauvee = await Store.saveCommande({
        id,
        client_id,
        vetement,
        tissu,
        prix_total,
        date_livraison
      }, avance);

      document.getElementById('modalNouvelleCommande')?.classList.remove('active');
      this.showToast(id ? "Commande modifiée avec succès ✓" : "Commande enregistrée avec succès ✓");

      // Si on était en train de regarder le détail de cette commande, actualiser sa fiche
      if (id) {
        this.ouvrirDetailCommande(id);
      }

      this.renderCommandes();
      this.renderAccueil();
      this.renderFinances();
    } catch (err) {
      if (err.message?.includes('ESSAI_EXPIRE')) {
        this.afficherModalEssaiExpire(id ? "modifier cette commande" : "créer une nouvelle commande");
      } else {
        alert("Erreur lors de l'enregistrement de la commande : " + err.message);
      }
    }
  },

  editerCommande(commandeId) {
    if (!Store.estCompteActif()) {
      this.afficherModalEssaiExpire("modifier cette commande");
      return;
    }
    document.getElementById('modalDetailCommande')?.classList.remove('active');
    this.ouvrirModalNouvelleCommande(commandeId);
  },

  async supprimerCommande(commandeId) {
    if (!Store.estCompteActif()) {
      this.afficherModalEssaiExpire("supprimer cette commande");
      return;
    }

    const cmd = Store.getCommandeParId(commandeId);
    if (!cmd) return;

    const client = Store.getClientParId(cmd.client_id);
    const nomClient = client ? client.nom : 'ce client';

    if (!confirm(`Supprimer définitivement la commande de "${cmd.vetement}" pour ${nomClient} ?\n\nCette action supprimera également tous les versements associés.`)) {
      return;
    }

    try {
      await Store.deleteCommande(commandeId);
      document.getElementById('modalDetailCommande')?.classList.remove('active');
      this.showToast("Commande supprimée avec succès ✓");
      this.renderCommandes();
      this.renderAccueil();
      this.renderFinances();
    } catch (err) {
      if (err.message?.includes('ESSAI_EXPIRE')) {
        this.afficherModalEssaiExpire("supprimer cette commande");
      } else {
        alert("Erreur lors de la suppression de la commande : " + err.message);
      }
    }
  },

  ouvrirDetailCommande(commandeId) {
    const cmd = Store.getCommandeParId(commandeId);
    if (!cmd) return;

    const client = Store.getClientParId(cmd.client_id);
    const modal = document.getElementById('modalDetailCommande');

    const clientNameEl = document.getElementById('detailCmdClient');
    const vetementEl = document.getElementById('detailCmdVetement');
    const tissuEl = document.getElementById('detailCmdTissu');
    const prixTotalEl = document.getElementById('detailCmdPrixTotal');
    const dateEl = document.getElementById('detailCmdDate');
    const payeEl = document.getElementById('detailCmdPaye');
    const resteEl = document.getElementById('detailCmdReste');
    const statutSelect = document.getElementById('detailCmdStatut');
    const btnPretWA = document.getElementById('btnCommandePreteWA');
    const btnModifier = document.getElementById('btnModifierCommandeDetail');
    const btnSupprimer = document.getElementById('btnSupprimerCommandeDetail');
    const btnAjouterPaiement = document.getElementById('btnOuvrirAjoutPaiement');
    const btnVoirMesures = document.getElementById('btnVoirMesuresClientCmd');

    if (clientNameEl) clientNameEl.textContent = client ? client.nom : 'Client inconnu';
    if (vetementEl) vetementEl.textContent = cmd.vetement;
    if (tissuEl) tissuEl.textContent = cmd.tissu || 'Tissu non précisé';
    if (prixTotalEl) prixTotalEl.textContent = formaterFCFA(cmd.prix_total);
    if (dateEl) dateEl.textContent = formaterDateFr(cmd.date_livraison);

    const paye = Store.getTotalPayePourCommande(cmd.id);
    const reste = Store.getResteDuPourCommande(cmd.id);
    if (payeEl) payeEl.textContent = formaterFCFA(paye);
    if (resteEl) resteEl.textContent = reste > 0 ? formaterFCFA(reste) : 'Soldé ✓';

    if (statutSelect) {
      statutSelect.value = cmd.statut;
      statutSelect.onchange = async () => {
        if (!Store.estCompteActif()) {
          statutSelect.value = cmd.statut; // Rétablir le statut précédent
          App.afficherModalEssaiExpire("modifier le statut de confection d'une commande");
          return;
        }
        try {
          await Store.updateStatutCommande(cmd.id, statutSelect.value);
          App.showToast("Statut mis à jour ✓");
          App.renderCommandes();
          App.renderAccueil();
        } catch (err) {
          statutSelect.value = cmd.statut;
          if (err.message?.includes('ESSAI_EXPIRE')) {
            App.afficherModalEssaiExpire("modifier le statut de confection d'une commande");
          } else {
            alert("Erreur lors de la mise à jour du statut : " + err.message);
          }
        }
      };
    }

    // Message WhatsApp commande prête
    if (btnPretWA) {
      const profil = Store.cache.profil;
      const atelier = profil?.atelier || 'notre atelier';
      const msg = encodeURIComponent(`Bonjour ${client ? client.nom : ''}, votre commande (${cmd.vetement}) est prête à l'atelier ${atelier} ! Vous pouvez passer la récupérer dès que vous le souhaitez.`);
      btnPretWA.href = client?.telephone ? `https://wa.me/${extraireChiffres(client.telephone)}?text=${msg}` : '#';
    }

    // Action Modifier la commande
    if (btnModifier) {
      btnModifier.onclick = () => this.editerCommande(cmd.id);
    }

    // Action Supprimer la commande
    if (btnSupprimer) {
      btnSupprimer.onclick = () => this.supprimerCommande(cmd.id);
    }

    // Action Encaisser un versement (Nouvelle vraie fenêtre de paiement)
    if (btnAjouterPaiement) {
      btnAjouterPaiement.onclick = () => this.ouvrirModalAjoutPaiement(cmd.id);
    }

    // Action Générer / Imprimer le reçu officiel
    const btnOuvrirRecu = document.getElementById('btnOuvrirRecuCommande');
    if (btnOuvrirRecu) {
      btnOuvrirRecu.onclick = () => this.ouvrirModalRecu(cmd.id);
    }

    // Action Voir mesures du client
    if (btnVoirMesures) {
      btnVoirMesures.onclick = () => {
        if (cmd.client_id) {
          modal?.classList.remove('active');
          this.ouvrirFicheClient(cmd.client_id);
        } else {
          alert("Aucun client associé à cette commande.");
        }
      };
    }

    modal?.classList.add('active');
  },

  /* ==========================================================================
     7. FENÊTRE DE PAIEMENT & ENCAISSEMENT D'ACOMPTE
     ========================================================================== */
  ouvrirModalAjoutPaiement(commandeId) {
    if (!Store.estCompteActif()) {
      this.afficherModalEssaiExpire("enregistrer des versements d'acompte");
      return;
    }

    const cmd = Store.getCommandeParId(commandeId);
    if (!cmd) return;

    const client = Store.getClientParId(cmd.client_id);
    const modal = document.getElementById('modalAjoutPaiement');
    const idInput = document.getElementById('paiementCommandeId');
    const vetementEl = document.getElementById('paiementCmdVetement');
    const clientEl = document.getElementById('paiementCmdClient');
    const prixTotalEl = document.getElementById('paiementPrixTotal');
    const dejaPayeEl = document.getElementById('paiementDejaPaye');
    const resteDuEl = document.getElementById('paiementResteDu');
    const montantInput = document.getElementById('paiementMontantInput');
    const apercuNouveauSolde = document.getElementById('paiementNouveauSoldeValeur');

    const paye = Store.getTotalPayePourCommande(cmd.id);
    const reste = Store.getResteDuPourCommande(cmd.id);

    if (reste <= 0) {
      alert("Cette commande est déjà intégralement payée (Soldé ✓).");
      return;
    }

    if (idInput) idInput.value = cmd.id;
    if (vetementEl) vetementEl.textContent = cmd.vetement;
    if (clientEl) clientEl.textContent = client ? client.nom : 'Client inconnu';
    if (prixTotalEl) prixTotalEl.textContent = formaterFCFA(cmd.prix_total);
    if (dejaPayeEl) dejaPayeEl.textContent = formaterFCFA(paye);
    if (resteDuEl) resteDuEl.textContent = formaterFCFA(reste);

    if (montantInput) {
      montantInput.value = '';
      montantInput.placeholder = `Montant (max: ${reste} F)`;
      
      // Calcul automatique et instantané du nouveau solde au fur et à mesure de la saisie
      montantInput.oninput = () => {
        const montantSaisi = Number(montantInput.value) || 0;
        const nouveauReste = reste - montantSaisi;

        if (montantSaisi <= 0) {
          apercuNouveauSolde.innerHTML = `<span style="color:#FFF;">${formaterFCFA(reste)}</span>`;
        } else if (nouveauReste <= 0) {
          apercuNouveauSolde.innerHTML = `<span style="color:#4ADE80; font-weight:800;">0 FCFA (Entièrement soldé 🎉)</span>`;
        } else {
          apercuNouveauSolde.innerHTML = `<span style="color:#F87171; font-weight:800;">${formaterFCFA(nouveauReste)} restant</span>`;
        }
      };
      
      // Initialisation aperçu
      montantInput.oninput();
    }

    modal?.classList.add('active');
  },

  remplirMontantPaiement(valeur) {
    const montantInput = document.getElementById('paiementMontantInput');
    const cmdId = document.getElementById('paiementCommandeId')?.value;
    if (!montantInput || !cmdId) return;

    if (valeur === 'solde') {
      const reste = Store.getResteDuPourCommande(cmdId);
      montantInput.value = reste;
    } else {
      montantInput.value = valeur;
    }

    montantInput.dispatchEvent(new Event('input'));
    montantInput.focus();
  },

  async soumettreAjoutPaiement(e) {
    e.preventDefault();
    const cmdId = document.getElementById('paiementCommandeId')?.value;
    const montantInput = document.getElementById('paiementMontantInput');
    const montant = Number(montantInput?.value) || 0;

    if (!cmdId) return;

    if (montant <= 0) {
      alert("Veuillez saisir un montant valide supérieur à 0 FCFA.");
      montantInput?.focus();
      return;
    }

    try {
      if (!Store.estCompteActif()) {
        this.afficherModalEssaiExpire("enregistrer des versements d'acompte");
        return;
      }
      await Store.savePaiement(cmdId, montant);
      document.getElementById('modalAjoutPaiement')?.classList.remove('active');
      this.showToast(`Versement de ${formaterFCFA(montant)} enregistré avec succès ✓`);

      // Actualiser la vue détail de la commande avec le nouveau solde immédiat
      this.ouvrirDetailCommande(cmdId);

      // Actualiser les listes et compteurs
      this.renderCommandes();
      this.renderAccueil();
      this.renderFinances();
    } catch (err) {
      if (err.message?.includes('ESSAI_EXPIRE')) {
        this.afficherModalEssaiExpire("enregistrer des versements d'acompte");
      } else {
        alert("Erreur lors de l'enregistrement du paiement : " + err.message);
      }
    }
  },

  /* ==========================================================================
     8. GESTION DES DÉPENSES D'ATELIER
     ========================================================================== */
  ouvrirModalNouvelleDepense() {
    if (!Store.estCompteActif()) {
      this.afficherModalEssaiExpire("noter une nouvelle dépense d'atelier");
      return;
    }
    document.getElementById('actionSheetOverlay')?.classList.remove('active');
    const modal = document.getElementById('modalNouvelleDepense');
    const form = document.getElementById('formNouvelleDepense');
    const dateInput = document.getElementById('depenseDateInput');
    
    if (form) form.reset();
    if (dateInput) {
      dateInput.value = new Date().toISOString().split('T')[0];
    }
    modal?.classList.add('active');
  },

  async soumettreNouvelleDepense(e) {
    e.preventDefault();
    const montantInput = document.getElementById('depenseMontantInput');
    const categorieSelect = document.getElementById('depenseCategorieSelect');
    const noteInput = document.getElementById('depenseNoteInput');
    const dateInput = document.getElementById('depenseDateInput');

    const montant = Number(montantInput?.value) || 0;
    const categorie = categorieSelect?.value || 'Autre dépense';
    const note = noteInput?.value || '';
    const date = dateInput?.value || new Date().toISOString().split('T')[0];

    if (montant <= 0) {
      alert("Veuillez saisir un montant valide supérieur à 0 FCFA.");
      montantInput?.focus();
      return;
    }

    try {
      if (!Store.estCompteActif()) {
        this.afficherModalEssaiExpire("noter une nouvelle dépense d'atelier");
        return;
      }
      await Store.saveDepense({ montant, categorie, note, date });
      document.getElementById('modalNouvelleDepense')?.classList.remove('active');
      this.showToast(`Dépense de ${formaterFCFA(montant)} enregistrée avec succès ✓`);
      this.renderFinances();
      this.renderAccueil();
    } catch (err) {
      if (err.message?.includes('ESSAI_EXPIRE')) {
        this.afficherModalEssaiExpire("noter une nouvelle dépense d'atelier");
      } else {
        alert("Erreur lors de l'enregistrement de la dépense : " + err.message);
      }
    }
  },

  async supprimerDepense(depenseId) {
    if (!Store.estCompteActif()) {
      this.afficherModalEssaiExpire("supprimer cette dépense");
      return;
    }

    if (!confirm("Voulez-vous vraiment supprimer cette dépense de l'historique ?")) {
      return;
    }

    try {
      await Store.deleteDepense(depenseId);
      this.showToast("Dépense supprimée avec succès ✓");
      this.renderFinances();
      this.renderAccueil();
    } catch (err) {
      if (err.message?.includes('ESSAI_EXPIRE')) {
        this.afficherModalEssaiExpire("supprimer cette dépense");
      } else {
        alert("Erreur lors de la suppression de la dépense : " + err.message);
      }
    }
  },

  /* ==========================================================================
     9. GÉNÉRATEUR DE REÇU DE CONFECTION (WHATSAPP & IMPRIMABLE)
     ========================================================================== */
  texteDernierRecu: '',

  ouvrirModalRecu(commandeId) {
    const cmd = Store.getCommandeParId(commandeId);
    if (!cmd) return;

    const client = Store.getClientParId(cmd.client_id);
    const profil = Store.cache.profil;
    const modal = document.getElementById('modalRecuCommande');

    const paye = Store.getTotalPayePourCommande(cmd.id);
    const reste = Store.getResteDuPourCommande(cmd.id);

    const atelierNom = this.formaterNomAtelierAffichage(profil);
    const atelierVille = profil?.ville ? ` · ${profil.ville}` : '';
    const atelierContact = profil?.telephone ? `Tél : ${profil.telephone}` : 'Atelier Haute Couture';
    const codeTicket = 'CMD-' + (cmd.id ? cmd.id.substring(0, 8).toUpperCase() : '000000');
    const dateJour = formaterDateFr(new Date().toISOString().split('T')[0]);

    // Remplissage facture officielle
    const elTicketRef = document.getElementById('recuNumeroTicket');
    const elBadgePaiement = document.getElementById('recuStatutPaiementBadge');
    const elAtelierNom = document.getElementById('recuNomAtelier');
    const elAtelierContact = document.getElementById('recuAtelierContact');
    const elDateEmission = document.getElementById('recuDateEmission');
    const elNomClient = document.getElementById('recuNomClient');
    const elTelClient = document.getElementById('recuTelClient');
    const elVetement = document.getElementById('recuVetement');
    const elTissu = document.getElementById('recuTissu');
    const elDateLivraison = document.getElementById('recuDateLivraison');
    const elStatut = document.getElementById('recuStatut');
    const elPrixTotal = document.getElementById('recuPrixTotal');
    const elDejaPaye = document.getElementById('recuDejaPaye');
    const elResteDu = document.getElementById('recuResteDu');
    const btnWA = document.getElementById('btnPartagerRecuWA');

    if (elTicketRef) elTicketRef.textContent = `N° ${codeTicket}`;
    if (elBadgePaiement) {
      elBadgePaiement.classList.remove('is-paid', 'is-partial', 'is-unpaid');
      if (reste <= 0) {
        elBadgePaiement.textContent = 'SOLDÉ';
        elBadgePaiement.classList.add('is-paid');
      } else if (paye > 0) {
        elBadgePaiement.textContent = 'ACOMPTE REÇU';
        elBadgePaiement.classList.add('is-partial');
      } else {
        elBadgePaiement.textContent = 'À RÉGLER';
        elBadgePaiement.classList.add('is-unpaid');
      }
    }
    if (elAtelierNom) elAtelierNom.textContent = atelierNom;
    if (elAtelierContact) elAtelierContact.textContent = `${atelierContact}${atelierVille}`;
    if (elDateEmission) elDateEmission.textContent = `Émise le : ${dateJour}`;
    if (elNomClient) elNomClient.textContent = client ? client.nom : 'Client inconnu';
    if (elTelClient) elTelClient.textContent = client?.telephone || 'Non renseigné';
    if (elVetement) elVetement.textContent = cmd.vetement;
    if (elTissu) elTissu.textContent = cmd.tissu || 'Tissu fourni par le client';
    if (elDateLivraison) elDateLivraison.textContent = formaterDateFr(cmd.date_livraison);
    if (elStatut) elStatut.textContent = cmd.statut.replace('_', ' ').toUpperCase();
    if (elPrixTotal) elPrixTotal.textContent = formaterFCFA(cmd.prix_total);
    if (elDejaPaye) elDejaPaye.textContent = formaterFCFA(paye);
    if (elResteDu) {
      if (reste <= 0) {
        elResteDu.textContent = "0 FCFA (Entièrement soldé ✓)";
        elResteDu.style.color = "#4ADE80";
      } else {
        elResteDu.textContent = formaterFCFA(reste);
        elResteDu.style.color = "#F87171";
      }
    }

    // Préparation texte WhatsApp professionnel avec signature Tailleur Pro
    const soldeLigne = reste > 0
      ? `⚠️ *Reste à régler :* ${formaterFCFA(reste)}`
      : `✅ *Statut paiement :* Entièrement soldé (0 FCFA)`;

    this.texteDernierRecu =
`🧾 *FACTURE OFFICIELLE DE CONFECTION*
🏢 *${atelierNom.toUpperCase()}*${atelierVille ? ` (${profil.ville})` : ''}
${profil?.telephone ? `📞 ${profil.telephone}\n` : ''}────────────────────────
📅 *Émise le :* ${dateJour}
🔢 *Référence :* ${codeTicket}

👤 *Client :* ${client ? client.nom : 'Cher client'}
👗 *Modèle :* ${cmd.vetement}
🧵 *Tissu :* ${cmd.tissu || 'Fourni par le client'}
🗓️ *Livraison promise :* ${formaterDateFr(cmd.date_livraison)}
────────────────────────
💰 *Montant total :* ${formaterFCFA(cmd.prix_total)}
💵 *Acompte versé :* ${formaterFCFA(paye)}
${soldeLigne}
────────────────────────
✨ _Merci de votre confiance ! Confection sur-mesure garantie._
✂️ _Facture générée avec *Tailleur Pro* — l'application des ateliers de couture_`;

    if (btnWA) {
      if (client?.telephone) {
        btnWA.href = `https://wa.me/${extraireChiffres(client.telephone)}?text=${encodeURIComponent(this.texteDernierRecu)}`;
        btnWA.style.display = 'flex';
      } else {
        btnWA.href = `https://wa.me/?text=${encodeURIComponent(this.texteDernierRecu)}`;
        btnWA.style.display = 'flex';
      }
    }

    modal?.classList.add('active');
  },

  async copierRecuTexte() {
    if (!this.texteDernierRecu) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(this.texteDernierRecu);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = this.texteDernierRecu;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      this.showToast("Reçu copié dans le presse-papier ✓ (prêt à coller)");
    } catch (e) {
      alert("Impossible de copier automatiquement : " + e.message);
    }
  },

  imprimerRecu() {
    window.print();
  },

  /**
   * Affichage d'un toast informatif discret
   */
  showToast(message) {
    const toast = document.getElementById('globalToast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('active');
    setTimeout(() => toast.classList.remove('active'), 2500);
  }
};
