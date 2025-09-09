import { mediaQueryLarge, isMobileBreakpoint } from '@theme/utilities';

class AccordionCustom extends HTMLElement {
  // --- Element getters (safe) ---
  /** @returns {HTMLDetailsElement|null} */
  get details() {
    const el = this.querySelector('details');
    return el instanceof HTMLDetailsElement ? el : null;
  }

  /** @returns {HTMLElement|null} */
  get summary() {
    const d = this.details;
    if (!d) return null;
    const s = d.querySelector('summary');
    return s instanceof HTMLElement ? s : null;
  }

  // --- Robust boolean parsing for data-attrs ---
  /** @returns {boolean} */
  #parseBool(val) {
    if (val === '' || val === undefined) return false; // attribute absent
    const s = String(val).toLowerCase();
    return s === 'true' || s === '1';
  }

  get #disableOnMobile() {
    return this.#parseBool(this.dataset.disableOnMobile);
  }
  get #disableOnDesktop() {
    return this.#parseBool(this.dataset.disableOnDesktop);
  }
  get #closeWithEscape() {
    return this.#parseBool(this.dataset.closeWithEscape);
  }

  // --- Controller lifecycle ---
  /** @type {AbortController | null} */
  #controller = null;

  connectedCallback() {
    // Recreate controller every time we connect (fixes "aborted signal" bug on reattach)
    this.#controller?.abort();
    this.#controller = new AbortController();
    const { signal } = this.#controller;

    // If structure is missing, fail gracefully (don’t throw in production)
    if (!this.details || !this.summary) {
      console.warn('[accordion-custom] Missing <details> or <summary> inside component.', this);
      return;
    }

    this.#setDefaultOpenState();

    // Events
    this.addEventListener('keydown', this.#handleKeyDown, { signal });
    this.summary.addEventListener('click', this.#handleSummaryClick, { signal });

    // Media query listener (guard if utilities not present)
    try {
      mediaQueryLarge?.addEventListener?.('change', this.#handleMediaQueryChange, { signal });
    } catch (e) {
      // non-fatal
    }
  }

  disconnectedCallback() {
    // Abort detaches all listeners bound with { signal }
    this.#controller?.abort();
  }

  // React to attribute flips at runtime (e.g., toggling defaults via DOM)
  static get observedAttributes() {
    return ['open-by-default-on-mobile', 'open-by-default-on-desktop', 'data-disable-on-mobile', 'data-disable-on-desktop'];
  }
  attributeChangedCallback() {
    this.#setDefaultOpenState();
  }

  // --- Handlers ---
  #handleMediaQueryChange = () => {
    this.#setDefaultOpenState();
  };

  #handleSummaryClick = (event) => {
    const isMobile = isMobileBreakpoint?.() ?? false;
    const isDesktop = !isMobile;

    // Block toggling when disabled for the current breakpoint
    if ((isMobile && this.#disableOnMobile) || (isDesktop && this.#disableOnDesktop)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    // Otherwise let <details>/<summary> do their native toggle
  };

  // Arrow function so `this` is always the custom element
  #handleKeyDown = (event) => {
    if (!this.details || !this.summary) return;

    // Close with ESC when used as a menu/dropdown
    if (event.key === 'Escape' && this.#closeWithEscape) {
      event.preventDefault();
      this.details.open = false;
      // Return focus to the control
      this.summary.focus?.();
    }
  };

  // --- Behavior ---
  #setDefaultOpenState() {
    if (!this.details) return;
    const isMobile = isMobileBreakpoint?.() ?? false;

    const openOnMobile = this.hasAttribute('open-by-default-on-mobile');
    const openOnDesktop = this.hasAt
