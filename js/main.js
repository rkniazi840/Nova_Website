/* ============================================
   NOVA Environmental Consulting — Main JS
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

  // --- Header scroll effect ---
  const header = document.getElementById('header');
  const scrollTop = document.getElementById('scrollTop');

  function handleScroll() {
    const y = window.scrollY;
    if (header && !header.classList.contains('page-header')) {
      header.classList.toggle('scrolled', y > 50);
    }
    if (scrollTop) {
      scrollTop.classList.toggle('visible', y > 400);
    }
  }

  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();

  // --- Scroll to top ---
  if (scrollTop) {
    scrollTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // --- Mobile menu ---
  const hamburger = document.getElementById('hamburger');
  const navLinks = document.getElementById('navLinks');
  const navOverlay = document.getElementById('navOverlay');

  function closeMenu() {
    hamburger?.classList.remove('active');
    navLinks?.classList.remove('active');
    navOverlay?.classList.remove('active');
    document.body.style.overflow = '';
  }

  hamburger?.addEventListener('click', () => {
    const isOpen = hamburger.classList.contains('active');
    if (isOpen) {
      closeMenu();
    } else {
      hamburger.classList.add('active');
      navLinks?.classList.add('active');
      navOverlay?.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  });

  navOverlay?.addEventListener('click', closeMenu);

  navLinks?.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', closeMenu);
  });

  // --- Fade-up on scroll ---
  const fadeElements = document.querySelectorAll('.fade-up');

  if (fadeElements.length > 0) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            entry.target.classList.add('visible');
          }, index * 100);
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -40px 0px'
    });

    fadeElements.forEach(el => observer.observe(el));
  }

  // --- Contact form ---
  const contactForm = document.getElementById('contactForm');
  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const formData = new FormData(contactForm);
      const data = Object.fromEntries(formData.entries());

      let valid = true;
      contactForm.querySelectorAll('[required]').forEach(field => {
        if (!field.value.trim()) {
          field.style.borderColor = '#e74c3c';
          valid = false;
        } else {
          field.style.borderColor = '';
        }
      });

      if (!valid) return;

      const btn = contactForm.querySelector('button[type="submit"]');
      const originalText = btn.innerHTML;
      btn.innerHTML = 'Sending...';
      btn.disabled = true;

      setTimeout(() => {
        btn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;">
            <path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/>
          </svg>
          Message Sent!
        `;
        btn.style.background = 'var(--secondary)';
        btn.style.color = '#fff';

        setTimeout(() => {
          contactForm.reset();
          btn.innerHTML = originalText;
          btn.disabled = false;
          btn.style.background = '';
          btn.style.color = '';
        }, 3000);
      }, 1500);
    });
  }

  // --- Smooth scroll for anchor links ---
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

});
