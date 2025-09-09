import PaginatedList from '@theme/paginated-list';

/**
 * <blog-posts-list>
 * Attributes (all optional unless noted):
 * - data-endpoint="...": URL returning JSON { items: [...], total, page, pageSize }
 * - data-page-size="12": page size (falls back to endpoint default)
 * - data-infinite="true|false": enable infinite scroll (default: false)
 * - data-template="#post-item-template": CSS selector for a <template> node used to render an item
 * - data-empty="No posts yet.": empty-state text
 * - data-error="Something went wrong.": error-state text
 *
 * Slots:
 * - <slot name="header"></slot>  (optional)
 * - <slot name="footer"></slot>  (optional)
 *
 * Progressive enhancement:
 * - Works with PaginatedList if available (extends it).
 * - Fallbacks to vanilla behavior if PaginatedList is missing.
 */

const Base = typeof PaginatedList === 'function' ? PaginatedList : HTMLElement;

export default class BlogPostsList extends Base {
  #controller = null;
  #io = null;                // IntersectionObserver for infinite mode
  #page = 1;
  #loading = false;
  #done = false;

  get endpoint() { return this.dataset.endpoint || ''; }
  get pageSize() { return parseInt(this.dataset.pageSize || '0', 10) || undefined; }
  get infinite() { return (this.dataset.infinite || '').toLowerCase() === 'true'; }
  get templateSel() { return this.dataset.template || ''; }
  get emptyText() { return this.dataset.empty || 'No posts yet.'; }
  get errorText() { return this.dataset.error || 'Something went wrong. Please try again.'; }

  get #list() { return this.querySelector('.bpl__list'); }
  get #sentinel() { return this.querySelector('.bpl__sentinel'); }
  get #status() { return this.querySelector('.bpl__status'); }
  get #btnMore() { return this.querySelector('.bpl__more'); }

  connectedCallback() {
    super.connectedCallback?.();

    // idempotent init
    if (this.#controller) return;
    this.#controller = new AbortController();
    const { signal } = this.#controller;

    this.classList.add('bpl');
    this.setAttribute('role', 'feed');
    this.setAttribute('aria-busy', 'true');

    // skeleton / structure
    if (!this.#list) {
      this.innerHTML = `
        <slot name="header"></slot>
        <div class="bpl__list" part="list"></div>
        <div class="bpl__status" role="status" aria-live="polite" part="status"></div>
        <button class="bpl__more" part="more" hidden>Load more</button>
        <div class="bpl__sentinel" hidden></div>
        <slot name="footer"></slot>
      `;
    }

    // click: Load more (non-infinite mode)
    this.#btnMore?.addEventListener('click', () => this.loadNext(), { signal });

    // infinite scroll
    if (this.infinite) {
      this.#btnMore?.setAttribute('hidden', '');
      this.#sentinel?.removeAttribute('hidden');
      this.#io = new IntersectionObserver((entries) => {
        if (entries.some(e => e.isIntersecting)) this.loadNext();
      }, { rootMargin: '600px 0px 600px 0px' });
      this.#io.observe(this.#sentinel);
      signal.addEventListener('abort', () => this.#io?.disconnect(), { once: true });
    } else {
      this.#btnMore?.removeAttribute('hidden');
      this.#sentinel?.setAttribute('hidden', '');
    }

    // initial load
    this.reset();
    this.loadNext().catch(() => {/* handled in loadNext */});
  }

  disconnectedCallback() {
    this.#controller?.abort();
    this.#controller = null;
    this.#io?.disconnect();
    this.#io = null;
    super.disconnectedCallback?.();
  }

  /** Public: reset to page 1 and clear items */
  reset() {
    this.#page = 1;
    this.#done = false;
    this.#list.innerHTML = '';
    this.#updateStatus('');
    this.setAttribute('aria-busy', 'true');
  }

