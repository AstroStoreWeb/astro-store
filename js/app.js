// ============================================================================
// LÓGICA MODULAR: PESTAÑAS INDEPENDIENTES + PAGOS POR PRODUCTO + ADMIN
// ============================================================================

const STORE_STATE = {
  currentView: 'public',   // 'public' | 'admin'
  publicTab: 'inicio',     // 'inicio' | 'catalogo' | 'pasarela' | 'contacto'
  adminTab: 'catalogo',    // 'catalogo' | 'pasarela' | 'tienda' | 'seguridad'
  isAdminAuthenticated: false,
  editingItemId: null,
  editingProjectId: null,
  editingJobId: null,
  draftItemImages: [],
  draftProjectImages: [],
  draftJobDeliverables: [],
  galleryImages: [],
  galleryIndex: 0,
  editingAccountId: null,
  editingPlanId: null,
  config: null,
  catalog: [],
  salesCatalogs: [],
  categories: [],
  projects: [],
  activeJobs: [],
  paymentReports: [],
  coupons: [],
  sponsors: [],
  appliedCoupon: null,
  paymentAccounts: [],
  paymentPlans: [],
  filterSalesCatalog: 'todos',
  filterCategory: 'todas',
  filterType: 'todos',
  searchQuery: '',
  jobSearchQuery: '',
  jobStatusFilter: 'todos',
  ledgerFilter: 'todos',
  ledgerSearch: '',
  cart: [],
  checkoutDirectItem: null,
  checkoutReceipt: null,
  selectedPlanId: null,
  selectedAccountId: null,
  isCartOpen: false,
  bcvRates: { usd: 46.85, eur: 50.60, updatedAt: null, isLive: false, source: 'Caché local' }
};

function initStore() {
  STORE_STATE.config = loadStoreConfig();
  STORE_STATE.catalog = loadCatalogItems();
  STORE_STATE.salesCatalogs = loadSalesCatalogs();
  STORE_STATE.categories = loadCategories();
  STORE_STATE.projects = loadProjects();
  STORE_STATE.activeJobs = loadActiveJobs();
  STORE_STATE.paymentReports = loadPaymentReports();
  STORE_STATE.coupons = loadCoupons();
  STORE_STATE.sponsors = loadSponsors();
  STORE_STATE.paymentAccounts = loadPaymentAccounts();
  STORE_STATE.paymentPlans = loadPaymentPlans();
  STORE_STATE.bcvRates = loadCachedBcvRates();
  STORE_STATE.isAdminAuthenticated = sessionStorage.getItem(STORE_STORAGE_KEYS.ADMIN_AUTH) === 'true';
  loadCartFromStorage();

  switchView(resolveViewFromURL(), false);
  syncBcvRates(false);
  checkCustomerPaymentStatus(false);

  // Sincronizar con Supabase al iniciar (si está configurado)
  if (window.storeCloud && window.storeCloud.isConnected) {
    syncAllFromSupabase(false);
  }

  // Polling ligero cada 8s cuando el cliente espera confirmación de pago en la nube
  setInterval(() => {
    const lastPay = loadFromStorage(STORE_STORAGE_KEYS.LAST_CUSTOMER_PAYMENT, null);
    if (lastPay && lastPay.reportId && !lastPay.notifiedConfirmed && window.storeCloud && window.storeCloud.isConnected) {
      syncAllFromSupabase(false);
    }
  }, 8000);

  // Sincronización en tiempo real entre pestañas (cuando el Admin confirma el pago)
  window.addEventListener('storage', ev => {
    if (ev.key === STORE_STORAGE_KEYS.PAYMENT_REPORTS || ev.key === STORE_STORAGE_KEYS.ACTIVE_JOBS) {
      STORE_STATE.paymentReports = loadPaymentReports();
      STORE_STATE.activeJobs = loadActiveJobs();
      if (STORE_STATE.currentView === 'public') {
        if (STORE_STATE.publicTab === 'pasarela') renderPasarelaModule();
        if (STORE_STATE.publicTab === 'trabajos') renderTrabajosModule();
        checkCustomerPaymentStatus(false);
      }
    }
  });
}

async function syncBcvRates(showFeedback = false) {
  const updated = await fetchLiveBcvRates();
  STORE_STATE.bcvRates = updated;

  if (STORE_STATE.currentView === 'public') {
    if (STORE_STATE.publicTab === 'inicio') renderHomeModule();
    if (STORE_STATE.publicTab === 'catalogo') renderCatalog();
    if (STORE_STATE.publicTab === 'pasarela') renderPasarelaModule();
    renderCart();
    if (window.lucide) window.lucide.createIcons();
  }

  if (showFeedback) {
    showToast(updated.isLive
      ? `BCV actualizado: $ ${updated.usd} Bs · € ${updated.eur} Bs`
      : 'Sin conexión a API BCV, usando última tasa guardada');
  }
}

function resolveViewFromURL() {
  return document.body.dataset.page === 'admin' ? 'admin' : 'public';
}

function resetScrollArea() {
  const area = document.getElementById('main-scroll-area');
  if (area) area.scrollTop = 0;
}

// --- CAMBIO ENTRE VISTA PÚBLICA Y VISTA ADMIN (ARCHIVOS SEPARADOS) ---
function switchView(viewName, updateUrl = true) {
  const isAdminPage = document.body.dataset.page === 'admin';
  if (viewName === 'public' && isAdminPage) {
    window.location.href = 'index.html';
    return;
  }

  STORE_STATE.currentView = viewName;
  const pubEl = document.getElementById('view-public');
  const admEl = document.getElementById('view-admin');
  const searchEl = document.getElementById('header-search-wrap');
  if (pubEl) pubEl.classList.toggle('hidden', viewName !== 'public');
  if (admEl) admEl.classList.toggle('hidden', viewName !== 'admin');
  if (searchEl) searchEl.classList.toggle('hidden', viewName !== 'public');

  if (viewName === 'public') {
    switchPublicTab(STORE_STATE.publicTab);
  } else {
    renderAdminView();
  }

  resetScrollArea();
}

// --- CAMBIO DE MÓDULO INDEPENDIENTE EN VISTA PÚBLICA (SIN BAJAR CON SCROLL) ---
function switchPublicTab(tabName, filterOverride = null) {
  STORE_STATE.publicTab = tabName;
  if (filterOverride) STORE_STATE.filterType = filterOverride;

  ['inicio', 'catalogo', 'proyectos', 'trabajos', 'pasarela', 'contacto'].forEach(t => {
    const panel = document.getElementById(`pub-panel-${t}`);
    if (panel) panel.classList.toggle('hidden', t !== tabName);
  });

  renderNavigationChrome('public');
  renderCommonPublicTexts();

  if (tabName === 'inicio') renderHomeModule();
  if (tabName === 'catalogo') {
    populateCatalogSelectors();
    updateFilterButtonsUI();
    renderCatalog();
  }
  if (tabName === 'proyectos') renderProjectsModule();
  if (tabName === 'trabajos') renderTrabajosModule();
  if (tabName === 'pasarela') renderPasarelaModule();
  if (tabName === 'contacto') renderContactoModule();

  renderCart();
  resetScrollArea();
  if (window.lucide) window.lucide.createIcons();
}

function renderNavigationChrome(viewName) {
  const topIcons = document.getElementById('sidebar-top-icons');
  const bottomIcons = document.getElementById('sidebar-bottom-icons');
  const mobileNav = document.getElementById('mobile-bottom-nav');
  const navActions = document.getElementById('navbar-actions-container');
  const modeBadge = document.getElementById('navbar-mode-badge');
  const subTitle = document.getElementById('navbar-subtitle');

  if (subTitle) subTitle.textContent = STORE_STATE.config.tagline;

  if (viewName === 'public') {
    const t = STORE_STATE.publicTab;
    if (modeBadge) {
      modeBadge.textContent = 'En línea';
      modeBadge.className = 'hidden sm:inline-block px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
    }

    const tabs = [
      { key: 'inicio', label: 'Inicio', icon: 'layout-grid' },
      { key: 'catalogo', label: 'Catálogo', icon: 'shopping-bag' },
      { key: 'proyectos', label: 'Proyectos', icon: 'briefcase' },
      { key: 'trabajos', label: 'Trabajos', icon: 'clock' },
      { key: 'pasarela', label: 'Pasarela', icon: 'wallet' },
      { key: 'contacto', label: 'Contacto', icon: 'message-square-heart' }
    ];

    topIcons.innerHTML = tabs.map(tab => `
      <button onclick="switchPublicTab('${tab.key}')" title="${tab.label}" class="w-10 h-10 rounded-full flex items-center justify-center transition ${t === tab.key ? 'bg-white text-slate-950 shadow' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}">
        <i data-lucide="${tab.icon}" class="w-5 h-5"></i>
      </button>
    `).join('');

    bottomIcons.innerHTML = `
      <a href="#" target="_blank" rel="noopener" title="WhatsApp Directo" class="dyn-wa-direct w-10 h-10 rounded-full text-emerald-400 hover:bg-emerald-500/20 flex items-center justify-center transition">
        <i data-lucide="message-circle" class="w-5 h-5"></i>
      </a>
    `;

    const mobTabs = [
      { key: 'inicio', label: 'Inicio', icon: 'home' },
      { key: 'catalogo', label: 'Catálogo', icon: 'shopping-bag' },
      { key: 'pasarela', label: 'Pasarela', icon: 'wallet', center: true },
      { key: 'trabajos', label: 'Trabajos', icon: 'clock' },
      { key: 'contacto', label: 'Contacto', icon: 'message-circle' }
    ];

    mobileNav.innerHTML = mobTabs.map(tab => {
      const active = t === tab.key;
      if (tab.center) {
        return `
          <button onclick="switchPublicTab('${tab.key}')" aria-label="${tab.label}" title="${tab.label}" class="mobile-pill-center ${active ? 'is-active' : ''}">
            <i data-lucide="${tab.icon}" class="w-5 h-5"></i>
          </button>
        `;
      }
      return `
        <button onclick="switchPublicTab('${tab.key}')" aria-label="${tab.label}" title="${tab.label}" class="mobile-pill-item ${active ? 'is-active' : ''}">
          <i data-lucide="${tab.icon}" class="w-5 h-5"></i>
          ${active ? `<span class="mobile-pill-dot"></span>` : ''}
        </button>
      `;
    }).join('');

    navActions.innerHTML = `
      <button onclick="toggleCartDrawer()" title="Carrito" class="relative p-2.5 rounded-full bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 transition">
        <i data-lucide="shopping-cart" class="w-4 h-4 sm:w-5 sm:h-5"></i>
        <span id="cart-count-badge" class="hidden absolute -top-1 -right-1 px-1.5 min-w-[18px] h-[18px] rounded-full bg-emerald-500 text-[10px] font-extrabold text-slate-950 flex items-center justify-center">0</span>
      </button>
      <a href="#" target="_blank" rel="noopener" class="dyn-wa-direct hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-extrabold text-slate-950 bg-[#25D366] hover:bg-[#1ebe5d] transition">
        <i data-lucide="send" class="w-3.5 h-3.5"></i>
        <span>WhatsApp</span>
      </a>
    `;
  } else {
    const t = STORE_STATE.adminTab;
    if (modeBadge) {
      modeBadge.textContent = 'Modo Admin';
      modeBadge.className = 'hidden sm:inline-block px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40';
    }

    const tabs = [
      { key: 'catalogo', label: 'Catálogo', icon: 'shopping-bag' },
      { key: 'proyectos', label: 'Proyectos', icon: 'briefcase' },
      { key: 'trabajos', label: 'Trabajos', icon: 'clock' },
      { key: 'pasarela', label: 'Pasarela', icon: 'wallet' },
      { key: 'tienda', label: 'Tienda', icon: 'sliders' },
      { key: 'seguridad', label: 'Seguridad', icon: 'shield-check' }
    ];

    topIcons.innerHTML = tabs.map(tab => `
      <button onclick="switchAdminTab('${tab.key}')" title="${tab.label}" class="w-10 h-10 rounded-full flex items-center justify-center transition ${t === tab.key ? 'bg-white text-slate-950 shadow' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}">
        <i data-lucide="${tab.icon}" class="w-5 h-5"></i>
      </button>
    `).join('');

    bottomIcons.innerHTML = `
      <button onclick="switchView('public')" title="Ver Tienda" class="w-10 h-10 rounded-full text-sky-300 hover:bg-sky-500/20 flex items-center justify-center transition">
        <i data-lucide="eye" class="w-5 h-5"></i>
      </button>
      ${STORE_STATE.isAdminAuthenticated ? `
        <button onclick="logoutAdmin()" title="Salir" class="w-10 h-10 rounded-full text-rose-300 hover:bg-rose-500/20 flex items-center justify-center transition">
          <i data-lucide="log-out" class="w-5 h-5"></i>
        </button>
      ` : ''}
    `;

    const mobAdminTabs = [
      { key: 'catalogo', label: 'Catálogo', icon: 'shopping-bag' },
      { key: 'proyectos', label: 'Proyectos', icon: 'briefcase' },
      { key: 'pasarela', label: 'Pasarela', icon: 'wallet', center: true },
      { key: 'trabajos', label: 'Trabajos', icon: 'clock' },
      { key: 'tienda', label: 'Tienda', icon: 'sliders' }
    ];

    mobileNav.innerHTML = STORE_STATE.isAdminAuthenticated ? mobAdminTabs.map(tab => {
      const active = t === tab.key;
      if (tab.center) {
        return `
          <button onclick="switchAdminTab('${tab.key}')" aria-label="${tab.label}" title="${tab.label}" class="mobile-pill-center ${active ? 'is-active' : ''}">
            <i data-lucide="${tab.icon}" class="w-5 h-5"></i>
          </button>
        `;
      }
      return `
        <button onclick="switchAdminTab('${tab.key}')" aria-label="${tab.label}" title="${tab.label}" class="mobile-pill-item ${active ? 'is-active' : ''}">
          <i data-lucide="${tab.icon}" class="w-5 h-5"></i>
          ${active ? `<span class="mobile-pill-dot"></span>` : ''}
        </button>
      `;
    }).join('') : `
      <button onclick="switchView('public')" class="text-xs font-bold text-sky-400 py-1">Volver a la Tienda</button>
    `;

    navActions.innerHTML = `
      <button onclick="switchView('public')" class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold text-sky-300 bg-sky-500/15 border border-sky-500/30">
        <i data-lucide="eye" class="w-3.5 h-3.5"></i> <span>Tienda</span>
      </button>
      ${STORE_STATE.isAdminAuthenticated ? `
        <button onclick="logoutAdmin()" class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold text-rose-300 bg-rose-500/15 border border-rose-500/30">
          <i data-lucide="log-out" class="w-3.5 h-3.5"></i> <span>Salir</span>
        </button>
      ` : ''}
    `;
  }
}

function renderCommonPublicTexts() {
  const c = STORE_STATE.config;
  document.querySelectorAll('.dyn-brand-name').forEach(el => { el.textContent = c.brandName; });
  const waUrl = buildWhatsAppUrl(c.welcomeMessage, c);
  document.querySelectorAll('.dyn-wa-direct').forEach(el => { el.href = waUrl; });
}

