/**
 * TAILLEUR PRO — INTERNATIONALISATION (FR / EN)
 * ==============================================
 * Gère le basculement Français / Anglais sur la landing page,
 * l'authentification, le paiement et le tableau de bord.
 */

(function (global) {
  const STORAGE_KEY = 'tailleurpro_lang';

  const PHRASES_FR_EN = {
    // Navigation & Landing Header
    'Accueil': 'Home',
    'Fonctionnalités': 'Features',
    'Comment ça marche': 'How it works',
    'Tarifs': 'Pricing',
    'Connexion': 'Sign in',
    'Commencer': 'Get started',
    'Commencer gratuitement': 'Start for free',
    'Tableau de bord': 'Dashboard',

    // Landing Hero
    'Votre atelier.': 'Your workshop.',
    'Mieux organisé.': 'Better organized.',
    'Clients, commandes, mesures et paiements. Gérez tout simplement avec Tailleur Pro.': 'Clients, orders, measurements and payments. Manage everything effortlessly with Tailleur Pro.',
    'Découvrir': 'Explore',
    '15 jours offerts · Sans carte bancaire': '15 days free · No bank card required',

    // Landing Aperçu / Features
    'Aperçu': 'Preview',
    'Clair. Rapide. Sans superflu.': 'Clear. Fast. No clutter.',
    "Tout votre carnet d'atelier tient dans une seule interface fluide.": 'Your entire workshop notebook fits into one clean, fast interface.',
    'Atelier Élégance': 'Elegance Atelier',
    'Clients': 'Clients',
    'Commandes': 'Orders',
    'Mesures': 'Measurements',
    'Paiements': 'Payments',
    'Dépenses': 'Expenses',
    'Activité': 'Activity',
    'Tout ce dont un atelier a besoin.': 'Everything a tailoring workshop needs.',
    'Chaque outil utile au quotidien, sans surcharge.': 'Every daily tool you need, without overload.',
    'Fiches complètes, historiques et recherche instantanée.': 'Complete profiles, order history and instant search.',
    'Tissu, date promise et statut : de Reçue à Livrée.': 'Fabric, due date and status: from Received to Delivered.',
    'Poitrine, épaules, taille et longueurs sauvegardées.': 'Chest, shoulders, waist and custom lengths saved.',
    'Avances perçues et reste dû calculé automatiquement.': 'Deposits collected and balance due calculated automatically.',
    'Achats de tissus, fournitures et frais mensuels suivis.': 'Fabric purchases, supplies and monthly expenses tracked.',
    "Livraisons de la semaine et recettes en un coup d'œil.": 'Weekly deliveries and revenue at a glance.',

    // Landing Savoir-faire
    'Savoir-faire': 'Craftsmanship',
    'Moins de gestion. Plus de couture.': 'Less admin. More sewing.',
    'Retrouvez instantanément chaque fiche mesure.': 'Find every client measurement sheet in one second.',
    'Anticipez vos livraisons de la semaine.': 'Stay ahead of every delivery this week.',
    'Suivez vos avances et soldes sans erreur.': 'Track deposits and remaining balances with zero errors.',

    // Landing Steps
    'Trois étapes simples.': 'Three simple steps.',
    'Créez votre compte': 'Create your account',
    "15 jours d'essai gratuit immédiat, sans carte bancaire.": 'Instant 15-day free trial, no bank card required.',
    'Ajoutez vos commandes': 'Add your orders',
    'Enregistrez mesures, tissus, dates et avances.': 'Save measurements, fabrics, dates and deposits.',
    'Suivez votre activité': 'Track your business',
    'Visualisez vos livraisons et paiements en direct.': 'See upcoming deliveries and payments in real time.',

    // Landing Pricing
    'Tarifs & Paiement': 'Pricing & Payment',
    'Rentabilisé dès la première commande.': 'Pays for itself from the very first order.',
    'Essayez Tailleur Pro gratuitement pendant 15 jours, sans carte bancaire ni engagement.': 'Try Tailleur Pro free for 15 days, no bank card or commitment required.',
    '15 jours 100 % gratuits': '15 days 100% free',
    'Activation en 30 sec': 'Ready in 30 sec',
    'Sans reconduction cachée': 'No hidden auto-billing',
    'Indépendant': 'Independent',
    "L'essentiel pour travailler vite, sans carnet perdu.": 'Everything to work fast, with no lost notebook.',
    '/ mois': '/ month',
    'Clients et mesures libres illimités': 'Unlimited clients & custom measurements',
    'Commandes, statuts et dates de livraison': 'Orders, statuses and delivery dates',
    'Acomptes, restes dus et reçus WhatsApp': 'Deposits, balances & WhatsApp receipts',
    'Suivi des dépenses de tissus et atelier': 'Fabric & workshop expense tracking',
    'Données sauvegardées et accessibles partout': 'Backed up and accessible anywhere',
    'Essayer Solo gratuitement': 'Try Solo for free',
    'Recommandé': 'Recommended',
    'Maîtrisez vos délais, recettes et recouvrements.': 'Master your deadlines, income and debt follow-ups.',
    'Soit moins de 175 FCFA / jour pour tout sécuriser': 'Under 175 FCFA / day to secure everything',
    'Tout le forfait Solo en illimité': 'Everything in Solo unlimited',
    'Alertes prioritaires retards et livraisons': 'Priority late & delivery alerts',
    'Bilan financier net : recettes et charges': 'Net financial summary: income & costs',
    'Relance des dettes clients en 1 clic WhatsApp': '1-click WhatsApp customer debt reminders',
    'Export complet de sauvegarde & support prioritaire': 'Full backup export & priority support',
    'Démarrer 15 jours offerts →': 'Start 15 free days →',
    'Paiement simple par Mobile Money ou Carte bancaire': 'Easy payment via Mobile Money or Bank Card',
    "Paiement 100 % sécurisé au moment où vous décidez de passer Pro. Aucune avance demandée à l'inscription.": '100% secure payment only when you choose Pro. Nothing charged at signup.',

    // Landing FAQ & CTA
    'Questions fréquentes.': 'Frequently asked questions.',
    "Comment marche l'essai gratuit de 15 jours ?": 'How does the 15-day free trial work?',
    'Vous accédez librement à Tailleur Pro pendant 15 jours dès votre inscription, sans carte bancaire.': 'You get full access to Tailleur Pro for 15 days right after signup, no card required.',
    'Comment activer un abonnement ensuite ?': 'How do I subscribe afterwards?',
    'Depuis votre espace Abonnement, réglez votre formule Solo (2 600 FCFA/mois) ou Atelier (5 100 FCFA/mois) par Mobile Money ou carte.': 'From your Subscription page, pay for Solo (2,600 FCFA/mo) or Atelier (5,100 FCFA/mo) via Mobile Money or card.',
    'Mes données sont-elles conservées après expiration ?': 'Is my data kept if my trial expires?',
    'Oui. Vos fiches clients, mesures et commandes restent sauvegardées et accessibles dès le renouvellement.': 'Yes. Your client files, measurements and orders stay saved and accessible as soon as you renew.',
    'Accès directs :': 'Quick links:',
    'Mot de passe': 'Password',
    'Abonnement': 'Subscription',

    // Dashboard Accueil & Tabs
    'Essai terminé': 'Trial ended',
    'Activez votre accès depuis les réglages pour continuer': 'Activate your plan in Settings to continue',
    'Activer': 'Activate',
    'Inscription réussie': 'Signup successful',
    "Bienvenue dans votre atelier. Vos 15 jours d'essai gratuit sont activés.": 'Welcome to your workshop. Your 15-day free trial is active.',
    'Voir →': 'View →',
    'Commandes en cours': 'Active orders',
    'Planifiées →': 'Scheduled →',
    'À livrer cette semaine': 'Due this week',
    'Dettes →': 'Debts →',
    'Argent à encaisser': 'Amount to collect',
    'Bilan →': 'Summary →',
    'Gagné ce mois': 'Earned this month',
    'Actions rapides': 'Quick actions',
    'Commande': 'Order',
    'Client': 'Client',
    'Acompte': 'Deposit',
    'Dernières commandes': 'Latest orders',
    'Voir tout →': 'View all →',
    'Mes clients': 'My clients',
    '+ Nouveau': '+ New',
    '+ Commande': '+ Order',
    'Toutes': 'All',
    'En cours': 'In progress',
    'À livrer': 'Due soon',
    'Impayées': 'Unpaid',
    'Livrées': 'Delivered',
    "Finances de l'Atelier": 'Workshop Finances',
    '+ Dépense': '+ Expense',
    'Encaissé ce mois': 'Collected this month',
    "Chiffre d'affaires ↑": 'Revenue ↑',
    'Dépenses ce mois': 'Expenses this month',
    'Achats & Charges': 'Supplies & Costs',
    'Bénéfice net du mois': 'Monthly net profit',
    'Gain réel en poche': 'Actual profit',
    'Reste à encaisser': 'Remaining balance',
    'Dettes & Acomptes': 'Debts & Deposits',
    "Dépenses de l'Atelier": 'Workshop Expenses',
    '+ Ajouter': '+ Add',
    'Activité Hebdomadaire': 'Weekly Activity',
    'Commandes livrées': 'Delivered orders',
    'Qui me doit de l\'argent ?': 'Who owes me money?',
    'Lun': 'Mon',
    'Mar': 'Tue',
    'Mer': 'Wed',
    'Jeu': 'Thu',
    'Ven': 'Fri',
    'Sam': 'Sat',
    'Dim': 'Sun',
    'Finances': 'Finances',
    'Réglages': 'Settings',

    // Paramètres / Settings
    'Paramètre': 'Setting',
    'Votre prénom ou nom *': 'Your first or full name *',
    "Ville d'exercice": 'City',
    'Pays / Indicatif par défaut': 'Default Country / Dial Code',
    'E-mail de récupération (facultatif)': 'Recovery email (optional)',
    'Enregistrer le profil': 'Save profile',
    "Nom personnalisé de l'atelier": 'Custom workshop name',
    "Mettre à jour l'atelier": 'Update workshop',
    "Conditions d'utilisation": 'Terms of use',
    'Politique de confidentialité': 'Privacy policy',
    'Se déconnecter': 'Sign out',

    // Client modal & labels
    'Nouveau Client': 'New Client',
    'Nom complet du client *': 'Client full name *',
    'Numéro WhatsApp / Téléphone': 'WhatsApp / Phone number',
    'Enregistrer': 'Save',
    'Annuler': 'Cancel',

    // Auth & Subscription pages
    'Créer mon compte': 'Create my account',
    '15 jours d\'essai gratuit · Sans carte bancaire': '15-day free trial · No bank card required',
    'Votre Prénom ou Nom d\'atelier': 'Your Name or Workshop Name',
    'Pays': 'Country',
    'Votre Pays': 'Your Country',
    'Numéro de téléphone': 'Phone number',
    'Mot de passe (8 caractères minimum)': 'Password (min 8 characters)',
    'Connexion à votre atelier': 'Sign in to your workshop',
    'Accédez à vos commandes et fiches clients': 'Access your orders and client files',
    'Mot de passe oublié ?': 'Forgot password?',
    'Se connecter': 'Sign in',
    '← Retour à l\'accueil': '← Back to home',
    '← Retour au tableau de bord': '← Back to dashboard',
    'Sécurisez votre atelier en 30 secondes': 'Secure your workshop in 30 seconds',
    'Choisir Solo →': 'Choose Solo →',
    'Choisir Atelier →': 'Choose Atelier →',
  };

  const PLACEHOLDERS_FR_EN = {
    'Rechercher un nom ou numéro...': 'Search a name or number...',
    'Ex: Mme Aïssatou Diallo': 'E.g.: Ms. Aissatou Diallo',
    'Ex: Moussa': 'E.g.: Moussa',
    'Ex: Dakar, Douala, Abidjan...': 'E.g.: Douala, Abidjan, Dakar...',
    'Ex: Ousmane ou Atelier Élégance': 'E.g.: Ousmane or Elegance Atelier',
    'Laissez vide pour « Atelier de [Votre nom] »': 'Leave blank for « [Your name] Workshop »',
  };

  const SELECTORS_TEXT = [
    '.site-header .nav-link',
    '.mobile-nav-link',
    '.header-actions a',
    '.mobile-nav-actions a',
    '.hero-title-static',
    '.hero-animated-phrase',
    '.hero-subtitle',
    '.hero-actions a span',
    '.hero-reassurance',
    '.section-eyebrow',
    '.tp-section-header h2',
    '.tp-section-header p',
    '.feature-item-text h3',
    '.feature-item-text p',
    '.craft-editorial-copy h2',
    '.craft-points li',
    '.step-card h3',
    '.step-card p',
    '.pricing-value-chip',
    '.plan-tag',
    '.pricing-card-sub',
    '.pricing-period',
    '.pricing-daily-note',
    '.pricing-list li',
    '.pricing-card-actions a',
    '.pricing-trust-head span',
    '.pricing-trust-note',
    '.faq-question span',
    '.faq-answer',
    '.assistance-strip > span',
    '.assistance-links-row a',
    '.trial-main-title #trialDaysText',
    '.trial-sub-text',
    '.trial-cta-btn',
    '.welcome-toast-title',
    '.welcome-toast-sub',
    '.stat-corner-chip',
    '.stat-widget-title',
    '.section-title-label',
    '.quick-pill-card span:last-child',
    '.section-link-action',
    '.tab-section-title',
    '.tab-header-cta',
    '#tabSection_commandes h2',
    '#tabSection_commandes > div:first-child button',
    '.filter-pill',
    '#tabSection_finances h2',
    '#tabSection_finances > div:first-child button',
    '#tabSection_finances .stat-card-widget span',
    '#tabSection_finances .chart-bar-label',
    '.settings-back-btn span',
    '.settings-subpage-title',
    '.settings-subpage-panel .modal-field-label',
    '.settings-save-btn',
    '.settings-legal-link span:first-child',
    '.drawer-logout-btn span',
    '.bottom-nav-container .nav-tab-item span',
    '#modalNouveauClient .modal-header-title',
    '#modalNouveauClient .modal-field-label',
    '.auth-title',
    '.auth-subtitle',
    '.form-label',
    '#btnText',
    '.auth-footer-links a',
    '.abo-title',
    '#btnPayerSolo',
    '#btnPayerAtelier',
  ];

  function get() {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'fr';
    } catch (e) {
      return 'fr';
    }
  }

  function isEn() {
    return get() === 'en';
  }

  function t(fr, en) {
    return isEn() ? (en || fr) : fr;
  }

  function traduireTexteBrut(frText, lang) {
    const clean = frText.replace(/\s+/g, ' ').trim();
    if (!clean) return frText;
    if (lang === 'en' && PHRASES_FR_EN[clean]) {
      return PHRASES_FR_EN[clean];
    }
    return frText;
  }

  function applyTranslations() {
    const lang = get();
    document.documentElement.lang = lang;

    // 1. Mise à jour des boutons de bascule FR | EN
    document.querySelectorAll('.lang-toggle-btn').forEach((btn) => {
      btn.setAttribute('aria-label', lang === 'en' ? 'Switch language to French' : 'Changer la langue en anglais');
      btn.querySelectorAll('[data-lang-choice]').forEach((chip) => {
        chip.classList.toggle('active', chip.getAttribute('data-lang-choice') === lang);
      });
    });

    // 2. Attributs explicites data-i18n
    document.querySelectorAll('[data-fr][data-en]').forEach((el) => {
      el.textContent = lang === 'en' ? el.getAttribute('data-en') : el.getAttribute('data-fr');
    });

    // 3. Sélecteurs connus (préserve exactement le texte FR original)
    SELECTORS_TEXT.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        if (el.children.length > 0 && selector.indexOf('span') === -1 && selector.indexOf('li') === -1) {
          // Ne pas écraser un conteneur contenant des SVG ou balises enfants sauf texte simple
          const hasOnlyTextOrSimple = Array.from(el.childNodes).every(
            (n) => n.nodeType === Node.TEXT_NODE || n.tagName === 'SVG' || n.tagName === 'svg'
          );
          if (!hasOnlyTextOrSimple) return;
        }
        if (el.dataset.tpOrigFr === undefined) {
          const textNode = Array.from(el.childNodes).find((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
          el.dataset.tpOrigFr = textNode ? textNode.textContent : el.textContent;
        }
        const orig = el.dataset.tpOrigFr;
        const nextText = lang === 'en' ? traduireTexteBrut(orig, 'en') : orig;
        const textNode = Array.from(el.childNodes).find((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
        if (textNode && el.children.length > 0) {
          textNode.textContent = nextText;
        } else if (el.children.length === 0) {
          el.textContent = nextText;
        }
      });
    });

    // 4. Placeholders courants
    document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach((inp) => {
      if (inp.dataset.tpOrigPlaceholder === undefined) {
        inp.dataset.tpOrigPlaceholder = inp.getAttribute('placeholder') || '';
      }
      const origPh = inp.dataset.tpOrigPlaceholder;
      inp.setAttribute('placeholder', lang === 'en' ? (PLACEHOLDERS_FR_EN[origPh] || origPh) : origPh);
    });

    // 5. Rafraîchir les sélecteurs de pays marqués [data-pays-format]
    if (typeof global.remplirSelectPays === 'function') {
      document.querySelectorAll('select[data-pays-format]').forEach((sel) => {
        const format = sel.getAttribute('data-pays-format') || 'complet';
        const val = sel.value;
        global.remplirSelectPays(sel, format, val);
      });
    }
  }

  function set(lang) {
    const cleanLang = lang === 'en' ? 'en' : 'fr';
    try {
      localStorage.setItem(STORAGE_KEY, cleanLang);
    } catch (e) {}
    applyTranslations();
    try {
      global.dispatchEvent(new CustomEvent('tailleurpro:langchange', { detail: { lang: cleanLang } }));
    } catch (e) {}
    return cleanLang;
  }

  function toggle() {
    return set(isEn() ? 'fr' : 'en');
  }

  function init() {
    applyTranslations();
  }

  global.Lang = {
    get,
    isEn,
    t,
    set,
    toggle,
    init,
    applyTranslations,
  };
})(window);