  async loadNext() {
    if (this.#loading || this.#done) return;
    if (!this.endpoint) return this.#emitError('Missing data-endpoint');

    this.#loading = true;
    this.#updateStatus('Loading…');
    this.setAttribute('aria-busy', 'true');

    try {
      const url = new URL(this.endpoint, window.location.origin);
      url.searchParams.set('page', String(this.#page));
      if (this.pageSize) url.searchParams.set('pageSize', String(this.pageSize));

      const res = await fetch(url.toString(), { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const items = Array.isArray(data.items) ? data.items : [];
      if (this.#page === 1 && items.length === 0) {
        this.#renderEmpty();
        this.#done = true;
        return;
      }

      this.#renderItems(items);
      const total = Number.isFinite(data.total) ? data.total : undefined;
      const pageSize = data.pageSize || this.pageSize || items.length;
      const rendered = this.#list.children.length;

      // Stop when there’s nothing left
      if ((total && rendered >= total) || items.length < pageSize) {
        this.#done = true;
        this.#btnMore?.setAttribute('hidden', '');
        this.#sentinel?.setAttribute('hidden', '');
        this.#updateStatus('All posts loaded.');
      } else {
        this.#btnMore?.removeAttribute('hidden');
        this.#sentinel?.removeAttribute('hidden');
        this.#updateStatus('');
      }

      this.#page += 1;
    } catch (err) {
      this.#renderError(err);
    } finally {
      this.#loading = false;
      this.removeAttribute('aria-busy');
    }
  }

  // ---- rendering ----
  #renderItems(items) {
    for (const post of items) {
      const el = this.#renderItem(post);
      if (el) this.#list.appendChild(el);
    }
  }

  #renderItem(post) {
    // If a template is provided, clone it; otherwise, build a minimal card.
    if (this.templateSel) {
      const tpl = document.querySelector(this.templateSel);
      if (tpl instanceof HTMLTemplateElement) {
        const node = tpl.content.cloneNode(true);
        // Simple token replacements: data fields like [data-title], [data-url], etc.
        // You can customize/extend these hooks as needed.
        node.querySelectorAll('[data-title]').forEach(n => (n.textContent = post.title ?? 'Untitled'));
        node.querySelectorAll('[data-excerpt]').forEach(n => (n.textContent = post.excerpt ?? ''));
        node.querySelectorAll('[data-url]').forEach(n => {
          if (n instanceof HTMLAnchorElement && post.url) n.href = post.url;
        });
        node.querySelectorAll('[data-date]').forEach(n => (n.textContent = this.#formatDate(post.date)));
        node.querySelectorAll('[data-image]').forEach(n => {
          if (n instanceof HTMLImageElement && post.image) {
            n.src = post.image;
            n.alt = post.imageAlt || post.title || '';
            n.loading = 'lazy';
          }
        });
        const wrapper = document.createElement('article');
        wrapper.className = 'bpl__item';
        wrapper.setAttribute('role', 'article');
        wrapper.appendChild(node);
        return wrapper;
      }
    }

    // Default minimal card
    const a = document.createElement('a');
    a.className = 'bpl__card';
    a.href = post.url || '#';
    a.innerHTML = `
      ${post.image ? `<img class="bpl__img" src="${post.image}" alt="${post.imageAlt || ''}" loading="lazy">` : ''}
      <h3 class="bpl__title">${this.#escape(post.title || 'Untitled')}</h3>
      ${post.excerpt ? `<p class="bpl__excerpt">${this.#escape(post.excerpt)}</p>` : ''}
      ${post.date ? `<time class="bpl__date" datetime="${this.#iso(post.date)}">${this.#formatDate(post.date)}</time>` : ''}
    `;
    const article = document.createElement('article');
    article.className = 'bpl__item';
    article.setAttribute('role', 'article');
    article.appendChild(a);
    return article;
  }

  #renderEmpty() {
    this.#list.innerHTML = `<div class="bpl__empty" role="note">${this.emptyText}</div>`;
    this.#btnMore?.setAttribute('hidden', '');
    this.#sentinel?.setAttribute('hidden', '');
    this.#updateStatus('No posts to display.');
  }

  #renderError(err) {
    console.error('[blog-posts-list]', err);
    this.#updateStatus(this.errorText);
    if (!this.#list.querySelector('.bpl__error')) {
      const div = document.createElement('div');
      div.className = 'bpl__error';
      div.setAttribute('role', 'alert');
      div.textContent = this.errorText;
      this.#list.appendChild(div);
    }
    this.#btnMore?.removeAttribute('hidden');
  }

  #updateStatus(text) {
    if (this.#status) this.#status.textContent = text || '';
  }

  // ---- small utils ----
  #escape(s) { return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  #iso(d) { try { return new Date(d).toISOString(); } catch { return ''; } }
  #formatDate(d) {
    try {
      const dt = new Date(d);
      return new Intl.DateTimeFormat(document.documentElement.lang || 'en', { year:'numeric', month:'short', day:'2-digit' }).format(dt);
    } catch { return ''; }
  }
}

if (!customElements.get('blog-posts-list')) {
  customElements.define('blog-posts-list', BlogPostsList);
}
