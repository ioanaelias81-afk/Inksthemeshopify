/**
 * <account-login-actions>
 * Enhances an inner <shop-login-button> when present.
 *
 * Data attributes on <account-login-actions> override defaults:
 *   data-full-width="true|false"
 *   data-persist="true|false"
 *   data-analytics-context="loginWithShopSelfServe"
 *   data-flow-version="account-actions-popover"
 *   data-return-uri="<absolute-or-relative-url>"
 */
class AccountLoginActions extends HTMLElement {
  /** @type {AbortController | null} */
  #controller = null;
  /** @type {MutationObserver | null} */
  #observer = null;

  /** @type {HTMLElement | null} */
  get button() {
    const el = this.querySelector('shop-login-button');
    return el instanceof HTMLElement ? el : null;
  }

  // ---- utils ----
  #parseBool(v, fallback = true) {
    if (v == null) return fallback;
    const s = String(v).trim().toLowerCase();
    return s === 'true' || s === '1' || s === '';
  }

  #setIf(value, setter) {
    if (value != null && value !== '') setter(String(value));
  }

  #computeReturnUri() {
    // Default to current URL without hash (avoids odd scroll positions)
    const provided = this.dataset.returnUri;
    if (provided) return provided;
    try {
      const u = new URL(window.location.href);
      u.hash = ''; // strip fragment
      return u.toString();
    } catch {
      return window.location.pathname || '/';
    }
  }

  connectedCallback() {
    // Recreate controller each connect (important if element is reattached)
    this.#controller?.abort();
    this.#controller = new AbortController();
    const { signal } = this.#controller;

    // Try to enhance immediately…
    this.#enhance();

    // …and watch for late-mounted <shop-login-button>
    if (!this.button && !this.#observer) {
      this.#observer = new MutationObserver(() => this.#enhance());
      this.#observer.observe(this, { childList: true, subtree: true });
    }

    // Ensure observer is cleaned up on disconnect
    signal.addEventListener('abort', () => {
      this.#observer?.disconnect();
      this.#observer = null;
    });
  }

  disconnectedCallback() {
    this.#controller?.abort();
  }

  // If these change at runtime, re-enhance
  static get observedAttributes() {
    return ['data-full-width', 'data-persist', 'data-analytics-context', 'data-flow-version', 'data-return-uri'];
  }
  attributeChangedCallback() {
    this.#enhance();
  }

  #enhance() {
    const btn = this.button;
    if (!btn) return;

    // Apply attributes with
