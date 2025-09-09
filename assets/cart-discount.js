import { Component } from '@theme/component';
import { morphSection } from '@theme/section-renderer';
import { DiscountUpdateEvent } from '@theme/events';
import { fetchConfig } from '@theme/utilities';
import { cartPerformance } from '@theme/performance';

/**
 * @typedef {Object} CartDiscountComponentRefs
 * @property {HTMLElement} cartDiscountError
 * @property {HTMLElement} cartDiscountErrorDiscountCode
 * @property {HTMLElement} cartDiscountErrorShipping
 */

/**
 * <cart-discount-component>
 * Handles applying/removing discount codes with resilient UX.
 *
 * Expects:
 * - this.dataset.sectionId (string)
 * - Pills in DOM with .cart-discount__pill[data-discount-code]
 * - A form with input[name="discount"] that triggers applyDiscount (submit)
 */
class CartDiscount extends Component {
  requiredRefs = ['cartDiscountError', 'cartDiscountErrorDiscountCode', 'cartDiscountErrorShipping'];

  /** @type {AbortController | null} */
  #activeFetch = null;
  /** @type {HTMLButtonElement | null} */
  #submitBtn = null;
  /** @type {HTMLElement | null} */
  #statusLive = null;

  // ---------- utils ----------

  #newAbort() {
    if (this.#activeFetch) this.#activeFetch.abort();
    this.#activeFetch = new AbortController();
    return this.#activeFetch;
  }

  #normalizeCode(raw) {
    if (typeof raw !== 'string') return '';
    // Trim, collapse inner whitespace, remove leading '#', and uppercase
    return raw.trim().replace(/\s+/g, '').replace(/^#/, '').toUpperCase();
  }

  #existingDiscounts() {
    /** @type {string[]} */
    const codes = [];
    this.querySelectorAll('.cart-discount__pill').forEach((pill) => {
      if (pill instanceof HTMLLIElement && typeof pill.dataset.discountCode === 'string') {
        codes.push(this.#normalizeCode(pill.dataset.discountCode));
      }
    });
    return codes;
  }

  #lockUI(form, label = 'Applying…') {
    this.#submitBtn = form.querySelector('[type="submit"]');
    if (this.#submitBtn) {
      this.#submitBtn.disabled = true;
      this.#submitBtn.setAttribute('aria-busy', 'true');
    }
    // simple polite live region (created once)
    if (!this.#statusLive) {
      this.#statusLive = document.createElement('div');
      this.#statusLive.className = 'visually-hidden';
      this.#statusLive.setAttribute('role', 'status');
      this.#statusLive.setAttribute('aria-live', 'polite');
      form.appendChild(this.#statusLive);
    }
    this.#statusLive.textContent = label;
  }

  #unlockUI(label = '') {
    if (this.#submitBtn) {
      this.#submitBtn.disabled = false;
      this.#submitBtn.removeAttribute('aria-busy');
    }
    if (this.#statusLive) this.#statusLive.textContent = label;
  }

