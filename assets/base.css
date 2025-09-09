(() => {
  const ATTR = 'data-auto-close-details';
  const BREAKPOINT = 750; // px
  
  let closingOn = window.innerWidth < BREAKPOINT ? 'mobile' : 'desktop';
  let lastWidth = window.innerWidth;
  
  // Update closingOn only when crossing breakpoint
  const updateMode = () => {
    const w = window.innerWidth;
    if ((w < BREAKPOINT && lastWidth >= BREAKPOINT) || (w >= BREAKPOINT && lastWidth < BREAKPOINT)) {
      closingOn = w < BREAKPOINT ? 'mobile' : 'desktop';
    }
    lastWidth = w;
  };
  window.addEventListener('resize', updateMode, { passive: true });

  const controller = new AbortController();
  const { signal } = controller;

  document.addEventListener(
    'click',
    (event) => {
      const openDetails = document.querySelectorAll(`details[${ATTR}][open]`);
      if (!openDetails.length) return;

      // Target chain for better Shadow DOM support
      const path = event.composedPath ? event.composedPath() : [event.target];

      for (const el of openDetails) {
        const modes = (el.getAttribute(ATTR) || '').split(',').map(s => s.trim().toLowerCase());
        if (!modes.includes(closingOn) && !modes.includes('always')) continue;

        // If click is inside this <details>, don’t close
        if (path.some((n) => n instanceof Node && el.contains(n))) continue;

        el.removeAttribute('open');
      }
    },
    { signal }
  );

  // Optional: expose a cleanup if needed in SPA contexts
  window.AutoCloseDetails = {
    stop() {
      controller.abort();
      window.removeEventListener('resize', updateMode);
    }
  };
})();
