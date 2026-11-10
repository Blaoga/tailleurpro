/**
 * TAILLEUR PRO - MODULE D'AUTHENTIFICATION TÉLÉPHONIQUE
 * ====================================================
 * Étape 4 : Gestion des comptes sans email et sans SMS (Section 7)
 * - Inscription par numéro normalisé + mot de passe
 * - Connexion par numéro normalisé + mot de passe
 * - Déconnexion
 * - Garde de routes (redirection automatique)
 * - Déclenchement de l'onboarding de bienvenue
 */

const Auth = {
  /**
   * Vérifie si le client Supabase est correctement configuré
   */
  estConfigure() {
    return (
      typeof supabaseClient !== 'undefined' &&
      supabaseClient !== null &&
      CONFIG.SUPABASE_URL !== 'https://VOTRE_PROJET.supabase.co'
    );
  },

  /**
   * Récupère la session active de l'utilisateur
   */
  async obtenirSession() {
    if (!this.estConfigure()) {
      // Vérification secours locale
      try {
        const local = localStorage.getItem('tailleurpro_session_active');
        return local ? JSON.parse(local) : null;
      } catch (e) {
        return null;
      }
    }

    try {
      const { data: { session }, error } = await supabaseClient.auth.getSession();
      if (error) {
        console.warn('[Tailleur Pro Auth] Erreur getSession :', error);
        return null;
      }
      return session;
    } catch (e) {
      console.warn('[Tailleur Pro Auth] Exception getSession :', e);
      return null;
    }
  },

  /**
   * Inscription d'un nouveau tailleur (Section 7.3 & 7.4)
   * 15 jours d'essai gratuit générés automatiquement par le trigger Supabase.
   */
  async inscrire({ prenom, codePays, telephoneSaisi, motDePasse }) {
    if (!this.estConfigure()) {
      throw new Error(
        "Supabase n'est pas configuré. Veuillez renseigner votre SUPABASE_URL et SUPABASE_ANON_KEY dans js/config.js."
      );
    }

    // 1. Validation du prénom
    if (!prenom || prenom.trim().length < 2) {
      throw new Error("Veuillez saisir votre prénom ou nom d'atelier.");
    }

    // 2. Normalisation stricte du numéro
    const norm = normaliserTelephone(telephoneSaisi, codePays);
    if (!norm.valide) {
      throw new Error(norm.erreur);
    }

    // 3. Validation de la longueur du mot de passe (8 caractères minimum)
    if (!motDePasse || motDePasse.length < 8) {
      throw new Error("Le mot de passe doit comporter au moins 8 caractères.");
    }

    // 4. Fabrication de l'email interne invisible (Section 7.3)
    const emailInterne = fabriquerEmailInterne(norm.telephoneE164);

    try {
      const { data, error } = await supabaseClient.auth.signUp({
        email: emailInterne,
        password: motDePasse,
        options: {
          data: {
            prenom: prenom.trim(),
            telephone: norm.telephoneE164,
            pays: codePays
          }
        }
      });

      if (error) {
        // Détection de compte déjà existant
        const msg = error.message.toLowerCase();
        if (msg.includes('already registered') || msg.includes('user_already_exists') || msg.includes('duplicate')) {
          throw new Error("Ce numéro a déjà un compte. Connectez-vous avec votre mot de passe.");
        }
        throw new Error(this.traduireErreurSupabase(error.message));
      }

      // Si l'utilisateur est bien créé
      if (data?.user) {
        // Mémorisation du pays
        memoriserPaysActif(codePays);

        // Marqueur pour déclencher l'écran de bienvenue en 3 étapes sur app.html
        try {
          sessionStorage.setItem('tailleurpro_bienvenue_nouveau', 'true');
        } catch (e) {}

        return data;
      }

      throw new Error("Impossible de finaliser l'inscription. Veuillez réessayer.");
    } catch (err) {
      throw err;
    }
  },

  /**
   * Connexion d'un tailleur existant (Section 7.3 & 7.5)
   */
  async connecter({ codePays, telephoneSaisi, motDePasse }) {
    if (!this.estConfigure()) {
      throw new Error(
        "Supabase n'est pas configuré. Veuillez renseigner votre SUPABASE_URL et SUPABASE_ANON_KEY dans js/config.js."
      );
    }

    // 1. Normalisation stricte
    const norm = normaliserTelephone(telephoneSaisi, codePays);
    if (!norm.valide) {
      throw new Error(norm.erreur);
    }

    if (!motDePasse) {
      throw new Error("Veuillez saisir votre mot de passe.");
    }

    // 2. Email interne invisible
    const emailInterne = fabriquerEmailInterne(norm.telephoneE164);

    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: emailInterne,
        password: motDePasse
      });

      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes('invalid login credentials') || msg.includes('invalid_grant')) {
          throw new Error("Numéro ou mot de passe incorrect.");
        }
        throw new Error(this.traduireErreurSupabase(error.message));
      }

      // Mémoriser le pays choisi
      memoriserPaysActif(codePays);

      return data;
    } catch (err) {
      throw err;
    }
  },

  /**
   * Déconnexion du tailleur
   */
  async deconnecter() {
    try {
      if (this.estConfigure()) {
        await supabaseClient.auth.signOut();
      }
      localStorage.removeItem('tailleurpro_session_active');
      sessionStorage.clear();
    } catch (e) {
      console.warn('[Tailleur Pro Auth] Erreur signOut :', e);
    } finally {
      window.location.replace('connexion.html');
    }
  },

  /**
   * Garde de routes pour les pages protégées (app.html, abonnement.html)
   * Section 7.7
   */
  async protegerRoute() {
    const session = await this.obtenirSession();
    if (!session) {
      window.location.replace('connexion.html');
      return null;
    }
    return session;
  },

  /**
   * Redirige l'utilisateur vers le dashboard s'il a déjà une session active
   * Utilisé sur connexion.html et inscription.html
   */
  async redirigerSiConnecte() {
    const session = await this.obtenirSession();
    if (session) {
      window.location.replace('app.html');
    }
  },

  /**
   * Traduction des erreurs d'authentification en français limpide
   */
  traduireErreurSupabase(messageAnglais) {
    if (!messageAnglais) return "Une erreur s'est produite lors de l'authentification.";
    const m = messageAnglais.toLowerCase();

    if (m.includes('password should be at least')) {
      return "Le mot de passe doit comporter au moins 8 caractères.";
    }
    if (m.includes('rate limit')) {
      return "Trop de tentatives consécutives. Veuillez patienter 1 minute avant de réessayer.";
    }
    if (m.includes('network') || m.includes('fetch')) {
      return "Erreur de connexion. Vérifiez votre accès internet.";
    }
    if (m.includes('email not confirmed')) {
      return "La vérification d'email est encore activée dans Supabase. Veuillez la désactiver dans Authentication > Providers > Email.";
    }

    return messageAnglais;
  }
};

// Export si environnement modulaire
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Auth };
}
