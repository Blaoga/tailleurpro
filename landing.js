/**
 * TAILLEUR PRO — INTERACTIONS LANDING PAGE (MISSION 8)
 * ====================================================
 * - Barre de navigation fixe avec effet verre dépoli au défilement
 * - Menu mobile hamburger (ouverture/fermeture, Échap, liens)
 * - Détection de session Supabase pour basculer "Connexion" -> "Mon espace"
 * - Apparition progressive discrète au scroll (IntersectionObserver)
 * - Accordéon FAQ interactif
 * - Parallaxe légère sur les outils de couture (desktop uniquement)
 * - Respect strict de prefers-reduced-motion
 */

document.documentElement.classList.add('tp-anim-ready');

document.addEventListener('DOMContentLoaded', () => {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 1. Header fixe : transition transparent -> verre sombre au scroll
  const siteHeader = document.getElementById('siteHeader') || document.querySelector('.site-header');
  const handleScroll = () => {
    if (window.scrollY > 24) {
      siteHeader?.classList.add('scrolled');
    } else {
      siteHeader?.classList.remove('scrolled');
    }
  };
  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();

  // 2. Menu Mobile Hamburger accessible
  const hamburgerBtn = document.getElementById('hamburgerBtn') || document.querySelector('.hamburger-btn');
  const mobileDrawer = document.getElementById('mobileNavDrawer') || document.querySelector('.mobile-nav-drawer');
  const mobileLinks = document.querySelectorAll('.mobile-nav-link, .mobile-nav-actions a');

  const setMobileMenuState = (open) => {
    hamburgerBtn?.classList.toggle('active', open);
    mobileDrawer?.classList.toggle('open', open);
    document.body.style.overflow = open ? 'hidden' : '';
    if (hamburgerBtn) {
      hamburgerBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    if (mobileDrawer) {
      mobileDrawer.setAttribute('aria-hidden', open ? 'false' : 'true');
    }
  };

  hamburgerBtn?.addEventListener('click', () => {
    const isCurrentlyOpen = Boolean(mobileDrawer?.classList.contains('open'));
    setMobileMenuState(!isCurrentlyOpen);
  });

  mobileLinks.forEach((link) => {
    link.addEventListener('click', () => {
      if (mobileDrawer?.classList.contains('open')) {
        setMobileMenuState(false);
      }
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && mobileDrawer?.classList.contains('open')) {
      setMobileMenuState(false);
      hamburgerBtn?.focus();
    }
  });

  // 3. Bascule "Connexion" -> "Mon espace" si session active
  verifierSessionUtilisateur();

  // 4. Apparition douce au défilement
  initScrollReveal(prefersReducedMotion);

  // 5. Accordéon FAQ
  initFaqAccordion();

  // 6. Initialisation de la langue (FR / EN) et rotation du titre Hero
  if (window.Lang) Lang.init();
  initHeroPhraseRotation(prefersReducedMotion);
});

/**
 * Rotation typographique discrète du titre Hero.
 * - Une seule expression visible à la fois, hauteur fixe sans décalage
 * - Désactivée si prefers-reduced-motion est activé
 */
function initHeroPhraseRotation(reducedMotion) {
  const target = document.getElementById('heroAnimatedPhrase');
  if (!target || reducedMotion) return;

  const phrasesByLang = {
    fr: ['Mieux organisé.', 'Plus serein.', 'Toujours à jour.'],
    en: ['Better organized.', 'More peaceful.', 'Always up to date.']
  };

  let index = 0;
  let holdTimer = null;
  let swapTimer = null;

  const getPhrases = () => (window.Lang && Lang.isEn()) ? phrasesByLang.en : phrasesByLang.fr;

  window.addEventListener('tailleurpro:langchange', () => {
    const activePhrases = getPhrases();
    target.textContent = activePhrases[index % activePhrases.length];
  });

  const scheduleNext = () => {
    holdTimer = window.setTimeout(() => {
      if (document.hidden) {
        scheduleNext();
        return;
      }

      target.classList.add('is-exiting');

      swapTimer = window.setTimeout(() => {
        const activePhrases = getPhrases();
        index = (index + 1) % activePhrases.length;
        target.classList.add('is-entering');
        target.classList.remove('is-exiting');
        target.textContent = activePhrases[index];

        void target.offsetHeight;

        window.requestAnimationFrame(() => {
          target.classList.remove('is-entering');
          scheduleNext();
        });
      }, 310);
    }, 4000);
  };

  scheduleNext();

  window.addEventListener('pagehide', () => {
    window.clearTimeout(holdTimer);
    window.clearTimeout(swapTimer);
  });
}

/**
 * Vérification de la session active
 * Si un tailleur a déjà une session valide, on remplace "Connexion" par "Mon espace".
 */
async function verifierSessionUtilisateur() {
  const btnConnexion = document.querySelectorAll('.btn-connexion-action');
  let estConnecte = false;

  if (typeof supabaseClient !== 'undefined' && supabaseClient) {
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (session) {
        estConnecte = true;
      }
    } catch (e) {
      console.warn('[Tailleur Pro] Erreur vérification session :', e);
    }
  } else {
    try {
      const tokenLocal = localStorage.getItem('tailleurpro_session');
      if (tokenLocal) {
        estConnecte = true;
      }
    } catch (e) {}
  }

  if (estConnecte) {
    btnConnexion.forEach((btn) => {
      btn.textContent = 'Mon espace';
      btn.setAttribute('href', 'app.html');
      btn.classList.remove('btn-ghost');
      btn.classList.add('btn-secondary');
    });
  }
}

/**
 * Révélation fluide des sections et cartes au défilement.
 */
function initScrollReveal(reducedMotion) {
  const revealTargets = document.querySelectorAll('[data-reveal]');
  if (!revealTargets.length) return;

  if (reducedMotion || typeof IntersectionObserver === 'undefined') {
    revealTargets.forEach((el) => el.classList.add('revealed'));
    return;
  }

  const revealIfVisible = () => {
    const triggerBottom = window.innerHeight * 0.98;
    revealTargets.forEach((el) => {
      if (el.classList.contains('revealed')) return;
      const rect = el.getBoundingClientRect();
      if (rect.top <= triggerBottom) {
        el.classList.add('revealed');
      }
    });
  };

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          obs.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.04,
      rootMargin: '0px 0px -16px 0px'
    }
  );

  revealTargets.forEach((el, index) => {
    const staggerDelay = (index % 3) * 45;
    el.style.transitionDelay = `${staggerDelay}ms`;
    observer.observe(el);
  });

  revealIfVisible();
  window.addEventListener('scroll', revealIfVisible, { passive: true });
  window.addEventListener('hashchange', () => window.setTimeout(revealIfVisible, 120));
}

/**
 * Accordéon interactif pour les questions fréquentes (#faq).
 */
function initFaqAccordion() {
  const faqItems = document.querySelectorAll('.faq-item');
  if (!faqItems.length) return;

  faqItems.forEach((item) => {
    const trigger = item.querySelector('.faq-question');
    if (!trigger) return;

    trigger.addEventListener('click', () => {
      const willOpen = !item.classList.contains('open');

      faqItems.forEach((otherItem) => {
        otherItem.classList.remove('open');
        otherItem.querySelector('.faq-question')?.setAttribute('aria-expanded', 'false');
      });

      if (willOpen) {
        item.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
      }
    });
  });
}
