/**
 * TAILLEUR PRO - INTERACTION & ANIMATIONS LANDING PAGE
 * ====================================================
 * Étape 2 : Script pour index.html
 * - Header transparent -> flou au scroll
 * - Menu mobile hamburger
 * - Animation du titre H1 (mot par mot + mot-clé alternatif 2,5s)
 * - Détection de session Supabase pour basculer "Connexion" -> "Mon espace"
 * - Apparitions fluides au scroll (IntersectionObserver)
 * - Respect strict de prefers-reduced-motion
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Détection du mode de mouvement réduit
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 2. Gestion du Header au scroll
  const siteHeader = document.querySelector('.site-header');
  const handleScroll = () => {
    if (window.scrollY > 30) {
      siteHeader?.classList.add('scrolled');
    } else {
      siteHeader?.classList.remove('scrolled');
    }
  };
  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll(); // Vérification initiale

  // 3. Menu Mobile Hamburger
  const hamburgerBtn = document.querySelector('.hamburger-btn');
  const mobileDrawer = document.querySelector('.mobile-nav-drawer');
  const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');

  const toggleMobileMenu = () => {
    const isOpen = hamburgerBtn?.classList.toggle('active');
    mobileDrawer?.classList.toggle('open', isOpen);
    document.body.style.overflow = isOpen ? 'hidden' : '';
    if (hamburgerBtn) {
      hamburgerBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }
  };

  hamburgerBtn?.addEventListener('click', toggleMobileMenu);

  mobileNavLinks.forEach(link => {
    link.addEventListener('click', () => {
      if (mobileDrawer?.classList.contains('open')) {
        toggleMobileMenu();
      }
    });
  });

  // 4. Machine à écrire (effacement et réécriture automatique)
  initTypewriterEffect(prefersReducedMotion);

  // 5. Bascule "Connexion" -> "Mon espace" si connecté
  verifierSessionUtilisateur();

  // 6. Apparition des éléments au scroll (IntersectionObserver)
  initScrollReveal(prefersReducedMotion);
});

/**
 * Section 6.6 : Machine à écrire dynamique (Typewriter Effect)
 * - L'écriture au centre s'efface lettre par lettre puis se réécrit automatiquement en boucle
 * - Phrases clés : "et gagnez du temps", "et gagnez plus d'argent", "et oubliez moins"
 */
function initTypewriterEffect(reducedMotion) {
  const target = document.getElementById('typewriterTarget');
  const cursor = document.querySelector('.typewriter-cursor');
  if (!target) return;

  const phrases = [
    "et gagnez du temps",
    "et gagnez plus d'argent",
    "et oubliez moins"
  ];

  if (reducedMotion) {
    target.textContent = phrases[0];
    if (cursor) cursor.style.display = 'none';
    return;
  }

  let phraseIndex = 0;
  let currentText = phrases[0];
  let charIndex = currentText.length;
  let isDeleting = false;

  const typingSpeed = 65;   // Vitesse d'écriture par lettre (ms)
  const deletingSpeed = 35; // Vitesse d'effacement par lettre (ms)
  const pauseFull = 2200;   // Temps de pause une fois le texte complet (ms)
  const pauseEmpty = 350;   // Temps de pause une fois le texte effacé (ms)

  function step() {
    const fullText = phrases[phraseIndex];

    if (isDeleting) {
      charIndex--;
      target.textContent = fullText.substring(0, charIndex);

      if (charIndex <= 0) {
        isDeleting = false;
        phraseIndex = (phraseIndex + 1) % phrases.length;
        setTimeout(step, pauseEmpty);
        return;
      }
      setTimeout(step, deletingSpeed);
    } else {
      charIndex++;
      target.textContent = fullText.substring(0, charIndex);

      if (charIndex >= fullText.length) {
        isDeleting = true;
        setTimeout(step, pauseFull);
        return;
      }
      setTimeout(step, typingSpeed);
    }
  }

  // Pause initiale avant le premier effacement
  setTimeout(() => {
    isDeleting = true;
    step();
  }, pauseFull);
}

/**
 * Vérification de la session active
 * Si un tailleur a déjà une session valide, on remplace le bouton "Connexion" par "Mon espace"
 */
async function verifierSessionUtilisateur() {
  const btnConnexion = document.querySelectorAll('.btn-connexion-action');
  let estConnecte = false;

  // 1. Vérification via Supabase si configuré
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
    // 2. Vérification locale de secours (localStorage)
    try {
      const tokenLocal = localStorage.getItem('tailleurpro_session');
      if (tokenLocal) {
        estConnecte = true;
      }
    } catch (e) {}
  }

  if (estConnecte) {
    btnConnexion.forEach(btn => {
      btn.textContent = 'Mon espace';
      btn.setAttribute('href', 'app.html');
      btn.classList.remove('btn-ghost');
      btn.classList.add('btn-secondary');
    });
  }
}

/**
 * Apparitions fluides des cartes au défilement (IntersectionObserver)
 */
function initScrollReveal(reducedMotion) {
  if (reducedMotion) return;

  const elementsToReveal = document.querySelectorAll(
    '.step-card, .feature-card, .pricing-card, .testimonial-card'
  );

  elementsToReveal.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(24px)';
    el.style.transition = 'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)';
  });

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        obs.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.12,
    rootMargin: '0px 0px -40px 0px'
  });

  elementsToReveal.forEach(el => observer.observe(el));
}
