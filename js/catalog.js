// ============================================================================
// CONFIGURACIÓN, CATÁLOGO (CON PLANES DE PAGO POR ÍTEM) Y PASARELA DE PAGOS
// ============================================================================

const STORE_STORAGE_KEYS = {
  CONFIG: 'astro_store_config_prod_v1',
  CATALOG: 'astro_store_catalog_prod_v1',
  SALES_CATALOGS: 'astro_store_sales_catalogs_prod_v1',
  CATEGORIES: 'astro_store_categories_prod_v1',
  PROJECTS: 'astro_store_projects_prod_v1',
  ACTIVE_JOBS: 'astro_store_active_jobs_prod_v1',
  PAYMENT_REPORTS: 'astro_store_payment_reports_prod_v1',
  LAST_CUSTOMER_PAYMENT: 'astro_store_last_customer_payment_prod_v1',
  COUPONS: 'astro_store_coupons_prod_v1',
  SPONSORS: 'astro_store_sponsors_prod_v1',
  SUPABASE_CFG: 'astro_store_supabase_cfg_prod_v1',
  IMAGE_CLOUD_CFG: 'astro_store_image_cloud_cfg_prod_v1',
  PAYMENT_ACCOUNTS: 'astro_store_pay_accounts_prod_v1',
  PAYMENT_PLANS: 'astro_store_pay_plans_prod_v1',
  CART: 'astro_store_cart_prod_v1',
  ADMIN_AUTH: 'astro_store_admin_auth_prod_v1',
  ADMIN_PASS: 'astro_store_admin_pass_prod_v1',
  BCV_RATES_CACHE: 'astro_store_bcv_rates_prod_v1'
};

// Proyectos / Trabajos Realizados (Portafolio) — vacío hasta que el Admin agregue reales
const DEFAULT_PROJECTS = [];

// Trabajos y Servicios Activos — vacío hasta que el Admin o clientes registren reales
const DEFAULT_ACTIVE_JOBS = [];

// Catálogos de Ventas configurables desde el Panel Admin
const DEFAULT_SALES_CATALOGS = [];

// Categorías de Productos y Servicios configurables desde el Panel Admin
const DEFAULT_CATEGORIES = [];

const DEFAULT_STORE_CONFIG = {
  brandName: 'Creative Store',
  tagline: 'Tienda Digital & Servicios Creativos',
  heroGreeting: 'Bienvenido a',
  heroHighlight: 'Creative Store',
  heroSubtitle: 'Explora productos, servicios y recursos creativos, canjea tus códigos especiales o coordina tu proyecto directo por WhatsApp.',
  whatsappNumber: '584147966697',
  adminEmail: '',
  currencySymbol: '$',
  welcomeMessage: '¡Hola! Vengo desde Creative Store y me gustaría más información.'
};

// Cuentas / Destinos de Pago — vacío hasta que el Admin agregue sus cuentas reales
const DEFAULT_PAYMENT_ACCOUNTS = [];

// Modalidades / Tipos de Pago controlados desde el Panel Admin
const DEFAULT_PAYMENT_PLANS = [
  {
    id: 'plan-contado',
    mode: 'contado', // 'contado' | 'partes' | 'abonos'
    name: 'Pago al Contado (100%)',
    initialPercent: 100,
    deadlineDays: 0,
    description: 'Se paga el 100% del monto total en una sola exhibición para iniciar o entregar de inmediato.',
    active: true
  },
  {
    id: 'plan-partes',
    mode: 'partes',
    name: 'Pago en 2 Partes (50% / 50%)',
    initialPercent: 50,
    deadlineDays: 0,
    description: 'Pagas un porcentaje inicial para comenzar el trabajo y el resto al finalizar y entregar.',
    active: true
  },
  {
    id: 'plan-abonos',
    mode: 'abonos',
    name: 'Acreditando Fondos (Abonos)',
    initialPercent: 25,
    deadlineDays: 15,
    description: 'Puedes ir abonando dentro del plazo establecido. Si no se completa en ese tiempo, el trabajo/servicio se cancela.',
    active: true
  }
];

// Catálogo inicial vacío (solo datos reales subidos por el Admin)
const DEFAULT_CATALOG_ITEMS = [];

function loadFromStorage(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return Array.isArray(fallback) ? fallback.map(i => ({ ...i })) : { ...fallback };
}

function saveToStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadStoreConfig() {
  const merged = { ...DEFAULT_STORE_CONFIG, ...loadFromStorage(STORE_STORAGE_KEYS.CONFIG, DEFAULT_STORE_CONFIG) };
  if (merged.brandName === 'Astro Store') merged.brandName = 'Creative Store';
  if (merged.heroHighlight === 'Astro Store') merged.heroHighlight = 'Creative Store';
  if (typeof merged.welcomeMessage === 'string' && merged.welcomeMessage.includes('Astro Store')) {
    merged.welcomeMessage = merged.welcomeMessage.replace(/Astro Store/g, 'Creative Store');
  }
  return merged;
}

function loadCatalogItems() {
  const data = loadFromStorage(STORE_STORAGE_KEYS.CATALOG, DEFAULT_CATALOG_ITEMS);
  if (!Array.isArray(data)) return [];
  return data.map(item => {
    const rawPrice = item.price;
    const isMissingPrice = rawPrice === null || rawPrice === undefined || rawPrice === '';
    const priceOnRequest = Boolean(item.priceOnRequest || isMissingPrice);
    const parsedPrice = priceOnRequest ? null : (Number.isFinite(Number(rawPrice)) ? Number(rawPrice) : null);
    return {
      ...item,
      price: parsedPrice,
      priceOnRequest: priceOnRequest || parsedPrice === null,
      purchaseMode: item.purchaseMode || 'unidad',
      purchaseDetail: item.purchaseDetail || '',
      salesCatalogId: item.salesCatalogId || '',
      defaultAccountId: item.defaultAccountId || '',
      allowedAccountIds: Array.isArray(item.allowedAccountIds) ? item.allowedAccountIds : [],
      allowedPlanIds: Array.isArray(item.allowedPlanIds) && item.allowedPlanIds.length
        ? item.allowedPlanIds
        : (priceOnRequest ? [] : ['plan-contado'])
    };
  });
}

function loadSalesCatalogs() {
  const data = loadFromStorage(STORE_STORAGE_KEYS.SALES_CATALOGS, DEFAULT_SALES_CATALOGS);
  return Array.isArray(data) ? data : [];
}

function loadCategories() {
  const data = loadFromStorage(STORE_STORAGE_KEYS.CATEGORIES, DEFAULT_CATEGORIES);
  return Array.isArray(data) ? data : [];
}

function loadProjects() {
  const data = loadFromStorage(STORE_STORAGE_KEYS.PROJECTS, DEFAULT_PROJECTS);
  return Array.isArray(data) ? data : [];
}

function loadActiveJobs() {
  const data = loadFromStorage(STORE_STORAGE_KEYS.ACTIVE_JOBS, DEFAULT_ACTIVE_JOBS);
  return Array.isArray(data) ? data : [];
}

function loadPaymentReports() {
  const data = loadFromStorage(STORE_STORAGE_KEYS.PAYMENT_REPORTS, []);
  return Array.isArray(data) ? data : [];
}

const DEFAULT_COUPONS = [];

const DEFAULT_SPONSORS = [];

function loadCoupons() {
  const data = loadFromStorage(STORE_STORAGE_KEYS.COUPONS, DEFAULT_COUPONS);
  if (!Array.isArray(data)) return [];
  return data.map(c => ({
    ...c,
    kind: c.kind || 'descuento',
    maxUses: c.maxUses !== undefined && c.maxUses !== null ? (c.maxUses === '' ? null : Number(c.maxUses)) : (c.singleUse ? 1 : null),
    usedCount: Number(c.usedCount || 0),
    durationDays: c.durationDays ? Number(c.durationDays) : 0,
    redemptions: Array.isArray(c.redemptions) ? c.redemptions : []
  }));
}

function loadSponsors() {
  const data = loadFromStorage(STORE_STORAGE_KEYS.SPONSORS, DEFAULT_SPONSORS);
  if (!Array.isArray(data)) return [];
  return data.map(s => {
    const rawPrice = s.price;
    const hasPrice = rawPrice !== null && rawPrice !== undefined && rawPrice !== '' && Number.isFinite(Number(rawPrice));
    return {
      ...s,
      classification: s.classification || 'socio',
      price: s.priceOnRequest ? null : (hasPrice ? Number(rawPrice) : null),
      priceOnRequest: Boolean(s.priceOnRequest || !hasPrice),
      purchaseMode: s.purchaseMode || 'mencion',
      purchaseDetail: s.purchaseDetail || '',
      whatsapp: s.whatsapp || '',
      imageUrl: s.imageUrl || '',
      allowQuote: s.allowQuote !== false
    };
  });
}

