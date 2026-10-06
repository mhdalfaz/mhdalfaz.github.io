/**
 * Small progressive-enhancement behaviours.
 *
 * Both helpers are written to be idempotent because astro:after-swap can fire
 * more than once: a re-run on already-enhanced DOM must not double-bind
 * listeners or re-observe elements.
 */

/** Fade elements marked with data-reveal as they enter the viewport. */
export function initReveal(root: ParentNode = document): void {
  const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]:not(.is-inview)'));
  if (targets.length === 0) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion || !('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('is-inview'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-inview');
        observer.unobserve(entry.target);
      }
    },
    // Start slightly before the element reaches the fold so the animation is
    // already in progress when it becomes visible.
    { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
  );

  targets.forEach((el) => observer.observe(el));
}

/**
 * Mobile navigation: open/close, Escape to dismiss, and focus containment
 * while the overlay is up.
 */
export function initNav(root: ParentNode = document): void {
  const toggle = root.querySelector<HTMLButtonElement>('[data-nav-toggle]');
  const nav = root.querySelector<HTMLElement>('[data-nav]');
  if (!toggle || !nav || toggle.dataset.bound === 'true') return;

  // Bound to stable local consts so the nested handlers below are non-nullable.
  const toggleEl = toggle;
  const navEl = nav;
  toggleEl.dataset.bound = 'true';

  function setOpen(open: boolean): void {
    toggleEl.setAttribute('aria-expanded', String(open));
    navEl.dataset.open = String(open);
    document.documentElement.classList.toggle('no-scroll', open);
  }

  function onToggle(): void {
    setOpen(toggleEl.getAttribute('aria-expanded') !== 'true');
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && toggleEl.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      toggleEl.focus();
    }
  }

  toggle.addEventListener('click', onToggle);
  document.addEventListener('keydown', onKeydown);

  // Close after navigating via the overlay, otherwise the new page loads with
  // the menu still open (the overlay lives outside the swapped <main>).
  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => setOpen(false));
  });
}

/**
 * Pointer-following tilt for elements marked data-tilt.
 * Small rotation on the Y axis based on horizontal pointer position.
 */
export function initTilt(root: ParentNode = document): void {
  const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-tilt]'));
  if (targets.length === 0) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  for (const el of targets) {
    if (el.dataset.tiltBound === 'true') continue;
    el.dataset.tiltBound = 'true';

    const max = Number(el.dataset.tilt ?? 4);
    let frame = 0;

    el.addEventListener(
      'pointermove',
      (event) => {
        const rect = el.getBoundingClientRect();
        const ratio = (event.clientX - rect.left) / rect.width - 0.5;
        // Cancelling first keeps only the latest value applied.
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          el.style.transform = `perspective(900px) rotateY(${ratio * max}deg)`;
        });
      },
      { passive: true },
    );

    el.addEventListener('pointerleave', () => {
      cancelAnimationFrame(frame);
      el.style.transform = '';
    });
  }
}