  #hideAllErrors() {
    const { cartDiscountError, cartDiscountErrorDiscountCode, cartDiscountErrorShipping } = this.refs;
    cartDiscountError?.classList.add('hidden');
    cartDiscountErrorDiscountCode?.classList.add('hidden');
    cartDiscountErrorShipping?.classList.add('hidden');
  }

  #showError(type /** @type {'discount_code'|'shipping'} */) {
    const { cartDiscountError, cartDiscountErrorDiscountCode, cartDiscountErrorShipping } = this.refs;
    const target = type === 'discount_code' ? cartDiscountErrorDiscountCode : cartDiscountErrorShipping;
    cartDiscountError?.classList.remove('hidden');
    target?.classList.remove('hidden');
    if (this.#statusLive) this.#statusLive.textContent = '';
  }

  // ---------- handlers ----------

  /**
   * Submit handler to apply a discount code.
   * Wire: <form onsubmit="this.closest('cart-discount-component')?.applyDiscount(event)">
   */
  applyDiscount = async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (typeof this.dataset.sectionId !== 'string') return;

    const input = form.querySelector('input[name="discount"]');
    if (!(input instanceof HTMLInputElement)) return;

    const code = this.#normalizeCode(input.value);
    if (!code) return;

    const existing = this.#existingDiscounts();
    if (existing.includes(code)) {
      // already applied → clear input silently
      input.value = '';
      return;
    }

    this.#hideAllErrors();
    this.#lockUI(form, 'Applying…');

    const controller = this.#newAbort();

    try {
      const body = {
        discount: [...existing, code].join(','),
        sections: [this.dataset.sectionId],
      };
      const config = fetchConfig('json', { body: JSON.stringify(body) });

      const res = await fetch(Theme.routes.cart_update_url, {
        ...config,
        signal: controller.signal,
      });

      // Robust JSON parsing
      let data = {};
      try {
        data = await res.json();
      } catch {
        // Non-JSON response
      }

      if (!res.ok || !data || typeof data !== 'object') {
        this.#showError('discount_code');
        return;
      }

      // If Shopify flags this code as NOT applicable, show discount_code error
      const notApplicable = Array.isArray(data.discount_codes)
        ? data.discount_codes.some((d) => this.#normalizeCode(d.code) === code && d.applicable === false)
        : false;

      if (notApplicable) {
        input.value = '';
        this.#showError('discount_code');
        return;
      }

      // Morph the section with returned HTML
      const newHtml = data.sections?.[this.dataset.sectionId];
      if (typeof newHtml === 'string') {
        // Parse incoming section HTML to introspect pills (for shipping heuristic)
        const doc = new DOMParser().parseFromString(newHtml, 'text/html');
        const section = doc.getElementById(`shopify-section-${this.dataset.sectionId}`);

        // The pills we will end up with in the new UI
        const pills = section ? section.querySelectorAll('.cart-discount__pill') : [];
        const nextCodes = Array.from(pills)
          .map((el) => (el instanceof HTMLLIElement ? this.#normalizeCode(el.dataset.discountCode || '') : ''))
          .filter(Boolean);

        // If the UI didn't gain a new pill BUT the code is marked applicable, treat as a shipping code error
        const applicable = Array.isArray(data.discount_codes)
          ? data.discount_codes.some((d) => this.#normalizeCode(d.code) === code && d.applicable === true)
          : false;

        const noNewPill =
          nextCodes.length === existing.length &&
          nextCodes.every((c) => existing.includes(c));

        if (applicable && noNewPill) {
          // Likely a shipping-only discount that doesn't reflect as a line/pill
          this.#showError('shipping');
          input.value = '';
          return;
        }

        // Dispatch model update + morph DOM
        document.dispatchEvent(new DiscountUpdateEvent(data, this.id));
        morphSection(this.dataset.sectionId, newHtml);
      }

      // Success: clear input
      input.value = '';
    } catch (err) {
      if (err?.name !== 'AbortError') {
        // Network/problem → show generic code error
        this.#showError('discount_code');
      }
    } finally {
      this.#activeFetch = null;
      this.#unlockUI('');
      cartPerformance.measureFromEvent('discount-update:user-action', event);
    }
  };

  /**
   * Click/Key handler to remove a discount code via its pill.
   * Wire: on pill container (e.g., ul) → click & keydown delegate to this method.
   */
  removeDiscount = async (event) => {
    event.preventDefault();
    event.stopPropagation();

    // Only Enter key for keyboard activation
    if (event instanceof KeyboardEvent && event.key !== 'Enter') return;
    if (!(event.target instanceof HTMLElement)) return;
    if (typeof this.dataset.sectionId !== 'string') return;

    const pill = event.target.closest('.cart-discount__pill');
    if (!(pill instanceof HTMLLIElement)) return;

    const code = this.#normalizeCode(pill.dataset.discountCode || '');
    if (!code) return;

    const existing = this.#existingDiscounts();
    const idx = existing.indexOf(code);
    if (idx === -1) return;
    existing.splice(idx, 1);

    const controller = this.#newAbort();

    try {
      const body = { discount: existing.join(','), sections: [this.dataset.sectionId] };
      const config = fetchConfig('json', { body: JSON.stringify(body) });

      const res = await fetch(Theme.routes.cart_update_url, {
        ...config,
        signal: controller.signal,
      });

      let data = {};
      try { data = await res.json(); } catch {}

      if (!res.ok || !data || typeof data !== 'object') return;

      document.dispatchEvent(new DiscountUpdateEvent(data, this.id));
      const html = data.sections?.[this.dataset.sectionId];
      if (typeof html === 'string') morphSection(this.dataset.sectionId, html);
    } catch (err) {
      // swallow; UI still shows prior state
    } finally {
      this.#activeFetch = null;
    }
  };
}

if (!customElements.get('cart-discount-component')) {
  customElements.define('cart-discount-component', CartDiscount);
}