// ============================================================================
// CAPA HÍBRIDA SUPABASE + NUBE EXTERNA DE IMÁGENES (CLOUDINARY / IMGBB / STORAGE)
// ============================================================================

const DEFAULT_SUPABASE_CFG = {
  url: 'https://hbuthwbjhiyxprnnwutb.supabase.co',
  anonKey: 'sb_publishable_2m6DrtifjgnhcMzKPl1Vxw_D7SkNgo_'
};

const DEFAULT_IMAGE_CLOUD_CFG = {
  provider: 'local', // 'local' | 'cloudinary' | 'imgbb' | 'supabase'
  param1: '',        // Cloud Name / ImgBB API Key / Bucket Name
  param2: ''         // Upload Preset (Cloudinary)
};

function loadSupabaseCfg() {
  const saved = loadFromStorage(STORE_STORAGE_KEYS.SUPABASE_CFG, DEFAULT_SUPABASE_CFG);
  return {
    url: (saved && saved.url) ? saved.url : DEFAULT_SUPABASE_CFG.url,
    anonKey: (saved && saved.anonKey) ? saved.anonKey : DEFAULT_SUPABASE_CFG.anonKey
  };
}

function loadImageCloudCfg() {
  return { ...DEFAULT_IMAGE_CLOUD_CFG, ...loadFromStorage(STORE_STORAGE_KEYS.IMAGE_CLOUD_CFG, DEFAULT_IMAGE_CLOUD_CFG) };
}