// --- MÓDULO 1: INICIO ---
function renderHomeModule() {
  const c = STORE_STATE.config;
  const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setTxt('dyn-hero-greeting', c.heroGreeting);
  setTxt('dyn-hero-highlight', c.heroHighlight);
  setTxt('dyn-hero-subtitle', c.heroSubtitle);

  const activePlans = STORE_STATE.paymentPlans.filter(p => p.active !== false);
  const rates = STORE_STATE.bcvRates || loadCachedBcvRates();

  setTxt('public-stat-count', STORE_STATE.catalog.length);
  setTxt('public-stat-plans', activePlans.length);
  setTxt('bento-bcv-usd', `Bs. ${Number(rates.usd).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  setTxt('bento-bcv-eur', `Bs. ${Number(rates.eur).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

  const updatedText = rates.updatedAt
    ? `Actualizado: ${new Date(rates.updatedAt).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })} · ${rates.source}`
    : rates.source;
  setTxt('bento-bcv-updated', updatedText);

  populateHomeSelectors();

  const portEl = document.getElementById('home-portfolio-grid');
  if (portEl) {
    portEl.innerHTML = STORE_STATE.projects.length
      ? STORE_STATE.projects.map(p => renderProjectCardHtml(p)).join('')
      : `<div class="col-span-full text-center text-slate-400 text-xs py-6">Aún no hay proyectos cargados en el portafolio.</div>`;
  }

  const spnSec = document.getElementById('home-sponsors-section');
  const spnGrid = document.getElementById('home-sponsors-grid');
  if (spnSec && spnGrid) {
    spnSec.classList.toggle('hidden', STORE_STATE.sponsors.length === 0);
    spnGrid.innerHTML = STORE_STATE.sponsors.map(s => `
      <div class="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="text-[10px] font-bold uppercase tracking-wider text-amber-300">${escapeHtml(s.role)}</div>
          <div class="font-bold text-white text-sm truncate mt-0.5">${escapeHtml(s.name)}</div>
          <p class="text-xs text-slate-400 mt-1 leading-snug">${escapeHtml(s.description)}</p>
        </div>
        ${s.url ? `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 text-[11px] font-bold shrink-0">Visitar</a>` : ''}
      </div>
    `).join('');
  }
}

function normalizeExternalImageUrl(rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!url || url.startsWith('data:')) return url;
  // Convierte enlaces compartidos de Google Drive en enlace directo de imagen
  const m1 = url.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i);
  if (m1) return `https://lh3.googleusercontent.com/d/${m1[1]}=w1000`;
  const m2 = url.match(/drive\.google\.com\/(?:open|uc)\?[^#]*id=([^&#]+)/i);
  if (m2) return `https://lh3.googleusercontent.com/d/${m2[1]}=w1000`;
  return url;
}

function renderProjectCardHtml(p) {
  const imgs = (Array.isArray(p.images) ? p.images : []).map(normalizeExternalImageUrl);
  const tagsHtml = (p.tags || []).map(tag => `<span class="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-800/90 text-indigo-300 border border-slate-700">${escapeHtml(tag)}</span>`).join('');

  const previewInner = imgs.length
    ? `<img src="${imgs[0]}" alt="${escapeHtml(p.title)}" class="w-full h-full object-cover" />`
    : `<div class="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-indigo-950/60 p-4 text-center">
         <i data-lucide="briefcase" class="w-8 h-8 text-indigo-400 mb-2"></i>
         <span class="text-xs font-bold text-slate-200 line-clamp-2">${escapeHtml(p.summary)}</span>
       </div>`;

  return `
    <article class="chilly-main">
      <div class="chilly-card-back"></div>

      <div onclick="openProjectDetailModal('${p.id}')" class="chilly-card group">
        <div class="chilly-fl">
          <div class="chilly-fullscreen" title="Ver detalle completo">
            <svg viewBox="0 0 100 100" class="chilly-fullscreen-svg"><path d="M3.563-.004a3.573 3.573 0 0 0-3.527 4.09l-.004-.02v28.141c0 1.973 1.602 3.57 3.57 3.57s3.57-1.598 3.57-3.57V12.218v.004l22.461 22.461a3.571 3.571 0 0 0 6.093-2.527c0-.988-.398-1.879-1.047-2.523L12.218 7.172h19.989c1.973 0 3.57-1.602 3.57-3.57s-1.598-3.57-3.57-3.57H4.035a3.008 3.008 0 0 0-.473-.035zM96.333 0l-.398.035.02-.004h-28.16a3.569 3.569 0 0 0-3.57 3.57 3.569 3.569 0 0 0 3.57 3.57h19.989L65.323 29.632a3.555 3.555 0 0 0-1.047 2.523 3.571 3.571 0 0 0 6.093 2.527L92.83 12.221v19.985a3.569 3.569 0 0 0 3.57 3.57 3.569 3.569 0 0 0 3.57-3.57V4.034v.004a3.569 3.569 0 0 0-3.539-4.043l-.105.004zM3.548 64.23A3.573 3.573 0 0 0 .029 67.8v28.626-.004l.016.305-.004-.016.004.059v-.012l.039.289-.004-.023.023.121-.004-.023c.074.348.191.656.34.938l-.008-.02.055.098-.008-.02.148.242-.008-.012.055.082-.008-.012c.199.285.43.531.688.742l.008.008.031.027.004.004c.582.461 1.32.742 2.121.762h.004l.078.004h28.61a3.569 3.569 0 0 0 3.57-3.57 3.569 3.569 0 0 0-3.57-3.57H12.224l22.461-22.461a3.569 3.569 0 0 0-2.492-6.125l-.105.004h.008a3.562 3.562 0 0 0-2.453 1.074L7.182 87.778V67.793a3.571 3.571 0 0 0-3.57-3.57h-.055.004zm92.805 0a3.573 3.573 0 0 0-3.519 3.57v19.993-.004L70.373 65.328a3.553 3.553 0 0 0-2.559-1.082h-.004a3.573 3.573 0 0 0-3.566 3.57c0 1.004.414 1.91 1.082 2.555l22.461 22.461H67.802a3.57 3.57 0 1 0 0 7.14h28.606c.375 0 .742-.059 1.082-.168l-.023.008.027-.012-.02.008.352-.129-.023.008.039-.02-.02.008.32-.156-.02.008.023-.016-.008.008c.184-.102.34-.207.488-.32l-.008.008.137-.113-.008.004.223-.211.008-.008c.156-.164.301-.34.422-.535l.008-.016-.008.016.008-.02.164-.285.008-.02-.008.016.008-.02c.098-.188.184-.406.246-.633l.008-.023-.004.008.008-.023a3.44 3.44 0 0 0 .121-.852v-.004l.004-.078V67.804a3.569 3.569 0 0 0-3.57-3.57h-.055.004z"></path></svg>
          </div>
        </div>
        ${previewInner}
        <div class="absolute bottom-2 left-2 flex gap-1.5 z-10">
          <span class="px-2 py-0.5 rounded-md bg-slate-950/85 text-[10px] font-bold text-emerald-300 border border-white/10">${escapeHtml(p.status)} · ${escapeHtml(p.year)}</span>
          ${imgs.length > 1 ? `<span class="px-2 py-0.5 rounded-md bg-slate-950/85 text-[10px] font-bold text-white border border-white/10">${imgs.length} fotos</span>` : ''}
        </div>
      </div>

      <div class="chilly-data">
        <div class="chilly-img text-indigo-400">
          <i data-lucide="briefcase" class="w-5 h-5"></i>
        </div>
        <div class="chilly-text">
          <div class="chilly-text-m truncate">${escapeHtml(p.title)}</div>
          <div class="chilly-text-s truncate">${escapeHtml(p.category)} · Cliente: ${escapeHtml(p.client)}</div>
          ${tagsHtml ? `<div class="flex flex-wrap gap-1 mt-1.5">${tagsHtml}</div>` : ''}
        </div>
      </div>

      <div class="chilly-btns">
        <button onclick="openProjectDetailModal('${p.id}')" class="chilly-pill-btn">
          <i data-lucide="eye" class="w-3.5 h-3.5 text-sky-400"></i>
          <span>Ver Detalle</span>
        </button>
        ${p.url ? `<a href="${escapeHtml(p.url)}" target="_blank" rel="noopener" class="chilly-pill-btn !bg-indigo-600 hover:!bg-indigo-500">Demo</a>` : ''}
      </div>
    </article>
  `;
}

function renderProjectsModule() {
  const grid = document.getElementById('projects-grid');
  if (!grid) return;
  grid.innerHTML = STORE_STATE.projects.length
    ? STORE_STATE.projects.map(p => renderProjectCardHtml(p)).join('')
    : `<div class="col-span-full bento-card p-8 text-center text-slate-400 text-sm">No hay proyectos registrados todavía.</div>`;
  if (window.lucide) window.lucide.createIcons();
}

function populateHomeSelectors() {
  const catSel = document.getElementById('home-select-sales-catalog');
  const subSel = document.getElementById('home-select-category');
  if (catSel) {
    catSel.innerHTML = `<option value="todos">Todos los Catálogos</option>` +
      STORE_STATE.salesCatalogs.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  }
  if (subSel) {
    subSel.innerHTML = `<option value="todas">Todas las Categorías</option>` +
      STORE_STATE.categories.map(cat => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join('');
  }
}

function jumpToCatalogFromHome() {
  const catSel = document.getElementById('home-select-sales-catalog');
  const subSel = document.getElementById('home-select-category');
  if (catSel) STORE_STATE.filterSalesCatalog = catSel.value;
  if (subSel) STORE_STATE.filterCategory = subSel.value;
  switchPublicTab('catalogo');
}

function populateCatalogSelectors() {
  const catSel = document.getElementById('filter-sales-catalog');
  const subSel = document.getElementById('filter-category-select');
  if (catSel) {
    catSel.innerHTML = `<option value="todos">Todos los Catálogos</option>` +
      STORE_STATE.salesCatalogs.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    catSel.value = STORE_STATE.filterSalesCatalog;
  }
  if (subSel) {
    subSel.innerHTML = `<option value="todas">Todas las Categorías</option>` +
      STORE_STATE.categories.map(cat => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join('');
    subSel.value = STORE_STATE.filterCategory;
  }
}

function setSalesCatalogFilter(val) {
  STORE_STATE.filterSalesCatalog = val;
  renderCatalog();
}

function setCategoryFilter(val) {
  STORE_STATE.filterCategory = val;
  renderCatalog();
}

function getSalesCatalogName(catalogId) {
  return STORE_STATE.salesCatalogs.find(c => c.id === catalogId)?.name || 'Catálogo General';
}

// --- MÓDULO 2: CATÁLOGO ---
function setCatalogFilter(type) {
  STORE_STATE.filterType = type;
  updateFilterButtonsUI();
  renderCatalog();
}

function updateFilterButtonsUI() {
  ['todos', 'producto', 'servicio'].forEach(t => {
    const btn = document.getElementById(`filter-btn-${t}`);
    if (!btn) return;
    btn.className = t === STORE_STATE.filterType
      ? 'px-4 py-1.5 rounded-full text-xs font-bold bg-sky-600 text-white transition'
      : 'px-4 py-1.5 rounded-full text-xs font-medium text-slate-300 hover:text-white transition';
  });
}

function handleCatalogSearch(value) {
  STORE_STATE.searchQuery = value.trim().toLowerCase();
  if (STORE_STATE.currentView === 'public' && STORE_STATE.publicTab !== 'catalogo' && STORE_STATE.searchQuery) {
    switchPublicTab('catalogo');
    return;
  }
  renderCatalog();
}

function getAllowedPlansForItem(item) {
  const activePlans = STORE_STATE.paymentPlans.filter(p => p.active !== false);
  const ids = Array.isArray(item.allowedPlanIds) ? item.allowedPlanIds : [];
  return activePlans.filter(p => ids.includes(p.id));
}

function renderCatalogCardHtml(item) {
  const cfg = STORE_STATE.config;
  const isSrv = item.type === 'servicio';
  const typeColor = isSrv ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : 'bg-sky-500/20 text-sky-300 border-sky-500/30';
  const itemPlans = getAllowedPlansForItem(item);
  const imgs = (Array.isArray(item.images) ? item.images : []).map(normalizeExternalImageUrl);

  const previewInner = imgs.length
    ? `<img src="${imgs[0]}" alt="${escapeHtml(item.name)}" class="w-full h-full object-cover" />`
    : `<div class="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-sky-950/60 p-4 text-center">
         <i data-lucide="${escapeHtml(item.icon || 'shopping-bag')}" class="w-9 h-9 text-sky-400 mb-2"></i>
         <span class="text-xs text-slate-300 line-clamp-2">${escapeHtml(item.description)}</span>
       </div>`;

  const plansPills = itemPlans.length
    ? itemPlans.map(p => `<span class="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-800/90 text-sky-300 border border-slate-700">${escapeHtml(p.name)}</span>`).join('')
    : `<span class="text-[10px] text-amber-300">Consultar modalidad</span>`;

  return `
    <article class="chilly-main">
      <div class="chilly-card-back"></div>

      <div onclick="openItemDetailModal('${item.id}')" class="chilly-card group">
        <div class="chilly-fl">
          <div class="chilly-fullscreen" title="Ver detalle completo">
            <svg viewBox="0 0 100 100" class="chilly-fullscreen-svg"><path d="M3.563-.004a3.573 3.573 0 0 0-3.527 4.09l-.004-.02v28.141c0 1.973 1.602 3.57 3.57 3.57s3.57-1.598 3.57-3.57V12.218v.004l22.461 22.461a3.571 3.571 0 0 0 6.093-2.527c0-.988-.398-1.879-1.047-2.523L12.218 7.172h19.989c1.973 0 3.57-1.602 3.57-3.57s-1.598-3.57-3.57-3.57H4.035a3.008 3.008 0 0 0-.473-.035zM96.333 0l-.398.035.02-.004h-28.16a3.569 3.569 0 0 0-3.57 3.57 3.569 3.569 0 0 0 3.57 3.57h19.989L65.323 29.632a3.555 3.555 0 0 0-1.047 2.523 3.571 3.571 0 0 0 6.093 2.527L92.83 12.221v19.985a3.569 3.569 0 0 0 3.57 3.57 3.569 3.569 0 0 0 3.57-3.57V4.034v.004a3.569 3.569 0 0 0-3.539-4.043l-.105.004zM3.548 64.23A3.573 3.573 0 0 0 .029 67.8v28.626-.004l.016.305-.004-.016.004.059v-.012l.039.289-.004-.023.023.121-.004-.023c.074.348.191.656.34.938l-.008-.02.055.098-.008-.02.148.242-.008-.012.055.082-.008-.012c.199.285.43.531.688.742l.008.008.031.027.004.004c.582.461 1.32.742 2.121.762h.004l.078.004h28.61a3.569 3.569 0 0 0 3.57-3.57 3.569 3.569 0 0 0-3.57-3.57H12.224l22.461-22.461a3.569 3.569 0 0 0-2.492-6.125l-.105.004h.008a3.562 3.562 0 0 0-2.453 1.074L7.182 87.778V67.793a3.571 3.571 0 0 0-3.57-3.57h-.055.004zm92.805 0a3.573 3.573 0 0 0-3.519 3.57v19.993-.004L70.373 65.328a3.553 3.553 0 0 0-2.559-1.082h-.004a3.573 3.573 0 0 0-3.566 3.57c0 1.004.414 1.91 1.082 2.555l22.461 22.461H67.802a3.57 3.57 0 1 0 0 7.14h28.606c.375 0 .742-.059 1.082-.168l-.023.008.027-.012-.02.008.352-.129-.023.008.039-.02-.02.008.32-.156-.02.008.023-.016-.008.008c.184-.102.34-.207.488-.32l-.008.008.137-.113-.008.004.223-.211.008-.008c.156-.164.301-.34.422-.535l.008-.016-.008.016.008-.02.164-.285.008-.02-.008.016.008-.02c.098-.188.184-.406.246-.633l.008-.023-.004.008.008-.023a3.44 3.44 0 0 0 .121-.852v-.004l.004-.078V67.804a3.569 3.569 0 0 0-3.57-3.57h-.055.004z"></path></svg>
          </div>
        </div>
        ${previewInner}
        <div class="absolute bottom-2 left-2 flex flex-wrap gap-1.5 z-10">
          <span class="px-2 py-0.5 rounded-md bg-slate-950/85 text-[10px] font-bold border ${typeColor}">${isSrv ? 'Servicio' : 'Producto'} · ${escapeHtml(item.category)}</span>
          ${item.badge ? `<span class="px-2 py-0.5 rounded-md bg-slate-950/85 text-[10px] font-bold text-emerald-300 border border-emerald-500/30">${escapeHtml(item.badge)}</span>` : ''}
          ${imgs.length > 1 ? `<span class="px-2 py-0.5 rounded-md bg-slate-950/85 text-[10px] font-bold text-white border border-white/10">${imgs.length} fotos</span>` : ''}
        </div>
      </div>

      <div class="chilly-data">
        <div class="chilly-img text-sky-400">
          <i data-lucide="${escapeHtml(item.icon || 'shopping-bag')}" class="w-5 h-5"></i>
        </div>
        <div class="chilly-text">
          <div class="chilly-text-m truncate">${escapeHtml(item.name)}</div>
          <div class="flex flex-wrap items-center gap-2 mt-0.5">
            <span class="text-sm font-extrabold text-emerald-400">${escapeHtml(cfg.currencySymbol)}${item.price}</span>
            <span class="text-[11px] font-semibold text-sky-300">&approx; ${formatBs(item.price, STORE_STATE.bcvRates?.usd)}</span>
          </div>
          <div class="chilly-text-s truncate mt-0.5">${escapeHtml(getSalesCatalogName(item.salesCatalogId))}</div>
          <div class="flex flex-wrap gap-1 mt-1.5">${plansPills}</div>
        </div>
      </div>

      <div class="chilly-btns">
        <button onclick="openItemDetailModal('${item.id}')" class="chilly-pill-btn">
          <i data-lucide="eye" class="w-3.5 h-3.5 text-sky-400"></i>
          <span>Detalle</span>
        </button>
        <button onclick="addToCart('${item.id}', this)" title="Agregar al carrito" class="uiverse-add-btn" aria-label="Agregar al carrito">
          <svg class="uiverse-add-icon" viewBox="0 0 576 512">
            <path d="M0 24C0 10.7 10.7 0 24 0H69.5c22 0 41.5 12.8 50.6 32h411c26.3 0 45.5 25 38.6 50.4l-41 152.3c-8.5 31.4-37 53.3-69.5 53.3H170.7l5.4 28.5c2.2 11.3 12.1 19.5 23.6 19.5H488c13.3 0 24 10.7 24 24s-10.7 24-24 24H199.7c-34.6 0-64.3-24.6-70.7-58.5L77.4 54.5c-.7-3.8-4-6.5-7.9-6.5H24C10.7 48 0 37.3 0 24zM128 464a48 48 0 1 1 96 0 48 48 0 1 1 -96 0zm336-48a48 48 0 1 1 0 96 48 48 0 1 1 0-96zM252 160c0 11 9 20 20 20h44v44c0 11 9 20 20 20s20-9 20-20V180h44c11 0 20-9 20-20s-9-20-20-20H356V96c0-11-9-20-20-20s-20 9-20 20v44H272c-11 0-20 9-20 20z"></path>
          </svg>
        </button>
        <button onclick="openPasarelaForItem('${item.id}')" class="chilly-pill-btn !bg-sky-600 hover:!bg-sky-500 flex-1">
          <i data-lucide="wallet" class="w-3.5 h-3.5"></i>
          <span>Adquirir</span>
        </button>
      </div>
    </article>
  `;
}

function renderCatalog() {
  const grid = document.getElementById('catalog-grid');
  if (!grid) return;

  const filtered = STORE_STATE.catalog.filter(item => {
    const matchesCatalog = STORE_STATE.filterSalesCatalog === 'todos' || item.salesCatalogId === STORE_STATE.filterSalesCatalog;
    const matchesCategory = STORE_STATE.filterCategory === 'todas' || item.category === STORE_STATE.filterCategory;
    const matchesType = STORE_STATE.filterType === 'todos' || item.type === STORE_STATE.filterType;
    const matchesSearch = !STORE_STATE.searchQuery ||
      item.name.toLowerCase().includes(STORE_STATE.searchQuery) ||
      item.category.toLowerCase().includes(STORE_STATE.searchQuery) ||
      getSalesCatalogName(item.salesCatalogId).toLowerCase().includes(STORE_STATE.searchQuery) ||
      item.description.toLowerCase().includes(STORE_STATE.searchQuery);
    return matchesCatalog && matchesCategory && matchesType && matchesSearch;
  });

  grid.innerHTML = filtered.length
    ? filtered.map(item => renderCatalogCardHtml(item)).join('')
    : `<div class="col-span-full bento-card p-8 text-center text-slate-400 text-sm">No se encontraron productos o servicios.</div>`;

  if (window.lucide) window.lucide.createIcons();
}

// --- CARRITO ---
function loadCartFromStorage() {
  try {
    const saved = localStorage.getItem(STORE_STORAGE_KEYS.CART);
    if (saved) STORE_STATE.cart = JSON.parse(saved);
  } catch (e) { STORE_STATE.cart = []; }
}

function saveCartToStorage() {
  try { localStorage.setItem(STORE_STORAGE_KEYS.CART, JSON.stringify(STORE_STATE.cart)); } catch (e) {}
}

function toggleCartDrawer() {
  const drawer = document.getElementById('cart-drawer');
  STORE_STATE.isCartOpen = !STORE_STATE.isCartOpen;
  if (drawer) drawer.classList.toggle('hidden', !STORE_STATE.isCartOpen);
}

function addToCart(itemId, btnEl = null) {
  const item = STORE_STATE.catalog.find(i => i.id === itemId);
  if (!item) return;

  if (btnEl) {
    btnEl.classList.add('is-animating');
    setTimeout(() => btnEl.classList.remove('is-animating'), 650);
  }

  const existing = STORE_STATE.cart.find(c => c.id === itemId);
  if (existing) existing.qty += 1;
  else STORE_STATE.cart.push({ id: item.id, name: item.name, price: Number(item.price), type: item.type, qty: 1 });
  saveCartToStorage();
  renderCart();
  showToast(`"${item.name}" agregado al carrito`);
}

function updateCartQty(itemId, delta) {
  const idx = STORE_STATE.cart.findIndex(c => c.id === itemId);
  if (idx === -1) return;
  STORE_STATE.cart[idx].qty += delta;
  if (STORE_STATE.cart[idx].qty <= 0) STORE_STATE.cart.splice(idx, 1);
  saveCartToStorage();
  renderCart();
  if (STORE_STATE.publicTab === 'pasarela') renderPasarelaModule();
}

function clearCart() {
  STORE_STATE.cart = [];
  saveCartToStorage();
  renderCart();
  if (STORE_STATE.publicTab === 'pasarela') renderPasarelaModule();
}

function calculateCouponDiscount(subtotal, coupon) {
  if (!coupon) return 0;
  const val = Number(coupon.discountValue || 0);
  if (val <= 0) return 0;
  if (coupon.discountType === 'fixed') return Math.min(subtotal, val);
  return Math.min(subtotal, (subtotal * val) / 100);
}

function validateAndApplyCouponCode(rawCode) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) return null;

  const found = STORE_STATE.coupons.find(c => c.code.toUpperCase() === code && c.active !== false);
  if (!found) {
    showToast(`Código "${code}" no encontrado o inactivo`, 'error');
    return null;
  }

  if (found.expiresAt) {
    const today = new Date().toISOString().slice(0, 10);
    if (today > found.expiresAt) {
      showToast(`El código "${code}" expiró el ${found.expiresAt}`, 'error');
      return null;
    }
  }

  STORE_STATE.appliedCoupon = found;
  showToast(found.kind === 'especial'
    ? `Código especial "${found.code}" reconocido`
    : `Cupón "${found.code}" aplicado`);
  return found;
}

function clearAppliedCoupon() {
  STORE_STATE.appliedCoupon = null;
  renderCart();
  if (STORE_STATE.publicTab === 'pasarela') renderPasarelaModule();
}

function handleApplyCartCoupon(e) {
  e.preventDefault();
  const input = document.getElementById('cart-coupon-input');
  const val = input ? input.value.trim() : '';
  if (!val) return;
  validateAndApplyCouponCode(val);
  renderCart();
  if (STORE_STATE.publicTab === 'pasarela') renderPasarelaModule();
}

function renderCart() {
  const listEl = document.getElementById('cart-items-list');
  const badgeEl = document.getElementById('cart-count-badge');
  const countLabelEl = document.getElementById('cart-items-count-label');
  const subtotalUsdEl = document.getElementById('cart-subtotal-usd');
  const discLabelEl = document.getElementById('cart-discount-label');
  const discAmtEl = document.getElementById('cart-discount-amount');
  const feedbackEl = document.getElementById('cart-coupon-feedback');
  const totalEl = document.getElementById('cart-total-amount');
  const totalBsEl = document.getElementById('cart-total-bs');
  const btn = document.getElementById('cart-checkout-btn');
  const sym = STORE_STATE.config.currencySymbol;
  const usdRate = STORE_STATE.bcvRates?.usd || 0;

  const totalItems = STORE_STATE.cart.reduce((s, i) => s + i.qty, 0);
  const subtotalPrice = STORE_STATE.cart.reduce((s, i) => s + (i.price * i.qty), 0);
  const coupon = STORE_STATE.appliedCoupon;
  const discount = calculateCouponDiscount(subtotalPrice, coupon);
  const finalPrice = Math.max(0, subtotalPrice - discount);

  if (badgeEl) {
    badgeEl.textContent = totalItems;
    badgeEl.classList.toggle('hidden', totalItems === 0);
  }
  if (countLabelEl) countLabelEl.textContent = `${totalItems} artículo${totalItems === 1 ? '' : 's'}`;
  if (subtotalUsdEl) subtotalUsdEl.textContent = `${sym}${subtotalPrice.toFixed(2)}`;
  if (discLabelEl && discAmtEl) {
    discLabelEl.classList.toggle('hidden', discount <= 0);
    discAmtEl.classList.toggle('hidden', discount <= 0);
    if (discount > 0) discAmtEl.textContent = `-${sym}${discount.toFixed(2)}`;
  }
  if (feedbackEl) {
    if (coupon) {
      feedbackEl.classList.remove('hidden');
      feedbackEl.innerHTML = `
        <div class="p-2.5 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-200 flex items-start justify-between gap-2">
          <div>
            <div class="font-bold text-white">${escapeHtml(coupon.code)} · ${coupon.kind === 'especial' ? 'Código Especial' : 'Descuento'}</div>
            <div class="text-[11px] text-slate-300 mt-0.5">${escapeHtml(coupon.specifications)}</div>
          </div>
          <button type="button" onclick="clearAppliedCoupon()" class="text-rose-400 font-bold px-1">&times;</button>
        </div>
      `;
    } else {
      feedbackEl.classList.add('hidden');
      feedbackEl.innerHTML = '';
    }
  }
  if (totalEl) totalEl.textContent = `${sym}${finalPrice.toFixed(2)}`;
  if (totalBsEl) totalBsEl.textContent = formatBs(finalPrice, usdRate);
  if (!listEl) return;

  if (!STORE_STATE.cart.length) {
    listEl.innerHTML = `<div class="text-center py-8 text-slate-400 text-xs font-semibold">Tu carrito está vacío.</div>`;
    if (btn) btn.classList.add('opacity-50', 'pointer-events-none');
  } else {
    listEl.innerHTML = STORE_STATE.cart.map(i => `
      <div class="wb-product">
        <div class="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
          <i data-lucide="${i.type === 'servicio' ? 'layers' : 'shopping-bag'}" class="w-4 h-4"></i>
        </div>
        <div class="min-w-0">
          <span class="wb-prod-name truncate">${escapeHtml(i.name)}</span>
          <p class="wb-prod-meta">${i.type === 'servicio' ? 'Servicio' : 'Producto'} · ${escapeHtml(sym)}${i.price} c/u</p>
        </div>
        <div class="wb-quantity">
          <button onclick="updateCartQty('${i.id}', -1)" aria-label="Restar">
            <svg fill="none" viewBox="0 0 24 24" height="13" width="13" xmlns="http://www.w3.org/2000/svg">
              <path stroke-linejoin="round" stroke-linecap="round" stroke-width="2.5" stroke="#CBD5E1" d="M20 12L4 12"></path>
            </svg>
          </button>
          <label>${i.qty}</label>
          <button onclick="updateCartQty('${i.id}', 1)" aria-label="Sumar">
            <svg fill="none" viewBox="0 0 24 24" height="13" width="13" xmlns="http://www.w3.org/2000/svg">
              <path stroke-linejoin="round" stroke-linecap="round" stroke-width="2.5" stroke="#CBD5E1" d="M12 4V20M20 12H4"></path>
            </svg>
          </button>
        </div>
        <label class="wb-small">${escapeHtml(sym)}${(i.price * i.qty).toFixed(2)}</label>
      </div>
    `).join('');
    if (btn) btn.classList.remove('opacity-50', 'pointer-events-none');
    if (window.lucide) window.lucide.createIcons();
  }
}

// ============================================================================
// MÓDULO 3: PASARELA DE PAGO (SOLO PLANES ASIGNADOS POR EL ADMIN AL PRODUCTO)
// ============================================================================

function openPasarelaForItem(itemId) {
  const item = STORE_STATE.catalog.find(i => i.id === itemId);
  if (!item) return;
  clearPendingWaitScreen();
  STORE_STATE.checkoutDirectItem = { id: item.id, name: item.name, price: Number(item.price), type: item.type, qty: 1 };
  STORE_STATE.selectedPlanId = null;
  switchPublicTab('pasarela');
}

function goToCheckoutFromCart() {
  clearPendingWaitScreen();
  STORE_STATE.checkoutDirectItem = null;
  STORE_STATE.selectedPlanId = null;
  if (STORE_STATE.isCartOpen) toggleCartDrawer();
  switchPublicTab('pasarela');
}

function getCheckoutItems() {
  return STORE_STATE.checkoutDirectItem ? [STORE_STATE.checkoutDirectItem] : STORE_STATE.cart;
}

function getCompatiblePlansForCheckout(items) {
  const activePlans = STORE_STATE.paymentPlans.filter(p => p.active !== false);
  if (!items.length) return [];

  // Intersección de planes permitidos en todos los productos del pedido
  let allowedIds = null;
  for (const ci of items) {
    const fullItem = STORE_STATE.catalog.find(x => x.id === ci.id);
    const ids = fullItem && Array.isArray(fullItem.allowedPlanIds) ? fullItem.allowedPlanIds : [];
    if (allowedIds === null) {
      allowedIds = [...ids];
    } else {
      allowedIds = allowedIds.filter(id => ids.includes(id));
    }
  }

  return activePlans.filter(p => (allowedIds || []).includes(p.id));
}

function selectCheckoutPlan(planId) {
  STORE_STATE.selectedPlanId = planId;
  renderPasarelaModule();
}

function selectCheckoutAccount(accId) {
  STORE_STATE.selectedAccountId = accId;
  renderPasarelaModule();
}

function renderPasarelaModule() {
  const container = document.getElementById('pasarela-content-container');
  if (!container) return;

  // Si el cliente tiene un pago reciente esperando confirmación del Admin, mostrar pantalla de espera Typewriter
  const lastPay = loadFromStorage(STORE_STORAGE_KEYS.LAST_CUSTOMER_PAYMENT, null);
  if (lastPay && lastPay.reportId) {
    const reports = loadPaymentReports();
    const rep = reports.find(r => r.id === lastPay.reportId);
    if (rep && rep.status === 'Pendiente') {
      const sym = STORE_STATE.config.currencySymbol;
      container.innerHTML = `
        <div class="lg:col-span-12 bento-card p-8 sm:p-12 text-center flex flex-col items-center justify-center space-y-6 border border-sky-500/30">
          <div class="pt-6 pb-2">
            <div class="uiverse-typewriter" aria-label="Esperando confirmación">
              <div class="tw-slide"><i></i></div>
              <div class="tw-paper"></div>
              <div class="tw-keyboard"></div>
            </div>
          </div>

          <div class="space-y-2 max-w-lg">
            <span class="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
              Esperando confirmación de pago
            </span>
            <h3 class="text-xl sm:text-2xl font-extrabold text-white">Estamos verificando tu pago</h3>
            <p class="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Tu reporte (<strong class="text-sky-300">${escapeHtml(rep.jobCode)}</strong>) por <strong class="text-emerald-400">${escapeHtml(sym)}${Number(rep.amountReported).toFixed(2)}</strong> fue registrado. En cuanto el administrador confirme el pago, recibirás una notificación aquí para recibir o descargar tu servicio/producto.
            </p>
          </div>

          <div class="flex flex-wrap items-center justify-center gap-3">
            <button onclick="checkCustomerPaymentStatus(true)" class="px-5 py-2.5 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white transition flex items-center gap-1.5">
              <i data-lucide="refresh-cw" class="w-4 h-4"></i>
              <span>Verificar si ya fue confirmado</span>
            </button>
            <button onclick="switchPublicTab('trabajos')" class="px-5 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition">
              Ir a Mis Trabajos
            </button>
            <button onclick="startAnotherOrderFromWait()" class="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition">
              Hacer otro pedido
            </button>
          </div>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }
  }

  const sym = STORE_STATE.config.currencySymbol;
  const items = getCheckoutItems();

  if (!items.length) {
    container.innerHTML = `
      <div class="lg:col-span-12 bento-card p-10 text-center space-y-4">
        <div class="w-14 h-14 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 mx-auto">
          <i data-lucide="wallet" class="w-7 h-7"></i>
        </div>
        <h3 class="text-lg font-extrabold text-white">No hay ningún producto o servicio seleccionado</h3>
        <p class="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">Ve al catálogo y presiona "Adquirir" en un producto/servicio o agrégalo al carrito para ver sus opciones de pago.</p>
        <button onclick="switchPublicTab('catalogo')" class="px-6 py-3 rounded-xl font-bold text-white bg-astro-gradient">Ir al Catálogo</button>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  const subtotal = items.reduce((s, i) => s + (i.price * i.qty), 0);
  const coupon = STORE_STATE.appliedCoupon;
  const discount = calculateCouponDiscount(subtotal, coupon);
  const total = Math.max(0, subtotal - discount);
  const compatiblePlans = getCompatiblePlansForCheckout(items);
  const activeAccounts = STORE_STATE.paymentAccounts.filter(a => a.active !== false);

  const selectedPlan = compatiblePlans.find(p => p.id === STORE_STATE.selectedPlanId) || compatiblePlans[0] || null;
  if (selectedPlan) STORE_STATE.selectedPlanId = selectedPlan.id;

  const selectedAcc = activeAccounts.find(a => a.id === STORE_STATE.selectedAccountId) || activeAccounts[0] || null;
  if (selectedAcc) STORE_STATE.selectedAccountId = selectedAcc.id;

  const pct = selectedPlan ? (selectedPlan.mode === 'contado' ? 100 : Number(selectedPlan.initialPercent || 50)) : 100;
  const payNow = (total * pct) / 100;
  const remaining = total - payNow;

  let ruleHtml = '';
  if (selectedPlan) {
    let extra = '';
    if (selectedPlan.mode === 'partes') {
      extra = ` Pagas <strong>${sym}${payNow.toFixed(2)} (${pct}%)</strong> al iniciar y <strong>${sym}${remaining.toFixed(2)} (${100 - pct}%)</strong> al terminar.`;
    } else if (selectedPlan.mode === 'abonos') {
      extra = ` Abono sugerido: <strong>${sym}${payNow.toFixed(2)}</strong>. Plazo máximo para completar <strong>${sym}${remaining.toFixed(2)}</strong>: <strong>${selectedPlan.deadlineDays} días</strong> (luego se cancela el servicio/trabajo).`;
    }
    ruleHtml = `<div class="p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/25 text-xs text-sky-200">${escapeHtml(selectedPlan.description)}${extra}</div>`;
  } else {
    ruleHtml = `<div class="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-xs text-amber-200">Los artículos en tu carrito tienen modalidades de pago distintas. Paga cada artículo por separado desde el catálogo o consulta por WhatsApp.</div>`;
  }

  container.innerHTML = `
    <!-- Columna Izquierda: Resumen y Plan de Pago -->
    <div class="lg:col-span-7 space-y-5">
      <div class="bento-card p-5 space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-extrabold text-white">Detalle del Pedido</h3>
          ${STORE_STATE.checkoutDirectItem ? `<span class="text-[11px] text-sky-400 font-semibold">Compra directa</span>` : `<span class="text-[11px] text-emerald-400 font-semibold">Desde carrito</span>`}
        </div>
        <div class="space-y-2">
          ${items.map(i => `
            <div class="flex items-center justify-between p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs">
              <span class="font-bold text-white">${i.qty}x ${escapeHtml(i.name)}</span>
              <span class="font-extrabold text-emerald-400">${escapeHtml(sym)}${(i.price * i.qty).toFixed(2)}</span>
            </div>
          `).join('')}
        </div>

        <!-- Cupón o Código Especial directo en Pasarela -->
        <div class="pt-2 space-y-2">
          <div class="flex gap-2">
            <input id="pasarela-coupon-input" type="text" value="${coupon ? escapeHtml(coupon.code) : ''}" placeholder="¿Tienes un cupón o código especial?" class="flex-1 bg-slate-950 text-white text-xs px-3 py-2 rounded-xl border border-slate-700 uppercase" />
            <button type="button" onclick="validateAndApplyCouponCode(document.getElementById('pasarela-coupon-input').value); renderPasarelaModule(); renderCart();" class="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold">Validar</button>
          </div>
          ${coupon ? `
            <div class="p-2.5 rounded-xl bg-sky-500/15 border border-sky-500/30 text-xs flex items-start justify-between gap-2">
              <div>
                <div class="font-bold text-white">${escapeHtml(coupon.code)} · ${coupon.kind === 'especial' ? 'Código Especial' : 'Descuento'}${discount > 0 ? ` (-${escapeHtml(sym)}${discount.toFixed(2)})` : ''}</div>
                <div class="text-[11px] text-sky-200 mt-0.5">${escapeHtml(coupon.specifications)}</div>
              </div>
              <button type="button" onclick="clearAppliedCoupon()" class="text-rose-400 font-bold px-1">&times;</button>
            </div>
          ` : ''}
        </div>
        <div class="pt-3 border-t border-slate-800 flex items-center justify-between">
          <div>
            <div class="text-xs text-slate-400">Total completo</div>
            <div class="text-xl font-extrabold text-white">${escapeHtml(sym)}${total.toFixed(2)}</div>
            <div class="text-xs text-sky-300 font-semibold">&approx; ${formatBs(total, STORE_STATE.bcvRates?.usd)}</div>
          </div>
          <div class="text-right">
            <div class="text-xs text-emerald-400 font-semibold">Pagar ahora</div>
            <div class="text-2xl font-extrabold text-emerald-400">${escapeHtml(sym)}${payNow.toFixed(2)}</div>
            <div class="text-xs text-emerald-300/90 font-semibold">&approx; ${formatBs(payNow, STORE_STATE.bcvRates?.usd)} (BCV)</div>
          </div>
        </div>
      </div>

      <div class="bento-card p-5 space-y-3">
        <h3 class="text-sm font-extrabold text-white">1. Modalidad de Pago Permitida</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          ${compatiblePlans.map(p => {
            const isSel = selectedPlan && p.id === selectedPlan.id;
            return `
              <button type="button" onclick="selectCheckoutPlan('${p.id}')" class="p-3.5 rounded-xl text-left border transition ${isSel ? 'bg-sky-600/25 border-sky-400 text-white' : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'}">
                <div class="text-xs font-extrabold">${escapeHtml(p.name)}</div>
                <div class="text-[11px] text-slate-400 mt-0.5">${p.mode === 'contado' ? '100% de una vez' : p.mode === 'partes' ? `${p.initialPercent}% inicio / ${100 - p.initialPercent}% final` : `Abono ${p.initialPercent}% · Plazo ${p.deadlineDays} días`}</div>
              </button>
            `;
          }).join('')}
        </div>
        ${ruleHtml}
      </div>
    </div>

    <!-- Columna Derecha: Cuentas Destino y Confirmación -->
    <div class="lg:col-span-5 space-y-5">
      <div class="bento-card p-5 space-y-3">
        <h3 class="text-sm font-extrabold text-white">2. ¿A dónde realizarás el pago?</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          ${activeAccounts.map(a => {
            const isSel = selectedAcc && a.id === selectedAcc.id;
            return `
              <button type="button" onclick="selectCheckoutAccount('${a.id}')" class="p-3 rounded-xl text-left border transition ${isSel ? 'bg-emerald-500/20 border-emerald-400 text-white' : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'}">
                <div class="text-xs font-extrabold">${escapeHtml(a.method)}</div>
                <div class="text-[11px] text-slate-400 truncate">${escapeHtml(a.bank)}</div>
              </button>
            `;
          }).join('')}
        </div>

        <div class="p-4 rounded-2xl bg-slate-900/95 border border-slate-800 text-xs space-y-1">
          ${selectedAcc ? `
            <div class="font-bold text-emerald-400 text-sm">${escapeHtml(selectedAcc.method)} — ${escapeHtml(selectedAcc.bank)}</div>
            <div class="text-white font-semibold">Datos: <span class="text-sky-300 select-all">${escapeHtml(selectedAcc.accountInfo)}</span></div>
            <div class="text-slate-300">Titular: ${escapeHtml(selectedAcc.holder)}</div>
            ${selectedAcc.instructions ? `<div class="text-slate-400 italic pt-1">${escapeHtml(selectedAcc.instructions)}</div>` : ''}
          ` : `<div class="text-amber-300">Sin cuentas activas. Coordina por WhatsApp.</div>`}
        </div>
      </div>

      <form onsubmit="confirmCheckoutToWhatsApp(event)" class="bento-card p-5 space-y-4 border border-emerald-500/30">
        <div class="space-y-2.5">
          <h3 class="text-sm font-extrabold text-white">3. Datos del Cliente</h3>
          <input id="chk-customer-name" type="text" required placeholder="Tu nombre completo *" class="w-full bg-slate-950 text-white text-sm px-4 py-2.5 rounded-xl border border-slate-700" />
          <input id="chk-reference" type="text" placeholder="Nro. de referencia / operación (opcional)" class="w-full bg-slate-950 text-white text-sm px-4 py-2.5 rounded-xl border border-slate-700" />
        </div>

        <div class="pt-3 border-t border-slate-800 space-y-2.5">
          <h3 class="text-sm font-extrabold text-white">4. Subir Comprobante de Pago y Enviar por WhatsApp</h3>
          <p class="text-[11px] text-slate-400">Adjunta la captura de tu pago; al enviar se copiará al portapapeles (si tu navegador lo permite) para que la pegues directo en el chat de WhatsApp.</p>

          <div class="flex flex-wrap items-center gap-2">
            <label class="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer transition inline-flex items-center gap-1.5">
              <i data-lucide="upload" class="w-4 h-4"></i>
              <span>Subir Comprobante</span>
              <input id="chk-receipt-file" type="file" accept="image/*" onchange="handleReceiptUpload(event)" class="hidden" />
            </label>
            ${STORE_STATE.checkoutReceipt ? `<span class="text-[11px] text-emerald-400 font-semibold truncate max-w-[180px]">${escapeHtml(STORE_STATE.checkoutReceipt.fileName)}</span>` : `<span class="text-[11px] text-slate-500">Sin archivo adjunto</span>`}
          </div>

          ${STORE_STATE.checkoutReceipt ? `
            <div class="relative w-24 h-24 rounded-xl overflow-hidden border border-emerald-500/40">
              <img src="${STORE_STATE.checkoutReceipt.dataUrl}" alt="Comprobante" class="w-full h-full object-cover" />
              <button type="button" onclick="clearCheckoutReceipt()" class="absolute top-1 right-1 w-5 h-5 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">&times;</button>
            </div>
          ` : ''}
        </div>

        <button type="submit" ${!selectedPlan ? 'disabled' : ''} class="uiverse-pay-btn">
          <span>Enviar Todo por WhatsApp</span>
          <svg class="uiverse-pay-icon" viewBox="0 0 576 512"><path d="M512 80c8.8 0 16 7.2 16 16v32H48V96c0-8.8 7.2-16 16-16H512zm16 144V416c0 8.8-7.2 16-16 16H64c-8.8 0-16-7.2-16-16V224H528zM64 32C28.7 32 0 60.7 0 96V416c0 35.3 28.7 64 64 64H512c35.3 0 64-28.7 64-64V96c0-35.3-28.7-64-64-64H64zm56 304c-13.3 0-24 10.7-24 24s10.7 24 24 24h48c13.3 0 24-10.7 24-24s-10.7-24-24-24H120zm128 0c-13.3 0-24 10.7-24 24s10.7 24 24 24H360c13.3 0 24-10.7 24-24s-10.7-24-24-24H248z"></path></svg>
        </button>
      </form>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();
}

async function handleReceiptUpload(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const compressed = await compressImageFile(file, 1000, 0.82);
    const finalUrl = window.storeCloud
      ? await window.storeCloud.uploadImageToConfiguredCloud(file, compressed)
      : compressed;
    STORE_STATE.checkoutReceipt = { dataUrl: finalUrl, fileName: file.name };
    renderPasarelaModule();
    showToast('Comprobante cargado correctamente');
  } catch (err) {
    showToast('No se pudo cargar el comprobante', 'error');
  }
}

function clearCheckoutReceipt() {
  STORE_STATE.checkoutReceipt = null;
  renderPasarelaModule();
}

async function confirmCheckoutToWhatsApp(e) {
  e.preventDefault();
  const submitBtn = e.target.querySelector('.uiverse-pay-btn');
  if (submitBtn) {
    submitBtn.classList.add('is-animating');
    setTimeout(() => submitBtn.classList.remove('is-animating'), 450);
  }
  const sym = STORE_STATE.config.currencySymbol;
  const items = getCheckoutItems();
  const subtotal = items.reduce((s, i) => s + (i.price * i.qty), 0);
  const coupon = STORE_STATE.appliedCoupon;
  const discount = calculateCouponDiscount(subtotal, coupon);
  const total = Math.max(0, subtotal - discount);

  const compatiblePlans = getCompatiblePlansForCheckout(items);
  const activeAccounts = STORE_STATE.paymentAccounts.filter(a => a.active !== false);
  const plan = compatiblePlans.find(p => p.id === STORE_STATE.selectedPlanId) || compatiblePlans[0];
  const acc = activeAccounts.find(a => a.id === STORE_STATE.selectedAccountId) || activeAccounts[0];

  const pct = plan ? (plan.mode === 'contado' ? 100 : Number(plan.initialPercent || 50)) : 100;
  const payNow = (total * pct) / 100;
  const remaining = total - payNow;

  const customerName = document.getElementById('chk-customer-name').value.trim();
  const reference = document.getElementById('chk-reference').value.trim();

  const itemLines = items.map(i => `• ${i.qty}x ${i.name} (${sym}${(i.price * i.qty).toFixed(2)})`).join('\n');
  const planLine = plan
    ? `${plan.name}${plan.mode === 'abonos' ? ` (Plazo: ${plan.deadlineDays} días)` : ''}`
    : 'Al Contado';

  const usdRate = STORE_STATE.bcvRates?.usd || 0;
  const receipt = STORE_STATE.checkoutReceipt;

  // Registrar automáticamente el trabajo activo y el reporte de pago en el Panel Admin
  const todayStr = new Date().toISOString().slice(0, 10);
  const daysToAdd = plan && plan.mode === 'abonos' && plan.deadlineDays > 0 ? plan.deadlineDays : 7;
  const dueObj = new Date();
  dueObj.setDate(dueObj.getDate() + daysToAdd);
  const dueStr = dueObj.toISOString().slice(0, 10);

  const nextNum = 101 + STORE_STATE.activeJobs.length + Math.floor(Math.random() * 10);
  const jobCode = `TRB-${nextNum}`;
  const serviceTitle = items.map(i => `${i.qty}x ${i.name}`).join(', ');
  const newJobId = 'job-' + Date.now();

  STORE_STATE.activeJobs.unshift({
    id: newJobId,
    code: jobCode,
    clientName: customerName,
    serviceName: serviceTitle,
    contractDate: todayStr,
    dueDate: dueStr,
    progress: 10,
    status: 'Esperando abono',
    paymentMode: planLine,
    totalAmount: Number(total.toFixed(2)),
    paidAmount: 0,
    notes: 'Pedido registrado desde Pasarela. Esperando confirmación de pago por el administrador.',
    deliverables: []
  });
  saveToStorage(STORE_STORAGE_KEYS.ACTIVE_JOBS, STORE_STATE.activeJobs);

  const newReportId = 'pay-' + Date.now();
  STORE_STATE.paymentReports.unshift({
    id: newReportId,
    jobId: newJobId,
    jobCode,
    customerName,
    serviceName: serviceTitle,
    planName: planLine,
    totalAmount: Number(total.toFixed(2)),
    amountReported: Number(payNow.toFixed(2)),
    accountMethod: acc ? `${acc.method} (${acc.bank})` : 'Por acordar',
    reference: reference || 'Sin referencia',
    receiptDataUrl: receipt ? receipt.dataUrl : '',
    status: 'Pendiente',
    createdAt: new Date().toISOString()
  });
  saveToStorage(STORE_STORAGE_KEYS.PAYMENT_REPORTS, STORE_STATE.paymentReports);

  // Guardar referencia del último pago del cliente para mostrar la pantalla de espera y notificar al confirmar
  saveToStorage(STORE_STORAGE_KEYS.LAST_CUSTOMER_PAYMENT, {
    reportId: newReportId,
    jobId: newJobId,
    jobCode,
    notifiedConfirmed: false
  });

  // Intentar copiar la imagen del comprobante al portapapeles para pegarla en WhatsApp
  if (receipt && navigator.clipboard && window.ClipboardItem) {
    try {
      const resp = await fetch(receipt.dataUrl);
      const blob = await resp.blob();
      const pngBlob = blob.type === 'image/png' ? blob : await new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.width;
          c.height = img.height;
          c.getContext('2d').drawImage(img, 0, 0);
          c.toBlob(resolve, 'image/png');
        };
        img.src = receipt.dataUrl;
      });
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
      showToast('Pago registrado y comprobante copiado (Ctrl+V en WhatsApp)');
    } catch (err) {}
  } else {
    showToast(`Pago registrado con código ${jobCode} para confirmación`);
  }

  const msg =
    `¡Hola! Soy *${customerName}* y confirmo mi pedido (*${jobCode}*) en *${STORE_STATE.config.brandName}*:\n\n` +
    `*Detalle:*\n${itemLines}\n\n` +
    (coupon ? `*Código / Cupón:* ${coupon.code} (${coupon.specifications})${discount > 0 ? ` [-${sym}${discount.toFixed(2)}]` : ''}\n` : '') +
    `*Total:* ${sym}${total.toFixed(2)} (${formatBs(total, usdRate)} a tasa BCV ${usdRate})\n` +
    `*Modalidad:* ${planLine}\n` +
    `*Monto a pagar ahora:* ${sym}${payNow.toFixed(2)} (${formatBs(payNow, usdRate)})` +
    (remaining > 0 ? `\n*Restante pendiente:* ${sym}${remaining.toFixed(2)} (${formatBs(remaining, usdRate)})` : '') +
    (acc ? `\n*Cuenta destino:* ${acc.method} (${acc.bank})` : '') +
    (reference ? `\n*Referencia:* ${reference}` : '') +
    (receipt ? `\n*Comprobante:* Adjunto captura (${receipt.fileName})` : '') +
    `\n\nMi código de seguimiento es *${jobCode}*. Quedo atento(a) para validar el pago.`;

  window.open(buildWhatsAppUrl(msg, STORE_STATE.config), '_blank', 'noopener');
  renderPasarelaModule();
}

// --- MÓDULO 4: CONTACTO ---
function renderContactoModule() {
  const el = document.getElementById('contact-official-phone');
  if (el) el.textContent = STORE_STATE.config.whatsappNumber;
}

function handleCustomWhatsAppInquiry(e) {
  e.preventDefault();
  const name = document.getElementById('contact-name').value.trim();
  const interest = document.getElementById('contact-interest').value.trim();
  const details = document.getElementById('contact-details').value.trim();
  const message = `¡Hola! Mi nombre es *${name}*.\nMe interesa: *${interest}*\n${details ? `Detalles: ${details}` : ''}`;
  window.open(buildWhatsAppUrl(message, STORE_STATE.config), '_blank', 'noopener');
}

// ============================================================================
// PANEL ADMINISTRATIVO
// ============================================================================

let tapCount = 0;
let tapTimer = null;
function handleSecretAdminTap() {
  tapCount += 1;
  clearTimeout(tapTimer);
  tapTimer = setTimeout(() => { tapCount = 0; }, 700);
  if (tapCount >= 3) {
    tapCount = 0;
    switchView(STORE_STATE.currentView === 'admin' ? 'public' : 'admin');
  }
}

function switchAdminTab(tabName) {
  STORE_STATE.adminTab = tabName;
  renderNavigationChrome('admin');

  ['catalogo', 'proyectos', 'trabajos', 'pasarela', 'tienda', 'seguridad'].forEach(t => {
    const panel = document.getElementById(`admin-panel-${t}`);
    const mobBtn = document.getElementById(`adm-mob-${t}`);
    if (panel) panel.classList.toggle('hidden', t !== tabName);
    if (mobBtn) {
      mobBtn.className = t === tabName
        ? 'px-3.5 py-2 rounded-xl text-xs font-bold bg-sky-600 text-white'
        : 'px-3.5 py-2 rounded-xl text-xs font-medium text-slate-300';
    }
  });

  if (tabName === 'catalogo') renderAdminItemPlansCheckboxes();
  if (tabName === 'pasarela') renderAdminReceivablesManager();
  resetScrollArea();
  if (window.lucide) window.lucide.createIcons();
}

function handleAdminLogin(e) {
  e.preventDefault();
  const input = document.getElementById('admin-password-input').value;
  const savedPass = localStorage.getItem(STORE_STORAGE_KEYS.ADMIN_PASS) || 'admin123';
  if (input === savedPass) {
    STORE_STATE.isAdminAuthenticated = true;
    sessionStorage.setItem(STORE_STORAGE_KEYS.ADMIN_AUTH, 'true');
    document.getElementById('admin-password-input').value = '';
    renderAdminView();
    showToast('Bienvenido al Panel Administrativo');
  } else {
    showToast('Contraseña incorrecta', 'error');
  }
}

function logoutAdmin() {
  STORE_STATE.isAdminAuthenticated = false;
  sessionStorage.removeItem(STORE_STORAGE_KEYS.ADMIN_AUTH);
  switchView('public');
}

function renderAdminView() {
  renderNavigationChrome('admin');
  document.getElementById('admin-login-box').classList.toggle('hidden', STORE_STATE.isAdminAuthenticated);
  document.getElementById('admin-dashboard-box').classList.toggle('hidden', !STORE_STATE.isAdminAuthenticated);
  if (!STORE_STATE.isAdminAuthenticated) {
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  switchAdminTab(STORE_STATE.adminTab);
  renderAdminClassificationUI();
  renderAdminItemPlansCheckboxes();
  renderAdminCatalogList();
  renderAdminProjectsList();
  renderAdminJobsList();
  renderAdminPaymentReportsList();
  renderAdminReceivablesManager();
  renderAdminAccountsList();
  renderAdminPlansList();
  renderAdminCouponsList();
  renderAdminSponsorsList();
  renderAdminCloudSettings();

  const c = STORE_STATE.config;
  document.getElementById('cfg-brand-name').value = c.brandName;
  document.getElementById('cfg-tagline').value = c.tagline;
  document.getElementById('cfg-wa-number').value = c.whatsappNumber;
  document.getElementById('cfg-currency').value = c.currencySymbol;
  document.getElementById('cfg-hero-greeting').value = c.heroGreeting;
  document.getElementById('cfg-hero-highlight').value = c.heroHighlight;
  document.getElementById('cfg-hero-subtitle').value = c.heroSubtitle;
  document.getElementById('cfg-welcome-msg').value = c.welcomeMessage;
}

// --- Checkboxes de Planes de Pago por Producto en el Formulario Admin ---
function renderAdminItemPlansCheckboxes(selectedIds = null) {
  const container = document.getElementById('item-allowed-plans-container');
  if (!container) return;

  const activeIds = selectedIds || (STORE_STATE.editingItemId
    ? (STORE_STATE.catalog.find(i => i.id === STORE_STATE.editingItemId)?.allowedPlanIds || [])
    : [STORE_STATE.paymentPlans[0]?.id].filter(Boolean));

  if (!STORE_STATE.paymentPlans.length) {
    container.innerHTML = `<span class="text-xs text-amber-300">Primero crea al menos un tipo de pago en la pestaña Pasarela.</span>`;
    return;
  }

  container.innerHTML = STORE_STATE.paymentPlans.map(p => {
    const checked = activeIds.includes(p.id) ? 'checked' : '';
    return `
      <label class="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-sky-500 cursor-pointer text-xs text-slate-200 select-none">
        <input type="checkbox" name="item-allowed-plan" value="${p.id}" ${checked} class="accent-sky-500 w-4 h-4 rounded" />
        <span class="font-semibold">${escapeHtml(p.name)}</span>
      </label>
    `;
  }).join('');
}

// --- Admin Clasificación: Catálogos de Ventas y Categorías ---
function renderAdminClassificationUI() {
  const scList = document.getElementById('admin-sales-catalogs-list');
  const catList = document.getElementById('admin-categories-list');
  const itemScSel = document.getElementById('item-sales-catalog');
  const itemCatSel = document.getElementById('item-category');

  if (scList) {
    scList.innerHTML = STORE_STATE.salesCatalogs.map(sc => `
      <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white">
        <span>${escapeHtml(sc.name)}</span>
        ${STORE_STATE.salesCatalogs.length > 1 ? `<button type="button" onclick="deleteSalesCatalog('${sc.id}')" class="text-rose-400 hover:text-rose-300 font-bold">&times;</button>` : ''}
      </span>
    `).join('');
  }

  if (catList) {
    catList.innerHTML = STORE_STATE.categories.map(cat => `
      <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white">
        <span>${escapeHtml(cat)}</span>
        ${STORE_STATE.categories.length > 1 ? `<button type="button" onclick="deleteCategory('${escapeHtml(cat)}')" class="text-rose-400 hover:text-rose-300 font-bold">&times;</button>` : ''}
      </span>
    `).join('');
  }

  if (itemScSel) {
    const prev = itemScSel.value;
    itemScSel.innerHTML = STORE_STATE.salesCatalogs.length
      ? STORE_STATE.salesCatalogs.map(sc => `<option value="${sc.id}">${escapeHtml(sc.name)}</option>`).join('')
      : `<option value="">-- Crea un catálogo de ventas arriba --</option>`;
    if (prev && STORE_STATE.salesCatalogs.some(sc => sc.id === prev)) itemScSel.value = prev;
  }

  if (itemCatSel) {
    const prev = itemCatSel.value;
    itemCatSel.innerHTML = STORE_STATE.categories.length
      ? STORE_STATE.categories.map(cat => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join('')
      : `<option value="">-- Crea una categoría arriba --</option>`;
    if (prev && STORE_STATE.categories.includes(prev)) itemCatSel.value = prev;
  }
}

function handleAddSalesCatalog(e) {
  e.preventDefault();
  const input = document.getElementById('new-sales-catalog-name');
  const name = input.value.trim();
  if (!name) return;
  STORE_STATE.salesCatalogs.push({ id: 'cat-' + Date.now(), name, description: '' });
  saveToStorage(STORE_STORAGE_KEYS.SALES_CATALOGS, STORE_STATE.salesCatalogs);
  input.value = '';
  renderAdminClassificationUI();
  showToast('Catálogo de ventas agregado');
}

function deleteSalesCatalog(id) {
  if (STORE_STATE.salesCatalogs.length <= 1) return;
  STORE_STATE.salesCatalogs = STORE_STATE.salesCatalogs.filter(c => c.id !== id);
  saveToStorage(STORE_STORAGE_KEYS.SALES_CATALOGS, STORE_STATE.salesCatalogs);
  renderAdminClassificationUI();
  showToast('Catálogo eliminado');
}

function handleAddCategory(e) {
  e.preventDefault();
  const input = document.getElementById('new-category-name');
  const name = input.value.trim();
  if (!name || STORE_STATE.categories.includes(name)) return;
  STORE_STATE.categories.push(name);
  saveToStorage(STORE_STORAGE_KEYS.CATEGORIES, STORE_STATE.categories);
  input.value = '';
  renderAdminClassificationUI();
  showToast('Categoría agregada');
}

function deleteCategory(name) {
  if (STORE_STATE.categories.length <= 1) return;
  STORE_STATE.categories = STORE_STATE.categories.filter(c => c !== name);
  saveToStorage(STORE_STORAGE_KEYS.CATEGORIES, STORE_STATE.categories);
  renderAdminClassificationUI();
  showToast('Categoría eliminada');
}

function renderAdminCatalogList() {
  const el = document.getElementById('admin-catalog-list');
  if (!el) return;
  el.innerHTML = STORE_STATE.catalog.map(item => {
    const planNames = (item.allowedPlanIds || [])
      .map(pid => STORE_STATE.paymentPlans.find(p => p.id === pid)?.name)
      .filter(Boolean);

    return `
      <div class="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase ${item.type === 'servicio' ? 'bg-indigo-500/20 text-indigo-300' : 'bg-sky-500/20 text-sky-300'}">${item.type}</span>
            <span class="font-bold text-white text-sm">${escapeHtml(item.name)}</span>
            <span class="text-emerald-400 font-extrabold text-sm">${escapeHtml(STORE_STATE.config.currencySymbol)}${item.price}</span>
          </div>
          <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(getSalesCatalogName(item.salesCatalogId))} · ${escapeHtml(item.category)} · ${escapeHtml(item.description)}</p>
          ${item.details ? `<p class="text-[11px] text-slate-300 bg-slate-950/80 border border-slate-800 rounded-xl p-2 mt-1.5 whitespace-pre-line">${escapeHtml(item.details)}</p>` : ''}
          <div class="flex flex-wrap gap-1.5 mt-1.5">
            ${planNames.map(n => `<span class="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 text-[10px] font-semibold">${escapeHtml(n)}</span>`).join('')}
          </div>
        </div>
        <div class="flex gap-2 shrink-0">
          <button onclick="editCatalogItem('${item.id}')" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-sky-300">Editar</button>
          <button onclick="deleteCatalogItem('${item.id}')" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/15 text-rose-300">Eliminar</button>
        </div>
      </div>
    `;
  }).join('');
}

function handleSaveCatalogItem(e) {
  e.preventDefault();
  const checkedPlans = Array.from(document.querySelectorAll('input[name="item-allowed-plan"]:checked')).map(cb => cb.value);
  if (!checkedPlans.length) {
    showToast('Debes marcar al menos un tipo de pago para este producto/servicio', 'error');
    return;
  }

  const pendingImgInput = document.getElementById('item-image-url-input');
  if (pendingImgInput && pendingImgInput.value.trim()) {
    STORE_STATE.draftItemImages.push(normalizeExternalImageUrl(pendingImgInput.value.trim()));
    pendingImgInput.value = '';
  }

  const data = {
    name: document.getElementById('item-name').value.trim(),
    salesCatalogId: document.getElementById('item-sales-catalog').value,
    type: document.getElementById('item-type').value,
    price: parseFloat(document.getElementById('item-price').value) || 0,
    category: document.getElementById('item-category').value,
    badge: document.getElementById('item-badge').value.trim(),
    icon: document.getElementById('item-icon').value,
    description: document.getElementById('item-description').value.trim(),
    details: document.getElementById('item-details').value.trim(),
    images: [...STORE_STATE.draftItemImages],
    allowedPlanIds: checkedPlans
  };

  if (STORE_STATE.editingItemId) {
    const idx = STORE_STATE.catalog.findIndex(i => i.id === STORE_STATE.editingItemId);
    if (idx !== -1) STORE_STATE.catalog[idx] = { ...STORE_STATE.catalog[idx], ...data };
  } else {
    STORE_STATE.catalog.unshift({ id: 'item-' + Date.now(), ...data });
  }
  saveToStorage(STORE_STORAGE_KEYS.CATALOG, STORE_STATE.catalog);
  cancelEditCatalogItem();
  renderAdminCatalogList();
  showToast('Catálogo actualizado');
}

function editCatalogItem(id) {
  const item = STORE_STATE.catalog.find(i => i.id === id);
  if (!item) return;
  STORE_STATE.editingItemId = id;
  document.getElementById('admin-item-form-title').textContent = 'Editar Producto o Servicio';
  document.getElementById('admin-item-cancel-edit').classList.remove('hidden');
  document.getElementById('item-name').value = item.name;
  document.getElementById('item-sales-catalog').value = item.salesCatalogId || STORE_STATE.salesCatalogs[0]?.id;
  document.getElementById('item-type').value = item.type;
  document.getElementById('item-price').value = item.price;
  document.getElementById('item-category').value = item.category;
  document.getElementById('item-badge').value = item.badge || '';
  document.getElementById('item-icon').value = item.icon || 'shopping-bag';
  document.getElementById('item-description').value = item.description;
  document.getElementById('item-details').value = item.details || '';
  STORE_STATE.draftItemImages = Array.isArray(item.images) ? [...item.images] : [];
  renderDraftImagesPreview('item');
  renderAdminItemPlansCheckboxes(item.allowedPlanIds || []);
  resetScrollArea();
}

function cancelEditCatalogItem() {
  STORE_STATE.editingItemId = null;
  STORE_STATE.draftItemImages = [];
  document.getElementById('admin-item-form-title').textContent = '3. Agregar Producto o Servicio';
  document.getElementById('admin-item-cancel-edit').classList.add('hidden');
  ['item-name', 'item-price', 'item-badge', 'item-description', 'item-details'].forEach(id => { document.getElementById(id).value = ''; });
  renderDraftImagesPreview('item');
  renderAdminItemPlansCheckboxes();
}

function deleteCatalogItem(id) {
  STORE_STATE.catalog = STORE_STATE.catalog.filter(i => i.id !== id);
  saveToStorage(STORE_STORAGE_KEYS.CATALOG, STORE_STATE.catalog);
  renderAdminCatalogList();
  showToast('Eliminado del catálogo');
}

// --- Admin Pasarela: Cuentas ---
function renderAdminAccountsList() {
  const el = document.getElementById('admin-accounts-list');
  if (!el) return;
  el.innerHTML = STORE_STATE.paymentAccounts.map(a => `
    <div class="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <div class="text-xs">
        <div class="font-bold text-white">${escapeHtml(a.method)} · <span class="text-emerald-400">${escapeHtml(a.bank)}</span></div>
        <div class="text-slate-400">${escapeHtml(a.accountInfo)} | ${escapeHtml(a.holder)}</div>
      </div>
      <div class="flex gap-2 shrink-0">
        <button onclick="toggleAccountActive('${a.id}')" class="px-2.5 py-1 rounded-lg text-[11px] font-bold ${a.active !== false ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'}">${a.active !== false ? 'Activa' : 'Oculta'}</button>
        <button onclick="editPaymentAccount('${a.id}')" class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-800 text-sky-300">Editar</button>
        <button onclick="deletePaymentAccount('${a.id}')" class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-rose-500/15 text-rose-300">Eliminar</button>
      </div>
    </div>
  `).join('');
}

function handleSavePaymentAccount(e) {
  e.preventDefault();
  const data = {
    method: document.getElementById('acc-method').value.trim(),
    bank: document.getElementById('acc-bank').value.trim(),
    accountInfo: document.getElementById('acc-info').value.trim(),
    holder: document.getElementById('acc-holder').value.trim(),
    instructions: document.getElementById('acc-instructions').value.trim(),
    active: true
  };
  if (STORE_STATE.editingAccountId) {
    const idx = STORE_STATE.paymentAccounts.findIndex(a => a.id === STORE_STATE.editingAccountId);
    if (idx !== -1) STORE_STATE.paymentAccounts[idx] = { ...STORE_STATE.paymentAccounts[idx], ...data };
  } else {
    STORE_STATE.paymentAccounts.push({ id: 'acc-' + Date.now(), ...data });
  }
  saveToStorage(STORE_STORAGE_KEYS.PAYMENT_ACCOUNTS, STORE_STATE.paymentAccounts);
  cancelEditAccount();
  renderAdminAccountsList();
  showToast('Cuenta guardada');
}

function editPaymentAccount(id) {
  const a = STORE_STATE.paymentAccounts.find(x => x.id === id);
  if (!a) return;
  STORE_STATE.editingAccountId = id;
  document.getElementById('admin-acc-cancel-edit').classList.remove('hidden');
  document.getElementById('acc-method').value = a.method;
  document.getElementById('acc-bank').value = a.bank;
  document.getElementById('acc-info').value = a.accountInfo;
  document.getElementById('acc-holder').value = a.holder;
  document.getElementById('acc-instructions').value = a.instructions || '';
}

function cancelEditAccount() {
  STORE_STATE.editingAccountId = null;
  document.getElementById('admin-acc-cancel-edit').classList.add('hidden');
  ['acc-method', 'acc-bank', 'acc-info', 'acc-holder', 'acc-instructions'].forEach(id => { document.getElementById(id).value = ''; });
}

function toggleAccountActive(id) {
  const a = STORE_STATE.paymentAccounts.find(x => x.id === id);
  if (!a) return;
  a.active = a.active === false;
  saveToStorage(STORE_STORAGE_KEYS.PAYMENT_ACCOUNTS, STORE_STATE.paymentAccounts);
  renderAdminAccountsList();
}

function deletePaymentAccount(id) {
  STORE_STATE.paymentAccounts = STORE_STATE.paymentAccounts.filter(x => x.id !== id);
  saveToStorage(STORE_STORAGE_KEYS.PAYMENT_ACCOUNTS, STORE_STATE.paymentAccounts);
  renderAdminAccountsList();
}

// --- Admin Pasarela: Tipos de Pago ---
function renderAdminPlansList() {
  const el = document.getElementById('admin-plans-list');
  if (!el) return;
  el.innerHTML = STORE_STATE.paymentPlans.map(p => `
    <div class="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <div class="text-xs">
        <div class="font-bold text-white">${escapeHtml(p.name)} <span class="text-sky-400">(${p.mode} · ${p.initialPercent}%${p.deadlineDays > 0 ? ` · ${p.deadlineDays} días` : ''})</span></div>
        <div class="text-slate-400">${escapeHtml(p.description)}</div>
      </div>
      <div class="flex gap-2 shrink-0">
        <button onclick="togglePlanActive('${p.id}')" class="px-2.5 py-1 rounded-lg text-[11px] font-bold ${p.active !== false ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'}">${p.active !== false ? 'Activo' : 'Oculto'}</button>
        <button onclick="editPaymentPlan('${p.id}')" class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-800 text-sky-300">Editar</button>
        <button onclick="deletePaymentPlan('${p.id}')" class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-rose-500/15 text-rose-300">Eliminar</button>
      </div>
    </div>
  `).join('');
}

function handleSavePaymentPlan(e) {
  e.preventDefault();
  const mode = document.getElementById('plan-mode').value;
  const pct = mode === 'contado' ? 100 : (parseInt(document.getElementById('plan-percent').value, 10) || 50);
  const days = mode === 'abonos' ? (parseInt(document.getElementById('plan-days').value, 10) || 15) : 0;
  const data = {
    name: document.getElementById('plan-name').value.trim(),
    mode,
    initialPercent: Math.min(100, Math.max(1, pct)),
    deadlineDays: Math.max(0, days),
    description: document.getElementById('plan-desc').value.trim(),
    active: true
  };
  if (STORE_STATE.editingPlanId) {
    const idx = STORE_STATE.paymentPlans.findIndex(p => p.id === STORE_STATE.editingPlanId);
    if (idx !== -1) STORE_STATE.paymentPlans[idx] = { ...STORE_STATE.paymentPlans[idx], ...data };
  } else {
    STORE_STATE.paymentPlans.push({ id: 'plan-' + Date.now(), ...data });
  }
  saveToStorage(STORE_STORAGE_KEYS.PAYMENT_PLANS, STORE_STATE.paymentPlans);
  cancelEditPlan();
  renderAdminPlansList();
  renderAdminItemPlansCheckboxes();
  showToast('Tipo de pago guardado');
}

function editPaymentPlan(id) {
  const p = STORE_STATE.paymentPlans.find(x => x.id === id);
  if (!p) return;
  STORE_STATE.editingPlanId = id;
  document.getElementById('admin-plan-cancel-edit').classList.remove('hidden');
  document.getElementById('plan-name').value = p.name;
  document.getElementById('plan-mode').value = p.mode;
  document.getElementById('plan-percent').value = p.initialPercent;
  document.getElementById('plan-days').value = p.deadlineDays;
  document.getElementById('plan-desc').value = p.description;
}

function cancelEditPlan() {
  STORE_STATE.editingPlanId = null;
  document.getElementById('admin-plan-cancel-edit').classList.add('hidden');
  ['plan-name', 'plan-percent', 'plan-days', 'plan-desc'].forEach(id => { document.getElementById(id).value = ''; });
}

function togglePlanActive(id) {
  const p = STORE_STATE.paymentPlans.find(x => x.id === id);
  if (!p) return;
  p.active = p.active === false;
  saveToStorage(STORE_STORAGE_KEYS.PAYMENT_PLANS, STORE_STATE.paymentPlans);
  renderAdminPlansList();
}

function deletePaymentPlan(id) {
  STORE_STATE.paymentPlans = STORE_STATE.paymentPlans.filter(x => x.id !== id);
  saveToStorage(STORE_STORAGE_KEYS.PAYMENT_PLANS, STORE_STATE.paymentPlans);
  renderAdminPlansList();
  renderAdminItemPlansCheckboxes();
}

// --- Admin Tienda & Seguridad ---
function handleSaveStoreConfig(e) {
  e.preventDefault();
  STORE_STATE.config = {
    ...STORE_STATE.config,
    brandName: document.getElementById('cfg-brand-name').value.trim(),
    tagline: document.getElementById('cfg-tagline').value.trim(),
    whatsappNumber: normalizeWhatsAppPhone(document.getElementById('cfg-wa-number').value.trim()),
    currencySymbol: document.getElementById('cfg-currency').value.trim() || '$',
    heroGreeting: document.getElementById('cfg-hero-greeting').value.trim(),
    heroHighlight: document.getElementById('cfg-hero-highlight').value.trim(),
    heroSubtitle: document.getElementById('cfg-hero-subtitle').value.trim(),
    welcomeMessage: document.getElementById('cfg-welcome-msg').value.trim()
  };
  saveToStorage(STORE_STORAGE_KEYS.CONFIG, STORE_STATE.config);
  showToast('Configuración guardada');
}

function handleChangeAdminPassword(e) {
  e.preventDefault();
  const p = document.getElementById('new-admin-pass').value;
  if (p.length < 4) return;
  localStorage.setItem(STORE_STORAGE_KEYS.ADMIN_PASS, p);
  document.getElementById('new-admin-pass').value = '';
  showToast('Contraseña actualizada');
}

function exportStoreBackup() {
  const data = {
    config: STORE_STATE.config,
    salesCatalogs: STORE_STATE.salesCatalogs,
    categories: STORE_STATE.categories,
    projects: STORE_STATE.projects,
    activeJobs: STORE_STATE.activeJobs,
    paymentReports: STORE_STATE.paymentReports,
    coupons: STORE_STATE.coupons,
    sponsors: STORE_STATE.sponsors,
    catalog: STORE_STATE.catalog,
    paymentAccounts: STORE_STATE.paymentAccounts,
    paymentPlans: STORE_STATE.paymentPlans
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'respaldo-astro-store.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function importStoreBackup(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const parsed = JSON.parse(ev.target.result);
      if (parsed.config) { STORE_STATE.config = { ...DEFAULT_STORE_CONFIG, ...parsed.config }; saveToStorage(STORE_STORAGE_KEYS.CONFIG, STORE_STATE.config); }
      if (Array.isArray(parsed.salesCatalogs)) { STORE_STATE.salesCatalogs = parsed.salesCatalogs; saveToStorage(STORE_STORAGE_KEYS.SALES_CATALOGS, STORE_STATE.salesCatalogs); }
      if (Array.isArray(parsed.categories)) { STORE_STATE.categories = parsed.categories; saveToStorage(STORE_STORAGE_KEYS.CATEGORIES, STORE_STATE.categories); }
      if (Array.isArray(parsed.projects)) { STORE_STATE.projects = parsed.projects; saveToStorage(STORE_STORAGE_KEYS.PROJECTS, STORE_STATE.projects); }
      if (Array.isArray(parsed.activeJobs)) { STORE_STATE.activeJobs = parsed.activeJobs; saveToStorage(STORE_STORAGE_KEYS.ACTIVE_JOBS, STORE_STATE.activeJobs); }
      if (Array.isArray(parsed.paymentReports)) { STORE_STATE.paymentReports = parsed.paymentReports; saveToStorage(STORE_STORAGE_KEYS.PAYMENT_REPORTS, STORE_STATE.paymentReports); }
      if (Array.isArray(parsed.coupons)) { STORE_STATE.coupons = parsed.coupons; saveToStorage(STORE_STORAGE_KEYS.COUPONS, STORE_STATE.coupons); }
      if (Array.isArray(parsed.sponsors)) { STORE_STATE.sponsors = parsed.sponsors; saveToStorage(STORE_STORAGE_KEYS.SPONSORS, STORE_STATE.sponsors); }
      if (Array.isArray(parsed.catalog)) { STORE_STATE.catalog = parsed.catalog; saveToStorage(STORE_STORAGE_KEYS.CATALOG, STORE_STATE.catalog); }
      if (Array.isArray(parsed.paymentAccounts)) { STORE_STATE.paymentAccounts = parsed.paymentAccounts; saveToStorage(STORE_STORAGE_KEYS.PAYMENT_ACCOUNTS, STORE_STATE.paymentAccounts); }
      if (Array.isArray(parsed.paymentPlans)) { STORE_STATE.paymentPlans = parsed.paymentPlans; saveToStorage(STORE_STORAGE_KEYS.PAYMENT_PLANS, STORE_STATE.paymentPlans); }
      renderAdminView();
      showToast('Respaldo importado con éxito');
    } catch (err) {
      showToast('Archivo de respaldo inválido', 'error');
    }
  };
  reader.readAsText(file);
}

function escapeHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const dot = type === 'error' ? 'bg-rose-400' : 'bg-emerald-400';
  const toast = document.createElement('div');
  toast.className = 'bento-card px-4 py-3 rounded-xl border border-sky-500/40 text-xs sm:text-sm font-semibold text-white shadow-xl animate-fade-in flex items-center gap-2';
  toast.innerHTML = `<span class="w-2 h-2 rounded-full ${dot} shrink-0"></span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

// ============================================================================
// MODALES DE DETALLE + CRUD DE PROYECTOS (PORTAFOLIO)
// ============================================================================

function openItemDetailModal(itemId) {
  const item = STORE_STATE.catalog.find(i => i.id === itemId);
  if (!item) return;
  const cfg = STORE_STATE.config;
  const plans = getAllowedPlansForItem(item);
  const body = document.getElementById('item-detail-modal-body');

  body.innerHTML = `
    <div class="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
      <div>
        <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-500/15 text-sky-300 border border-sky-500/30">${item.type === 'servicio' ? 'Servicio' : 'Producto'} · ${escapeHtml(item.category)}</span>
        <h3 class="text-xl font-extrabold text-white mt-2">${escapeHtml(item.name)}</h3>
        <div class="text-xs text-indigo-300 font-semibold mt-0.5">${escapeHtml(getSalesCatalogName(item.salesCatalogId))}</div>
      </div>
      <button onclick="closeItemDetailModal()" class="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white"><i data-lucide="x" class="w-5 h-5"></i></button>
    </div>

    <div class="flex flex-wrap items-baseline gap-3">
      <span class="text-3xl font-extrabold text-emerald-400">${escapeHtml(cfg.currencySymbol)}${item.price}</span>
      <span class="text-sm font-bold text-sky-300 bg-sky-500/10 border border-sky-500/25 px-3 py-1 rounded-xl">&approx; ${formatBs(item.price, STORE_STATE.bcvRates?.usd)} (BCV)</span>
    </div>

    ${renderModalGalleryHtml(item.images, item.name)}

    <div class="space-y-2">
      <div class="text-xs font-bold uppercase tracking-wider text-slate-400">Descripción</div>
      <p class="text-sm text-slate-200 leading-relaxed">${escapeHtml(item.description)}</p>
    </div>

    ${item.details ? `
      <div class="space-y-2 p-4 rounded-2xl bg-slate-900/90 border border-slate-800">
        <div class="text-xs font-bold uppercase tracking-wider text-sky-300">Todo lo que incluye / Detalles</div>
        <div class="text-xs sm:text-sm text-slate-300 leading-relaxed whitespace-pre-line">${escapeHtml(item.details)}</div>
      </div>
    ` : ''}

    <div class="space-y-2">
      <div class="text-xs font-bold uppercase tracking-wider text-slate-400">Modalidades de pago disponibles</div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        ${plans.map(p => `
          <div class="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs">
            <div class="font-bold text-white">${escapeHtml(p.name)}</div>
            <div class="text-slate-400 mt-0.5">${escapeHtml(p.description)}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="pt-3 border-t border-slate-800 flex flex-wrap gap-2.5">
      <button onclick="addToCart('${item.id}'); closeItemDetailModal();" class="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold border border-slate-700">Agregar al Carrito</button>
      <button onclick="closeItemDetailModal(); openPasarelaForItem('${item.id}');" class="flex-1 py-3 px-4 rounded-xl bg-astro-gradient text-white text-xs font-extrabold">Ir a Pasarela y Pagar</button>
    </div>
  `;

  document.getElementById('item-detail-modal').classList.remove('hidden');
  if (window.lucide) window.lucide.createIcons();
}

function openProjectDetailModal(projectId) {
  const p = STORE_STATE.projects.find(x => x.id === projectId);
  if (!p) return;
  const body = document.getElementById('item-detail-modal-body');
  const waMsg = `¡Hola! Vi el proyecto "${p.title}" en tu portafolio y me interesa cotizar algo similar.`;

  body.innerHTML = `
    <div class="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
      <div>
        <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">${escapeHtml(p.category)} · ${escapeHtml(p.year)}</span>
        <h3 class="text-xl font-extrabold text-white mt-2">${escapeHtml(p.title)}</h3>
        <div class="text-xs text-emerald-400 font-semibold mt-0.5">Cliente: ${escapeHtml(p.client)} · ${escapeHtml(p.status)}</div>
      </div>
      <button onclick="closeItemDetailModal()" class="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white"><i data-lucide="x" class="w-5 h-5"></i></button>
    </div>
    ${renderModalGalleryHtml(p.images, p.title)}
    <p class="text-sm text-slate-200 leading-relaxed">${escapeHtml(p.summary)}</p>
    ${p.details ? `
      <div class="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 text-xs sm:text-sm text-slate-300 leading-relaxed whitespace-pre-line">
        ${escapeHtml(p.details)}
      </div>
    ` : ''}
    <div class="flex flex-wrap gap-1.5">
      ${(p.tags || []).map(t => `<span class="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-indigo-300 font-semibold">${escapeHtml(t)}</span>`).join('')}
    </div>
    <div class="pt-3 border-t border-slate-800 flex flex-wrap gap-2.5">
      <a href="${buildWhatsAppUrl(waMsg, STORE_STATE.config)}" target="_blank" rel="noopener" class="flex-1 py-3 px-4 rounded-xl bg-[#25D366] text-slate-950 text-xs font-extrabold text-center">Cotizar proyecto similar por WhatsApp</a>
      ${p.url ? `<a href="${escapeHtml(p.url)}" target="_blank" rel="noopener" class="py-3 px-4 rounded-xl bg-indigo-600 text-white text-xs font-bold">Abrir Demo</a>` : ''}
    </div>
  `;

  document.getElementById('item-detail-modal').classList.remove('hidden');
  if (window.lucide) window.lucide.createIcons();
}

function closeItemDetailModal() {
  document.getElementById('item-detail-modal').classList.add('hidden');
}

function renderAdminProjectsList() {
  const el = document.getElementById('admin-projects-list');
  if (!el) return;
  el.innerHTML = STORE_STATE.projects.map(p => `
    <div class="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300">${escapeHtml(p.category)}</span>
          <span class="font-bold text-white text-sm">${escapeHtml(p.title)}</span>
          <span class="text-xs text-emerald-400 font-semibold">${escapeHtml(p.year)}</span>
        </div>
        <p class="text-xs text-slate-400 truncate mt-0.5">${escapeHtml(p.client)} · ${escapeHtml(p.summary)}</p>
      </div>
      <div class="flex gap-2 shrink-0">
        <button onclick="editProject('${p.id}')" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-sky-300">Editar</button>
        <button onclick="deleteProject('${p.id}')" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/15 text-rose-300">Eliminar</button>
      </div>
    </div>
  `).join('');
}

function handleSaveProject(e) {
  e.preventDefault();
  const pendingPrjImg = document.getElementById('prj-image-url-input');
  if (pendingPrjImg && pendingPrjImg.value.trim()) {
    STORE_STATE.draftProjectImages.push(normalizeExternalImageUrl(pendingPrjImg.value.trim()));
    pendingPrjImg.value = '';
  }

  const tagsRaw = document.getElementById('prj-tags').value.trim();
  const data = {
    title: document.getElementById('prj-title').value.trim(),
    client: document.getElementById('prj-client').value.trim(),
    year: document.getElementById('prj-year').value.trim(),
    category: document.getElementById('prj-category').value.trim(),
    status: document.getElementById('prj-status').value.trim() || 'Completado',
    tags: tagsRaw ? tagsRaw.split(',').map(s => s.trim()).filter(Boolean) : [],
    url: document.getElementById('prj-url').value.trim(),
    summary: document.getElementById('prj-summary').value.trim(),
    details: document.getElementById('prj-details').value.trim(),
    images: [...STORE_STATE.draftProjectImages]
  };

  if (STORE_STATE.editingProjectId) {
    const idx = STORE_STATE.projects.findIndex(p => p.id === STORE_STATE.editingProjectId);
    if (idx !== -1) STORE_STATE.projects[idx] = { ...STORE_STATE.projects[idx], ...data };
  } else {
    STORE_STATE.projects.unshift({ id: 'prj-' + Date.now(), ...data });
  }
  saveToStorage(STORE_STORAGE_KEYS.PROJECTS, STORE_STATE.projects);
  cancelEditProject();
  renderAdminProjectsList();
  showToast('Proyecto guardado en portafolio');
}

function editProject(id) {
  const p = STORE_STATE.projects.find(x => x.id === id);
  if (!p) return;
  STORE_STATE.editingProjectId = id;
  document.getElementById('admin-prj-form-title').textContent = 'Editar Proyecto Realizado';
  document.getElementById('admin-prj-cancel-edit').classList.remove('hidden');
  document.getElementById('prj-title').value = p.title;
  document.getElementById('prj-client').value = p.client;
  document.getElementById('prj-year').value = p.year;
  document.getElementById('prj-category').value = p.category;
  document.getElementById('prj-status').value = p.status;
  document.getElementById('prj-tags').value = (p.tags || []).join(', ');
  document.getElementById('prj-url').value = p.url || '';
  document.getElementById('prj-summary').value = p.summary;
  document.getElementById('prj-details').value = p.details || '';
  STORE_STATE.draftProjectImages = Array.isArray(p.images) ? [...p.images] : [];
  renderDraftImagesPreview('project');
  resetScrollArea();
}

function cancelEditProject() {
  STORE_STATE.editingProjectId = null;
  STORE_STATE.draftProjectImages = [];
  document.getElementById('admin-prj-form-title').textContent = 'Agregar Trabajo / Proyecto Realizado';
  document.getElementById('admin-prj-cancel-edit').classList.add('hidden');
  ['prj-title', 'prj-client', 'prj-year', 'prj-category', 'prj-tags', 'prj-url', 'prj-summary', 'prj-details'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('prj-status').value = 'Completado';
  renderDraftImagesPreview('project');
}

function deleteProject(id) {
  STORE_STATE.projects = STORE_STATE.projects.filter(p => p.id !== id);
  saveToStorage(STORE_STORAGE_KEYS.PROJECTS, STORE_STATE.projects);
  renderAdminProjectsList();
  showToast('Proyecto eliminado');
}

// ============================================================================
// GESTIÓN DE MÚLTIPLES FOTOGRAFÍAS (COMPRESIÓN + GALERÍA EN MODAL)
// ============================================================================

function compressImageFile(file, maxWidth = 900, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handleImageFilesUpload(e, target) {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  const arr = target === 'item' ? STORE_STATE.draftItemImages : STORE_STATE.draftProjectImages;
  for (const file of files) {
    try {
      const compressed = await compressImageFile(file);
      const finalUrl = window.storeCloud
        ? await window.storeCloud.uploadImageToConfiguredCloud(file, compressed)
        : compressed;
      arr.push(finalUrl);
    } catch (err) {}
  }
  e.target.value = '';
  renderDraftImagesPreview(target);
  showToast(`${files.length} foto(s) cargada(s)`);
}

function handleAddImageUrl(target) {
  const inputId = target === 'item' ? 'item-image-url-input' : 'prj-image-url-input';
  const input = document.getElementById(inputId);
  const rawUrl = input ? input.value.trim() : '';
  if (!rawUrl) return;
  const url = normalizeExternalImageUrl(rawUrl);
  const arr = target === 'item' ? STORE_STATE.draftItemImages : STORE_STATE.draftProjectImages;
  arr.push(url);
  input.value = '';
  renderDraftImagesPreview(target);
}

function removeDraftImage(target, idx) {
  const arr = target === 'item' ? STORE_STATE.draftItemImages : STORE_STATE.draftProjectImages;
  arr.splice(idx, 1);
  renderDraftImagesPreview(target);
}

function renderDraftImagesPreview(target) {
  const el = document.getElementById(target === 'item' ? 'item-images-preview' : 'prj-images-preview');
  if (!el) return;
  const arr = target === 'item' ? STORE_STATE.draftItemImages : STORE_STATE.draftProjectImages;
  if (!arr.length) {
    el.innerHTML = `<span class="text-[11px] text-slate-500">Sin fotografías cargadas.</span>`;
    return;
  }
  el.innerHTML = arr.map((src, i) => `
    <div class="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-700 group shrink-0">
      <img src="${src}" alt="Foto ${i + 1}" class="w-full h-full object-cover" />
      <button type="button" onclick="removeDraftImage('${target}', ${i})" class="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center shadow">&times;</button>
    </div>
  `).join('');
}

function renderModalGalleryHtml(images, title) {
  const imgs = (Array.isArray(images) ? images : []).map(normalizeExternalImageUrl);
  if (!imgs.length) return '';
  STORE_STATE.galleryImages = imgs;
  STORE_STATE.galleryIndex = 0;

  return `
    <div class="space-y-2.5">
      <div class="relative h-64 sm:h-72 rounded-2xl overflow-hidden bg-slate-900 border border-slate-800">
        <img id="modal-gallery-main" src="${imgs[0]}" alt="${escapeHtml(title)}" class="w-full h-full object-contain" />
        ${imgs.length > 1 ? `
          <button type="button" onclick="stepModalGallery(-1)" class="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-slate-950/75 hover:bg-slate-900 text-white flex items-center justify-center border border-white/15">&lsaquo;</button>
          <button type="button" onclick="stepModalGallery(1)" class="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-slate-950/75 hover:bg-slate-900 text-white flex items-center justify-center border border-white/15">&rsaquo;</button>
        ` : ''}
      </div>
      ${imgs.length > 1 ? `
        <div class="flex gap-2 overflow-x-auto hover-scroll-x pb-1">
          ${imgs.map((src, i) => `
            <button type="button" onclick="setModalGalleryIndex(${i})" class="w-16 h-16 rounded-xl overflow-hidden border-2 shrink-0 transition ${i === 0 ? 'border-sky-400' : 'border-slate-800 opacity-70 hover:opacity-100'}" id="gal-thumb-${i}">
              <img src="${src}" class="w-full h-full object-cover" />
            </button>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function setModalGalleryIndex(idx) {
  const imgs = STORE_STATE.galleryImages;
  if (!imgs.length) return;
  STORE_STATE.galleryIndex = (idx + imgs.length) % imgs.length;
  const main = document.getElementById('modal-gallery-main');
  if (main) main.src = imgs[STORE_STATE.galleryIndex];
  imgs.forEach((_, i) => {
    const th = document.getElementById(`gal-thumb-${i}`);
    if (th) th.className = `w-16 h-16 rounded-xl overflow-hidden border-2 shrink-0 transition ${i === STORE_STATE.galleryIndex ? 'border-sky-400' : 'border-slate-800 opacity-70 hover:opacity-100'}`;
  });
}

function stepModalGallery(delta) {
  setModalGalleryIndex(STORE_STATE.galleryIndex + delta);
}

// ============================================================================
// MÓDULO TRABAJOS Y SERVICIOS ACTIVOS (SEGUIMIENTO + ADMIN CRUD)
// ============================================================================

function computeJobDeadlineInfo(contractDateStr, dueDateStr, status) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = dueDateStr ? new Date(dueDateStr + 'T00:00:00') : null;
  if (!due || isNaN(due.getTime())) {
    return { label: 'Sin fecha', badgeCls: 'bg-slate-800 text-slate-300' };
  }
  const diffDays = Math.round((due - now) / (1000 * 60 * 60 * 24));
  if (status === 'Completado') {
    return { label: 'Entregado', badgeCls: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' };
  }
  if (status === 'Vencido / Cancelado' || diffDays < 0) {
    return { label: `Vencido hace ${Math.abs(diffDays)} día(s)`, badgeCls: 'bg-rose-500/20 text-rose-300 border border-rose-500/30' };
  }
  if (diffDays === 0) {
    return { label: 'Vence hoy', badgeCls: 'bg-amber-500/20 text-amber-300 border border-amber-500/30' };
  }
  if (diffDays <= 3) {
    return { label: `Quedan ${diffDays} día(s)`, badgeCls: 'bg-amber-500/20 text-amber-300 border border-amber-500/30' };
  }
  return { label: `Quedan ${diffDays} días`, badgeCls: 'bg-sky-500/20 text-sky-300 border border-sky-500/30' };
}

function formatJobDate(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function handleJobSearch(val) {
  STORE_STATE.jobSearchQuery = val.trim().toLowerCase();
  renderTrabajosModule();
}

function setJobStatusFilter(status) {
  STORE_STATE.jobStatusFilter = status;
  ['todos', 'En progreso', 'Esperando abono', 'Completado'].forEach(st => {
    const btn = document.getElementById(`job-filter-${st}`);
    if (!btn) return;
    btn.className = st === status
      ? 'px-3.5 py-1.5 rounded-full text-xs font-bold bg-sky-600 text-white whitespace-nowrap'
      : 'px-3.5 py-1.5 rounded-full text-xs font-medium text-slate-300 hover:text-white whitespace-nowrap';
  });
  renderTrabajosModule();
}

function renderTrabajosModule() {
  const grid = document.getElementById('active-jobs-grid');
  if (!grid) return;

  const sym = STORE_STATE.config.currencySymbol;
  const usdRate = STORE_STATE.bcvRates?.usd || 0;

  const filtered = STORE_STATE.activeJobs.filter(j => {
    const matchesStatus = STORE_STATE.jobStatusFilter === 'todos' || j.status === STORE_STATE.jobStatusFilter;
    const q = STORE_STATE.jobSearchQuery;
    const matchesSearch = !q ||
      j.code.toLowerCase().includes(q) ||
      j.clientName.toLowerCase().includes(q) ||
      j.serviceName.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  if (!filtered.length) {
    grid.innerHTML = `<div class="col-span-full bento-card p-8 text-center text-slate-400 text-sm">No hay trabajos o servicios activos con ese filtro.</div>`;
    return;
  }

  grid.innerHTML = filtered.map(j => {
    const timeInfo = computeJobDeadlineInfo(j.contractDate, j.dueDate, j.status);
    const total = Number(j.totalAmount || 0);
    const paid = Number(j.paidAmount || 0);
    const pending = Math.max(0, total - paid);
    const pct = Math.min(100, Math.max(0, Number(j.progress || 0)));

    const statusBadgeCls = j.status === 'Completado'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      : j.status === 'Esperando abono'
      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
      : j.status === 'Vencido / Cancelado'
      ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
      : 'bg-sky-500/15 text-sky-300 border-sky-500/30';

    const waMsg = `¡Hola! Consulto sobre mi trabajo activo *${j.code}* (${j.serviceName} - Cliente: ${j.clientName}).`;

    return `
      <article class="bento-card bento-card-hover p-5 flex flex-col justify-between gap-4">
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <span class="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-slate-800 text-sky-300 border border-slate-700">${escapeHtml(j.code)}</span>
            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${statusBadgeCls}">${escapeHtml(j.status)}</span>
          </div>

          <div>
            <h3 class="font-bold text-white text-base leading-snug">${escapeHtml(j.serviceName)}</h3>
            <div class="text-xs text-slate-400 mt-0.5">Cliente: <strong class="text-slate-200">${escapeHtml(j.clientName)}</strong></div>
          </div>

          <!-- Fechas de Contrato y Vencimiento -->
          <div class="grid grid-cols-2 gap-2 p-3 rounded-2xl bg-slate-900/90 border border-slate-800 text-xs">
            <div>
              <div class="text-[10px] text-slate-400">Fecha de contrato</div>
              <div class="font-bold text-white mt-0.5">${formatJobDate(j.contractDate)}</div>
            </div>
            <div>
              <div class="text-[10px] text-slate-400">Vence / Entrega</div>
              <div class="font-bold text-amber-300 mt-0.5">${formatJobDate(j.dueDate)}</div>
            </div>
            <div class="col-span-2 pt-2 border-t border-slate-800 flex items-center justify-between">
              <span class="text-[11px] text-slate-400">Tiempo restante:</span>
              <span class="px-2 py-0.5 rounded-md text-[10px] font-bold ${timeInfo.badgeCls}">${timeInfo.label}</span>
            </div>
          </div>

          <!-- Barra de avance -->
          <div>
            <div class="flex items-center justify-between text-xs mb-1">
              <span class="text-slate-400 font-semibold">Avance del trabajo</span>
              <span class="font-extrabold text-sky-300">${pct}%</span>
            </div>
            <div class="w-full h-2.5 rounded-full bg-slate-900 border border-slate-800 overflow-hidden">
              <div class="h-full bg-astro-gradient rounded-full transition-all duration-300" style="width: ${pct}%"></div>
            </div>
          </div>

          <!-- Estado de pago -->
          <div class="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 text-xs space-y-1">
            <div class="flex justify-between">
              <span class="text-slate-400">Modalidad:</span>
              <span class="text-slate-200 font-semibold">${escapeHtml(j.paymentMode || 'Acordado')}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-400">Pagado / Abonado:</span>
              <span class="text-emerald-400 font-bold">${escapeHtml(sym)}${paid.toFixed(2)} de ${escapeHtml(sym)}${total.toFixed(2)}</span>
            </div>
            ${pending > 0 ? `
              <div class="flex justify-between">
                <span class="text-slate-400">Saldo pendiente:</span>
                <span class="text-amber-300 font-bold">${escapeHtml(sym)}${pending.toFixed(2)} (&approx; ${formatBs(pending, usdRate)})</span>
              </div>
            ` : `<div class="text-emerald-400 font-bold text-right">Pago completado 100%</div>`}
          </div>

          ${j.notes ? `<p class="text-[11px] text-slate-300 leading-relaxed">${escapeHtml(j.notes)}</p>` : ''}
        </div>

        <div class="pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
          <button onclick="openJobViewerModal('${j.id}')" class="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 text-xs font-bold border border-slate-700 transition flex items-center justify-center gap-1.5">
            <i data-lucide="eye" class="w-4 h-4"></i>
            <span>Ver Avances (${(j.deliverables || []).length})</span>
          </button>
          ${pending > 0 ? `
            <button onclick="openAbonoModal('${j.id}')" class="flex-1 py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold transition flex items-center justify-center gap-1.5">
              <i data-lucide="wallet" class="w-4 h-4"></i>
              <span>Reportar Abono</span>
            </button>
          ` : `
            <a href="${buildWhatsAppUrl(waMsg, STORE_STATE.config)}" target="_blank" rel="noopener" class="flex-1 py-2.5 px-3 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-slate-950 text-xs font-extrabold text-center transition flex items-center justify-center gap-1.5">
              <i data-lucide="message-circle" class="w-4 h-4"></i>
              <span>Consultar</span>
            </a>
          `}
        </div>
      </article>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();
}

function renderAdminJobsList() {
  const el = document.getElementById('admin-jobs-list');
  if (!el) return;
  const sym = STORE_STATE.config.currencySymbol;
  if (!STORE_STATE.activeJobs.length) {
    el.innerHTML = `<p class="text-xs text-slate-400">No hay trabajos activos registrados.</p>`;
    return;
  }
  el.innerHTML = STORE_STATE.activeJobs.map(j => `
    <div class="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-300">${escapeHtml(j.code)}</span>
          <span class="font-bold text-white text-sm">${escapeHtml(j.serviceName)}</span>
          <span class="text-xs text-emerald-400 font-bold">${j.progress}% · ${escapeHtml(j.status)}</span>
        </div>
        <p class="text-xs text-slate-400 mt-0.5">Cliente: ${escapeHtml(j.clientName)} | Contrato: ${formatJobDate(j.contractDate)} | Vence: ${formatJobDate(j.dueDate)} | Pagado: ${escapeHtml(sym)}${j.paidAmount}/${j.totalAmount}</p>
      </div>
      <div class="flex gap-2 shrink-0">
        <button onclick="editActiveJob('${j.id}')" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-sky-300">Editar</button>
        <button onclick="deleteActiveJob('${j.id}')" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/15 text-rose-300">Eliminar</button>
      </div>
    </div>
  `).join('');
}

function handleSaveActiveJob(e) {
  e.preventDefault();
  const data = {
    code: document.getElementById('job-code').value.trim(),
    clientName: document.getElementById('job-client').value.trim(),
    serviceName: document.getElementById('job-service').value.trim(),
    contractDate: document.getElementById('job-contract-date').value,
    dueDate: document.getElementById('job-due-date').value,
    progress: Math.min(100, Math.max(0, parseInt(document.getElementById('job-progress').value, 10) || 0)),
    status: document.getElementById('job-status').value,
    paymentMode: document.getElementById('job-payment-mode').value.trim() || 'Acordado',
    totalAmount: parseFloat(document.getElementById('job-total').value) || 0,
    paidAmount: parseFloat(document.getElementById('job-paid').value) || 0,
    notes: document.getElementById('job-notes').value.trim(),
    deliverables: [...STORE_STATE.draftJobDeliverables]
  };

  if (STORE_STATE.editingJobId) {
    const idx = STORE_STATE.activeJobs.findIndex(j => j.id === STORE_STATE.editingJobId);
    if (idx !== -1) STORE_STATE.activeJobs[idx] = { ...STORE_STATE.activeJobs[idx], ...data };
  } else {
    STORE_STATE.activeJobs.unshift({ id: 'job-' + Date.now(), ...data });
  }
  saveToStorage(STORE_STORAGE_KEYS.ACTIVE_JOBS, STORE_STATE.activeJobs);
  cancelEditActiveJob();
  renderAdminJobsList();
  showToast('Trabajo activo guardado');
}

function editActiveJob(id) {
  const j = STORE_STATE.activeJobs.find(x => x.id === id);
  if (!j) return;
  STORE_STATE.editingJobId = id;
  document.getElementById('admin-job-form-title').textContent = 'Editar Trabajo / Servicio Activo';
  document.getElementById('admin-job-cancel-edit').classList.remove('hidden');
  document.getElementById('job-code').value = j.code;
  document.getElementById('job-client').value = j.clientName;
  document.getElementById('job-service').value = j.serviceName;
  document.getElementById('job-contract-date').value = j.contractDate;
  document.getElementById('job-due-date').value = j.dueDate;
  document.getElementById('job-progress').value = j.progress;
  document.getElementById('job-status').value = j.status;
  document.getElementById('job-payment-mode').value = j.paymentMode || '';
  document.getElementById('job-total').value = j.totalAmount;
  document.getElementById('job-paid').value = j.paidAmount;
  document.getElementById('job-notes').value = j.notes || '';
  STORE_STATE.draftJobDeliverables = Array.isArray(j.deliverables) ? [...j.deliverables] : [];
  renderDraftJobDeliverablesPreview();
  resetScrollArea();
}

function cancelEditActiveJob() {
  STORE_STATE.editingJobId = null;
  STORE_STATE.draftJobDeliverables = [];
  document.getElementById('admin-job-form-title').textContent = 'Registrar / Actualizar Trabajo o Servicio Activo';
  document.getElementById('admin-job-cancel-edit').classList.add('hidden');
  ['job-code', 'job-client', 'job-service', 'job-contract-date', 'job-due-date', 'job-payment-mode', 'job-total', 'job-paid', 'job-notes'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('job-progress').value = '0';
  document.getElementById('job-status').value = 'En progreso';
  renderDraftJobDeliverablesPreview();
}

function deleteActiveJob(id) {
  STORE_STATE.activeJobs = STORE_STATE.activeJobs.filter(j => j.id !== id);
  saveToStorage(STORE_STORAGE_KEYS.ACTIVE_JOBS, STORE_STATE.activeJobs);
  renderAdminJobsList();
  showToast('Trabajo eliminado');
}

// ============================================================================
// ENTREGABLES DE TRABAJOS (ADMIN UPLOAD/NUBE + VISOR PROTEGIDO SOLO VER)
// ============================================================================

async function handleJobDeliverablesUpload(e) {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  const allowDownload = Boolean(document.getElementById('job-ext-allow-download')?.checked);

  for (const file of files) {
    try {
      if (file.type === 'application/pdf') {
        const dataUrl = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = ev => resolve(ev.target.result);
          r.onerror = reject;
          r.readAsDataURL(file);
        });
        STORE_STATE.draftJobDeliverables.push({
          id: 'del-' + Date.now() + Math.random(),
          kind: 'pdf',
          title: file.name,
          url: dataUrl,
          allowDownload
        });
      } else if (file.type.startsWith('image/')) {
        const compressed = await compressImageFile(file, 1000, 0.8);
        const finalUrl = window.storeCloud
          ? await window.storeCloud.uploadImageToConfiguredCloud(file, compressed)
          : compressed;
        STORE_STATE.draftJobDeliverables.push({
          id: 'del-' + Date.now() + Math.random(),
          kind: 'image',
          title: file.name,
          url: finalUrl,
          allowDownload
        });
      }
    } catch (err) {}
  }

  e.target.value = '';
  renderDraftJobDeliverablesPreview();
  showToast(`${files.length} archivo(s) adjuntado(s)`);
}

function handleAddJobDeliverableUrl() {
  const kind = document.getElementById('job-ext-kind').value;
  const titleInput = document.getElementById('job-ext-title');
  const urlInput = document.getElementById('job-ext-url');
  const allowDownload = Boolean(document.getElementById('job-ext-allow-download')?.checked);

  const url = urlInput.value.trim();
  if (!url) return;
  const title = titleInput.value.trim() || (kind === 'pdf' ? 'Documento PDF' : kind === 'image' ? 'Imagen de Avance' : 'Archivo en Nube Externa');

  STORE_STATE.draftJobDeliverables.push({
    id: 'del-' + Date.now(),
    kind,
    title,
    url,
    allowDownload
  });

  titleInput.value = '';
  urlInput.value = '';
  renderDraftJobDeliverablesPreview();
}

function removeDraftJobDeliverable(idx) {
  STORE_STATE.draftJobDeliverables.splice(idx, 1);
  renderDraftJobDeliverablesPreview();
}

function renderDraftJobDeliverablesPreview() {
  const el = document.getElementById('job-deliverables-preview');
  if (!el) return;
  if (!STORE_STATE.draftJobDeliverables.length) {
    el.innerHTML = `<span class="text-[11px] text-slate-500">Sin archivos de avance adjuntos.</span>`;
    return;
  }
  el.innerHTML = STORE_STATE.draftJobDeliverables.map((d, idx) => `
    <div class="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2 text-xs">
      <div class="min-w-0 flex items-center gap-2">
        <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase ${d.kind === 'pdf' ? 'bg-rose-500/20 text-rose-300' : d.kind === 'image' ? 'bg-sky-500/20 text-sky-300' : 'bg-indigo-500/20 text-indigo-300'}">${escapeHtml(d.kind)}</span>
        <span class="font-semibold text-white truncate">${escapeHtml(d.title)}</span>
        <span class="text-[10px] px-2 py-0.5 rounded-full ${d.allowDownload ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}">${d.allowDownload ? 'Descargable' : 'Solo Ver'}</span>
      </div>
      <button type="button" onclick="removeDraftJobDeliverable(${idx})" class="text-rose-400 hover:text-rose-300 font-bold px-2">&times;</button>
    </div>
  `).join('');
}

function toEmbedPreviewUrl(url) {
  if (!url) return '';
  // Convierte enlaces de Google Drive (/view o /open?id=) a /preview para solo visualizar
  const driveFileMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
  if (driveFileMatch) {
    return `https://drive.google.com/file/d/${driveFileMatch[1]}/preview`;
  }
  const driveIdMatch = url.match(/drive\.google\.com\/open\?id=([^&]+)/i);
  if (driveIdMatch) {
    return `https://drive.google.com/file/d/${driveIdMatch[1]}/preview`;
  }
  return url;
}

function openJobViewerModal(jobId) {
  const j = STORE_STATE.activeJobs.find(x => x.id === jobId);
  if (!j) return;
  const items = Array.isArray(j.deliverables) ? j.deliverables : [];
  const body = document.getElementById('item-detail-modal-body');

  const deliverablesHtml = items.length ? items.map(d => {
    const previewUrl = toEmbedPreviewUrl(d.url);
    const isEmbeddableCloud = previewUrl.includes('drive.google.com/file/d/') && previewUrl.includes('/preview');

    let mediaHtml = '';
    if (d.kind === 'image') {
      mediaHtml = `
        <div oncontextmenu="return false;" class="protected-view-box rounded-2xl bg-slate-950 border border-slate-800 h-64 flex items-center justify-center">
          <img src="${d.url}" alt="${escapeHtml(d.title)}" draggable="false" class="protected-view-media max-h-full max-w-full object-contain" />
          <div class="protected-watermark">SOLO VISTA PREVIA · ${escapeHtml(j.code)}</div>
        </div>
      `;
    } else if (d.kind === 'pdf') {
      const pdfSrc = d.url.startsWith('data:') ? `${d.url}#toolbar=0&navpanes=0` : `${previewUrl}#toolbar=0&navpanes=0`;
      mediaHtml = `
        <div oncontextmenu="return false;" class="protected-view-box rounded-2xl bg-slate-950 border border-slate-800 h-72">
          <iframe src="${pdfSrc}" class="w-full h-full border-0"></iframe>
        </div>
      `;
    } else if (isEmbeddableCloud) {
      mediaHtml = `
        <div oncontextmenu="return false;" class="protected-view-box rounded-2xl bg-slate-950 border border-slate-800 h-72">
          <iframe src="${previewUrl}" class="w-full h-full border-0" allow="autoplay"></iframe>
        </div>
      `;
    } else {
      mediaHtml = `
        <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300">
          ${d.allowDownload
            ? 'Archivo alojado en nube externa listo para descargar.'
            : 'Vista protegida: el administrador aún no habilitó la descarga directa de este enlace externo.'}
        </div>
      `;
    }

    return `
      <div class="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-sky-500/20 text-sky-300">${escapeHtml(d.kind)}</span>
            <span class="font-bold text-white text-sm">${escapeHtml(d.title)}</span>
          </div>
          <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold ${d.allowDownload ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}">
            ${d.allowDownload ? 'Descarga habilitada' : 'Solo Ver (Protegido)'}
          </span>
        </div>

        ${mediaHtml}

        ${d.allowDownload ? `
          <a href="${escapeHtml(d.url)}" target="_blank" rel="noopener" download="${escapeHtml(d.title)}" class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold transition">
            <i data-lucide="download" class="w-3.5 h-3.5"></i>
            <span>Descargar Archivo</span>
          </a>
        ` : ''}
      </div>
    `;
  }).join('') : `<div class="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 text-center text-xs text-slate-400">Aún no hay archivos de avance cargados para este trabajo.</div>`;

  body.innerHTML = `
    <div class="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
      <div>
        <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-500/15 text-sky-300 border border-sky-500/30">${escapeHtml(j.code)} · ${escapeHtml(j.status)}</span>
        <h3 class="text-xl font-extrabold text-white mt-2">${escapeHtml(j.serviceName)}</h3>
        <div class="text-xs text-slate-400 mt-0.5">Cliente: <strong class="text-slate-200">${escapeHtml(j.clientName)}</strong> · Avance: <strong class="text-emerald-400">${j.progress}%</strong></div>
      </div>
      <button onclick="closeItemDetailModal()" class="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white"><i data-lucide="x" class="w-5 h-5"></i></button>
    </div>

    <div oncontextmenu="return false;" class="space-y-3">
      ${deliverablesHtml}
    </div>
  `;

  document.getElementById('item-detail-modal').classList.remove('hidden');
  if (window.lucide) window.lucide.createIcons();
}

// ============================================================================
// REPORTAR ABONO DESDE TRABAJOS + CONFIRMACIÓN ADMIN (LIBERA EL TRABAJO)
// ============================================================================

let draftAbonoReceiptDataUrl = '';

function openAbonoModal(jobId) {
  const j = STORE_STATE.activeJobs.find(x => x.id === jobId);
  if (!j) return;
  draftAbonoReceiptDataUrl = '';
  const sym = STORE_STATE.config.currencySymbol;
  const usdRate = STORE_STATE.bcvRates?.usd || 0;
  const pending = Math.max(0, Number(j.totalAmount || 0) - Number(j.paidAmount || 0));
  const activeAccounts = STORE_STATE.paymentAccounts.filter(a => a.active !== false);
  const body = document.getElementById('item-detail-modal-body');

  body.innerHTML = `
    <div class="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
      <div>
        <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">${escapeHtml(j.code)} · Abono</span>
        <h3 class="text-lg font-extrabold text-white mt-2">Reportar Abono / Pago Pendiente</h3>
        <p class="text-xs text-slate-400">${escapeHtml(j.serviceName)} · Saldo pendiente: <strong class="text-amber-300">${escapeHtml(sym)}${pending.toFixed(2)} (${formatBs(pending, usdRate)})</strong></p>
      </div>
      <button onclick="closeItemDetailModal()" class="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white"><i data-lucide="x" class="w-5 h-5"></i></button>
    </div>

    <form onsubmit="submitAbonoReport(event, '${j.id}')" class="space-y-3">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="block text-xs text-slate-300 font-semibold mb-1">Monto que estás abonando (${escapeHtml(sym)}) *</label>
          <input id="abono-amount" type="number" step="0.01" min="1" max="${pending.toFixed(2)}" value="${pending.toFixed(2)}" required class="w-full bg-slate-900 text-white text-sm px-3.5 py-2.5 rounded-xl border border-slate-700" />
        </div>
        <div>
          <label class="block text-xs text-slate-300 font-semibold mb-1">Cuenta a donde pagaste *</label>
          <select id="abono-account" class="w-full bg-slate-900 text-white text-sm px-3.5 py-2.5 rounded-xl border border-slate-700">
            ${activeAccounts.map(a => `<option value="${escapeHtml(a.method + ' (' + a.bank + ')')}">${escapeHtml(a.method)} — ${escapeHtml(a.accountInfo)}</option>`).join('')}
          </select>
        </div>
      </div>

      <input id="abono-reference" type="text" required placeholder="Nro. de referencia / comprobante *" class="w-full bg-slate-900 text-white text-sm px-3.5 py-2.5 rounded-xl border border-slate-700" />

      <div class="flex flex-wrap items-center gap-2">
        <label class="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer inline-flex items-center gap-1.5">
          <i data-lucide="upload" class="w-4 h-4"></i>
          <span>Subir Captura del Abono</span>
          <input type="file" accept="image/*" onchange="handleAbonoReceiptFile(event)" class="hidden" />
        </label>
        <span id="abono-receipt-status" class="text-[11px] text-slate-400">Opcional, recomendada</span>
      </div>

      <button type="submit" class="uiverse-pay-btn">
        <span>Registrar Abono y Enviar por WhatsApp</span>
        <svg class="uiverse-pay-icon" viewBox="0 0 576 512"><path d="M512 80c8.8 0 16 7.2 16 16v32H48V96c0-8.8 7.2-16 16-16H512zm16 144V416c0 8.8-7.2 16-16 16H64c-8.8 0-16-7.2-16-16V224H528zM64 32C28.7 32 0 60.7 0 96V416c0 35.3 28.7 64 64 64H512c35.3 0 64-28.7 64-64V96c0-35.3-28.7-64-64-64H64zm56 304c-13.3 0-24 10.7-24 24s10.7 24 24 24h48c13.3 0 24-10.7 24-24s-10.7-24-24-24H120zm128 0c-13.3 0-24 10.7-24 24s10.7 24 24 24H360c13.3 0 24-10.7 24-24s-10.7-24-24-24H248z"></path></svg>
      </button>
    </form>
  `;

  document.getElementById('item-detail-modal').classList.remove('hidden');
  if (window.lucide) window.lucide.createIcons();
}

async function handleAbonoReceiptFile(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const compressed = await compressImageFile(file, 900, 0.8);
    draftAbonoReceiptDataUrl = window.storeCloud
      ? await window.storeCloud.uploadImageToConfiguredCloud(file, compressed)
      : compressed;
    const st = document.getElementById('abono-receipt-status');
    if (st) {
      st.textContent = `Adjunto: ${file.name}`;
      st.className = 'text-[11px] text-emerald-400 font-semibold';
    }
  } catch (err) {}
}

function submitAbonoReport(e, jobId) {
  e.preventDefault();
  const j = STORE_STATE.activeJobs.find(x => x.id === jobId);
  if (!j) return;

  const amount = parseFloat(document.getElementById('abono-amount').value) || 0;
  const account = document.getElementById('abono-account').value;
  const reference = document.getElementById('abono-reference').value.trim();
  const sym = STORE_STATE.config.currencySymbol;
  const usdRate = STORE_STATE.bcvRates?.usd || 0;

  const newAbonoId = 'pay-' + Date.now();
  STORE_STATE.paymentReports.unshift({
    id: newAbonoId,
    jobId: j.id,
    jobCode: j.code,
    customerName: j.clientName,
    serviceName: j.serviceName,
    planName: `Abono (${j.paymentMode || 'Acordado'})`,
    totalAmount: Number(j.totalAmount || 0),
    amountReported: Number(amount.toFixed(2)),
    accountMethod: account,
    reference,
    receiptDataUrl: draftAbonoReceiptDataUrl || '',
    status: 'Pendiente',
    createdAt: new Date().toISOString()
  });
  saveToStorage(STORE_STORAGE_KEYS.PAYMENT_REPORTS, STORE_STATE.paymentReports);

  saveToStorage(STORE_STORAGE_KEYS.LAST_CUSTOMER_PAYMENT, {
    reportId: newAbonoId,
    jobId: j.id,
    jobCode: j.code,
    notifiedConfirmed: false
  });

  closeItemDetailModal();
  showToast('Abono registrado para confirmación en Admin');

  const msg =
    `¡Hola! Soy *${j.clientName}* y reporto un abono para mi trabajo *${j.code}* (${j.serviceName}):\n\n` +
    `*Monto abonado:* ${sym}${amount.toFixed(2)} (${formatBs(amount, usdRate)})\n` +
    `*Cuenta:* ${account}\n` +
    `*Referencia:* ${reference}\n\n` +
    `Quedo atento(a) a la confirmación y liberación.`;

  window.open(buildWhatsAppUrl(msg, STORE_STATE.config), '_blank', 'noopener');
  renderPasarelaModule();
}

function renderAdminPaymentReportsList() {
  const el = document.getElementById('admin-payment-reports-list');
  const badge = document.getElementById('admin-pending-payments-badge');
  if (!el) return;

  const sym = STORE_STATE.config.currencySymbol;
  const usdRate = STORE_STATE.bcvRates?.usd || 0;
  const pendingCount = STORE_STATE.paymentReports.filter(r => r.status === 'Pendiente').length;
  if (badge) badge.textContent = `${pendingCount} pendiente${pendingCount === 1 ? '' : 's'}`;

  if (!STORE_STATE.paymentReports.length) {
    el.innerHTML = `<p class="text-xs text-slate-400">Aún no hay pagos o abonos reportados por clientes.</p>`;
    return;
  }

  el.innerHTML = STORE_STATE.paymentReports.map(r => {
    const stCls = r.status === 'Confirmado'
      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      : r.status === 'Rechazado'
      ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
      : 'bg-amber-500/20 text-amber-300 border-amber-500/30';

    return `
      <div class="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="flex items-start gap-3 min-w-0">
          ${r.receiptDataUrl ? `<img src="${r.receiptDataUrl}" onclick="previewAdminReceipt('${r.id}')" title="Ver captura" class="w-14 h-14 rounded-xl object-cover border border-slate-700 cursor-pointer shrink-0" />` : ''}
          <div class="min-w-0 text-xs space-y-0.5">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-bold">${escapeHtml(r.jobCode)}</span>
              <span class="font-bold text-white text-sm">${escapeHtml(r.customerName)}</span>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${stCls}">${escapeHtml(r.status)}</span>
            </div>
            <div class="text-slate-300 truncate">${escapeHtml(r.serviceName)} · <strong class="text-emerald-400">${escapeHtml(sym)}${Number(r.amountReported).toFixed(2)}</strong> (${formatBs(r.amountReported, usdRate)})</div>
            <div class="text-slate-400">Cuenta: ${escapeHtml(r.accountMethod)} · Ref: <strong class="text-white">${escapeHtml(r.reference)}</strong></div>
          </div>
        </div>

        <div class="flex flex-wrap gap-2 shrink-0">
          ${r.status === 'Pendiente' ? `
            <button onclick="confirmPaymentReport('${r.id}')" class="px-3.5 py-2 rounded-xl text-xs font-extrabold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition">Confirmar Pago</button>
            <button onclick="rejectPaymentReport('${r.id}')" class="px-3 py-2 rounded-xl text-xs font-bold bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 transition">Rechazar</button>
          ` : ''}
          <button onclick="deletePaymentReport('${r.id}')" class="px-2.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-400 hover:text-white">Eliminar</button>
        </div>
      </div>
    `;
  }).join('');
}

function previewAdminReceipt(reportId) {
  const r = STORE_STATE.paymentReports.find(x => x.id === reportId);
  if (!r || !r.receiptDataUrl) return;
  const body = document.getElementById('item-detail-modal-body');
  body.innerHTML = `
    <div class="flex items-center justify-between border-b border-slate-800 pb-3">
      <div class="text-sm font-bold text-white">Comprobante · ${escapeHtml(r.jobCode)} (${escapeHtml(r.customerName)})</div>
      <button onclick="closeItemDetailModal()" class="p-2 rounded-xl bg-slate-800 text-slate-300"><i data-lucide="x" class="w-5 h-5"></i></button>
    </div>
    <img src="${r.receiptDataUrl}" class="w-full max-h-[70vh] object-contain rounded-xl bg-slate-950" />
  `;
  document.getElementById('item-detail-modal').classList.remove('hidden');
  if (window.lucide) window.lucide.createIcons();
}

function confirmPaymentReport(reportId) {
  const r = STORE_STATE.paymentReports.find(x => x.id === reportId);
  if (!r || r.status === 'Confirmado') return;

  r.status = 'Confirmado';
  saveToStorage(STORE_STORAGE_KEYS.PAYMENT_REPORTS, STORE_STATE.paymentReports);

  // Buscar el trabajo vinculado y actualizar saldo + liberar archivos si llega al 100%
  const job = STORE_STATE.activeJobs.find(j => j.id === r.jobId || j.code === r.jobCode);
  let liberated = false;
  if (job) {
    job.paidAmount = Number((Number(job.paidAmount || 0) + Number(r.amountReported || 0)).toFixed(2));
    if (job.paidAmount >= Number(job.totalAmount || 0)) {
      job.paidAmount = Number(job.totalAmount || job.paidAmount);
      job.status = 'Completado';
      job.progress = 100;
      if (Array.isArray(job.deliverables) && job.deliverables.length > 0) {
        job.deliverables = job.deliverables.map(d => ({ ...d, allowDownload: true }));
        liberated = true;
      }
      job.notes = 'Pago confirmado al 100%. Trabajo completado y entregables liberados.';
    } else {
      job.status = 'En progreso';
      job.notes = `Pago parcial confirmado (${STORE_STATE.config.currencySymbol}${job.paidAmount}/${job.totalAmount}).`;
    }
    saveToStorage(STORE_STORAGE_KEYS.ACTIVE_JOBS, STORE_STATE.activeJobs);
  }

  renderAdminPaymentReportsList();
  renderAdminJobsList();
  renderAdminReceivablesManager();
  showToast(liberated
    ? 'Pago confirmado al 100%: trabajo y archivos protegidos LIBERADOS automáticamente'
    : 'Pago confirmado y abonado al trabajo activo');
}

function rejectPaymentReport(reportId) {
  const r = STORE_STATE.paymentReports.find(x => x.id === reportId);
  if (!r) return;
  r.status = 'Rechazado';
  saveToStorage(STORE_STORAGE_KEYS.PAYMENT_REPORTS, STORE_STATE.paymentReports);
  renderAdminPaymentReportsList();
  showToast('Reporte de pago marcado como rechazado', 'error');
}

function deletePaymentReport(reportId) {
  STORE_STATE.paymentReports = STORE_STATE.paymentReports.filter(x => x.id !== reportId);
  saveToStorage(STORE_STORAGE_KEYS.PAYMENT_REPORTS, STORE_STATE.paymentReports);
  renderAdminPaymentReportsList();
}

// ============================================================================
// PANTALLA DE ESPERA + NOTIFICACIÓN EMERGENTE AL CONFIRMAR PAGO
// ============================================================================

function clearPendingWaitScreen() {
  localStorage.removeItem(STORE_STORAGE_KEYS.LAST_CUSTOMER_PAYMENT);
}

function startAnotherOrderFromWait() {
  clearPendingWaitScreen();
  renderPasarelaModule();
}

function checkCustomerPaymentStatus(manualCheck = false) {
  const lastPay = loadFromStorage(STORE_STORAGE_KEYS.LAST_CUSTOMER_PAYMENT, null);
  if (!lastPay || !lastPay.reportId) return;

  const reports = loadPaymentReports();
  const rep = reports.find(r => r.id === lastPay.reportId);
  if (!rep) return;

  if (rep.status === 'Confirmado' && !lastPay.notifiedConfirmed) {
    lastPay.notifiedConfirmed = true;
    saveToStorage(STORE_STORAGE_KEYS.LAST_CUSTOMER_PAYMENT, lastPay);
    const jobs = loadActiveJobs();
    const job = jobs.find(j => j.id === rep.jobId || j.code === rep.jobCode);
    showCustomerPaymentConfirmedPopup(rep, job);
    if (STORE_STATE.currentView === 'public' && STORE_STATE.publicTab === 'pasarela') {
      renderPasarelaModule();
    }
  } else if (manualCheck) {
    if (rep.status === 'Pendiente') {
      showToast('Aún está pendiente de confirmación por el administrador');
    } else if (rep.status === 'Rechazado') {
      showToast('El reporte fue marcado como rechazado. Contáctanos por WhatsApp.', 'error');
    }
  }
}

function showCustomerPaymentConfirmedPopup(report, job) {
  const sym = STORE_STATE.config.currencySymbol;
  const hasDeliverables = job && Array.isArray(job.deliverables) && job.deliverables.length > 0;
  const isCompleted = job && job.status === 'Completado';
  const waMsg = `¡Hola! Mi pago del pedido *${report.jobCode}* (${report.serviceName}) ya fue confirmado. Quedo atento para recibir/retirar mi servicio o producto.`;
  const body = document.getElementById('item-detail-modal-body');

  body.innerHTML = `
    <div class="text-center space-y-4 py-2">
      <div class="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 mx-auto">
        <i data-lucide="check-circle-2" class="w-9 h-9"></i>
      </div>
      <div>
        <span class="px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
          ¡Pago Confirmado! · ${escapeHtml(report.jobCode)}
        </span>
        <h3 class="text-2xl font-extrabold text-white mt-3">Tu pago ha sido aprobado</h3>
        <p class="text-xs sm:text-sm text-slate-300 mt-1 max-w-md mx-auto">
          ${isCompleted
            ? 'Tu pago se completó al 100%. Ya puedes descargar tus archivos o coordinar la entrega/retiro de tu producto o servicio.'
            : `Confirmamos tu pago de <strong>${escapeHtml(sym)}${Number(report.amountReported).toFixed(2)}</strong>. Tu trabajo ya está activo en progreso.`}
        </p>
      </div>

      <div class="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 text-left text-xs space-y-1">
        <div class="text-slate-400">Servicio / Producto: <strong class="text-white">${escapeHtml(report.serviceName)}</strong></div>
        <div class="text-slate-400">Monto confirmado: <strong class="text-emerald-400">${escapeHtml(sym)}${Number(report.amountReported).toFixed(2)}</strong></div>
      </div>

      <div class="flex flex-col sm:flex-row gap-2.5 pt-2">
        ${hasDeliverables ? `
          <button onclick="closeItemDetailModal(); openJobViewerModal('${job.id}');" class="flex-1 py-3 px-4 rounded-xl font-extrabold text-white bg-astro-gradient">
            Ver / Descargar Entregables
          </button>
        ` : ''}
        <button onclick="closeItemDetailModal(); switchPublicTab('trabajos');" class="flex-1 py-3 px-4 rounded-xl font-bold bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700">
          Ver en Mis Trabajos
        </button>
        <a href="${buildWhatsAppUrl(waMsg, STORE_STATE.config)}" target="_blank" rel="noopener" class="flex-1 py-3 px-4 rounded-xl font-extrabold text-slate-950 bg-[#25D366] hover:bg-[#1ebe5d] text-center">
          Recibir / Buscar por WhatsApp
        </a>
      </div>
    </div>
  `;

  document.getElementById('item-detail-modal').classList.remove('hidden');
  if (window.lucide) window.lucide.createIcons();
}

// ============================================================================
// ADMIN: CUPONES, CÓDIGOS ESPECIALES Y PATROCINADORES / SOCIOS
// ============================================================================

function generateRandomCouponCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'ASTRO-';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  const el = document.getElementById('cpn-code');
  if (el) el.value = code;
}

function renderAdminCouponsList() {
  const el = document.getElementById('admin-coupons-list');
  if (!el) return;
  if (!STORE_STATE.coupons.length) {
    el.innerHTML = `<p class="text-xs text-slate-400">No hay cupones ni códigos especiales creados.</p>`;
    return;
  }
  el.innerHTML = STORE_STATE.coupons.map(c => {
    const valLabel = c.discountValue > 0
      ? (c.discountType === 'fixed' ? `-$${c.discountValue}` : `-${c.discountValue}%`)
      : 'Beneficio Especial';
    return `
      <div class="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-extrabold">${escapeHtml(c.code)}</span>
            <span class="font-bold text-emerald-400">${valLabel}</span>
            ${c.expiresAt ? `<span class="text-amber-300 font-semibold">Vence: ${escapeHtml(c.expiresAt)}</span>` : `<span class="text-slate-500">Sin vencimiento</span>`}
          </div>
          <p class="text-slate-300 mt-1">${escapeHtml(c.specifications)}</p>
        </div>
        <div class="flex gap-2 shrink-0">
          <button onclick="toggleCouponActive('${c.id}')" class="px-2.5 py-1 rounded-lg font-bold ${c.active !== false ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'}">${c.active !== false ? 'Activo' : 'Inactivo'}</button>
          <button onclick="deleteCoupon('${c.id}')" class="px-2.5 py-1 rounded-lg font-semibold bg-rose-500/15 text-rose-300">Eliminar</button>
        </div>
      </div>
    `;
  }).join('');
}

function handleSaveCoupon(e) {
  e.preventDefault();
  const code = document.getElementById('cpn-code').value.trim().toUpperCase();
  const kind = document.getElementById('cpn-kind').value;
  const discountType = document.getElementById('cpn-discount-type').value;
  const discountValue = parseFloat(document.getElementById('cpn-discount-val').value) || 0;
  const expiresAt = document.getElementById('cpn-expires').value;
  const specifications = document.getElementById('cpn-specs').value.trim();
  if (!code) return;

  STORE_STATE.coupons.unshift({
    id: 'cpn-' + Date.now(),
    code,
    kind,
    discountType,
    discountValue,
    expiresAt,
    specifications,
    active: true
  });
  saveToStorage(STORE_STORAGE_KEYS.COUPONS, STORE_STATE.coupons);
  ['cpn-code', 'cpn-expires', 'cpn-specs'].forEach(id => { document.getElementById(id).value = ''; });
  renderAdminCouponsList();
  showToast(`Código ${code} creado`);
}

function toggleCouponActive(id) {
  const c = STORE_STATE.coupons.find(x => x.id === id);
  if (!c) return;
  c.active = c.active === false;
  saveToStorage(STORE_STORAGE_KEYS.COUPONS, STORE_STATE.coupons);
  renderAdminCouponsList();
}

function deleteCoupon(id) {
  STORE_STATE.coupons = STORE_STATE.coupons.filter(x => x.id !== id);
  saveToStorage(STORE_STORAGE_KEYS.COUPONS, STORE_STATE.coupons);
  renderAdminCouponsList();
}

function renderAdminSponsorsList() {
  const el = document.getElementById('admin-sponsors-list');
  if (!el) return;
  if (!STORE_STATE.sponsors.length) {
    el.innerHTML = `<p class="text-xs text-slate-400">No hay patrocinadores o socios registrados.</p>`;
    return;
  }
  el.innerHTML = STORE_STATE.sponsors.map(s => `
    <div class="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-2 text-xs">
      <div class="min-w-0">
        <div class="font-bold text-white">${escapeHtml(s.name)} · <span class="text-amber-300">${escapeHtml(s.role)}</span></div>
        <div class="text-slate-400 truncate">${escapeHtml(s.description)}</div>
      </div>
      <button onclick="deleteSponsor('${s.id}')" class="px-2.5 py-1 rounded-lg font-semibold bg-rose-500/15 text-rose-300 shrink-0">Eliminar</button>
    </div>
  `).join('');
}

function handleSaveSponsor(e) {
  e.preventDefault();
  const name = document.getElementById('spn-name').value.trim();
  const role = document.getElementById('spn-role').value.trim();
  const url = document.getElementById('spn-url').value.trim();
  const description = document.getElementById('spn-desc').value.trim();
  STORE_STATE.sponsors.unshift({ id: 'spn-' + Date.now(), name, role, url, description });
  saveToStorage(STORE_STORAGE_KEYS.SPONSORS, STORE_STATE.sponsors);
  ['spn-name', 'spn-role', 'spn-url', 'spn-desc'].forEach(id => { document.getElementById(id).value = ''; });
  renderAdminSponsorsList();
  showToast('Socio / Patrocinador agregado');
}

function deleteSponsor(id) {
  STORE_STATE.sponsors = STORE_STATE.sponsors.filter(x => x.id !== id);
  saveToStorage(STORE_STORAGE_KEYS.SPONSORS, STORE_STATE.sponsors);
  renderAdminSponsorsList();
}

// ============================================================================
// ADMIN: GESTOR COMPLETO DE PAGOS Y CUENTAS POR COBRAR (QUIÉN ME DEBE Y NO)
// ============================================================================

function setLedgerFilter(filterKey) {
  STORE_STATE.ledgerFilter = filterKey;
  ['todos', 'deben', 'aldia', 'vencidos'].forEach(k => {
    const btn = document.getElementById(`fin-filter-${k}`);
    if (!btn) return;
    btn.className = k === filterKey
      ? 'px-3 py-1 rounded-lg text-[11px] font-bold bg-sky-600 text-white'
      : 'px-3 py-1 rounded-lg text-[11px] font-medium text-slate-300';
  });
  renderAdminReceivablesManager();
}

function handleLedgerSearch(val) {
  STORE_STATE.ledgerSearch = val.trim().toLowerCase();
  renderAdminReceivablesManager();
}

function renderAdminReceivablesManager() {
  const listEl = document.getElementById('admin-receivables-list');
  if (!listEl) return;

  const sym = STORE_STATE.config.currencySymbol;
  const usdRate = STORE_STATE.bcvRates?.usd || 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let totalCollected = 0;
  let totalReceivable = 0;
  let debtorsCount = 0;
  let paidUpCount = 0;

  STORE_STATE.activeJobs.forEach(j => {
    const total = Number(j.totalAmount || 0);
    const paid = Number(j.paidAmount || 0);
    const debt = Math.max(0, total - paid);
    totalCollected += paid;
    totalReceivable += debt;
    if (debt > 0) debtorsCount += 1;
    else paidUpCount += 1;
  });

  const pendingReports = STORE_STATE.paymentReports.filter(r => r.status === 'Pendiente');
  const pendingAmt = pendingReports.reduce((s, r) => s + Number(r.amountReported || 0), 0);

  const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setTxt('fin-stat-collected', `${sym}${totalCollected.toFixed(2)}`);
  setTxt('fin-stat-collected-bs', formatBs(totalCollected, usdRate));
  setTxt('fin-stat-receivable', `${sym}${totalReceivable.toFixed(2)}`);
  setTxt('fin-stat-receivable-bs', formatBs(totalReceivable, usdRate));
  setTxt('fin-stat-pending-count', pendingReports.length);
  setTxt('fin-stat-pending-amt', `${sym}${pendingAmt.toFixed(2)} reportados`);
  setTxt('fin-stat-clients-ratio', `${debtorsCount} deben · ${paidUpCount} al día`);

  const filtered = STORE_STATE.activeJobs.filter(j => {
    const debt = Math.max(0, Number(j.totalAmount || 0) - Number(j.paidAmount || 0));
    const due = j.dueDate ? new Date(j.dueDate + 'T00:00:00') : null;
    const isExpired = Boolean(due && !isNaN(due.getTime()) && due < today && debt > 0);

    if (STORE_STATE.ledgerFilter === 'deben' && debt <= 0) return false;
    if (STORE_STATE.ledgerFilter === 'aldia' && debt > 0) return false;
    if (STORE_STATE.ledgerFilter === 'vencidos' && !isExpired) return false;

    const q = STORE_STATE.ledgerSearch;
    if (q) {
      const hit = j.clientName.toLowerCase().includes(q) ||
        j.code.toLowerCase().includes(q) ||
        j.serviceName.toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });

  if (!filtered.length) {
    listEl.innerHTML = `<p class="text-xs text-slate-400">No hay registros en esta vista.</p>`;
    return;
  }

  listEl.innerHTML = filtered.map(j => {
    const total = Number(j.totalAmount || 0);
    const paid = Number(j.paidAmount || 0);
    const debt = Math.max(0, total - paid);
    const due = j.dueDate ? new Date(j.dueDate + 'T00:00:00') : null;
    const isExpired = Boolean(due && !isNaN(due.getTime()) && due < today && debt > 0);

    const statusTag = debt <= 0
      ? `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Al día (100%)</span>`
      : isExpired
      ? `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">Vencido · Debe ${escapeHtml(sym)}${debt.toFixed(2)}</span>`
      : `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">Debe ${escapeHtml(sym)}${debt.toFixed(2)}</span>`;

    const waReminder = `¡Hola *${j.clientName}*! Te recordamos tu saldo pendiente de *${sym}${debt.toFixed(2)}* (${formatBs(debt, usdRate)}) correspondiente a *${j.serviceName}* (${j.code}), con fecha límite ${formatJobDate(j.dueDate)}.`;

    return `
      <div class="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div class="min-w-0 space-y-1 text-xs">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-extrabold">${escapeHtml(j.code)}</span>
            <span class="font-bold text-white text-sm">${escapeHtml(j.clientName)}</span>
            ${statusTag}
          </div>
          <div class="text-slate-300">${escapeHtml(j.serviceName)} · <span class="text-slate-400">Contrato: ${formatJobDate(j.contractDate)} | Vence: ${formatJobDate(j.dueDate)}</span></div>
          <div class="flex flex-wrap gap-3 pt-0.5">
            <span class="text-slate-400">Total: <strong class="text-white">${escapeHtml(sym)}${total.toFixed(2)}</strong></span>
            <span class="text-slate-400">Pagado: <strong class="text-emerald-400">${escapeHtml(sym)}${paid.toFixed(2)}</strong></span>
            <span class="text-slate-400">Saldo: <strong class="${debt > 0 ? 'text-rose-400' : 'text-emerald-400'}">${escapeHtml(sym)}${debt.toFixed(2)} (${formatBs(debt, usdRate)})</strong></span>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2 shrink-0">
          ${debt > 0 ? `
            <a href="${buildWhatsAppUrl(waReminder, STORE_STATE.config)}" target="_blank" rel="noopener" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#25D366] hover:bg-[#1ebe5d] text-slate-950 transition">Cobrar WhatsApp</a>
            <button onclick="openManualAbonoModal('${j.id}')" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white transition">+ Abono Manual</button>
            <button onclick="markJobFullyPaidAndRelease('${j.id}')" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition">Saldar 100% y Liberar</button>
          ` : `
            <span class="text-xs font-bold text-emerald-400 px-2">Cuenta saldada</span>
          `}
        </div>
      </div>
    `;
  }).join('');
}

function openManualAbonoModal(jobId) {
  const j = STORE_STATE.activeJobs.find(x => x.id === jobId);
  if (!j) return;
  const sym = STORE_STATE.config.currencySymbol;
  const debt = Math.max(0, Number(j.totalAmount || 0) - Number(j.paidAmount || 0));
  const body = document.getElementById('item-detail-modal-body');

  body.innerHTML = `
    <div class="flex items-center justify-between border-b border-slate-800 pb-3">
      <div>
        <h3 class="text-base font-extrabold text-white">Registrar Abono Manual · ${escapeHtml(j.code)}</h3>
        <p class="text-xs text-slate-400">${escapeHtml(j.clientName)} · Debe: ${escapeHtml(sym)}${debt.toFixed(2)}</p>
      </div>
      <button onclick="closeItemDetailModal()" class="p-2 rounded-xl bg-slate-800 text-slate-300"><i data-lucide="x" class="w-4 h-4"></i></button>
    </div>
    <form onsubmit="submitManualAbono(event, '${j.id}')" class="space-y-3">
      <div>
        <label class="block text-xs text-slate-300 font-semibold mb-1">Monto recibido (${escapeHtml(sym)}) *</label>
        <input id="manual-abono-amt" type="number" step="0.01" min="0.01" max="${debt.toFixed(2)}" value="${debt.toFixed(2)}" required class="w-full bg-slate-900 text-white text-sm px-3.5 py-2.5 rounded-xl border border-slate-700" />
      </div>
      <div>
        <label class="block text-xs text-slate-300 font-semibold mb-1">Método / Nota</label>
        <input id="manual-abono-note" type="text" placeholder="Ej. Efectivo / Pago Móvil directo" class="w-full bg-slate-900 text-white text-sm px-3.5 py-2.5 rounded-xl border border-slate-700" />
      </div>
      <button type="submit" class="w-full py-3 rounded-xl font-bold text-white bg-astro-gradient">Guardar Abono</button>
    </form>
  `;
  document.getElementById('item-detail-modal').classList.remove('hidden');
  if (window.lucide) window.lucide.createIcons();
}

function submitManualAbono(e, jobId) {
  e.preventDefault();
  const j = STORE_STATE.activeJobs.find(x => x.id === jobId);
  if (!j) return;
  const amt = parseFloat(document.getElementById('manual-abono-amt').value) || 0;
  const note = document.getElementById('manual-abono-note').value.trim() || 'Registro manual Admin';

  STORE_STATE.paymentReports.unshift({
    id: 'pay-' + Date.now(),
    jobId: j.id,
    jobCode: j.code,
    customerName: j.clientName,
    serviceName: j.serviceName,
    planName: 'Manual Admin',
    totalAmount: Number(j.totalAmount || 0),
    amountReported: Number(amt.toFixed(2)),
    accountMethod: note,
    reference: 'Manual',
    receiptDataUrl: '',
    status: 'Confirmado',
    createdAt: new Date().toISOString()
  });
  saveToStorage(STORE_STORAGE_KEYS.PAYMENT_REPORTS, STORE_STATE.paymentReports);

  j.paidAmount = Number((Number(j.paidAmount || 0) + amt).toFixed(2));
  let liberated = false;
  if (j.paidAmount >= Number(j.totalAmount || 0)) {
    j.paidAmount = Number(j.totalAmount || j.paidAmount);
    j.status = 'Completado';
    j.progress = 100;
    if (Array.isArray(j.deliverables) && j.deliverables.length > 0) {
      j.deliverables = j.deliverables.map(d => ({ ...d, allowDownload: true }));
      liberated = true;
    }
  }
  saveToStorage(STORE_STORAGE_KEYS.ACTIVE_JOBS, STORE_STATE.activeJobs);

  closeItemDetailModal();
  renderAdminPaymentReportsList();
  renderAdminJobsList();
  renderAdminReceivablesManager();
  showToast(liberated ? 'Saldo completado y archivos liberados automáticamente' : 'Abono manual registrado');
}

function markJobFullyPaidAndRelease(jobId) {
  const j = STORE_STATE.activeJobs.find(x => x.id === jobId);
  if (!j) return;
  const remaining = Math.max(0, Number(j.totalAmount || 0) - Number(j.paidAmount || 0));
  if (remaining > 0) {
    STORE_STATE.paymentReports.unshift({
      id: 'pay-' + Date.now(),
      jobId: j.id,
      jobCode: j.code,
      customerName: j.clientName,
      serviceName: j.serviceName,
      planName: 'Saldado por Admin',
      totalAmount: Number(j.totalAmount || 0),
      amountReported: Number(remaining.toFixed(2)),
      accountMethod: 'Confirmado por Admin',
      reference: 'Saldado 100%',
      receiptDataUrl: '',
      status: 'Confirmado',
      createdAt: new Date().toISOString()
    });
    saveToStorage(STORE_STORAGE_KEYS.PAYMENT_REPORTS, STORE_STATE.paymentReports);
  }
  j.paidAmount = Number(j.totalAmount || 0);
  j.status = 'Completado';
  j.progress = 100;
  if (Array.isArray(j.deliverables) && j.deliverables.length > 0) {
    j.deliverables = j.deliverables.map(d => ({ ...d, allowDownload: true }));
  }
  saveToStorage(STORE_STORAGE_KEYS.ACTIVE_JOBS, STORE_STATE.activeJobs);
  renderAdminPaymentReportsList();
  renderAdminJobsList();
  renderAdminReceivablesManager();
  showToast('Cuenta saldada al 100% y trabajo liberado');
}

// ============================================================================
// SINCRONIZACIÓN SUPABASE + CONFIGURACIÓN DE NUBE EXTERNA DE IMÁGENES
// ============================================================================

async function syncAllFromSupabase(showFeedback = false) {
  if (!window.storeCloud || !window.storeCloud.isConnected) return false;
  const map = await window.storeCloud.pullAllFromCloud();
  if (!map) return false;

  const applyKey = (storageKey, stateSetter) => {
    if (map[storageKey] !== undefined) {
      _baseSaveToStorage(storageKey, map[storageKey]);
      stateSetter(map[storageKey]);
    }
  };

  applyKey(STORE_STORAGE_KEYS.CONFIG, v => { STORE_STATE.config = { ...DEFAULT_STORE_CONFIG, ...v }; });
  applyKey(STORE_STORAGE_KEYS.CATALOG, v => { if (Array.isArray(v)) STORE_STATE.catalog = v; });
  applyKey(STORE_STORAGE_KEYS.SALES_CATALOGS, v => { if (Array.isArray(v)) STORE_STATE.salesCatalogs = v; });
  applyKey(STORE_STORAGE_KEYS.CATEGORIES, v => { if (Array.isArray(v)) STORE_STATE.categories = v; });
  applyKey(STORE_STORAGE_KEYS.PROJECTS, v => { if (Array.isArray(v)) STORE_STATE.projects = v; });
  applyKey(STORE_STORAGE_KEYS.ACTIVE_JOBS, v => { if (Array.isArray(v)) STORE_STATE.activeJobs = v; });
  applyKey(STORE_STORAGE_KEYS.PAYMENT_REPORTS, v => { if (Array.isArray(v)) STORE_STATE.paymentReports = v; });
  applyKey(STORE_STORAGE_KEYS.PAYMENT_ACCOUNTS, v => { if (Array.isArray(v)) STORE_STATE.paymentAccounts = v; });
  applyKey(STORE_STORAGE_KEYS.PAYMENT_PLANS, v => { if (Array.isArray(v)) STORE_STATE.paymentPlans = v; });
  applyKey(STORE_STORAGE_KEYS.COUPONS, v => { if (Array.isArray(v)) STORE_STATE.coupons = v; });
  applyKey(STORE_STORAGE_KEYS.SPONSORS, v => { if (Array.isArray(v)) STORE_STATE.sponsors = v; });

  if (STORE_STATE.currentView === 'public') {
    switchPublicTab(STORE_STATE.publicTab);
    checkCustomerPaymentStatus(false);
  } else if (STORE_STATE.isAdminAuthenticated) {
    renderAdminView();
  }

  if (showFeedback) showToast('Datos sincronizados con Supabase');
  return true;
}

function renderAdminCloudSettings() {
  const supaCfg = loadSupabaseCfg();
  const imgCfg = loadImageCloudCfg();
  const badge = document.getElementById('supa-status-badge');

  if (document.getElementById('supa-url-input')) document.getElementById('supa-url-input').value = supaCfg.url;
  if (document.getElementById('supa-key-input')) document.getElementById('supa-key-input').value = supaCfg.anonKey;
  if (badge) {
    const ok = window.storeCloud && window.storeCloud.isConnected;
    badge.textContent = ok ? 'Conectado' : 'Modo Local';
    badge.className = ok
      ? 'px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
      : 'px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300';
  }

  if (document.getElementById('cloud-provider-select')) document.getElementById('cloud-provider-select').value = imgCfg.provider;
  if (document.getElementById('cloud-param-1')) document.getElementById('cloud-param-1').value = imgCfg.param1;
  if (document.getElementById('cloud-param-2')) document.getElementById('cloud-param-2').value = imgCfg.param2;
  updateCloudProviderHints();
}

function updateCloudProviderHints() {
  const provider = document.getElementById('cloud-provider-select')?.value || 'local';
  const p1 = document.getElementById('cloud-param-1');
  const p2 = document.getElementById('cloud-param-2');
  if (!p1 || !p2) return;

  if (provider === 'cloudinary') {
    p1.classList.remove('hidden');
    p2.classList.remove('hidden');
    p1.placeholder = 'Cloud Name (Cloudinary)';
    p2.placeholder = 'Upload Preset sin firma (Cloudinary)';
  } else if (provider === 'imgbb') {
    p1.classList.remove('hidden');
    p2.classList.add('hidden');
    p1.placeholder = 'API Key gratuita de ImgBB';
  } else if (provider === 'supabase') {
    p1.classList.remove('hidden');
    p2.classList.add('hidden');
    p1.placeholder = 'Nombre del Bucket público (ej. tienda-fotos)';
  } else {
    p1.classList.add('hidden');
    p2.classList.add('hidden');
  }
}

async function handleSaveSupabaseCfg(e) {
  e.preventDefault();
  const url = document.getElementById('supa-url-input').value.trim();
  const anonKey = document.getElementById('supa-key-input').value.trim();
  _baseSaveToStorage(STORE_STORAGE_KEYS.SUPABASE_CFG, { url, anonKey });
  const ok = window.storeCloud.initClient();
  renderAdminCloudSettings();
  if (ok) {
    await syncAllFromSupabase(true);
  } else {
    showToast('Guardado en modo local (verifica URL y Key)', 'error');
  }
}

async function pushAllLocalToSupabase() {
  if (!window.storeCloud || !window.storeCloud.isConnected) {
    showToast('Primero conecta tu URL y Key de Supabase', 'error');
    return;
  }
  const pairs = [
    [STORE_STORAGE_KEYS.CONFIG, STORE_STATE.config],
    [STORE_STORAGE_KEYS.CATALOG, STORE_STATE.catalog],
    [STORE_STORAGE_KEYS.SALES_CATALOGS, STORE_STATE.salesCatalogs],
    [STORE_STORAGE_KEYS.CATEGORIES, STORE_STATE.categories],
    [STORE_STORAGE_KEYS.PROJECTS, STORE_STATE.projects],
    [STORE_STORAGE_KEYS.ACTIVE_JOBS, STORE_STATE.activeJobs],
    [STORE_STORAGE_KEYS.PAYMENT_REPORTS, STORE_STATE.paymentReports],
    [STORE_STORAGE_KEYS.PAYMENT_ACCOUNTS, STORE_STATE.paymentAccounts],
    [STORE_STORAGE_KEYS.PAYMENT_PLANS, STORE_STATE.paymentPlans],
    [STORE_STORAGE_KEYS.COUPONS, STORE_STATE.coupons],
    [STORE_STORAGE_KEYS.SPONSORS, STORE_STATE.sponsors]
  ];
  for (const [k, v] of pairs) {
    await window.storeCloud.pushCollection(k, v);
  }
  showToast('Todos los datos locales fueron subidos a Supabase');
}

function handleSaveImageCloudCfg(e) {
  e.preventDefault();
  const provider = document.getElementById('cloud-provider-select').value;
  const param1 = document.getElementById('cloud-param-1').value.trim();
  const param2 = document.getElementById('cloud-param-2').value.trim();
  _baseSaveToStorage(STORE_STORAGE_KEYS.IMAGE_CLOUD_CFG, { provider, param1, param2 });
  showToast(`Nube de fotografías configurada: ${provider}`);
}

document.addEventListener('DOMContentLoaded', initStore);
