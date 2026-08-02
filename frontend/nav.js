/**
 * nav.js — Shared navigation behaviour
 * - Theme toggle (dark/light, persists to localStorage)
 * - Mobile hamburger menu
 * - Active link highlighting
 */

(function () {
  'use strict';

  /* ── Theme ─────────────────────────────────────────────────── */
  const root     = document.documentElement;
  const stored   = localStorage.getItem('cv-theme');
  if (stored) root.setAttribute('data-theme', stored);

  function toggleTheme() {
    const current = root.getAttribute('data-theme');
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    let next;
    if (!current) {
      next = systemDark ? 'light' : 'dark';
    } else {
      next = current === 'dark' ? 'light' : 'dark';
    }
    root.setAttribute('data-theme', next);
    localStorage.setItem('cv-theme', next);
  }

  /* ── Mobile hamburger ───────────────────────────────────────── */
  function initNav() {
    const toggleBtn  = document.getElementById('themeToggle');
    const hamburger  = document.getElementById('navHamburger');
    const mobileMenu = document.getElementById('navMobileMenu');

    if (toggleBtn)  toggleBtn.addEventListener('click', toggleTheme);

    if (hamburger && mobileMenu) {
      hamburger.addEventListener('click', () => {
        mobileMenu.classList.toggle('open');
      });
      // Close on outside click
      document.addEventListener('click', (e) => {
        if (!hamburger.contains(e.target) && !mobileMenu.contains(e.target)) {
          mobileMenu.classList.remove('open');
        }
      });
    }

    // Active link
    const current = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav__links a, .nav__mobile-menu a').forEach(a => {
      const href = a.getAttribute('href');
      if (href === current) a.classList.add('active');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNav);
  } else {
    initNav();
  }
})();