class StoreCloudService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.initClient();
  }

  initClient() {
    const cfg = loadSupabaseCfg();
    if (cfg.url && cfg.anonKey && window.supabase && typeof window.supabase.createClient === 'function') {
      try {
        this.client = window.supabase.createClient(cfg.url.trim(), cfg.anonKey.trim());
        this.isConnected = true;
        return true;
      } catch (e) {}
    }
    this.client = null;
    this.isConnected = false;
    return false;
  }

  async pullAllFromCloud() {
    if (!this.client) return null;
    try {
      const { data, error } = await this.client.from('store_collections').select('key, data');
      if (error || !Array.isArray(data)) return null;
      const map = {};
      data.forEach(row => { map[row.key] = row.data; });
      return map;
    } catch (e) {
      return null;
    }
  }

  async pushCollection(key, value) {
    if (!this.client) return false;
    try {
      const { error } = await this.client
        .from('store_collections')
        .upsert({ key, data: value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      return !error;
    } catch (e) {
      return false;
    }
  }

  async uploadImageToConfiguredCloud(file, fallbackDataUrl) {
    const cfg = loadImageCloudCfg();
    if (!file || cfg.provider === 'local') return fallbackDataUrl;

    try {
      if (cfg.provider === 'cloudinary' && cfg.param1 && cfg.param2) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('upload_preset', cfg.param2.trim());
        const res = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cfg.param1.trim())}/image/upload`, {
          method: 'POST',
          body: fd
        });
        if (res.ok) {
          const json = await res.json();
          if (json.secure_url) return json.secure_url;
        }
      } else if (cfg.provider === 'imgbb' && cfg.param1) {
        const fd = new FormData();
        fd.append('image', fallbackDataUrl.split(',')[1] || '');
        const res = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(cfg.param1.trim())}`, {
          method: 'POST',
          body: fd
        });
        if (res.ok) {
          const json = await res.json();
          if (json?.data?.url) return json.data.url;
        }
      } else if (cfg.provider === 'supabase' && this.client && cfg.param1) {
        const bucket = cfg.param1.trim();
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const filePath = `uploads/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const { error } = await this.client.storage.from(bucket).upload(filePath, file, { upsert: true });
        if (!error) {
          const { data: pub } = this.client.storage.from(bucket).getPublicUrl(filePath);
          if (pub?.publicUrl) return pub.publicUrl;
        }
      }
    } catch (e) {}

    return fallbackDataUrl;
  }
}

window.storeCloud = new StoreCloudService();

// Override de saveToStorage para sincronizar automáticamente con Supabase si está conectado
const _baseSaveToStorage = saveToStorage;
saveToStorage = function (key, value) {
  _baseSaveToStorage(key, value);
  const syncable = [
    STORE_STORAGE_KEYS.CONFIG,
    STORE_STORAGE_KEYS.CATALOG,
    STORE_STORAGE_KEYS.SALES_CATALOGS,
    STORE_STORAGE_KEYS.CATEGORIES,
    STORE_STORAGE_KEYS.PROJECTS,
    STORE_STORAGE_KEYS.ACTIVE_JOBS,
    STORE_STORAGE_KEYS.PAYMENT_REPORTS,
    STORE_STORAGE_KEYS.PAYMENT_ACCOUNTS,
    STORE_STORAGE_KEYS.PAYMENT_PLANS,
    STORE_STORAGE_KEYS.COUPONS,
    STORE_STORAGE_KEYS.SPONSORS
  ];
  if (syncable.includes(key) && window.storeCloud && window.storeCloud.isConnected) {
    window.storeCloud.pushCollection(key, value);
  }
};

function loadPaymentAccounts() {
  const data = loadFromStorage(STORE_STORAGE_KEYS.PAYMENT_ACCOUNTS, DEFAULT_PAYMENT_ACCOUNTS);
  const list = Array.isArray(data) ? data : DEFAULT_PAYMENT_ACCOUNTS.map(i => ({ ...i }));
  return list.map(a => {
    const vis = a.visibility || (a.active === false ? 'oculta' : 'general');
    return {
      ...a,
      alias: a.alias || '',
      visibility: vis,
      active: vis !== 'oculta'
    };
  });
}

function loadPaymentPlans() {
  const data = loadFromStorage(STORE_STORAGE_KEYS.PAYMENT_PLANS, DEFAULT_PAYMENT_PLANS);
  return Array.isArray(data) ? data : DEFAULT_PAYMENT_PLANS.map(i => ({ ...i }));
}

function normalizeWhatsAppPhone(rawPhone) {
  let digits = String(rawPhone || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = '58' + digits.slice(1);
  }
  return digits || '584147966697';
}

function buildWhatsAppUrl(message, configOverride = null) {
  const cfg = configOverride || loadStoreConfig();
  const cleanPhone = normalizeWhatsAppPhone(cfg.whatsappNumber);
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

// ============================================================================
// SERVICIO GRATUITO DE TASAS OFICIALES DEL BANCO CENTRAL DE VENEZUELA (BCV)
// ============================================================================

function loadCachedBcvRates() {
  try {
    const raw = localStorage.getItem(STORE_STORAGE_KEYS.BCV_RATES_CACHE);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {
    usd: 46.85,
    eur: 50.60,
    updatedAt: null,
    isLive: false,
    source: 'Caché local'
  };
}

async function fetchLiveBcvRates() {
  let usd = 0;
  let eur = 0;
  let apiTimestamp = null;

  // 1. Dólar Oficial BCV (API gratuita ve.dolarapi.com)
  try {
    const resUsd = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', { cache: 'no-store' });
    if (resUsd.ok) {
      const json = await resUsd.json();
      usd = Number(json.promedio || json.venta || json.compra || 0);
      if (json.fechaActualizacion) apiTimestamp = json.fechaActualizacion;
    }
  } catch (e) {}

  // 2. Euro Oficial BCV (API gratuita ve.dolarapi.com)
  try {
    const resEur = await fetch('https://ve.dolarapi.com/v1/euros/oficial', { cache: 'no-store' });
    if (resEur.ok) {
      const json = await resEur.json();
      eur = Number(json.promedio || json.venta || json.compra || 0);
    }
  } catch (e) {}

  // Respaldo gratuito para Euro si el endpoint de euros no responde
  if (eur <= 0 && usd > 0) {
    try {
      const resEr = await fetch('https://open.er-api.com/v6/latest/USD');
      if (resEr.ok) {
        const erJson = await resEr.json();
        const eurPerUsd = Number(erJson?.rates?.EUR || 0);
        if (eurPerUsd > 0) eur = usd / eurPerUsd;
      }
    } catch (e) {}
    if (eur <= 0) eur = usd * 1.08;
  }

  const cached = loadCachedBcvRates();
  const finalUsd = usd > 0 ? usd : cached.usd;
  const finalEur = eur > 0 ? eur : (usd > 0 ? usd * 1.08 : cached.eur);

  const result = {
    usd: Number(finalUsd.toFixed(2)),
    eur: Number(finalEur.toFixed(2)),
    updatedAt: apiTimestamp || new Date().toISOString(),
    isLive: usd > 0,
    source: usd > 0 ? 'BCV Oficial (ve.dolarapi.com)' : 'Caché Offline'
  };

  try {
    localStorage.setItem(STORE_STORAGE_KEYS.BCV_RATES_CACHE, JSON.stringify(result));
  } catch (e) {}

  return result;
}

function formatBs(amountUsd, usdRate) {
  const bs = (Number(amountUsd) || 0) * (Number(usdRate) || 0);
  return 'Bs. ' + bs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
