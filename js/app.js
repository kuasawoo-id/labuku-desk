/**
 * ============================================================
 * LABUKU Desk — Frontend JavaScript (SPA)
 * ============================================================
 * Prinsip (gas-instant-ux):
 * 1. Navigasi SPA murni — tidak ada google.script.run untuk pindah halaman.
 * 2. State penting disimpan di window.AppState (cache client).
 * 3. Setiap google.script.run pakai withSuccessHandler + withFailureHandler.
 * 4. Tidak ada window.location / window.open (aman untuk iframe — gas-spa-iframe).
 * ============================================================
 */

window.AppState = {
  user: null,
  config: {},
  katalog: [],
  currentSection: 'dashboard',
  dashboardPeriode: 'Harian'
};

/** 8 kategori layanan resmi KUA — sumber tunggal untuk dropdown & ikon. */
const KATEGORI_LAYANAN_RESMI = [
  'Layanan Perkawinan dan Pencatatan Nikah',
  'Layanan Bimbingan dan Konseling Keluarga',
  'Layanan Kemasjidan',
  'Layanan Konsultasi dan Bimbingan Keagamaan',
  'Layanan Zakat dan Wakaf',
  'Layanan Data dan Kelembagaan Keagamaan',
  'Layanan Administrasi dan Tata Kelola KUA',
  'Layanan Jaminan Produk Halal',
  'Layanan Lain-lain'
];

// ════════════════════════════════════════════════════════
// BAGIAN 1: INISIALISASI
// ════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('labuku_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  mulaiAplikasi();
});

const APP_CACHE_KEY = 'labuku_boot_v3';
const TOKEN_KEY = 'labuku_token';
const WHO_KEY = 'labuku_who';
const WA_BASE = 'https:' + String.fromCharCode(47, 47) + 'wa.me/';
const NL = String.fromCharCode(10);
const CR_RE = new RegExp(String.fromCharCode(13), 'g');

/*
 * Penyimpanan lokal dengan cadangan memori: bila localStorage diblokir
 * (mis. browser di dalam aplikasi WhatsApp), aplikasi tetap jalan selama tab terbuka.
 */
const memStore = {};
function lsGet(k) {
  try { const v = localStorage.getItem(k); return v === null ? (memStore[k] || null) : v; } catch (e) { return memStore[k] || null; }
}
function lsSet(k, v) { memStore[k] = v; try { localStorage.setItem(k, v); } catch (e) {} }
function lsDel(k) { delete memStore[k]; try { localStorage.removeItem(k); } catch (e) {} }

/*
 * v6 (GitHub Pages): data awal (status aktivasi & identitas KUA) tidak lagi disuntik oleh doGet,
 * melainkan diambil sekali lewat getIndexBoot. Bila sudah pernah masuk (ada token) dan data awal
 * tersimpan, aplikasi langsung tampil seketika; data awal diperbarui diam-diam di latar belakang.
 */
const INDEX_BOOT_KEY = 'labuku_indexboot_v1';
let INDEX_BOOT = null;
function readBootstrapData() { return INDEX_BOOT; }

function mulaiAplikasi() {
  if (!window.LABUKU_GAS_SIAP || !window.LABUKU_GAS_SIAP()) {
    tampilGagalMuat('GAS_URL belum diisi di js/config.js. Isi dengan URL Web App Apps Script (berakhiran /exec), lalu push ulang.');
    return;
  }
  let simpan = null;
  try { simpan = JSON.parse(lsGet(INDEX_BOOT_KEY) || 'null'); } catch (e) { simpan = null; }
  if (simpan && simpan.ok && lsGet(TOKEN_KEY)) {
    INDEX_BOOT = simpan;
    initApp();
    google.script.run
      .withSuccessHandler(function (res) { if (res && res.ok) lsSet(INDEX_BOOT_KEY, JSON.stringify(res)); })
      .withFailureHandler(function () {})
      .getIndexBoot();
    return;
  }
  google.script.run
    .withSuccessHandler(function (res) {
      INDEX_BOOT = res || null;
      if (res && res.ok) lsSet(INDEX_BOOT_KEY, JSON.stringify(res));
      initApp();
    })
    .withFailureHandler(function (err) { tampilGagalMuat('Aplikasi gagal dimuat: ' + (err && err.message ? err.message : err)); })
    .getIndexBoot();
}

function tampilGagalMuat(pesan) {
  const box = document.querySelector('#loadingOverlay p');
  if (box) {
    box.textContent = pesan;
    box.style.maxWidth = '560px'; box.style.textAlign = 'center'; box.style.color = '#991B1B';
  }
  const spinner = document.querySelector('#loadingOverlay .spinner-border');
  if (spinner) spinner.style.display = 'none';
}

/* v6: link form antrean publik = antrean.html di folder yang sama (GitHub Pages). */
function urlFormPublik() {
  try { return new URL('antrean.html', location.href).href; } catch (e) { return ''; }
}

function clearAppStateCache() { lsDel(APP_CACHE_KEY); }

/*
 * Pemanggil server untuk semua fungsi data. Antarmukanya sama dengan
 * google.script.run, tetapi setiap panggilan otomatis membawa token sesi dan
 * nama "Masuk sebagai" (dicatat di ActivityLog). Respons code AUTH = sesi habis.
 */
function gsr(okH, failH) {
  return new Proxy({}, {
    get: function (_, name) {
      if (name === 'withSuccessHandler') return function (h) { return gsr(h, failH); };
      if (name === 'withFailureHandler') return function (h) { return gsr(okH, h); };
      return function () {
        const args = Array.prototype.slice.call(arguments);
        if (!window.AppState.token) { handleAuthExpired('Silakan masuk terlebih dahulu.'); return; }
        google.script.run
          .withSuccessHandler(function (res) {
            if (res && res.code === 'AUTH') { handleAuthExpired(res.message); return; }
            if (okH) okH(res);
          })
          .withFailureHandler(function (err) { if (failH) failH(err); else console.warn(err); })
          .api({ token: window.AppState.token, who: window.AppState.who || '' }, name, args);
      };
    }
  });
}

/*
 * Alur buka aplikasi (pola Akad Tracker):
 * - Belum ada token → layar Masuk (atau Aktivasi bila password belum dibuat).
 * - Ada token + cache lokal → tampil SEKETIKA dari cache, lalu data segar
 *   diambil di latar belakang dengan SATU panggilan getBootstrap.
 */
function initApp() {
  const boot = readBootstrapData() || {};
  window.AppState.indexBoot = boot;
  document.getElementById('authInstansi').textContent = boot.instansi || boot.appName || 'KUA';
  window.AppState.token = lsGet(TOKEN_KEY);
  window.AppState.who = lsGet(WHO_KEY);

  if (boot.ok === false) {
    hideLoadingOverlay();
    showAuth(boot.activated ? 'login' : 'activate', 'Aplikasi belum siap: ' + (boot.message || 'jalankan setupAppEnvironment().'));
    return;
  }
  if (!window.AppState.token) {
    hideLoadingOverlay();
    showAuth(boot.activated === false ? 'activate' : 'login');
    return;
  }
  const cached = loadAppStateCache();
  if (cached) {
    applyBootData(cached);
    enterApp();
    hideLoadingOverlay();
  }
  fetchBootstrap(!cached);
}

function loadAppStateCache() {
  try {
    const raw = lsGet(APP_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.data ? parsed.data : null;
  } catch (e) { return null; }
}

function saveAppStateCache() {
  try {
    const b = window.AppState.boot || {};
    b.config = window.AppState.config; b.users = window.AppState.users; b.katalog = window.AppState.katalog;
    b.fo = window.AppState.fo; b.bo = window.AppState.bo; b.wilayahHome = window.AppState.wilayahHome;
    b.katalogLengkap = window.AppState.katalogLengkap || null;
    window.AppState.boot = b;
    lsSet(APP_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data: b }));
  } catch (e) { /* penyimpanan penuh/nonaktif — tidak kritikal */ }
}

function applyBootData(data) {
  window.AppState.boot = data;
  window.AppState.config = data.config || {};
  window.AppState.users = data.users || [];
  window.AppState.katalog = data.katalog || [];
  /* Data bootstrap = antrean HARI INI & Back Office default; jangan timpa bila filter lain sedang dipakai. */
  if (foFilter.periode === 'today' || !window.AppState.fo) window.AppState.fo = (data.fo || []).filter(r => !r._temp);
  if (boRangeLoaded === 'default' || !window.AppState.bo) window.AppState.bo = data.bo || [];
  window.AppState.publicFormUrl = urlFormPublik();
  window.AppState.wilayahHome = data.wilayahHome || window.AppState.wilayahHome || null;
  if (data.katalogLengkap && !window.AppState.katalogLengkap) window.AppState.katalogLengkap = data.katalogLengkap;
  setSidebarInstansi();
  if (data.dashboard) {
    window.AppState.prefetchedDashboard = { periode: 'Harian', res: { success: true, data: data.dashboard, message: 'OK' } };
  }
}

function fetchBootstrap(blocking, done) {
  gsr(function (res) {
    if (done) done(res);
    if (!res || !res.success) {
      if (blocking) { hideLoadingOverlay(); showAuth('login', (res && res.message) || 'Gagal memuat data.'); }
      return;
    }
    const firstEntry = !window.AppState.user;
    if (pendingStale()) { res.data.fo = window.AppState.fo; res.data.bo = window.AppState.bo; }
    applyBootData(res.data);
    window.AppState.dataAt = Date.now();
    if (foFilter.periode === 'today') window.AppState.foAt = Date.now();
    if (boRangeLoaded === 'default') window.AppState.boAt = Date.now();
    saveAppStateCache();
    if (firstEntry) { enterApp(); hideLoadingOverlay(); return; }
    if (namaMasukHilang()) return;
    applyUserToUI();
    rerenderCurrentSection();
  }, function (err) {
    if (done) done(null);
    if (blocking) { hideLoadingOverlay(); showAuth('login', 'Tidak dapat terhubung ke server: ' + (err.message || err)); }
  }).getBootstrap();
}

/* Setelah data segar tiba: perbarui tampilan yang sedang dibuka tanpa memindah halaman. */
function rerenderCurrentSection() {
  const s = window.AppState.currentSection;
  if (s === 'frontoffice') renderFrontOffice();
  else if (s === 'backoffice') renderBackOffice();
  else if (s === 'dashboard') loadDashboard();
}

/* v4: nama instansi tampil di sidebar (mengikuti Pengaturan → Umum). */
function setSidebarInstansi() {
  const el = document.getElementById('sidebarInstansi');
  if (el) el.textContent = (window.AppState.config && window.AppState.config.instansi) || '';
}

/**
 * Bug fix v5.1: bila nama "Masuk sebagai" sudah tidak ada / nonaktif di daftar tim (mis. diganti
 * namanya), server menganggap peran kosong dan menolak aksi admin. Minta pilih nama lagi.
 */
function namaMasukHilang() {
  const users = window.AppState.users || [];
  if (!window.AppState.who || !users.length || users.some(u => u.Nama === window.AppState.who)) return false;
  const lama = window.AppState.who;
  window.AppState.user = null;
  showAuth('who', 'Nama "' + lama + '" tidak ada lagi di daftar tim aktif. Pilih nama Anda.');
  return true;
}

function enterApp() {
  const names = (window.AppState.users || []).map(u => u.Nama);
  if (!window.AppState.who || (names.length && names.indexOf(window.AppState.who) === -1)) {
    window.AppState.user = null;
    showAuth('who');
    return;
  }
  window.AppState.user = { nama: window.AppState.who, role: 'Admin' };
  document.getElementById('authScreen').style.display = 'none';
  applyUserToUI();
  showMainApp();
  navigateTo(window.AppState.currentSection && window.AppState.currentSection !== 'workspace' ? window.AppState.currentSection : 'dashboard');
  startAutoRefresh();
}

function showAuth(mode, msg) {
  document.getElementById('sidebar').style.display = 'none';
  document.getElementById('mainContent').style.display = 'none';
  document.getElementById('authScreen').style.display = 'flex';
  document.getElementById('authActivate').style.display = mode === 'activate' ? 'block' : 'none';
  document.getElementById('authLogin').style.display = mode === 'login' ? 'block' : 'none';
  document.getElementById('authWho').style.display = mode === 'who' ? 'block' : 'none';
  document.getElementById('authMsg').textContent = msg || '';
  if (mode === 'who') renderWhoList();
  if (mode === 'login') setTimeout(() => { const i = document.getElementById('loginPw'); if (i) i.focus(); }, 50);
}

function showLoadingOverlay(text) {
  const overlay = document.getElementById('loadingOverlay');
  overlay.querySelector('p').textContent = text || 'Memuat LABUKU Desk...';
  overlay.style.display = 'flex';
  overlay.style.opacity = '1';
}

function onTokenIssued(token) {
  window.AppState.token = token;
  lsSet(TOKEN_KEY, token);
  document.getElementById('authScreen').style.display = 'none';
  showLoadingOverlay('Menyiapkan data...');
  fetchBootstrap(true);
}

function submitActivation() {
  const code = document.getElementById('actCode').value.trim();
  const pw = document.getElementById('actPw').value;
  const pw2 = document.getElementById('actPw2').value;
  const msg = document.getElementById('authMsg');
  if (!code || pw.length < 6) { msg.textContent = 'Isi kode aktivasi dan password minimal 6 karakter.'; return; }
  if (pw !== pw2) { msg.textContent = 'Ulangan password tidak sama.'; return; }
  const btn = document.getElementById('actBtn');
  btn.disabled = true; msg.textContent = '';
  google.script.run
    .withSuccessHandler(res => {
      btn.disabled = false;
      if (res && res.success) onTokenIssued(res.data.token);
      else msg.textContent = (res && res.message) || 'Aktivasi gagal.';
    })
    .withFailureHandler(err => { btn.disabled = false; msg.textContent = 'Koneksi gagal: ' + (err.message || err); })
    .activateApp(code, pw);
}

function submitLogin() {
  const pw = document.getElementById('loginPw').value;
  const msg = document.getElementById('authMsg');
  if (!pw) { msg.textContent = 'Masukkan password tim.'; return; }
  const btn = document.getElementById('loginBtn');
  btn.disabled = true; btn.textContent = 'Memeriksa...'; msg.textContent = '';
  google.script.run
    .withSuccessHandler(res => {
      btn.disabled = false; btn.textContent = 'Masuk';
      if (res && res.success) { document.getElementById('loginPw').value = ''; onTokenIssued(res.data.token); }
      else if (res && res.code === 'NOT_ACTIVATED') showAuth('activate', res.message);
      else msg.textContent = (res && res.message) || 'Gagal masuk.';
    })
    .withFailureHandler(err => { btn.disabled = false; btn.textContent = 'Masuk'; msg.textContent = 'Koneksi gagal: ' + (err.message || err); })
    .loginApp(pw);
}

function renderWhoList() {
  const box = document.getElementById('whoList');
  const users = window.AppState.users || [];
  if (users.length === 0) { box.innerHTML = '<p class="small text-secondary mb-0">Belum ada nama tim aktif. Tambahkan di sheet Users.</p>'; return; }
  box.innerHTML = users.map((u, i) => `<button type="button" class="who-item" onclick="pilihNama(${i})">${escapeHtml(u.Nama)}<small>${escapeHtml(roleLabel(u.Role))}</small></button>`).join('');
}

function roleLabel(role) {
  if (role === 'Admin') return 'Kepala KUA';
  return role ? (role === 'User' ? 'ASN (peran belum diatur)' : role) : 'Tim KUA';
}
/* v5: Kepala KUA = admin. Bila belum ada Kepala KUA aktif, semua boleh mengatur (agar tidak terkunci). */
const ROLE_LIST = ['Kepala KUA', 'Penyuluh', 'Penghulu', 'Pelaksana'];
function isAdminRole(role) { return role === 'Kepala KUA' || role === 'Admin'; }
function isAdmin() {
  const users = window.AppState.users || [];
  if (!users.some(u => isAdminRole(u.Role))) return true;
  const me = users.find(u => u.Nama === window.AppState.who);
  return !!(me && isAdminRole(me.Role));
}

function pilihNama(idx) {
  const u = (window.AppState.users || [])[idx];
  if (!u) return;
  window.AppState.who = u.Nama;
  lsSet(WHO_KEY, u.Nama);
  enterApp();
}

function gantiNamaMasuk() {
  closeSidebar();
  window.AppState.user = null;
  showAuth('who');
}

function logout() {
  const token = window.AppState.token;
  if (token) google.script.run.withFailureHandler(function () {}).logoutApp(token);
  clearSession();
  showAuth('login', 'Anda telah keluar.');
}

function clearSession() {
  stopAutoRefresh();
  lsDel(TOKEN_KEY); lsDel(WHO_KEY); clearAppStateCache();
  window.AppState.token = null; window.AppState.who = null; window.AppState.user = null;
  window.AppState.fo = []; window.AppState.bo = []; window.AppState.boot = null;
}

function handleAuthExpired(message) {
  clearSession();
  hideLoadingOverlay();
  showAuth('login', message || 'Sesi berakhir. Silakan masuk kembali.');
}

/*
 * Auto-refresh (pola Akad Tracker): Front Office tiap 30 detik agar pendaftar
 * dari form publik langsung muncul; Back Office tiap 60 detik. Ditunda bila ada
 * aksi yang belum tersinkron, modal terbuka, atau tab tidak sedang dilihat.
 */
let autoRefreshTimer = null;
let autoRefreshTick = 0;
function startAutoRefresh() {
  if (autoRefreshTimer) return;
  autoRefreshTimer = setInterval(() => {
    autoRefreshTick++;
    if (document.hidden || pendingStale() || document.querySelector('.modal.show')) return;
    const s = window.AppState.currentSection;
    if (s === 'frontoffice' && foFilter.periode === 'today') refreshFrontOffice(true);
    else if (s === 'backoffice' && autoRefreshTick % 2 === 0) refreshBackOffice(true);
  }, 30000);
}
function stopAutoRefresh() { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }

function showAccessDenied(message) {
  document.getElementById('accessDeniedMessage').textContent = message;
  document.getElementById('accessDenied').style.display = 'flex';
}

function showMainApp() {
  document.getElementById('sidebar').style.display = 'flex';
  document.getElementById('mainContent').style.display = 'block';
}

function applyUserToUI() {
  const nama = window.AppState.who || 'Tim KUA';
  const u = (window.AppState.users || []).find(x => x.Nama === nama) || {};
  const initial = nama.trim().charAt(0).toUpperCase() || 'A';
  document.getElementById('userAvatarInitial').textContent = initial;
  document.getElementById('topbarAvatar').textContent = initial;
  document.getElementById('userMiniName').textContent = nama;
  document.getElementById('userMiniRole').textContent = 'Masuk sebagai · ' + roleLabel(u.Role);
  const admin = isAdmin();
  document.body.classList.toggle('non-admin', !admin);
  const nav = document.getElementById('navManajemen');
  if (nav) nav.style.display = admin ? '' : 'none';
}

// ════════════════════════════════════════════════════════
// BAGIAN 2: NAVIGASI SPA (0ms — prinsip Client-Side SPA)
// ════════════════════════════════════════════════════════
const SECTION_TITLES = {
  dashboard: 'Dashboard', frontoffice: 'Front Office', backoffice: 'Back Office',
  workspace: 'Service Workspace',
  knowledge: 'Katalog Layanan', manajemen: 'Pengaturan'
};

/** v5: data dianggap segar 20 detik — pindah menu tidak memanggil server lagi bila baru saja dimuat. */
const SEGAR_MS = 20000;
function masihSegar(t) { return t && Date.now() - t < SEGAR_MS; }

function navigateTo(sectionId, params) {
  if (!window.AppState.user) return; // belum siap / akses ditolak
  if (sectionId === 'manajemen' && !isAdmin()) { showToast('Akses', 'Menu Pengaturan khusus Kepala KUA.', 'warning'); sectionId = 'dashboard'; }
  document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
  const target = document.getElementById('section-' + sectionId);
  if (target) target.classList.add('active');

  document.querySelectorAll('.sidebar-nav .nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.section === sectionId);
  });
  document.getElementById('pageTitle').textContent = SECTION_TITLES[sectionId] || sectionId;
  // Bug fix: kelas Bootstrap "d-md-flex" (!important) mengalahkan style.display,
  // sehingga kotak cari selalu tampil di desktop. Kini kelasnya yang di-toggle.
  const searchable = sectionId === 'frontoffice' || sectionId === 'backoffice';
  document.getElementById('topbarSearchBox').classList.toggle('d-md-flex', searchable);
  document.getElementById('globalSearchInput').value = sectionId === 'frontoffice' ? foSearch : sectionId === 'backoffice' ? boSearch : '';

  window.AppState.currentSection = sectionId;
  closeSidebar();

  const loaders = {
    dashboard: loadDashboard,
    frontoffice: () => { renderFrontOffice(); if (foFilter.periode !== 'today' || !masihSegar(window.AppState.foAt)) refreshFrontOffice(true); },
    backoffice: () => { renderBackOffice(); if (boRangeLoaded !== 'default' || !masihSegar(window.AppState.boAt)) refreshBackOffice(true); },
    workspace: () => loadServiceWorkspace(params && params.layananId),
    knowledge: renderKnowledgeShell,
    manajemen: renderManajemenShell
  };
  if (loaders[sectionId]) loaders[sectionId](params);
}

function openWorkspace(layananId) {
  navigateTo('workspace', { layananId });
}

// ════════════════════════════════════════════════════════
// BAGIAN 3: DARK MODE & SIDEBAR MOBILE
// ════════════════════════════════════════════════════════
function toggleDarkMode() {
  const html = document.documentElement;
  const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('labuku_theme', next);
}
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('show');
  document.querySelector('.sidebar-overlay').classList.toggle('show');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('show');
  document.querySelector('.sidebar-overlay').classList.remove('show');
}

/**
 * Tombol Refresh di topbar (gas-instant-ux): memuat ulang data section yang
 * sedang aktif dengan cepat, melewati cache server untuk section yang
 * memakainya, agar data yang baru saja diinput langsung tampil tanpa perlu
 * reload seluruh halaman.
 */
/**
 * Tombol Refresh: SELALU mengambil ulang seluruh data (getBootstrap) lalu memuat
 * ulang halaman yang sedang dibuka. Ikon berputar sampai selesai dan ada
 * konfirmasi waktu pembaruan. Bug fix: sebelumnya bisa tampak "tidak berfungsi"
 * (data sama → tidak dirender ulang, atau aksi tertunda membuat refresh dilewati).
 */
let refreshBusy = false;
function refreshCurrentSection() {
  if (refreshBusy) return;
  refreshBusy = true;
  const btn = document.getElementById('topbarRefreshBtn');
  if (btn) btn.classList.add('spinning-loop');
  foPending = 0;
  /*
   * v5 (kecepatan): SATU panggilan getBootstrap sudah membawa antrean hari ini, Back Office,
   * dashboard Harian, katalog, tim & pengaturan — dan langsung merender ulang menu yang dibuka.
   * Panggilan tambahan hanya untuk data yang memang tidak ada di bootstrap (filter khusus,
   * workspace, katalog lengkap, daftar tim). Sebelumnya selalu 2 panggilan yang tumpang tindih.
   */
  const sec = window.AppState.currentSection;
  const tambahan = [];
  if (sec === 'frontoffice' && foFilter.periode !== 'today') tambahan.push(d => refreshFrontOffice(false, d));
  if (sec === 'backoffice' && boFilter.periode === 'range') tambahan.push(d => refreshBackOffice(false, d));
  if (sec === 'knowledge') tambahan.push(d => muatKatalogLengkap(true, d));
  if (sec === 'manajemen' && manajemenActiveTab === 'users') tambahan.push(d => loadManajemenUsers(d));
  let sisa = 1 + tambahan.length;
  let gagal = false;
  const selesai = (ok) => {
    if (ok === false) gagal = true;
    if (--sisa > 0) return;
    refreshBusy = false;
    if (btn) btn.classList.remove('spinning-loop');
    if (!gagal) showToast('Diperbarui', 'Data terbaru dimuat pukul ' + new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + '.', 'success');
  };
  if (sec === 'dashboard' && window.AppState.dashboardPeriode !== 'Harian') { delete dashboardCache[window.AppState.dashboardPeriode]; delete dashboardAt[window.AppState.dashboardPeriode]; }
  fetchBootstrap(false, (res) => {
    selesai(!!(res && res.success));
    if (sec === 'dashboard' && window.AppState.dashboardPeriode !== 'Harian') loadDashboard();
    if (sec === 'workspace' && workspaceState.layananId) loadServiceWorkspace(workspaceState.layananId, workspaceState.activeTab);
    if (sec === 'manajemen' && manajemenActiveTab !== 'users' && manajemenActiveTab !== 'keamanan') switchManajemenTab(manajemenActiveTab);
  });
  tambahan.forEach(fn => fn(() => selesai()));
}

// ════════════════════════════════════════════════════════
// BAGIAN 4: UTILITAS UI
// ════════════════════════════════════════════════════════
function hideLoadingOverlay() {
  const overlay = document.getElementById('loadingOverlay');
  overlay.style.opacity = '0';
  setTimeout(() => overlay.style.display = 'none', 250);
}

function showToast(title, message, type) {
  type = type || 'info';
  const toastEl = document.getElementById('appToast');
  document.getElementById('toastTitle').textContent = title;
  document.getElementById('toastBody').textContent = message;
  const icon = document.getElementById('toastIcon');
  icon.className = 'bi me-2 ' + (type === 'success' ? 'bi-check-circle-fill text-success' : type === 'danger' ? 'bi-x-circle-fill text-danger' : type === 'warning' ? 'bi-exclamation-triangle-fill text-warning' : 'bi-info-circle-fill text-primary');
  new bootstrap.Toast(toastEl, { delay: 4000 }).show();
}

function loadingBlock(msg) {
  return '<div class="loading-inline"><div class="spinner-border" style="color:var(--primary)" role="status"></div><p class="mt-2 mb-0">' + (msg || 'Memuat data...') + '</p></div>';
}

function emptyState(icon, text) {
  return '<div class="empty-state"><i class="bi ' + icon + '"></i><p class="mb-0">' + text + '</p></div>';
}

/**
 * Bug fix: jika Apps Script mengirim respons null/undefined ke success handler
 * (terbukti dari error Console "Cannot read properties of null (reading
 * 'success')" — biasanya karena payload/waktu eksekusi terlalu besar), kode
 * lama langsung crash di baris pertama (if (!res.success)) TANPA sempat
 * mengubah tampilan, sehingga terlihat "hanya berputar selamanya". Fungsi ini
 * dipanggil di awal success handler untuk menangkap kondisi itu secara halus.
 */
function isNullResponse(res, container, retryCallExpr) {
  if (res) return false;
  if (container) {
    container.innerHTML = emptyState('bi-exclamation-triangle', 'Server tidak memberikan respons (kemungkinan data terlalu besar atau koneksi lambat).') +
      (retryCallExpr ? `<div class="text-center mt-2"><button class="btn btn-labuku-primary btn-sm-pill" onclick="${retryCallExpr}"><i class="bi bi-arrow-clockwise"></i> Coba Lagi</button></div>` : '');
  }
  showToast('Error', 'Server tidak memberikan respons yang valid. Silakan coba lagi.', 'danger');
  return true;
}

function statusBadgeClass(status) {
  const map = {
    'Selesai': 'badge-selesai', 'Diproses': 'badge-diproses', 'Pending': 'badge-pending',
    'Ditolak': 'badge-ditolak', 'Antre': 'badge-antre', 'Menunggu': 'badge-menunggu',
    'Di Loket': 'badge-diloket', 'Terlewat': 'badge-terlewat', 'Proses': 'badge-proses'
  };
  return map[status] || 'badge-netral';
}

function fmtDate(val) {
  if (!val) return '-';
  const d = new Date(val);
  if (isNaN(d)) return String(val);
  const opts = { day: '2-digit', month: 'short', year: 'numeric' };
  return d.toLocaleDateString('id-ID', opts);
}
function fmtDateTime(val) {
  if (!val) return '-';
  const d = new Date(val);
  if (isNaN(d)) return String(val);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + ', ' +
    d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}
/* v5: penanda {{Field}} yang bisa diklik → tersalin sebagai TEKS POLOS (tanpa warna/huruf kode),
   sehingga saat ditempel ke template Google Docs warnanya mengikuti teks di sekitarnya. */
function chipSalin(nama) {
  const t = '{{' + nama + '}}';
  return `<button type="button" class="chip-copy" title="Klik untuk menyalin" data-t="${escapeHtml(t)}" onclick="salinTeks(this.dataset.t, this)">${escapeHtml(t)}</button>`;
}
function salinTeks(teks, el) {
  const ok = () => {
    showToast('Disalin', teks + ' — tempel di template Google Docs.', 'success');
    if (el) { el.classList.add('copied'); setTimeout(() => el.classList.remove('copied'), 900); }
  };
  const cadangan = () => {
    const ta = document.createElement('textarea');
    ta.value = teks; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); ok(); } catch (e) { showToast('Info', 'Salin manual: ' + teks, 'warning'); }
    document.body.removeChild(ta);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(teks).then(ok).catch(cadangan);
  else cadangan();
}
/* v5: jenis dokumen knowledge. WI & Tutorial lama tampil sebagai Petunjuk Teknis. */
const TIPE_LABEL = { SOP: 'SOP', Regulasi: 'Regulasi', Juknis: 'Petunjuk Teknis', WI: 'Petunjuk Teknis', Tutorial: 'Petunjuk Teknis', Template: 'Template Surat' };
function labelTipe(t) { return TIPE_LABEL[t] || t || '-'; }
const DATA_OTOMATIS = ['NamaPemohon', 'NIK', 'Alamat', 'Desa', 'Kecamatan', 'Kabupaten', 'Provinsi', 'NoHP', 'IDLayanan', 'JenisLayanan', 'Tanggal', 'Petugas'];

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function confirmAction(title, body, onConfirm) {
  document.getElementById('confirmModalTitle').textContent = title;
  document.getElementById('confirmModalBody').textContent = body;
  const modalEl = document.getElementById('confirmModal');
  const modal = new bootstrap.Modal(modalEl);
  const btn = document.getElementById('confirmModalBtn');
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  newBtn.onclick = () => { modal.hide(); onConfirm(); };
  modal.show();
}

function openFormModal(title, bodyHtml) {
  document.getElementById('formModalTitle').textContent = title;
  document.getElementById('formModalBody').innerHTML = bodyHtml;
  new bootstrap.Modal(document.getElementById('formModal')).show();
}
function closeFormModal() {
  const modalEl = document.getElementById('formModal');
  const instance = bootstrap.Modal.getInstance(modalEl);
  if (instance) instance.hide();
}

function previewFile(fileUrl, fileName, mimeType) {
  const content = document.getElementById('previewContent');
  document.getElementById('downloadBtn').href = fileUrl;
  if (mimeType && mimeType.indexOf('image/') === 0) {
    content.innerHTML = '<img src="' + fileUrl + '" class="img-fluid rounded" alt="' + escapeHtml(fileName) + '">';
  } else {
    // Bug fix: "//" di dalam string URL ini terpotong oleh proses penghapus komentar saat kode
    // disalin (baris jadi '<iframe src="https: → SyntaxError, aplikasi berputar terus).
    // Ditulis "\/\/" (nilainya tetap "//") agar tidak pernah dianggap komentar.
    content.innerHTML = '<iframe src="https:\/\/docs.google.com/gview?url=' + encodeURIComponent(fileUrl) + '&embedded=true" style="width:100%;height:65vh;border:none;"></iframe>';
  }
  document.querySelector('#previewModal .modal-title').textContent = fileName || 'Pratinjau Dokumen';
  new bootstrap.Modal(document.getElementById('previewModal')).show();
}

function handleGlobalSearch(query) {
  if (window.AppState.currentSection === 'frontoffice') { foSearch = query; renderFoTable(); }
  if (window.AppState.currentSection === 'backoffice') { boSearch = query; renderBackOffice(); }
}

// ════════════════════════════════════════════════════════
// BAGIAN 5: MODUL DASHBOARD (PRD 5.1)
// ════════════════════════════════════════════════════════
/**
 * Optimasi (gas-instant-ux, stale-while-revalidate): data dashboard terakhir per
 * periode disimpan di memori. Saat kembali ke Dashboard, tampilan lama langsung
 * dirender (0 ms), lalu data segar diambil di latar belakang dan hanya dirender
 * ulang bila memang berubah. Data awal dari doGet dipakai tanpa request sama sekali.
 */
const dashboardCache = {};
const dashboardAt = {};

function loadDashboard() {
  const container = document.getElementById('section-dashboard');
  const periode = window.AppState.dashboardPeriode;

  const pre = window.AppState.prefetchedDashboard;
  if (pre && pre.periode === periode) {
    window.AppState.prefetchedDashboard = null;
    dashboardCache[periode] = JSON.stringify(pre.res);
    dashboardAt[periode] = Date.now();
    renderDashboard(pre.res);
    return;
  }

  const cachedStr = dashboardCache[periode];
  if (cachedStr) renderDashboard(JSON.parse(cachedStr));
  else container.innerHTML = loadingBlock('Memuat dashboard...');
  if (cachedStr && masihSegar(dashboardAt[periode])) return; // v5: baru dimuat → tanpa panggilan server

  gsr()
    .withSuccessHandler(res => {
      if (!res) { if (!cachedStr) isNullResponse(res, container, 'loadDashboard()'); return; }
      const str = JSON.stringify(res);
      const unchanged = str === dashboardCache[periode];
      if (res.success) { dashboardCache[periode] = str; dashboardAt[periode] = Date.now(); }
      if (unchanged) return;
      if (window.AppState.currentSection !== 'dashboard' || window.AppState.dashboardPeriode !== periode) return;
      renderDashboard(res);
    })
    .withFailureHandler(err => {
      if (!cachedStr) container.innerHTML = emptyState('bi-exclamation-triangle', 'Gagal memuat dashboard.');
      showToast('Error', err.message || err, 'danger');
    })
    .getDashboardData(periode);
}

/*
 * v5: Dashboard tanpa pustaka grafik (Chart.js dihapus → halaman lebih ringan & cepat).
 * Warna status konsisten di seluruh aplikasi (lolos uji buta warna, urutan Antre–Pending–Proses–Selesai):
 * Antre biru · Pending oranye · Proses ungu · Selesai hijau. Setiap warna selalu disertai label & angka.
 */
const STATUS_DASH = [
  { key: 'Antre', label: 'Antre', cls: 'st-antre', icon: 'bi-people' },
  { key: 'Pending', label: 'Pending', cls: 'st-pending', icon: 'bi-hourglass-split' },
  { key: 'Diproses', label: 'Proses', cls: 'st-proses', icon: 'bi-gear' },
  { key: 'Selesai', label: 'Selesai', cls: 'st-selesai', icon: 'bi-check2-circle' }
];

function changeDashboardPeriode(periode) {
  window.AppState.dashboardPeriode = periode;
  loadDashboard();
}

function pct(n, total) { return total ? Math.round(n * 100 / total) : 0; }

function renderDashboard(res) {
  const container = document.getElementById('section-dashboard');
  if (!res.success) { container.innerHTML = emptyState('bi-exclamation-triangle', res.message); return; }
  const d = res.data;
  const periodeOptions = ['Harian', 'Mingguan', 'Bulanan', 'Triwulan', 'Tahunan'];
  const dist = d.distribusiStatus || {};
  const totalStatus = STATUS_DASH.reduce((s, x) => s + (Number(dist[x.key]) || 0), 0);
  const instansi = instansiNama();

  const tiles = STATUS_DASH.map(x => {
    const n = Number(dist[x.key]) || 0;
    return `
      <div class="col-6 col-lg-3">
        <div class="lb-card dash-tile ${x.cls}">
          <div class="dash-tile-head"><span class="dash-dot"></span>${x.label}<i class="bi ${x.icon} ms-auto"></i></div>
          <div class="dash-tile-val">${n}</div>
          <div class="dash-tile-sub">${pct(n, totalStatus)}% dari ${totalStatus} layanan</div>
        </div>
      </div>`;
  }).join('');

  const segmen = totalStatus === 0 ? '<div class="dash-stack-empty">Belum ada layanan pada periode ini.</div>' :
    STATUS_DASH.filter(x => Number(dist[x.key]) > 0).map(x => {
      const n = Number(dist[x.key]);
      return `<div class="dash-seg ${x.cls}" style="flex:${n}" title="${x.label}: ${n} (${pct(n, totalStatus)}%)"></div>`;
    }).join('');
  const legend = STATUS_DASH.map(x => {
    const n = Number(dist[x.key]) || 0;
    return `<span class="dash-legend ${x.cls}"><span class="dash-dot"></span>${x.label} <b>${n}</b> <span class="text-secondary">${pct(n, totalStatus)}%</span></span>`;
  }).join('');

  const trenMax = Math.max(1, ...(d.trenValue || [0]));
  const tren = (d.trenLabel || []).length === 0 ? emptyState('bi-graph-up', 'Belum ada kunjungan pada periode ini.') : `
    <div class="dash-cols">
      ${d.trenLabel.map((lb, i) => {
        const v = Number(d.trenValue[i]) || 0;
        return `<div class="dash-col" title="${escapeHtml(lb)}: ${v} kunjungan"><span class="dash-col-val">${v}</span><div class="dash-col-bar" style="height:${Math.max(4, Math.round(v * 100 / trenMax))}%"></div><span class="dash-col-lbl">${escapeHtml(lb)}</span></div>`;
      }).join('')}
    </div>`;

  const top = d.layananTerbanyak || [];
  const topMax = Math.max(1, ...top.map(t => Number(t.jumlah) || 0));
  const terbanyak = top.length === 0 ? emptyState('bi-bar-chart', 'Belum ada layanan pada periode ini.') : top.map((t, i) => `
    <div class="dash-rank" title="${escapeHtml(t.nama)}: ${t.jumlah} layanan">
      <div class="d-flex justify-content-between align-items-baseline gap-2">
        <span class="dash-rank-nama"><span class="dash-rank-no">${i + 1}</span>${escapeHtml(t.nama)}</span><b>${t.jumlah}</b>
      </div>
      <div class="dash-track"><div class="dash-fill" style="width:${Math.max(3, Math.round(t.jumlah * 100 / topMax))}%"></div></div>
    </div>`).join('');

  container.innerHTML = `
    <div class="d-flex flex-wrap justify-content-between align-items-start mb-3 gap-2">
      <div>
        <h2 class="page-heading">Dashboard</h2>
        <p class="page-sub mb-0">Ringkasan layanan ${escapeHtml(instansi)}.</p>
      </div>
      <div class="dash-periode" role="group" aria-label="Periode">
        ${periodeOptions.map(p => `<button type="button" class="${p === d.periode ? 'active' : ''}" onclick="changeDashboardPeriode('${p}')">${p}</button>`).join('')}
      </div>
    </div>

    <div class="row g-3 mb-3">
      <div class="col-6 col-lg-3"><div class="lb-card dash-tile"><div class="dash-tile-head">Pengunjung<i class="bi bi-person-walking ms-auto"></i></div><div class="dash-tile-val">${d.totalPengunjung}</div><div class="dash-tile-sub">kunjungan ke loket</div></div></div>
      <div class="col-6 col-lg-3"><div class="lb-card dash-tile"><div class="dash-tile-head">Layanan<i class="bi bi-journal-text ms-auto"></i></div><div class="dash-tile-val">${d.totalLayanan}</div><div class="dash-tile-sub">permohonan baru</div></div></div>
      <div class="col-12 col-lg-6">
        <div class="lb-card h-100">
          <div class="d-flex justify-content-between align-items-center mb-2"><h6 class="fw-bold mb-0">Status Layanan</h6><span class="small text-secondary">${totalStatus} layanan</span></div>
          <div class="dash-stack">${segmen}</div>
          <div class="d-flex flex-wrap gap-3 mt-2">${legend}</div>
        </div>
      </div>
    </div>

    <div class="row g-3 mb-3">${tiles}</div>

    <div class="row g-3 mb-3">
      <div class="col-lg-7">
        <div class="lb-card h-100">
          <h6 class="fw-bold mb-3">Tren Kunjungan <span class="small text-secondary fw-normal">${d.periode === 'Harian' ? 'per jam' : 'per hari'}</span></h6>
          ${tren}
        </div>
      </div>
      <div class="col-lg-5">
        <div class="lb-card h-100">
          <h6 class="fw-bold mb-3">Layanan Terbanyak</h6>
          ${terbanyak}
        </div>
      </div>
    </div>

    <div class="lb-card">
      <h6 class="fw-bold mb-3">Aktivitas Hari Ini</h6>
      ${d.aktivitasHariIni.length === 0 ? emptyState('bi-inbox', 'Belum ada aktivitas hari ini.') : `
      <div class="table-responsive">
        <table class="lb-table">
          <thead><tr><th>ID Layanan</th><th>Nama Pemohon</th><th>Jenis Layanan</th><th>Status</th></tr></thead>
          <tbody>
            ${d.aktivitasHariIni.map(a => `
              <tr style="cursor:pointer" onclick="openWorkspace('${a.id}')">
                <td class="fw-semibold">${escapeHtml(a.id)}</td>
                <td>${escapeHtml(a.nama)}</td>
                <td>${escapeHtml(a.jenis)}</td>
                <td><span class="badge-status ${statusBadgeClass(a.status)}">${a.status === 'Diproses' ? 'Proses' : escapeHtml(a.status)}</span></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`}
    </div>
  `;
}

// ════════════════════════════════════════════════════════
// BAGIAN 6: FRONT OFFICE — antrean (filter periode/status/kategori/layanan/sumber),
// tambah antrean, form publik, WA nomor antrean, verifikasi berkas (pop-up)
// ════════════════════════════════════════════════════════
let foSearch = '';
let foPending = 0; /* jumlah aksi optimistik yang belum dikonfirmasi server */
let foPendingSince = 0;
let verifikasiPanelLayananId = null;
let lastTambahData = null;
let foFilter = { periode: 'today', dari: '', sampai: '', status: '', kategori: '', layanan: '', sumber: '' };

function pad2(n) { return String(n).padStart(2, '0'); }
function ymd(d) { d = new Date(d); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function rangeFor(periode, dari, sampai) {
  const now = new Date();
  if (periode === 'month') return { dari: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), sampai: ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
  if (periode === 'range') return { dari: dari || ymd(now), sampai: sampai || dari || ymd(now) };
  if (periode === 'today') return { dari: ymd(now), sampai: ymd(now) };
  return null;
}
function dalamRentang(val, r) {
  if (!r) return true;
  if (!val) return false;
  const s = ymd(val);
  return s >= r.dari && s <= r.sampai;
}

/* Penanda aksi tertunda; otomatis dilepas bila server tidak menjawab > 45 detik
   (agar tombol Refresh & auto-refresh tidak pernah macet). */
function pendingStart() { foPending++; foPendingSince = Date.now(); }
function pendingEnd() { foPending = Math.max(0, foPending - 1); }
function pendingStale() {
  if (foPending > 0 && Date.now() - foPendingSince > 45000) foPending = 0;
  return foPending > 0;
}

function foStatusInfo(r) {
  if (r._temp) return { label: 'Menyimpan...', cls: 'badge-netral' };
  if (r.Status === 'Menunggu') return { label: 'Menunggu', cls: 'badge-menunggu' };
  if (r.Status === 'Di Loket') return { label: 'Di Loket', cls: 'badge-diloket' };
  if (r.Status === 'Terlewat') return { label: 'Terlewat', cls: 'badge-terlewat' };
  if (r.LayananStatus === 'Diproses') return { label: 'Proses', cls: 'badge-proses' };
  if (r.LayananStatus === 'Pending') return { label: 'Pending', cls: 'badge-pending' };
  if (r.LayananStatus === 'Selesai') return { label: 'Selesai', cls: 'badge-selesai' };
  return { label: r.Status || '-', cls: 'badge-netral' };
}

function katalogById(id) { return (window.AppState.katalog || []).find(k => k.ID === id) || null; }
function kategoriOf(row) {
  const k = katalogById(row.KatalogID) || (window.AppState.katalog || []).find(x => x.NamaLayanan === (row.LayananNama || row.JenisLayanan));
  return k ? k.Kategori : '';
}

function filterOptionsHtml(selectedKat, selectedLay) {
  const kats = KATEGORI_LAYANAN_RESMI.map(k => `<option value="${escapeHtml(k)}" ${k === selectedKat ? 'selected' : ''}>${escapeHtml(k.replace(/^Layanan /, ''))}</option>`).join('');
  const lays = katalogSorted().filter(k => !selectedKat || k.Kategori === selectedKat)
    .map(k => `<option value="${k.ID}" ${k.ID === selectedLay ? 'selected' : ''}>${escapeHtml(k.NamaLayanan)}</option>`).join('');
  return { kats, lays };
}

function renderFrontOffice() {
  const container = document.getElementById('section-frontoffice');
  if (!document.getElementById('foTableBox')) {
    container.innerHTML = `
      <div class="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-2">
        <div>
          <h2 class="page-heading">Front Office</h2>
          <p class="page-sub mb-0" id="foSub">Antrean</p>
        </div>
        <div class="d-flex gap-2 flex-wrap">
          <button class="btn btn-labuku-outline" onclick="openQrModal()"><i class="bi bi-qr-code"></i> Link &amp; QR Form Publik</button>
          <button class="btn btn-labuku-primary" onclick="openTambahAntrean()"><i class="bi bi-plus-lg"></i> Tambah Antrean</button>
        </div>
      </div>
      <div class="lb-card filter-bar mb-3" id="foFilterBar"></div>
      <div class="fo-stats" id="foStats"></div>
      <div class="table-wrap" id="foTableBox"></div>`;
  }
  renderFoFilterBar();
  renderFoTable();
}

function renderFoFilterBar() {
  const bar = document.getElementById('foFilterBar');
  if (!bar) return;
  const f = foFilter;
  const o = filterOptionsHtml(f.kategori, f.layanan);
  bar.innerHTML = `
    <div class="row g-2 align-items-end">
      <div class="col-6 col-md-2"><label class="form-label">Periode</label>
        <select class="form-select form-select-sm" id="foPeriode" onchange="ubahFoPeriode(this.value)">
          <option value="today" ${f.periode === 'today' ? 'selected' : ''}>Hari ini</option>
          <option value="month" ${f.periode === 'month' ? 'selected' : ''}>Bulan ini</option>
          <option value="range" ${f.periode === 'range' ? 'selected' : ''}>Pilih tanggal</option>
        </select></div>
      ${f.periode === 'range' ? `
      <div class="col-6 col-md-2"><label class="form-label">Dari</label><input type="date" class="form-control form-control-sm" id="foDari" value="${f.dari}"></div>
      <div class="col-6 col-md-2"><label class="form-label">Sampai</label><input type="date" class="form-control form-control-sm" id="foSampai" value="${f.sampai}"></div>
      <div class="col-6 col-md-1"><button class="btn btn-labuku-primary btn-sm w-100" onclick="terapkanFoRentang()">Terapkan</button></div>` : ''}
      <div class="col-6 col-md-2"><label class="form-label">Status</label>
        <select class="form-select form-select-sm" onchange="foFilter.status=this.value;renderFoTable()">
          ${['', 'Menunggu', 'Di Loket', 'Proses', 'Pending', 'Selesai', 'Terlewat'].map(s => `<option value="${s}" ${s === f.status ? 'selected' : ''}>${s || 'Semua status'}</option>`).join('')}
        </select></div>
      <div class="col-6 col-md-2"><label class="form-label">Kategori</label>
        <select class="form-select form-select-sm" onchange="foFilter.kategori=this.value;foFilter.layanan='';renderFoFilterBar();renderFoTable()"><option value="">Semua kategori</option>${o.kats}</select></div>
      <div class="col-6 col-md-2"><label class="form-label">Layanan</label>
        <select class="form-select form-select-sm" onchange="foFilter.layanan=this.value;renderFoTable()"><option value="">Semua layanan</option>${o.lays}</select></div>
      <div class="col-6 col-md-1"><label class="form-label">Sumber</label>
        <select class="form-select form-select-sm" onchange="foFilter.sumber=this.value;renderFoTable()">
          ${['', 'Loket', 'Online'].map(s => `<option value="${s}" ${s === f.sumber ? 'selected' : ''}>${s || 'Semua'}</option>`).join('')}
        </select></div>
    </div>`;
}

function ubahFoPeriode(p) {
  foFilter.periode = p;
  if (p === 'range') {
    foFilter.dari = foFilter.dari || ymd(new Date());
    foFilter.sampai = foFilter.sampai || ymd(new Date());
    renderFoFilterBar();
    return;
  }
  renderFoFilterBar();
  refreshFrontOffice(false);
}

function terapkanFoRentang() {
  foFilter.dari = document.getElementById('foDari').value;
  foFilter.sampai = document.getElementById('foSampai').value || foFilter.dari;
  if (!foFilter.dari) { showToast('Peringatan', 'Isi tanggal mulai.', 'warning'); return; }
  refreshFrontOffice(false);
}

function foFilteredList() {
  const q = (foSearch || '').toLowerCase().trim();
  const f = foFilter;
  return (window.AppState.fo || []).filter(r => {
    if (q && !(String(r.PemohonNama).toLowerCase().includes(q) || String(r.Nomor).toLowerCase().includes(q) ||
      String(r.LayananNama).toLowerCase().includes(q) || String(r.LayananID).toLowerCase().includes(q) || String(r.NoHP || '').includes(q))) return false;
    if (f.status && foStatusInfo(r).label !== f.status) return false;
    if (f.sumber && (r.Sumber || 'Loket') !== f.sumber) return false;
    if (f.layanan && r.KatalogID !== f.layanan && (katalogById(f.layanan) || {}).NamaLayanan !== r.LayananNama) return false;
    if (f.kategori && kategoriOf(r) !== f.kategori) return false;
    return true;
  });
}

function renderFoStats(list) {
  const box = document.getElementById('foStats');
  if (!box) return;
  const c = (fn) => list.filter(fn).length;
  const items = [
    ['Total', list.length],
    ['Menunggu', c(r => r.Status === 'Menunggu')],
    ['Di Loket', c(r => r.Status === 'Di Loket')],
    ['Proses', c(r => foStatusInfo(r).label === 'Proses')],
    ['Pending', c(r => foStatusInfo(r).label === 'Pending')],
    ['Selesai', c(r => foStatusInfo(r).label === 'Selesai')],
    ['Online', c(r => r.Sumber === 'Online')]
  ];
  box.innerHTML = items.map(([k, v]) => `<div class="fo-stat">${k}<b>${v}</b></div>`).join('');
}

function renderFoTable() {
  const box = document.getElementById('foTableBox');
  if (!box) return;
  const sub = document.getElementById('foSub');
  const r0 = rangeFor(foFilter.periode, foFilter.dari, foFilter.sampai);
  if (sub) sub.textContent = foFilter.periode === 'today'
    ? 'Antrean hari ini · ' + new Date().toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    : 'Antrean ' + fmtDate(r0.dari) + ' – ' + fmtDate(r0.sampai);
  const list = foFilteredList();
  renderFoStats(list);
  const showTgl = foFilter.periode !== 'today';
  if (list.length === 0) {
    box.innerHTML = emptyState('bi-ticket-perforated', (window.AppState.fo || []).length ? 'Tidak ada antrean yang cocok dengan filter.' : 'Belum ada antrean pada periode ini. Klik "Tambah Antrean" atau bagikan QR form publik.');
    return;
  }
  box.innerHTML = `
    <table class="lb-table">
      <thead><tr><th>No.</th>${showTgl ? '<th>Tanggal</th>' : ''}<th>Pemohon</th><th>Layanan</th><th>Status</th><th style="text-align:right;">Aksi</th></tr></thead>
      <tbody>
        ${list.map(r => {
          const st = foStatusInfo(r);
          const waiting = r.Status === 'Menunggu' || r.Status === 'Di Loket';
          let aksi = '';
          if (r._temp) aksi = '<span class="spinner-border spinner-border-sm text-secondary"></span>';
          else {
            if (r.Status === 'Menunggu' || r.Status === 'Terlewat') aksi += `<button class="btn btn-labuku-outline btn-sm-pill" onclick="panggilFo('${r.ID}')">Panggil</button>`;
            if (waiting) aksi += `<button class="btn btn-labuku-accent btn-sm-pill" onclick="openVerifikasiPanel('${r.LayananID}')"><i class="bi bi-clipboard-check"></i> Verifikasi</button>`;
            if (waiting) aksi += `<button class="btn btn-labuku-outline btn-sm-pill" title="Kirim nomor antrean via WhatsApp" onclick="waAntrean('${r.ID}')"><i class="bi bi-whatsapp"></i></button>`;
            if (waiting) aksi += `<button class="btn btn-link btn-sm text-secondary" title="Tandai terlewat" onclick="terlewatFo('${r.ID}')"><i class="bi bi-skip-forward"></i></button>`;
          }
          return `
          <tr class="${r.Status === 'Di Loket' ? 'queue-highlight' : ''} ${r._temp ? 'fo-row-pending' : ''}">
            <td class="fw-bold fs-6" style="white-space:nowrap;">${escapeHtml(r.Nomor)}</td>
            ${showTgl ? `<td style="white-space:nowrap;">${fmtDate(r.Waktu)}</td>` : ''}
            <td><div class="fw-semibold">${escapeHtml(r.PemohonNama)}</div>
              <div class="small text-secondary">${r.Sumber === 'Online' ? '<span class="badge-status badge-online me-1">Online</span>' : ''}${escapeHtml(r.NoHP || '')}</div></td>
            <td>${escapeHtml(r.LayananNama)}<div class="small text-secondary">${escapeHtml(kategoriOf(r).replace(/^Layanan /, ''))}</div>${r.CatatanPending && st.label === 'Pending' ? `<div class="small text-secondary fst-italic">${escapeHtml(r.CatatanPending)}</div>` : ''}</td>
            <td><span class="badge-status ${st.cls}">${st.label}</span></td>
            <td class="fo-actions" style="text-align:right;">${aksi}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

function saveFoToCache() { if (foFilter.periode === 'today') saveAppStateCache(); }

function refreshFrontOffice(silent, done) {
  const range = rangeFor(foFilter.periode, foFilter.dari, foFilter.sampai);
  gsr(function (res) {
    if (done) done();
    if (!res || !res.success) { if (!silent) showToast('Gagal', (res && res.message) || 'Server tidak merespons.', 'danger'); return; }
    if (pendingStale()) return;
    window.AppState.fo = res.data.list || [];
    window.AppState.foAt = Date.now();
    saveFoToCache();
    if (window.AppState.currentSection === 'frontoffice') renderFoTable();
  }, function (err) { if (done) done(); if (!silent) showToast('Error', err.message || err, 'danger'); }).getFrontOffice(range);
}

/** Optimistic UI: ubah baris seketika, kirim ke server di latar belakang, kembalikan bila gagal. */
function foOptimistic(id, patch, serverFn, args, okMsg) {
  const r = (window.AppState.fo || []).find(x => x.ID === id);
  if (!r) return;
  const backup = Object.assign({}, r);
  Object.assign(r, patch);
  pendingStart();
  renderFoTable(); saveFoToCache();
  const rollback = (msg) => { pendingEnd(); Object.assign(r, backup); renderFoTable(); saveFoToCache(); showToast('Gagal', msg, 'danger'); };
  gsr(function (res) {
    if (!res || !res.success) { rollback((res && res.message) || 'Server tidak merespons.'); return; }
    pendingEnd();
    if (okMsg) showToast('Berhasil', okMsg, 'success');
  }, function (err) { rollback(err.message || String(err)); })[serverFn].apply(null, args);
}

function panggilFo(id) {
  const r = window.AppState.fo.find(x => x.ID === id);
  foOptimistic(id, { Status: 'Di Loket' }, 'panggilAntrean', [id], r ? 'Nomor ' + r.Nomor + ' dipanggil ke loket.' : null);
}

function terlewatFo(id) {
  foOptimistic(id, { Status: 'Terlewat' }, 'tandaiAntreanTerlewat', [id], null);
}

function normWa(hp) {
  const d = String(hp || '').replace(/\D/g, '').replace(/^0+/, '');
  if (!d) return '';
  return d.indexOf('62') === 0 ? d : '62' + d;
}

function openWa(hp, pesan) {
  const nomor = normWa(hp);
  if (!nomor) { showToast('Peringatan', 'Nomor WhatsApp pemohon belum ada.', 'warning'); return false; }
  window.open(WA_BASE + nomor + '?text=' + encodeURIComponent(pesan), '_blank', 'noopener');
  return true;
}

/** Sisa antrean = antrean "Menunggu" pada HARI YANG SAMA yang terdaftar lebih dulu. */
function sisaSebelum(id) {
  const list = window.AppState.fo || [];
  const idx = list.findIndex(x => x.ID === id);
  if (idx === -1) return 0;
  const hari = ymd(list[idx].Waktu || new Date());
  return list.filter((x, i) => i < idx && x.Status === 'Menunggu' && ymd(x.Waktu || new Date()) === hari).length;
}

/* ---------- v4: template WA (diedit di Pengaturan → Template WA) ---------- */
function waTpl(key) {
  const c = window.AppState.config || {};
  return (c.wa && c.wa[key]) || (c.waDefault && c.waDefault[key]) || "Assalamu'alaikum {nama}. Layanan {layanan} ({id}) di {instansi}.";
}
function isiTpl(tpl, vars) {
  return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m));
}
function instansiNama() { return (window.AppState.config && window.AppState.config.instansi) || 'KUA'; }
function tglPanjang(d) { return new Date(d || new Date()).toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }); }
const MODEL_LIST = ['TTE', 'PDF', 'Arsip', 'Langsung'];
const MODEL_LABEL = { TTE: 'TTE', PDF: 'PDF langsung', Arsip: 'Arsip PDF', Langsung: 'Selesai di FO' };
function modelOf(k) { const m = k && k.ModelHasil; return MODEL_LIST.indexOf(m) >= 0 ? m : 'TTE'; }

function waAntrean(id) {
  const r = (window.AppState.fo || []).find(x => x.ID === id);
  if (!r) return;
  const sisa = sisaSebelum(id);
  const pesan = isiTpl(waTpl('wa_antrean'), {
    nama: r.PemohonNama, nomor: r.Nomor, layanan: r.LayananNama, id: r.LayananID, instansi: instansiNama(), tanggal: tglPanjang(r.Waktu), sisa: sisa,
    posisi: sisa > 0 ? 'Saat ini ada ' + sisa + ' antrean sebelum Anda.' : 'Anda adalah antrean berikutnya.'
  });
  openWa(r.NoHP, pesan);
}

/* ---------- Pilihan layanan: bisa diketik, yang paling sering dipakai di atas ---------- */
function katalogSorted() {
  return (window.AppState.katalog || []).slice().sort((a, b) =>
    (Number(b.Pemakaian) || 0) - (Number(a.Pemakaian) || 0) || String(a.NamaLayanan).localeCompare(String(b.NamaLayanan)));
}

/* v4: semua layanan tampil per kategori (klik untuk membuka), tetap bisa dicari; paling sering dipakai di atas. */
const layananPickers = {};
function layananPickerHtml(prefix, selectedId) {
  const sel = katalogById(selectedId);
  return `
    <input type="hidden" id="${prefix}Katalog" value="${sel ? sel.ID : ''}">
    <input type="text" class="form-control" id="${prefix}Cari" autocomplete="off" placeholder="Cari layanan, mis. nikah, wakaf, kiblat... atau pilih kategori di bawah"
      value="${sel ? escapeHtml(sel.NamaLayanan) : ''}" oninput="document.getElementById('${prefix}Katalog').value='';renderLayananPicker('${prefix}')" onfocus="renderLayananPicker('${prefix}')">
    <div class="lpx-box" id="${prefix}List" style="display:none;"></div>
    <div class="small text-secondary mt-1" id="${prefix}Info">${sel ? 'Dipilih: ' + escapeHtml(sel.NamaLayanan) + ' · ' + escapeHtml(sel.Kategori) : 'Paling sering dipakai tampil di atas. Klik kategori untuk melihat layanannya.'}</div>`;
}

function renderLayananPicker(prefix) {
  const box = document.getElementById(prefix + 'List');
  if (!box) return;
  let p = layananPickers[prefix];
  if (!p || p.box !== box) {
    p = { box: box, opts: { items: [], kategori: KATEGORI_LAYANAN_RESMI, onPick: it => pilihLayananPicker(prefix, it.id) } };
    p.ui = LabukuUI.LayananList(box, p.opts);
    layananPickers[prefix] = p;
  }
  p.opts.items = (window.AppState.katalog || []).map(k => ({ id: k.ID, nama: k.NamaLayanan, kategori: k.Kategori, pakai: Number(k.Pemakaian) || 0 }));
  const dipilih = document.getElementById(prefix + 'Katalog').value;
  p.ui.render(dipilih ? '' : document.getElementById(prefix + 'Cari').value);
}

function pilihLayananPicker(prefix, id) {
  const k = katalogById(id);
  if (!k) return;
  document.getElementById(prefix + 'Katalog').value = k.ID;
  document.getElementById(prefix + 'Cari').value = k.NamaLayanan;
  document.getElementById(prefix + 'Info').textContent = 'Dipilih: ' + k.NamaLayanan + ' · ' + k.Kategori;
  document.getElementById(prefix + 'List').style.display = 'none';
}

/* Wilayah adaptif (v5: luar kabupaten utama diketik, tanpa memuat data dari server). */
let taWil = null;

/* ---------- Tambah antrean ---------- */
function openTambahAntrean(prefill) {
  const p = prefill || {};
  openFormModal('Tambah Antrean', `
    <div class="mb-3">
      <label class="form-label">Pemohon lama / layanan pending?</label>
      <div class="input-group">
        <input type="text" class="form-control" id="taCari2" placeholder="Cari nama, NIK, No. HP, atau ID layanan" onkeydown="if(event.key==='Enter'){event.preventDefault();cariDataLamaFo();}">
        <button class="btn btn-labuku-outline" type="button" onclick="cariDataLamaFo()"><i class="bi bi-search"></i></button>
      </div>
      <div id="taCariHasil" class="mt-2"></div>
    </div>
    <hr>
    <form id="taForm" onsubmit="event.preventDefault(); submitTambahAntrean();">
      <div class="row g-3">
        <div class="col-md-6"><label class="form-label">NIK</label><input class="form-control" id="taNik" maxlength="16" inputmode="numeric" value="${escapeHtml(p.nik || '')}"></div>
        <div class="col-md-6"><label class="form-label">Nama Lengkap</label><input class="form-control" id="taNama" required value="${escapeHtml(p.nama || '')}"></div>
        <div class="col-md-6"><label class="form-label">Nomor WhatsApp</label><input class="form-control" id="taHp" inputmode="tel" placeholder="08xxxxxxxxxx" required value="${escapeHtml(p.noHp || '')}"></div>
        <div class="col-12"><label class="form-label">Alamat</label><div id="taWilayah"></div>
          <input class="form-control mt-2" id="taAlamat" maxlength="120" placeholder="Dusun / RT / RW (opsional)" value="${escapeHtml(p.alamat || '')}"></div>
        <div class="col-12"><label class="form-label">Layanan</label>${layananPickerHtml('ta', p.katalogId)}</div>
      </div>
      <button type="submit" class="btn btn-labuku-primary w-100 mt-4"><i class="bi bi-ticket-perforated"></i> Terbitkan Nomor Antrean</button>
    </form>`);
  const wilBox = document.getElementById('taWilayah');
  if (window.AppState.wilayahHome) {
    taWil = LabukuUI.Wilayah(wilBox, { home: window.AppState.wilayahHome, id: 'taW' });
    if (p.wilayahState) taWil.restore(p.wilayahState);
  } else {
    taWil = null;
    wilBox.innerHTML = '<div class="small text-danger">Data wilayah belum dimuat. Klik tombol Refresh di kanan atas.</div>';
  }
  if (!p.katalogId) renderLayananPicker('ta');
}

function cariDataLamaFo() {
  const q = document.getElementById('taCari2').value.trim();
  const box = document.getElementById('taCariHasil');
  if (q.length < 2) { box.innerHTML = ''; return; }
  box.innerHTML = '<div class="small text-secondary">Mencari...</div>';
  gsr(function (res) {
    if (!res || !res.success) { box.innerHTML = '<div class="small text-danger">' + escapeHtml((res && res.message) || 'Gagal mencari.') + '</div>'; return; }
    if (!res.data.length) { box.innerHTML = '<div class="small text-secondary">Tidak ada data lama. Isi form di bawah untuk pendaftaran baru.</div>'; return; }
    box.innerHTML = res.data.map(r => `
      <div class="d-flex justify-content-between align-items-center gap-2 py-2" style="border-bottom:1px solid var(--outline);">
        <div class="small"><strong>${escapeHtml(r.nama)}</strong> <span class="badge-status ${statusBadgeClass(r.status)}">${escapeHtml(r.status)}</span>
          <div class="text-secondary">${escapeHtml(r.layananId)} · ${escapeHtml(r.jenisLayanan)}</div>
          ${r.catatanPending ? `<div class="text-secondary fst-italic">Catatan: ${escapeHtml(r.catatanPending)}</div>` : ''}</div>
        ${r.status === 'Pending' ? `<button class="btn btn-labuku-accent btn-sm-pill" onclick="lanjutkanLayananFo('${r.layananId}')">Lanjutkan</button>` : ''}
      </div>`).join('');
  }, function (err) { box.innerHTML = '<div class="small text-danger">' + escapeHtml(err.message || err) + '</div>'; }).cariPemohonLama(q);
}

function submitTambahAntrean() {
  const form = document.getElementById('taForm');
  if (!form.checkValidity()) { form.reportValidity(); return; }
  const data = {
    nik: document.getElementById('taNik').value.replace(/\D/g, ''),
    nama: document.getElementById('taNama').value.trim(),
    noHp: document.getElementById('taHp').value.trim(),
    alamat: document.getElementById('taAlamat').value.trim(),
    katalogId: document.getElementById('taKatalog').value
  };
  const wil = taWil ? taWil.getValue() : { ok: false, error: 'Data wilayah belum dimuat. Klik tombol Refresh.' };
  if (!wil.ok) { showToast('Peringatan', wil.error, 'warning'); return; }
  data.wilayah = wil.data;
  if (!data.katalogId) { showToast('Peringatan', 'Pilih layanan dari daftar (cari, atau klik kategori lalu layanan).', 'warning'); renderLayananPicker('ta'); return; }
  lastTambahData = Object.assign({}, data, { wilayahState: taWil.getState() });
  closeFormModal();

  const kat = katalogById(data.katalogId);
  if (kat) kat.Pemakaian = (Number(kat.Pemakaian) || 0) + 1;
  const temp = { ID: 'tmp-' + Date.now(), _temp: true, Nomor: '…', PemohonNama: data.nama, LayananNama: kat ? kat.NamaLayanan : '', LayananID: '', KatalogID: data.katalogId,
    Status: 'Menunggu', LayananStatus: 'Antre', NoHP: data.noHp, Sumber: 'Loket', Waktu: new Date().toISOString() };
  window.AppState.fo.push(temp);
  pendingStart();
  renderFoTable();

  const removeTemp = () => { window.AppState.fo = window.AppState.fo.filter(x => x.ID !== temp.ID); };
  gsr(function (res) {
    pendingEnd();
    removeTemp();
    if (!res || !res.success) {
      renderFoTable();
      showToast('Gagal', (res && res.message) || 'Server tidak merespons.', 'danger');
      openTambahAntrean(lastTambahData);
      return;
    }
    window.AppState.fo.push(res.data);
    renderFoTable(); saveFoToCache();
    showAntreanDibuat(res.data);
  }, function (err) {
    pendingEnd(); removeTemp(); renderFoTable();
    showToast('Error', err.message || err, 'danger');
    openTambahAntrean(lastTambahData);
  }).tambahAntrean(data);
}

function lanjutkanLayananFo(layananId) {
  closeFormModal();
  gsr(function (res) {
    if (!res || !res.success) { showToast('Gagal', (res && res.message) || 'Server tidak merespons.', 'danger'); return; }
    if (res.data.row) { window.AppState.fo.push(res.data.row); renderFoTable(); saveFoToCache(); showAntreanDibuat(res.data.row); }
    else refreshFrontOffice(true);
  }, function (err) { showToast('Error', err.message || err, 'danger'); }).lanjutkanLayanan(layananId);
}

function showAntreanDibuat(row) {
  const sisa = sisaSebelum(row.ID);
  openFormModal('Antrean Diterbitkan', `
    <div class="ptsp-ticket-card mb-3">
      <div class="ptsp-ticket-label">Nomor Antrean</div>
      <div class="ptsp-ticket-num">${escapeHtml(row.Nomor)}</div>
      <div class="ptsp-service-chip"><div class="text-start"><div class="small opacity-75">${escapeHtml(row.PemohonNama)}</div><div class="fw-semibold">${escapeHtml(row.LayananNama)}</div></div></div>
    </div>
    <p class="text-center small text-secondary">${sisa > 0 ? sisa + ' antrean menunggu sebelum pemohon ini.' : 'Pemohon ini antrean berikutnya.'}</p>
    <button class="btn btn-labuku-accent w-100" onclick="waAntrean('${row.ID}')"><i class="bi bi-whatsapp"></i> Kirim Nomor Antrean via WhatsApp</button>`);
}

/* ---------- Link & QR form publik ---------- */
function openQrModal() {
  const url = window.AppState.publicFormUrl;
  if (!url) { showToast('Info', 'URL form publik belum tersedia. Deploy aplikasi sebagai Web app terlebih dahulu.', 'warning'); return; }
  const instansi = (window.AppState.config && window.AppState.config.instansi) || 'KUA';
  openFormModal('Form Antrean Publik', `
    <p class="small text-secondary">Bagikan link atau cetak QR ini. Pendaftar langsung mendapat nomor antrean hari ini dan otomatis muncul di Front Office.</p>
    <div class="input-group mb-3">
      <input type="text" class="form-control" id="qrUrl" readonly value="${escapeHtml(url)}">
      <button class="btn btn-labuku-outline" type="button" onclick="salinLinkPublik()"><i class="bi bi-clipboard"></i> Salin</button>
      <a class="btn btn-labuku-outline" href="${escapeHtml(url)}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right"></i></a>
    </div>
    <div class="qr-box mb-3"><div id="qrBox"></div></div>
    <button class="btn btn-labuku-primary w-100" onclick="unduhQr('${escapeHtml(instansi)}')"><i class="bi bi-download"></i> Unduh QR (PNG siap cetak)</button>`);
  if (typeof QRCode === 'undefined') { document.getElementById('qrBox').innerHTML = '<span class="small text-secondary">Pustaka QR gagal dimuat. Gunakan link di atas.</span>'; return; }
  new QRCode(document.getElementById('qrBox'), { text: url, width: 240, height: 240, correctLevel: QRCode.CorrectLevel.M });
}

function salinLinkPublik() {
  const input = document.getElementById('qrUrl');
  const done = () => showToast('Berhasil', 'Link disalin.', 'success');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(input.value).then(done).catch(() => { input.select(); document.execCommand('copy'); done(); });
  } else { input.select(); document.execCommand('copy'); done(); }
}

function unduhQr(instansi) {
  const src = document.querySelector('#qrBox canvas');
  if (!src) { showToast('Info', 'QR belum siap.', 'warning'); return; }
  const c = document.createElement('canvas');
  c.width = 600; c.height = 720;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#1B4332'; g.textAlign = 'center';
  g.font = 'bold 34px Inter, Arial, sans-serif'; g.fillText('AMBIL NOMOR ANTREAN', 300, 70);
  g.font = '24px Inter, Arial, sans-serif'; g.fillText(instansi, 300, 110);
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 100, 140, 400, 400);
  g.fillStyle = '#475569'; g.font = '22px Inter, Arial, sans-serif';
  g.fillText('Scan dengan kamera HP, isi data,', 300, 600);
  g.fillText('lalu tunggu panggilan di ruang tunggu.', 300, 634);
  const a = document.createElement('a');
  a.href = c.toDataURL('image/png');
  a.download = 'QR-Antrean-' + instansi.replace(/[^A-Za-z0-9]+/g, '-') + '.png';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

/* ---------- Verifikasi berkas (pop-up) ---------- */
function openVerifikasiPanel(layananId) {
  verifikasiPanelLayananId = layananId;
  openFormModal('Verifikasi Berkas', loadingBlock('Memuat detail verifikasi...'));
  gsr(res => {
    if (verifikasiPanelLayananId !== layananId) return;
    const body = document.getElementById('formModalBody');
    if (isNullResponse(res, body, `openVerifikasiPanel('${layananId}')`)) return;
    renderVerifikasiPanel(res, layananId);
  }, err => { document.getElementById('formModalBody').innerHTML = emptyState('bi-exclamation-triangle', 'Gagal memuat detail.'); showToast('Error', err.message || err, 'danger'); })
    .getDetailVerifikasi(layananId);
}

function renderVerifikasiPanel(res, layananId) {
  const panel = document.getElementById('formModalBody');
  if (!panel || verifikasiPanelLayananId !== layananId) return;
  if (!res.success) { panel.innerHTML = emptyState('bi-exclamation-triangle', res.message); return; }
  const { layanan, pemohon, persyaratan, jejak } = res.data;
  const model = modelOf(katalogById(layanan.KatalogID));
  const foRow = (window.AppState.fo || []).find(x => x.LayananID === layananId) || {};
  const hp = (pemohon && pemohon.NoHP) || foRow.NoHP || '';
  window._verifData = { layanan: layanan, pemohon: pemohon || {}, model: model, hp: hp };

  panel.innerHTML = `
    <div class="d-flex justify-content-between flex-wrap gap-2 mb-3">
      <div>
        <div class="fw-bold"><i class="bi bi-person"></i> ${escapeHtml(layanan.PemohonNama)}</div>
        <div class="small text-secondary">${escapeHtml(layanan.ID)} — ${escapeHtml(layanan.JenisLayanan)} · diajukan ${fmtDateTime(layanan.TanggalMulai)}</div>
        <div class="small mt-1"><span class="badge-status badge-model">Model hasil: ${escapeHtml(MODEL_LABEL[model])}</span></div>
      </div>
      <span class="badge-status badge-netral align-self-start" id="verifCount"></span>
    </div>

    <h6 class="fw-bold mb-1">Berkas Persyaratan</h6>
    ${persyaratan.length === 0 ? '<p class="text-secondary small">Checklist berkas layanan ini belum diatur di Katalog. Periksa berkas secara manual.</p>' : `
      <div class="small mb-1"><a href="javascript:void(0)" onclick="centangSemua()">Centang semua</a></div>` + persyaratan.map(p => `
      <label class="checklist-item" style="cursor:pointer;">
        <input type="checkbox" class="form-check-input verif-check" data-nama="${escapeHtml(p.ItemNama)}" ${p.Status === 'Valid' ? 'checked' : ''} onchange="toggleChecklist('${p.ID}', this.checked)">
        <div class="flex-grow-1">
          <div class="fw-semibold">${escapeHtml(p.ItemNama)}</div>
          ${p.DivalidasiOleh ? `<div class="small text-secondary">Diperiksa ${escapeHtml(p.DivalidasiOleh)}</div>` : ''}
        </div>
      </label>`).join('')}

    <h6 class="fw-bold mt-3 mb-1">Catatan Kekurangan</h6>
    <textarea class="form-control mb-3" id="catatanVerifikasi" rows="2" placeholder="Opsional bila ada persyaratan yang belum dicentang (otomatis disebut di WA). Wajib bila checklist kosong."></textarea>
    <div class="d-flex gap-2 flex-wrap">
      ${model === 'Langsung'
        ? `<button class="btn btn-labuku-primary flex-fill" id="btnVerifLengkap" onclick="submitVerifikasiUI('${layananId}', 'selesai')"><i class="bi bi-check2-all"></i> Lengkap → Selesai</button>`
        : `<button class="btn btn-labuku-primary flex-fill" id="btnVerifLengkap" onclick="submitVerifikasiUI('${layananId}', 'lanjut')"><i class="bi bi-check2-circle"></i> Lengkap → Proses</button>`}
      <button class="btn btn-outline-danger flex-fill" onclick="submitVerifikasiUI('${layananId}', 'pending')"><i class="bi bi-hourglass-split"></i> Kurang → Pending</button>
    </div>
    <label class="form-check verif-wa mt-2">
      <input type="checkbox" class="form-check-input" id="verifKirimWa" ${hp ? 'checked' : 'disabled'}>
      <span class="form-check-label">Kirim WA ke pemohon ${hp ? '(' + escapeHtml(hp) + ')' : '(nomor belum ada)'} saat Pending${model === 'Langsung' ? ' atau Selesai' : ''}</span>
    </label>
    <div class="small text-secondary mt-1" id="verifHint"></div>

    <details class="mt-3"><summary class="small fw-semibold">Jejak proses (${jejak.length})</summary>
      ${jejak.map(j => `<div class="timeline-item mt-2"><div class="timeline-dot"></div><div><div class="timeline-title">${escapeHtml(j.Aksi)}</div><div class="timeline-time">${escapeHtml(j.Oleh)} · ${fmtDateTime(j.Waktu)}</div></div></div>`).join('')}
    </details>
  `;
  updateVerifButtons();
}

/** Tombol "Lengkap" hanya aktif bila SEMUA persyaratan sudah dicentang. */
function updateVerifButtons() {
  const boxes = document.querySelectorAll('#formModalBody .verif-check');
  const checked = Array.prototype.filter.call(boxes, b => b.checked).length;
  const count = document.getElementById('verifCount');
  const btn = document.getElementById('btnVerifLengkap');
  const hint = document.getElementById('verifHint');
  if (count) count.textContent = boxes.length ? checked + ' / ' + boxes.length + ' lengkap' : 'Tanpa checklist';
  const lengkap = checked === boxes.length;
  if (btn) btn.disabled = !lengkap;
  const langsung = window._verifData && window._verifData.model === 'Langsung';
  if (hint) hint.textContent = lengkap
    ? (langsung ? 'Layanan ini diselesaikan langsung di Front Office (tanpa isian Back Office) dan tetap tercatat di riwayat Back Office.' : '')
    : 'Centang semua persyaratan untuk mengaktifkan tombol "Lengkap". Bila ada yang kurang, pilih Pending — yang belum dicentang otomatis disebut di WA.';
}

function centangSemua() {
  document.querySelectorAll('#formModalBody .verif-check').forEach(b => {
    if (!b.checked) { b.checked = true; b.dispatchEvent(new Event('change')); }
  });
}

function toggleChecklist(persyaratanId, checked) {
  /* Optimistic — checkbox sudah berubah di UI, sinkron ke server di latar belakang. */
  updateVerifButtons();
  gsr(null, err => showToast('Sinkronisasi gagal', err.message || err, 'warning'))
    .updateItemPersyaratan(persyaratanId, checked ? 'Valid' : 'Belum');
}

/**
 * Lengkap → Proses (masuk Back Office) | Lengkap → Selesai (model Langsung, selesai di Front Office)
 * | Kurang → Pending. WA Pending/Selesai dibuka SEKETIKA di dalam klik (tidak diblokir popup),
 * status disimpan di latar belakang (optimistic) dan dikembalikan bila server gagal.
 */
function submitVerifikasiUI(layananId, hasil) {
  const boxes = Array.prototype.slice.call(document.querySelectorAll('#formModalBody .verif-check'));
  const kurang = boxes.filter(b => !b.checked).map(b => b.getAttribute('data-nama'));
  const catatanUser = document.getElementById('catatanVerifikasi').value.trim();
  let catatan = catatanUser;
  if (hasil === 'pending') {
    if (!catatanUser && !kurang.length) { showToast('Peringatan', 'Isi catatan kekurangan, atau biarkan persyaratan yang kurang tidak dicentang.', 'warning'); return; }
    if (!catatan) catatan = 'Belum lengkap: ' + kurang.join('; ');
  } else if (kurang.length) {
    showToast('Peringatan', 'Masih ada persyaratan yang belum dicentang.', 'warning'); return;
  }
  const v = window._verifData || {};
  const kirimWa = !!(document.getElementById('verifKirimWa') || {}).checked;
  if (kirimWa && (hasil === 'pending' || hasil === 'selesai') && v.layanan) {
    const daftar = kurang.map(x => '- ' + x);
    if (catatanUser) daftar.push((kurang.length ? 'Catatan: ' : '- ') + catatanUser);
    openWa(v.hp, isiTpl(waTpl(hasil === 'pending' ? 'wa_pending' : 'wa_langsung'), {
      nama: v.layanan.PemohonNama, layanan: v.layanan.JenisLayanan, id: layananId, instansi: instansiNama(),
      tanggal: tglPanjang(), kekurangan: daftar.join(NL), link: ''
    }));
  }
  verifikasiPanelLayananId = null;
  closeFormModal();
  const row = (window.AppState.fo || []).find(x => x.LayananID === layananId && (x.Status === 'Menunggu' || x.Status === 'Di Loket'));
  const backup = row ? Object.assign({}, row) : null;
  const boBackup = (window.AppState.bo || []).slice();
  const statusBaru = hasil === 'lanjut' ? 'Diproses' : (hasil === 'selesai' ? 'Selesai' : 'Pending');
  if (row) Object.assign(row, { Status: 'Selesai', LayananStatus: statusBaru, CatatanPending: hasil === 'pending' ? catatan : '' });
  if (hasil !== 'pending' && row && !window.AppState.bo.some(b => b.ID === layananId)) {
    const kat = katalogById(row.KatalogID);
    window.AppState.bo.push(hasil === 'lanjut'
      ? { ID: layananId, PemohonNama: row.PemohonNama, JenisLayanan: row.LayananNama, KatalogID: row.KatalogID, TanggalMulai: row.Waktu, ASNNama: '', Status: 'Diproses', TahapBO: 'Isian', ModelHasil: modelOf(kat) }
      : { ID: layananId, PemohonNama: row.PemohonNama, JenisLayanan: row.LayananNama, KatalogID: row.KatalogID, TanggalMulai: row.Waktu, TanggalSelesai: new Date().toISOString(),
          ASNNama: window.AppState.who || '', Status: 'Selesai', TahapBO: 'Selesai', ModelHasil: 'Langsung' });
  }
  pendingStart();
  renderFoTable(); saveFoToCache();
  const rollback = (msg) => {
    pendingEnd();
    if (row && backup) Object.assign(row, backup);
    window.AppState.bo = boBackup;
    renderFoTable(); saveFoToCache();
    showToast('Gagal', msg, 'danger');
  };
  gsr(res => {
    if (!res || !res.success) { rollback((res && res.message) || 'Server tidak merespons.'); return; }
    pendingEnd();
    showToast('Berhasil', hasil === 'lanjut' ? 'Status Proses — layanan masuk Back Office.' : hasil === 'selesai' ? 'Layanan Selesai di Front Office — tercatat di riwayat Back Office.' : 'Status Pending tersimpan.', 'success');
  }, err => rollback(err.message || String(err))).submitVerifikasi(layananId, catatan, hasil, null);
}

// ════════════════════════════════════════════════════════
// BAGIAN 7: BACK OFFICE — pengerjaan layanan (isian → PDF → TTE → selesai/WA)
// ════════════════════════════════════════════════════════
let boSearch = '';
/* v4: default "Semua" — layanan yang sudah selesai tidak hilang, tetap tampil sebagai riwayat. */
let boFilter = { periode: 'all', dari: '', sampai: '', status: '', kategori: '', layanan: '' };
let boRangeLoaded = 'default';
const BO_TAHAP = {
  'Isian': { label: 'Isian', cls: 'badge-netral' },
  'Menunggu TTE': { label: 'Menunggu TTE', cls: 'badge-proses' },
  'Siap Kirim': { label: 'Siap Kirim', cls: 'badge-proses' },
  'Selesai': { label: 'Selesai', cls: 'badge-selesai' }
};
function boTahap(l) { return l.Status === 'Selesai' ? 'Selesai' : (l.TahapBO || 'Isian'); }

function renderBackOffice() {
  const container = document.getElementById('section-backoffice');
  if (!document.getElementById('boTableBox')) {
    container.innerHTML = `
      <div class="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-2">
        <div>
          <h2 class="page-heading">Back Office</h2>
          <p class="page-sub mb-0">Pengerjaan layanan &amp; riwayat. Yang sudah selesai tetap tercatat di sini — klik <b>Detail</b> untuk jejak lengkap.</p>
        </div>
        <div class="d-flex gap-2 align-items-center flex-wrap">
          <span class="badge-status badge-proses" id="boCount"></span>
          <button class="btn btn-labuku-outline btn-sm-pill" id="boExportBtn" onclick="exportBoCsv()"><i class="bi bi-download"></i> Export CSV</button>
        </div>
      </div>
      <div class="lb-card filter-bar mb-3" id="boFilterBar"></div>
      <div class="table-wrap" id="boTableBox"></div>`;
  }
  renderBoFilterBar();
  renderBoTable();
}

function renderBoFilterBar() {
  const bar = document.getElementById('boFilterBar');
  if (!bar) return;
  const f = boFilter;
  const o = filterOptionsHtml(f.kategori, f.layanan);
  bar.innerHTML = `
    <div class="row g-2 align-items-end">
      <div class="col-6 col-md-2"><label class="form-label">Periode masuk</label>
        <select class="form-select form-select-sm" onchange="ubahBoPeriode(this.value)">
          ${[['all', 'Aktif + selesai bulan ini'], ['today', 'Hari ini'], ['month', 'Bulan ini'], ['range', 'Pilih tanggal (riwayat)']].map(([v, l]) => `<option value="${v}" ${v === f.periode ? 'selected' : ''}>${l}</option>`).join('')}
        </select></div>
      ${f.periode === 'range' ? `
      <div class="col-6 col-md-2"><label class="form-label">Dari</label><input type="date" class="form-control form-control-sm" id="boDari" value="${f.dari}"></div>
      <div class="col-6 col-md-2"><label class="form-label">Sampai</label><input type="date" class="form-control form-control-sm" id="boSampai" value="${f.sampai}"></div>
      <div class="col-6 col-md-1"><button class="btn btn-labuku-primary btn-sm w-100" onclick="terapkanBoRentang()">Terapkan</button></div>` : ''}
      <div class="col-6 col-md-2"><label class="form-label">Status</label>
        <select class="form-select form-select-sm" onchange="boFilter.status=this.value;renderBoTable()">
          ${[['', 'Semua'], ['aktif', 'Belum selesai'], ['Isian', 'Isian'], ['Menunggu TTE', 'Menunggu TTE'], ['Siap Kirim', 'Siap Kirim / Selesaikan'], ['Selesai', 'Selesai (riwayat)']].map(([v, l]) => `<option value="${v}" ${v === f.status ? 'selected' : ''}>${l}</option>`).join('')}
        </select></div>
      <div class="col-6 col-md-2"><label class="form-label">Kategori</label>
        <select class="form-select form-select-sm" onchange="boFilter.kategori=this.value;boFilter.layanan='';renderBoFilterBar();renderBoTable()"><option value="">Semua kategori</option>${o.kats}</select></div>
      <div class="col-6 col-md-2"><label class="form-label">Layanan</label>
        <select class="form-select form-select-sm" onchange="boFilter.layanan=this.value;renderBoTable()"><option value="">Semua layanan</option>${o.lays}</select></div>
    </div>`;
}

function ubahBoPeriode(p) {
  boFilter.periode = p;
  if (p === 'range') {
    boFilter.dari = boFilter.dari || ymd(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    boFilter.sampai = boFilter.sampai || ymd(new Date());
    renderBoFilterBar();
    return;
  }
  renderBoFilterBar();
  if (boRangeLoaded !== 'default') refreshBackOffice(false); else renderBoTable();
}

function terapkanBoRentang() {
  boFilter.dari = document.getElementById('boDari').value;
  boFilter.sampai = document.getElementById('boSampai').value || boFilter.dari;
  if (!boFilter.dari) { showToast('Peringatan', 'Isi tanggal mulai.', 'warning'); return; }
  refreshBackOffice(false);
}

function renderBoTable() {
  const box = document.getElementById('boTableBox');
  if (!box) return;
  const q = (boSearch || '').toLowerCase().trim();
  const f = boFilter;
  const r = f.periode === 'all' ? null : rangeFor(f.periode, f.dari, f.sampai);
  const all = window.AppState.bo || [];
  const list = all.filter(l => {
    const t = boTahap(l);
    if (q && !(String(l.PemohonNama).toLowerCase().includes(q) || String(l.ID).toLowerCase().includes(q) || String(l.JenisLayanan).toLowerCase().includes(q))) return false;
    if (f.status === 'aktif' && t === 'Selesai') return false;
    if (f.status && f.status !== 'aktif' && t !== f.status) return false;
    if (f.layanan && l.KatalogID !== f.layanan && (katalogById(f.layanan) || {}).NamaLayanan !== l.JenisLayanan) return false;
    if (f.kategori && kategoriOf(l) !== f.kategori) return false;
    if (r && !dalamRentang(l.TanggalMulai, r)) return false;
    return true;
  });
  window._boFiltered = list;
  const cnt = document.getElementById('boCount');
  if (cnt) cnt.innerHTML = '<i class="bi bi-briefcase"></i> ' + all.filter(l => boTahap(l) !== 'Selesai').length + ' belum selesai';
  if (list.length === 0) { box.innerHTML = emptyState('bi-briefcase', all.length ? 'Tidak ada layanan yang cocok dengan filter.' : 'Belum ada layanan yang diproses atau selesai pada periode ini.'); return; }
  box.innerHTML = `
    <table class="lb-table">
      <thead><tr><th>ID Layanan</th><th>Pemohon</th><th>Jenis Layanan</th><th>Masuk</th><th>Tahap</th><th>Dikerjakan oleh</th><th style="text-align:right;">Aksi</th></tr></thead>
      <tbody>
        ${list.map(l => {
          const t = BO_TAHAP[boTahap(l)] || BO_TAHAP.Isian;
          const model = MODEL_LIST.indexOf(l.ModelHasil) >= 0 ? l.ModelHasil : modelOf(katalogById(l.KatalogID));
          const label = t.label === 'Siap Kirim' && (model === 'Arsip' || model === 'Langsung') ? 'Siap Selesai' : t.label;
          return `
          <tr>
            <td class="fw-semibold" style="white-space:nowrap;">${escapeHtml(l.ID)}</td>
            <td>${escapeHtml(l.PemohonNama)}</td>
            <td>${escapeHtml(l.JenisLayanan)}<div class="small text-secondary">${escapeHtml(kategoriOf(l).replace(/^Layanan /, ''))} <span class="badge-status badge-model">${escapeHtml(MODEL_LABEL[model])}</span></div></td>
            <td style="white-space:nowrap;">${fmtDate(l.TanggalMulai)}${t.label === 'Selesai' && l.TanggalSelesai ? `<div class="small text-secondary">Selesai ${fmtDate(l.TanggalSelesai)}</div>` : ''}</td>
            <td><span class="badge-status ${t.cls}">${label}</span></td>
            <td>${l.ASNNama ? escapeHtml(l.ASNNama) : '<span class="text-secondary small">Belum diambil</span>'}</td>
            <td style="text-align:right;white-space:nowrap;">
              <button class="btn btn-labuku-outline btn-sm-pill" onclick="lihatDetailRiwayat('${l.ID}')"><i class="bi bi-card-list"></i> Detail</button>
              <button class="btn ${t.label === 'Selesai' ? 'btn-labuku-outline' : 'btn-labuku-primary'} btn-sm-pill" onclick="openWorkspace('${l.ID}')">${t.label === 'Selesai' ? 'Buka' : 'Kerjakan'}</button></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

function refreshBackOffice(silent, done) {
  const custom = boFilter.periode === 'range';
  const range = custom ? rangeFor('range', boFilter.dari, boFilter.sampai) : null;
  gsr(function (res) {
    if (done) done();
    if (!res || !res.success) { if (!silent) showToast('Gagal', (res && res.message) || 'Server tidak merespons.', 'danger'); return; }
    if (pendingStale()) return;
    window.AppState.bo = res.data || [];
    window.AppState.boAt = Date.now();
    boRangeLoaded = custom ? 'custom' : 'default';
    if (!custom) saveAppStateCache();
    if (window.AppState.currentSection === 'backoffice') renderBoTable();
  }, function (err) { if (done) done(); if (!silent) showToast('Error', err.message || err, 'danger'); }).getBackOffice(range);
}

// ════════════════════════════════════════════════════════
// BAGIAN 10: MODUL SERVICE WORKSPACE (PRD 5.6)
// ════════════════════════════════════════════════════════
let workspaceState = { layananId: null, activeTab: 'isian' };

function loadServiceWorkspace(layananId, initialTab) {
  const container = document.getElementById('section-workspace');
  if (!layananId) { container.innerHTML = emptyState('bi-briefcase', 'Pilih layanan dari menu Back Office.'); return; }
  container.innerHTML = loadingBlock('Memuat Service Workspace...');
  gsr()
    .withSuccessHandler(res => { if (isNullResponse(res, container, `loadServiceWorkspace('${layananId}')`)) return; renderServiceWorkspace(res, layananId, initialTab); })
    .withFailureHandler(err => { container.innerHTML = emptyState('bi-exclamation-triangle', 'Gagal memuat workspace.'); showToast('Error', err.message || err, 'danger'); })
    .getServiceWorkspace(layananId);
}

function renderServiceWorkspace(res, layananId, initialTab) {
  const container = document.getElementById('section-workspace');
  if (!res.success) { container.innerHTML = emptyState('bi-exclamation-triangle', res.message); return; }
  const d = res.data;
  const model = MODEL_LIST.indexOf(d.model) >= 0 ? d.model : 'TTE';
  d.model = model;
  workspaceState = { layananId, activeTab: model === 'Langsung' ? 'tte' : 'isian', canEdit: d.canEdit };
  /* v4: alur kerja mengikuti model hasil layanan (diatur di Katalog Layanan). */
  const TAB_HASIL = { TTE: '2. Unggah TTE &amp; Kirim', PDF: '2. Kirim Hasil', Arsip: '2. Selesaikan', Langsung: 'Selesaikan' };
  const TAB_ISIAN = { TTE: '1. Isian &amp; PDF', PDF: '1. Isian &amp; PDF', Arsip: '1. Isian &amp; PDF Arsip' };

  document.getElementById('pageTitle').textContent = 'Service Workspace — ' + d.layanan.ID;
  const tahap = d.layanan.Status === 'Selesai' ? 'Selesai' : (d.layanan.TahapBO || 'Isian');

  container.innerHTML = `
    <button class="btn btn-link ps-0 mb-2 text-decoration-none" onclick="navigateTo('backoffice')"><i class="bi bi-arrow-left"></i> Kembali ke Back Office</button>
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
      <div>
        <h2 class="page-heading mb-0">${escapeHtml(d.katalog ? d.katalog.NamaLayanan : d.layanan.JenisLayanan)} <span class="text-secondary fw-normal">#${escapeHtml(d.layanan.ID)}</span></h2>
        <div class="small text-secondary">${escapeHtml(d.layanan.PemohonNama)}${d.pemohon && d.pemohon.NoHP ? ' · ' + escapeHtml(d.pemohon.NoHP) : ''}</div>
      </div>
      <div class="text-end"><span class="badge-status ${(BO_TAHAP[tahap] || BO_TAHAP.Isian).cls}">${tahap}</span>
        <div class="small mt-1"><span class="badge-status badge-model">Model: ${escapeHtml(MODEL_LABEL[model])}</span></div></div>
    </div>

    <div class="doc-tab-nav">
      ${model === 'Langsung' ? '' : `<div class="doc-tab-link active" data-tab="isian" onclick="switchWorkspaceTab('isian')">${TAB_ISIAN[model]}</div>`}
      <div class="doc-tab-link ${model === 'Langsung' ? 'active' : ''}" data-tab="tte" onclick="switchWorkspaceTab('tte')">${TAB_HASIL[model]}</div>
      <div class="doc-tab-link" data-tab="knowledge" onclick="switchWorkspaceTab('knowledge')">SOP / WI / Template</div>
      <div class="doc-tab-link" data-tab="eksternal" onclick="switchWorkspaceTab('eksternal')">Link Eksternal</div>
    </div>

    <div id="wsTabContent"></div>
  `;
  window._wsData = d;
  if (initialTab === 'hasil' || (model === 'Langsung' && (!initialTab || initialTab === 'isian'))) initialTab = 'tte';
  if (initialTab && initialTab !== 'isian') switchWorkspaceTab(initialTab);
  else renderWorkspaceTab('isian');
}

function switchWorkspaceTab(tab) {
  workspaceState.activeTab = tab;
  document.querySelectorAll('.doc-tab-link').forEach(el => el.classList.toggle('active', el.dataset.tab === tab));
  renderWorkspaceTab(tab);
}

function renderWorkspaceTab(tab) {
  const d = window._wsData;
  const target = document.getElementById('wsTabContent');
  if (!target || !d) return;
  if (tab === 'isian') target.innerHTML = buildWorkspaceIsianTab(d);
  else if (tab === 'knowledge') target.innerHTML = buildWorkspaceKnowledgeTab(d);
  else if (tab === 'eksternal') target.innerHTML = buildWorkspaceEksternalTab(d);
  else if (tab === 'tte') target.innerHTML = buildWorkspaceTteTab(d);
}

function dokumenByKategori(d, kat) {
  return (d.dokumen || []).filter(doc => (doc.Kategori || 'Hasil') === kat)
    .sort((a, b) => new Date(a.WaktuUpload) - new Date(b.WaktuUpload));
}

function driveDownloadUrl(fileUrl) {
  const m = String(fileUrl || '').match(/[-\w]{25,}/);
  return m ? 'https:' + String.fromCharCode(47, 47) + 'drive.google.com/uc?export=download&id=' + m[0] : fileUrl;
}

function dokumenListHtml(list, emptyText) {
  if (!list.length) return `<p class="small text-secondary mb-0">${emptyText}</p>`;
  return list.slice().reverse().map(doc => `
    <div class="d-flex justify-content-between align-items-center gap-2 py-2" style="border-bottom:1px solid var(--outline);">
      <div class="small"><div class="fw-semibold">${escapeHtml(doc.NamaFile)}</div>
        <div class="text-secondary" style="font-size:.72rem;">${escapeHtml(doc.DiuploadOleh)} · ${fmtDateTime(doc.WaktuUpload)}</div></div>
      <div class="d-flex gap-1">
        <a class="btn btn-sm btn-labuku-outline" href="${escapeHtml(driveDownloadUrl(doc.FileURL))}" target="_blank" rel="noopener" title="Unduh"><i class="bi bi-download"></i></a>
        <a class="btn btn-sm btn-labuku-outline" href="${escapeHtml(doc.FileURL)}" target="_blank" rel="noopener" title="Buka"><i class="bi bi-box-arrow-up-right"></i></a>
      </div>
    </div>`).join('');
}

/** Tab 1: field isian surat (diatur per layanan di Katalog) + data pemohon otomatis → PDF. */
function buildWorkspaceIsianTab(d) {
  const fields = d.fields || [];
  const isian = d.isian || {};
  const auto = d.autoData || {};
  const KAT_DOK = { TTE: 'Draft', PDF: 'Hasil', Arsip: 'Arsip' };
  const JUDUL_DOK = { TTE: 'PDF Draft (untuk di-TTE)', PDF: 'PDF Hasil (dikirim ke pemohon)', Arsip: 'PDF Arsip (tidak dikirim)' };
  const LANJUT = { TTE: 'Lanjut: Unggah PDF ber-TTE', PDF: 'Lanjut: Kirim hasil via WA', Arsip: 'Lanjut: Selesaikan layanan' };
  const drafts = dokumenByKategori(d, KAT_DOK[d.model] || 'Draft');
  const selesai = d.layanan.Status === 'Selesai';
  return `
    <div class="row g-3">
      <div class="col-lg-7">
        <div class="lb-card mb-3">
          <h6 class="fw-bold mb-1">Field Isian Surat</h6>
          <p class="small text-secondary mb-3">${d.template
            ? 'Template: <strong>' + escapeHtml(d.template.NamaDokumen) + '</strong> (Google Docs). Penanda di template diganti isian berikut — klik penanda untuk menyalinnya.'
            : '<span class="text-danger">Template Google Docs untuk layanan ini belum ada di Katalog (Tipe: Template).</span> PDF yang dibuat berupa ringkasan isian.'}</p>
          ${fields.length === 0 ? '<p class="small text-secondary">Field isian belum diatur. Tambahkan di menu Katalog Layanan → pilih layanan → Edit Layanan → "Field isian surat" (satu per baris).</p>' : ''}
          <form id="isianForm" onsubmit="event.preventDefault(); simpanIsianPdf();">
            ${fields.map((f, i) => `
              <div class="mb-2"><label class="form-label d-flex justify-content-between align-items-center gap-2">${escapeHtml(f)} ${chipSalin(f)}</label>
                <input type="text" class="form-control isian-field" data-field="${escapeHtml(f)}" id="isian_${i}" value="${escapeHtml(isian[f] !== undefined ? isian[f] : (auto[f] !== undefined ? auto[f] : ''))}" ${selesai ? 'disabled' : ''}></div>`).join('')}
            <details class="mt-2 mb-3"><summary class="small fw-semibold">Data otomatis (tanpa perlu diisi) — klik penanda untuk menyalin</summary>
              <div class="small mt-2">${Object.keys(auto).map(k => `<div class="mb-1">${chipSalin(k)} = ${escapeHtml(auto[k] || '-')}</div>`).join('')}</div>
            </details>
            ${selesai ? '' : `<button type="submit" class="btn btn-labuku-primary w-100" id="isianBtn"><i class="bi bi-file-earmark-pdf"></i> Simpan &amp; Buat PDF</button>`}
          </form>
        </div>
      </div>
      <div class="col-lg-5">
        <div class="lb-card mb-3">
          <h6 class="fw-bold mb-2">${JUDUL_DOK[d.model] || JUDUL_DOK.TTE}</h6>
          ${dokumenListHtml(drafts, 'Belum ada PDF. Isi field lalu klik "Simpan &amp; Buat PDF".')}
          ${drafts.length && !selesai ? '<button class="btn btn-labuku-outline w-100 mt-3" onclick="switchWorkspaceTab(&#39;tte&#39;)">' + (LANJUT[d.model] || LANJUT.TTE) + ' <i class="bi bi-arrow-right"></i></button>' : ''}
        </div>
        <div class="lb-card">
          <h6 class="fw-bold mb-3">Log Aktivitas</h6>
          ${d.jejak.length === 0 ? '<p class="small text-secondary mb-0">Belum ada aktivitas.</p>' : d.jejak.slice(0, 8).map(j => `
            <div class="timeline-item"><div class="timeline-dot"></div>
              <div><div class="timeline-title">${escapeHtml(j.Aksi)}</div><div class="timeline-time">${escapeHtml(j.Oleh)} · ${fmtDateTime(j.Waktu)}</div>${j.Keterangan ? `<div class="small text-secondary">${escapeHtml(j.Keterangan)}</div>` : ''}</div>
            </div>`).join('')}
        </div>
      </div>
    </div>`;
}

/** v5: unduh PDF langsung dari data yang dikirim server (tanpa membuka Drive). false bila tidak bisa. */
function unduhPdfBase64(b64, nama) {
  if (!b64) return false;
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url; a.download = nama || 'dokumen.pdf';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return true;
  } catch (e) { return false; }
}

function simpanIsianPdf() {
  const values = {};
  document.querySelectorAll('#isianForm .isian-field').forEach(el => { values[el.dataset.field] = el.value.trim(); });
  const btn = document.getElementById('isianBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-inline"></span> Membuat PDF...'; }
  const layananId = workspaceState.layananId;
  gsr(res => {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-file-earmark-pdf"></i> Simpan &amp; Buat PDF'; }
    if (!res || !res.success) { showToast('Gagal', (res && res.message) || 'Server tidak merespons.', 'danger'); return; }
    const b = (window.AppState.bo || []).find(x => x.ID === layananId);
    if (b) { b.TahapBO = res.data && res.data.model && res.data.model !== 'TTE' ? 'Siap Kirim' : 'Menunggu TTE'; saveAppStateCache(); }
    const unduh = unduhPdfBase64(res.data && res.data.pdfBase64, res.data && res.data.fileName);
    showToast('Berhasil', res.message + (unduh ? ' PDF otomatis diunduh.' : ' Unduh lewat tombol di daftar PDF.'), 'success');
    loadServiceWorkspace(layananId, 'isian');
  }, err => {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-file-earmark-pdf"></i> Simpan &amp; Buat PDF'; }
    showToast('Error', err.message || err, 'danger');
  }).simpanIsianDanBuatPdf(layananId, values);
}

/** PDF yang dikirim ke pemohon: PDF ber-TTE terbaru (cadangan: PDF Hasil versi lama). */
function latestHasilPdf(d) {
  const isPdf = (doc) => doc.MimeType === 'application/pdf' || /\.pdf$/i.test(String(doc.NamaFile || ''));
  const tte = dokumenByKategori(d, 'TTE').filter(isPdf);
  if (tte.length) return tte[tte.length - 1];
  const lama = dokumenByKategori(d, 'Hasil').filter(isPdf);
  return lama.length ? lama[lama.length - 1] : null;
}

/** Tab 2 sesuai model: TTE (unggah bila dikirim WA) · PDF (kirim tautan) · Arsip/Langsung (WA selesai tanpa PDF). */
function buildWorkspaceTteTab(d) {
  if (d.model === 'PDF' || d.model === 'Arsip' || d.model === 'Langsung') return buildWorkspaceSelesaiTab(d);
  const pdf = latestHasilPdf(d);
  const selesai = d.layanan.Status === 'Selesai';
  const hp = d.pemohon ? d.pemohon.NoHP : '';
  return `
    <div class="row g-3">
      <div class="col-lg-6">
        <div class="lb-card mb-3">
          <h6 class="fw-bold mb-2"><i class="bi bi-cloud-upload"></i> Unggah PDF ber-TTE</h6>
          <p class="small text-secondary">Unduh PDF draft di tab 1, tandatangani (TTE/SRIKANDI). Unggah di sini <b>hanya bila hasil akan dikirim via WA</b>; bila tidak, cukup "Selesai tanpa WA". Hanya PDF, maks 10MB.</p>
          <label class="dropzone mb-2 ${selesai ? 'disabled' : ''}" id="wsDrop" for="wsFileInput"
            ondragover="event.preventDefault();this.classList.add('over')" ondragleave="this.classList.remove('over')" ondrop="dropPdfTte(event)">
            <i class="bi bi-file-earmark-arrow-up"></i>
            <span class="dz-teks" id="wsDropTeks">Seret &amp; lepas PDF ber-TTE di sini, atau klik untuk memilih file</span>
            <input type="file" class="dz-input" id="wsFileInput" accept="application/pdf,.pdf" ${selesai ? 'disabled' : ''} onchange="tampilNamaPdf()">
          </label>
          <button class="btn btn-labuku-primary w-100" id="wsUploadBtn" onclick="uploadWorkspaceFile()" ${selesai ? 'disabled' : ''}><i class="bi bi-upload"></i> Unggah PDF TTE</button>
        </div>
        <div class="lb-card">
          <h6 class="fw-bold mb-2">PDF ber-TTE</h6>
          ${dokumenListHtml(dokumenByKategori(d, 'TTE').concat(dokumenByKategori(d, 'Hasil')), 'Belum ada PDF ber-TTE yang diunggah.')}
        </div>
      </div>
      <div class="col-lg-6">
        <div class="lb-card">
          <h6 class="fw-bold mb-2"><i class="bi bi-check2-circle"></i> ${selesai ? 'Layanan Selesai' : 'Selesaikan Layanan'}</h6>
          ${pdf ? `<p class="small mb-2">PDF untuk pemohon: <strong>${escapeHtml(pdf.NamaFile)}</strong></p>` : '<p class="small text-danger mb-2">Kirim WA: unggah PDF ber-TTE terlebih dahulu. Tanpa WA: langsung "Selesai tanpa WA".</p>'}
          <p class="small text-secondary">WhatsApp ke: ${hp ? escapeHtml(hp) : '<span class="text-danger">nomor pemohon belum ada</span>'}. Pesan berisi tautan PDF yang bisa dibuka &amp; diunduh pemohon (siapa pun yang memegang tautan dapat membukanya).</p>
          ${selesai
            ? `<button class="btn btn-labuku-accent w-100" ${pdf ? '' : 'disabled'} onclick="kirimWaHasil()"><i class="bi bi-whatsapp"></i> Kirim Ulang WA</button>`
            : `<button class="btn btn-labuku-primary w-100 py-2" ${pdf ? '' : 'disabled'} onclick="selesaiDanKirimWa()"><i class="bi bi-whatsapp"></i> Selesai &amp; Kirim WA</button>
               <button class="btn btn-labuku-outline w-100 mt-2" onclick="selesaikanLayananUI('${d.layanan.ID}')"><i class="bi bi-check-circle"></i> Selesai tanpa WA</button>`}
        </div>
      </div>
    </div>`;
}

function buildWorkspaceKnowledgeTab(d) {
  if (d.knowledge.length === 0) return emptyState('bi-journal-x', 'Belum ada SOP/WI/Template untuk layanan ini.');
  return `
    <div class="table-wrap">
      <table class="lb-table">
        <thead><tr><th>Kode</th><th>Nama Dokumen</th><th>Tipe</th><th>Tgl. Efektif</th><th></th></tr></thead>
        <tbody>
          ${d.knowledge.map(k => `
            <tr>
              <td>${escapeHtml(k.KodeDokumen)}</td>
              <td>${escapeHtml(k.NamaDokumen)}</td>
              <td><span class="badge-status badge-netral">${escapeHtml(labelTipe(k.Tipe))}</span></td>
              <td>${escapeHtml(fmtDate(k.TglEfektif))}</td>
              <td style="text-align:right;"><i class="bi bi-download text-secondary" style="cursor:pointer;" title="Buka Dokumen" onclick="bukaDokumenKnowledge('${escapeHtml(k.LinkURL || '')}')"></i></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/* v5: Link eksternal bersama (semua layanan) — buka, tambah, edit, hapus langsung di Workspace. */
function linksSaatIni() { return ((window.AppState.config && window.AppState.config.links) || []).slice(); }

function buildWorkspaceEksternalTab(d) {
  const links = linksSaatIni();
  return `
    <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
      <span class="small text-secondary">Link berlaku untuk semua layanan. Perubahan langsung tersimpan untuk seluruh tim.</span>
      <button class="btn btn-labuku-primary btn-sm-pill" onclick="formLinkEksternal(-1)"><i class="bi bi-plus-lg"></i> Tambah Link</button>
    </div>
    <div id="linkFormBox"></div>
    <div class="row g-3">
      ${links.length === 0 ? `<div class="col-12">${emptyState('bi-link-45deg', 'Belum ada link. Klik "Tambah Link".')}</div>` : links.map((l, i) => `
      <div class="col-md-6 col-xl-4">
        <div class="lb-card h-100 d-flex flex-column">
          <div class="d-flex justify-content-between align-items-start gap-2">
            <h6 class="fw-bold mb-1"><i class="bi bi-box-arrow-up-right"></i> ${escapeHtml(l.nama)}</h6>
            <div class="d-flex gap-1">
              <button class="btn btn-sm btn-labuku-outline" title="Edit" onclick="formLinkEksternal(${i})"><i class="bi bi-pencil"></i></button>
              <button class="btn btn-sm btn-labuku-outline" title="Hapus" onclick="hapusLinkEksternal(${i})"><i class="bi bi-trash text-danger"></i></button>
            </div>
          </div>
          <p class="small text-secondary mb-2 flex-grow-1">${escapeHtml(l.ket || '')}<span class="d-block text-truncate" style="opacity:.7">${escapeHtml(l.url)}</span></p>
          <a href="${escapeHtml(l.url)}" target="_blank" rel="noopener" class="btn btn-labuku-outline w-100">Buka ${escapeHtml(l.nama)}</a>
        </div>
      </div>`).join('')}
    </div>
  `;
}

function formLinkEksternal(i) {
  const l = i >= 0 ? linksSaatIni()[i] : { nama: '', url: '', ket: '' };
  const box = document.getElementById('linkFormBox');
  if (!box || !l) return;
  box.innerHTML = `
    <div class="lb-card mb-3">
      <div class="row g-2 align-items-end">
        <div class="col-md-3"><label class="form-label">Nama</label><input class="form-control" id="lkNama" maxlength="60" value="${escapeHtml(l.nama)}" placeholder="mis. SIMAS"></div>
        <div class="col-md-5"><label class="form-label">URL</label><input class="form-control" id="lkUrl" value="${escapeHtml(l.url)}" placeholder="awali dengan https:"></div>
        <div class="col-md-4"><label class="form-label">Keterangan <span class="text-secondary fw-normal">(opsional)</span></label><input class="form-control" id="lkKet" maxlength="120" value="${escapeHtml(l.ket || '')}"></div>
      </div>
      <div class="d-flex gap-2 mt-2">
        <button class="btn btn-labuku-primary btn-sm-pill" onclick="simpanLinkUI(${i})"><i class="bi bi-save"></i> Simpan</button>
        <button class="btn btn-labuku-outline btn-sm-pill" onclick="document.getElementById('linkFormBox').innerHTML=''">Batal</button>
      </div>
    </div>`;
  document.getElementById('lkNama').focus();
}

function simpanLinkUI(i) {
  const item = { nama: document.getElementById('lkNama').value.trim(), url: document.getElementById('lkUrl').value.trim(), ket: document.getElementById('lkKet').value.trim() };
  if (!item.nama || !/^https?:/i.test(item.url)) { showToast('Peringatan', 'Isi nama dan URL yang diawali http: atau https:', 'warning'); return; }
  const list = linksSaatIni();
  if (i >= 0) list[i] = item; else list.push(item);
  kirimLinkEksternal(list);
}

function hapusLinkEksternal(i) {
  const list = linksSaatIni();
  const l = list[i];
  if (!l) return;
  confirmAction('Hapus link?', 'Link "' + l.nama + '" akan dihapus untuk semua layanan.', () => { list.splice(i, 1); kirimLinkEksternal(list); });
}

/** Optimistic: tampilan langsung berubah, disimpan di latar belakang, dikembalikan bila gagal. */
function kirimLinkEksternal(list) {
  const lama = linksSaatIni();
  window.AppState.config.links = list;
  saveAppStateCache();
  if (workspaceState.activeTab === 'eksternal') renderWorkspaceTab('eksternal');
  gsr(res => {
    if (!res || !res.success) {
      window.AppState.config.links = lama; saveAppStateCache();
      if (workspaceState.activeTab === 'eksternal') renderWorkspaceTab('eksternal');
      showToast('Gagal', (res && res.message) || 'Server tidak merespons.', 'danger');
      return;
    }
    window.AppState.config.links = res.data; saveAppStateCache();
    showToast('Berhasil', 'Link eksternal disimpan.', 'success');
  }, err => {
    window.AppState.config.links = lama; saveAppStateCache();
    if (workspaceState.activeTab === 'eksternal') renderWorkspaceTab('eksternal');
    showToast('Error', err.message || err, 'danger');
  }).simpanLinkEksternal(list);
}

/** Tab "Kirim Hasil / Selesaikan" untuk model PDF (tautan PDF), Arsip & Langsung (WA selesai tanpa PDF). */
function buildWorkspaceSelesaiTab(d) {
  const selesai = d.layanan.Status === 'Selesai';
  const hp = d.pemohon ? d.pemohon.NoHP : '';
  const butuhPdf = d.model === 'PDF';
  const pdf = butuhPdf ? latestHasilPdf(d) : null;
  const arsip = dokumenByKategori(d, 'Arsip');
  const info = d.model === 'PDF'
    ? (pdf ? `<p class="small mb-2">PDF hasil (tanpa TTE) yang dikirim: <strong>${escapeHtml(pdf.NamaFile)}</strong></p>` : '<p class="small text-danger mb-2">Buat PDF hasil di tab 1 terlebih dahulu.</p>')
    : d.model === 'Arsip'
      ? (arsip.length ? `<p class="small mb-2">PDF arsip tersimpan: <strong>${escapeHtml(arsip[arsip.length - 1].NamaFile)}</strong> (tidak dikirim ke pemohon).</p>` : '<p class="small text-warning mb-2">Belum ada PDF arsip. Disarankan isi field &amp; buat PDF di tab 1 sebelum menyelesaikan.</p>')
      : '<p class="small mb-2">Layanan tanpa isian (mis. legalisir). Biasanya sudah diselesaikan di Front Office.</p>';
  const ket = d.model === 'PDF' ? 'Pesan berisi tautan PDF yang bisa dibuka &amp; diunduh pemohon.' : 'Pesan pemberitahuan layanan selesai (tanpa PDF).';
  return `
    <div class="row g-3">
      <div class="col-lg-6">
        <div class="lb-card">
          <h6 class="fw-bold mb-2"><i class="bi bi-check2-circle"></i> ${selesai ? 'Layanan Selesai' : 'Selesaikan Layanan'}</h6>
          ${info}
          <p class="small text-secondary">WhatsApp ke: ${hp ? escapeHtml(hp) : '<span class="text-danger">nomor pemohon belum ada</span>'}. ${ket}</p>
          ${selesai
            ? `<button class="btn btn-labuku-accent w-100" ${butuhPdf && !pdf ? 'disabled' : ''} onclick="kirimWaHasil()"><i class="bi bi-whatsapp"></i> Kirim Ulang WA</button>`
            : `<button class="btn btn-labuku-primary w-100 py-2" ${butuhPdf && !pdf ? 'disabled' : ''} onclick="selesaiDanKirimWa()"><i class="bi bi-whatsapp"></i> Selesai &amp; Kirim WA</button>
               <button class="btn btn-labuku-outline w-100 mt-2" onclick="selesaikanLayananUI('${d.layanan.ID}')"><i class="bi bi-check-circle"></i> Selesai tanpa WA</button>`}
        </div>
      </div>
      <div class="col-lg-6">
        <div class="lb-card">
          <h6 class="fw-bold mb-2">Dokumen layanan</h6>
          ${dokumenListHtml((d.dokumen || []).slice().sort((a, b) => new Date(a.WaktuUpload) - new Date(b.WaktuUpload)), 'Belum ada dokumen.')}
        </div>
      </div>
    </div>`;
}

function pesanWaHasil(d, pdf) {
  const KEY = { TTE: 'wa_tte', PDF: 'wa_pdf', Arsip: 'wa_arsip', Langsung: 'wa_langsung' };
  return isiTpl(waTpl(KEY[d.model] || 'wa_tte'), {
    nama: d.layanan.PemohonNama || '', layanan: d.layanan.JenisLayanan, id: d.layanan.ID, instansi: instansiNama(),
    tanggal: tglPanjang(), link: pdf ? pdf.FileURL : ''
  });
}

function butuhPdfWa(d) { return d.model !== 'Arsip' && d.model !== 'Langsung'; }

function kirimWaHasil() {
  const d = window._wsData;
  const pdf = d ? latestHasilPdf(d) : null;
  if (d && butuhPdfWa(d) && !pdf) { showToast('Peringatan', d.model === 'PDF' ? 'Buat PDF hasil terlebih dahulu.' : 'Unggah PDF ber-TTE terlebih dahulu.', 'warning'); return; }
  openWa(d.pemohon ? d.pemohon.NoHP : '', pesanWaHasil(d, pdf));
}

function tandaiBoSelesai(layananId) {
  const b = (window.AppState.bo || []).find(x => x.ID === layananId);
  if (b) { b.Status = 'Selesai'; b.TahapBO = 'Selesai'; }
  saveAppStateCache();
}

/**
 * Optimistic: WhatsApp dibuka seketika (masih dalam klik, tidak diblokir popup),
 * status Selesai disimpan ke server di latar belakang; dikembalikan bila gagal.
 */
function selesaiDanKirimWa() {
  const d = window._wsData;
  if (!d) return;
  const pdf = latestHasilPdf(d);
  if (butuhPdfWa(d) && !pdf) { showToast('Peringatan', d.model === 'PDF' ? 'Buat PDF hasil terlebih dahulu.' : 'Unggah PDF ber-TTE terlebih dahulu.', 'warning'); return; }
  if (!openWa(d.pemohon ? d.pemohon.NoHP : '', pesanWaHasil(d, butuhPdfWa(d) ? pdf : null))) return;
  const layananId = d.layanan.ID;
  const prevStatus = d.layanan.Status;
  const boBackup = JSON.parse(JSON.stringify(window.AppState.bo || []));
  d.layanan.Status = 'Selesai';
  tandaiBoSelesai(layananId);
  renderWorkspaceTab('tte');
  const rollback = (msg) => {
    d.layanan.Status = prevStatus; window.AppState.bo = boBackup; saveAppStateCache();
    if (window._wsData === d) renderWorkspaceTab('tte');
    showToast('Gagal menyimpan status Selesai', msg, 'danger');
  };
  gsr(res => {
    if (!res || !res.success) { rollback((res && res.message) || 'Server tidak merespons.'); return; }
    showToast('Berhasil', 'Layanan Selesai & pesan WA disiapkan.', 'success');
  }, err => rollback(err.message || String(err))).selesaikanLayanan(layananId);
}

/** v5: area unggah TTE yang bisa diseret-lepas. */
function dropPdfTte(ev) {
  ev.preventDefault();
  const zone = document.getElementById('wsDrop');
  if (zone) zone.classList.remove('over');
  const input = document.getElementById('wsFileInput');
  if (!input || input.disabled || !ev.dataTransfer || !ev.dataTransfer.files.length) return;
  try { const dt = new DataTransfer(); dt.items.add(ev.dataTransfer.files[0]); input.files = dt.files; } catch (e) { return; }
  tampilNamaPdf();
}
function tampilNamaPdf() {
  const input = document.getElementById('wsFileInput');
  const t = document.getElementById('wsDropTeks');
  const f = input && input.files && input.files[0];
  if (t) t.textContent = f ? 'Dipilih: ' + f.name + ' — klik "Unggah PDF TTE"' : 'Seret & lepas PDF ber-TTE di sini, atau klik untuk memilih file';
  const zone = document.getElementById('wsDrop');
  if (zone) zone.classList.toggle('ada', !!f);
}

function uploadWorkspaceFile() {
  const input = document.getElementById('wsFileInput');
  const file = input.files[0];
  if (!file) { showToast('Peringatan', 'Pilih file PDF terlebih dahulu.', 'warning'); return; }
  if (!(file.type === 'application/pdf' || /\.pdf$/i.test(file.name))) { showToast('Peringatan', 'File TTE harus berformat PDF.', 'warning'); return; }
  if (file.size > 10 * 1024 * 1024) { showToast('Peringatan', 'Ukuran file maksimal 10MB.', 'warning'); return; }
  const btn = document.getElementById('wsUploadBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-inline"></span> Mengunggah...'; }
  const layananId = workspaceState.layananId;

  const reader = new FileReader();
  reader.onload = () => {
    const base64 = reader.result.split(',')[1];
    gsr()
      .withSuccessHandler(res => {
        if (res && res.success) {
          const b = (window.AppState.bo || []).find(x => x.ID === layananId);
          if (b) { b.TahapBO = 'Siap Kirim'; saveAppStateCache(); }
          showToast('Berhasil', 'PDF ber-TTE berhasil diunggah.', 'success');
          loadServiceWorkspace(layananId, 'tte');
        } else { showToast('Gagal', (res && res.message) || 'Server tidak merespons.', 'danger'); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-upload"></i> Unggah PDF TTE'; } }
      })
      .withFailureHandler(err => { showToast('Error', err.message || err, 'danger'); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-upload"></i> Unggah PDF TTE'; } })
      .uploadDokumenLayanan(layananId, base64, file.name, 'application/pdf', 'TTE');
  };
  reader.readAsDataURL(file);
}

function selesaikanLayananUI(layananId) {
  confirmAction('Selesaikan Layanan?', 'Siklus layanan ini akan ditutup tanpa mengirim WhatsApp.', () => {
    gsr()
      .withSuccessHandler(res => {
        if (res.success) {
          tandaiBoSelesai(layananId);
          showToast('Berhasil', res.message, 'success'); navigateTo('backoffice');
        }
        else showToast('Gagal', res.message, 'danger');
      })
      .withFailureHandler(err => showToast('Error', err.message || err, 'danger'))
      .selesaikanLayanan(layananId);
  });
}

// ════════════════════════════════════════════════════════
// BAGIAN 11: MODUL KATALOG LAYANAN (v5: dimuat SEKALI, kategori instan; SOP & Regulasi per kategori)
// ════════════════════════════════════════════════════════
/*
 * Kategori → Layanan → pengetahuan layanan. v5:
 * - Seluruh katalog + dokumen dimuat dalam SATU panggilan (getKatalogLengkap, di-cache server &
 *   disimpan lokal) → berpindah kategori/layanan tanpa menunggu server.
 * - SOP & Regulasi dipasang per KATEGORI (bisa beberapa PDF sekaligus) dan otomatis tampil di
 *   semua layanan kategori itu. Petunjuk Teknis (gabungan Instruksi Kerja + Tutorial) & Template per layanan.
 * - Tombol tambah/edit/hapus hanya untuk Kepala KUA (kelas admin-only).
 */
let knowledgeActiveKategori = null;
let knowledgeActiveLayanan = null;
let katalogMuat = false;

function katalogLengkap() { return window.AppState.katalogLengkap || null; }

function muatKatalogLengkap(force, done) {
  if (katalogMuat && !force) { if (done) done(); return; }
  katalogMuat = true;
  gsr(res => {
    katalogMuat = false;
    if (done) done();
    if (!res || !res.success) { if (!katalogLengkap()) { const b = document.getElementById('knowledgeContentBox'); if (b) b.innerHTML = emptyState('bi-exclamation-triangle', (res && res.message) || 'Gagal memuat katalog.'); } return; }
    window.AppState.katalogLengkap = res.data;
    window.AppState.katalogAt = Date.now();
    sinkronKatalogAktif();
    saveAppStateCache();
    if (window.AppState.currentSection === 'knowledge') renderKnowledgeView();
  }, err => { katalogMuat = false; if (done) done(); showToast('Error', err.message || err, 'danger'); }).getKatalogLengkap(!!force);
}

/** Daftar layanan aktif untuk Front Office/filter diturunkan dari katalog lengkap (tanpa panggilan tambahan). */
function sinkronKatalogAktif() {
  const L = katalogLengkap();
  if (!L) return;
  const pakai = {};
  (window.AppState.katalog || []).forEach(k => { pakai[k.ID] = k.Pemakaian || 0; });
  window.AppState.katalog = L.katalog.filter(k => k.Aktif === 'Ya').map(k => Object.assign({}, k, { Pemakaian: pakai[k.ID] || 0 }));
}

function renderKnowledgeShell() {
  const container = document.getElementById('section-knowledge');
  if (!knowledgeActiveKategori) knowledgeActiveKategori = KATEGORI_LAYANAN_RESMI[0];
  container.innerHTML = `
    <div class="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-2">
      <div>
        <h2 class="page-heading">Katalog Layanan</h2>
        <p class="page-sub mb-0">Pilih kategori → pilih layanan. SOP &amp; Regulasi dipasang per kategori; Petunjuk Teknis &amp; Template per layanan.</p>
      </div>
      <button class="btn btn-labuku-primary admin-only" onclick="openKatalogForm(null, knowledgeActiveKategori)"><i class="bi bi-plus-lg"></i> Tambah Layanan</button>
    </div>
    <div class="row g-3">
      <div class="col-lg-3">
        <div class="lb-card">
          <div class="fw-bold small text-secondary mb-2" style="text-transform:uppercase;letter-spacing:.04em;">Kategori Layanan</div>
          <ul class="knowledge-cat-list" id="knowledgeCatList"></ul>
        </div>
      </div>
      <div class="col-lg-9"><div id="knowledgeContentBox"></div></div>
    </div>`;
  renderKnowledgeCatList();
  if (katalogLengkap()) renderKnowledgeView();
  else document.getElementById('knowledgeContentBox').innerHTML = loadingBlock('Memuat katalog...');
  if (!katalogLengkap() || !masihSegar(window.AppState.katalogAt)) muatKatalogLengkap(false);
}

function renderKnowledgeView() {
  renderKnowledgeCatList();
  const L = katalogLengkap();
  if (!L) return;
  if (knowledgeActiveLayanan && L.katalog.some(k => k.ID === knowledgeActiveLayanan)) renderKnowledgeLayanan(knowledgeActiveLayanan);
  else { knowledgeActiveLayanan = null; renderKnowledgeContent(knowledgeActiveKategori); }
}

function renderKnowledgeCatList() {
  const ul = document.getElementById('knowledgeCatList');
  if (!ul) return;
  const counts = {};
  const sumber = katalogLengkap() ? katalogLengkap().katalog.filter(k => k.Aktif === 'Ya') : (window.AppState.katalog || []);
  sumber.forEach(k => { counts[k.Kategori] = (counts[k.Kategori] || 0) + 1; });
  ul.innerHTML = KATEGORI_LAYANAN_RESMI.map(k => `
    <li class="knowledge-cat-item ${k === knowledgeActiveKategori ? 'active' : ''}" data-kat="${escapeHtml(k)}" onclick="selectKnowledgeKategori(this.dataset.kat)">
      <i class="bi ${KATEGORI_ICON[k] || 'bi-folder'}"></i> <span class="flex-grow-1">${escapeHtml(k.replace(/^Layanan /, ''))}</span><span class="small text-secondary">${counts[k] || 0}</span>
    </li>`).join('');
}

const KATEGORI_ICON = {
  'Layanan Perkawinan dan Pencatatan Nikah': 'bi-heart',
  'Layanan Bimbingan dan Konseling Keluarga': 'bi-people',
  'Layanan Kemasjidan': 'bi-building',
  'Layanan Konsultasi dan Bimbingan Keagamaan': 'bi-chat-dots',
  'Layanan Zakat dan Wakaf': 'bi-hand-thumbs-up',
  'Layanan Data dan Kelembagaan Keagamaan': 'bi-database',
  'Layanan Administrasi dan Tata Kelola KUA': 'bi-clipboard-check',
  'Layanan Jaminan Produk Halal': 'bi-patch-check',
  'Layanan Lain-lain': 'bi-three-dots'
};

function selectKnowledgeKategori(kategori) {
  knowledgeActiveKategori = kategori;
  knowledgeActiveLayanan = null;
  document.querySelectorAll('#knowledgeCatList .knowledge-cat-item').forEach(el => el.classList.toggle('active', el.dataset.kat === kategori));
  renderKnowledgeContent(kategori);
}

/** Kompatibilitas (dipanggil versi lama): kini cukup render dari data lokal / muat ulang. */
function loadKnowledgeContent(kategori, forceRefresh) {
  if (forceRefresh) muatKatalogLengkap(true); else renderKnowledgeContent(kategori);
}

function dokKategori(kategori, tipe) {
  const L = katalogLengkap();
  return L ? L.knowledge.filter(k => !k.KatalogID && k.Kategori === kategori && k.Tipe === tipe) : [];
}

function docRowHtml(k, bisaUbah) {
  return `
    <div class="d-flex justify-content-between align-items-center gap-2 pt-2 mt-2" style="border-top:1px solid var(--outline);">
      <div class="small"><i class="bi bi-file-earmark-pdf text-secondary"></i> <span class="fw-semibold">${escapeHtml(k.NamaDokumen)}</span> <span class="text-secondary">· ${escapeHtml(k.KodeDokumen)}${k.TglEfektif ? ' · ' + escapeHtml(fmtDate(k.TglEfektif)) : ''}</span></div>
      <div class="d-flex gap-1 flex-shrink-0">
        <button class="btn btn-sm btn-labuku-outline" title="Buka" onclick="bukaDokumenKnowledge('${escapeHtml(k.LinkURL || '')}')"><i class="bi bi-box-arrow-up-right"></i></button>
        ${bisaUbah ? `<button class="btn btn-sm btn-labuku-outline admin-only" title="Edit" onclick="openKnowledgeFormById('${k.ID}')"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-labuku-outline admin-only" title="Hapus" onclick="hapusKnowledgeUI('${k.ID}')"><i class="bi bi-trash text-danger"></i></button>` : ''}
      </div>
    </div>`;
}

function renderKnowledgeContent(kategori) {
  const box = document.getElementById('knowledgeContentBox');
  const L = katalogLengkap();
  if (!box || !L) return;
  const layananKategori = L.katalog.filter(k => k.Kategori === kategori);
  const tombolTambah = `<button class="btn btn-labuku-outline btn-sm-pill admin-only" onclick="openKatalogForm(null, knowledgeActiveKategori)"><i class="bi bi-plus-lg"></i> Tambah layanan di kategori ini</button>`;
  const katDocs = ['SOP', 'Regulasi'].map(t => {
    const list = dokKategori(kategori, t);
    return `
      <div class="col-md-6">
        <div class="d-flex justify-content-between align-items-center gap-2"><div class="fw-semibold">${t} <span class="small text-secondary fw-normal">· ${list.length} dokumen</span></div>
          <button class="btn btn-sm btn-labuku-outline admin-only" onclick="openKnowledgeForm({ Kategori: knowledgeActiveKategori, Tipe: '${t}' })"><i class="bi bi-upload"></i> Unggah PDF</button></div>
        ${list.length ? list.map(k => docRowHtml(k, true)).join('') : '<div class="small text-secondary mt-1">Belum ada.</div>'}
      </div>`;
  }).join('');
  const urut = layananKategori.slice().sort((a, b) => (a.Aktif === 'Ya' ? 0 : 1) - (b.Aktif === 'Ya' ? 0 : 1) || String(a.NamaLayanan).localeCompare(String(b.NamaLayanan)));
  box.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2"><div class="fw-bold">${escapeHtml(kategori)}</div>${tombolTambah}</div>
    <div class="lb-card mb-3">
      <div class="small text-secondary mb-2"><i class="bi bi-collection"></i> Dokumen kategori — otomatis berlaku untuk semua layanan di kategori ini</div>
      <div class="row g-3">${katDocs}</div>
    </div>
    ${urut.length === 0 ? `<div class="lb-card">${emptyState('bi-journal-x', 'Belum ada layanan di kategori ini.')}</div>` : `
    <div class="row g-2">
      ${urut.map(l => {
        const n = L.knowledge.filter(k => k.KatalogID === l.ID).length;
        return `
        <div class="col-md-6 col-xl-4">
          <div class="lb-card kn-card h-100" onclick="renderKnowledgeLayanan('${l.ID}')" style="${l.Aktif === 'Ya' ? '' : 'opacity:.6;'}">
            <div class="fw-semibold">${escapeHtml(l.NamaLayanan)}</div>
            <div class="small text-secondary mt-1">${escapeHtml(l.Deskripsi || '')}</div>
            <div class="small mt-2"><span class="badge-status ${n ? 'badge-selesai' : 'badge-netral'}">${n} dokumen</span> <span class="badge-status badge-netral">${splitLinesClient(l.PersyaratanJSON).length} persyaratan</span>
              <span class="badge-status badge-model">${escapeHtml(MODEL_LABEL[modelOf(l)])}</span>${l.Aktif === 'Ya' ? '' : ' <span class="badge-status badge-pending">Nonaktif</span>'}</div>
          </div>
        </div>`;
      }).join('')}
    </div>`}`;
}

function splitLinesClient(v) {
  let arr = v;
  if (typeof arr === 'string') { try { arr = JSON.parse(arr || '[]'); } catch (e) { arr = [arr]; } }
  if (!Array.isArray(arr)) return [];
  const out = [];
  arr.forEach(x => String(x == null ? '' : x).split(NL).forEach(t => { t = t.replace(CR_RE, '').trim(); if (t) out.push(t); }));
  return out;
}

const MODEL_PENJELASAN = {
  TTE: 'Isi field → unduh PDF → tanda tangan (TTE). Unggah PDF ber-TTE hanya bila hasil dikirim via WA.',
  PDF: 'Isi field → PDF hasil langsung dikirim tautannya via WA (tanpa TTE).',
  Arsip: 'Isi field → PDF disimpan sebagai arsip (tidak dikirim). Pemohon menerima WA pemberitahuan selesai.',
  Langsung: 'Tanpa isian (mis. legalisir) → diselesaikan di Front Office: Lengkap → Selesai → WA. Tetap tercatat di riwayat Back Office.'
};

function renderKnowledgeLayanan(katalogId) {
  const L = katalogLengkap();
  const box = document.getElementById('knowledgeContentBox');
  const l = L ? L.katalog.find(x => x.ID === katalogId) : null;
  if (!l || !box) return;
  knowledgeActiveLayanan = katalogId;
  const docsLayanan = L.knowledge.filter(k => k.KatalogID === katalogId);
  const persyaratan = splitLinesClient(l.PersyaratanJSON);
  const fields = splitLinesClient(l.FieldJSON);
  const model = modelOf(l);
  const kartu = (judul, list, tombol, catatan) => `
    <div class="lb-card mb-2">
      <div class="d-flex justify-content-between align-items-center gap-2"><h6 class="fw-bold mb-0">${judul} <span class="small text-secondary fw-normal">· ${list.length} dokumen</span></h6>${tombol || ''}</div>
      ${catatan ? `<div class="small text-secondary mt-1">${catatan}</div>` : ''}
      ${list.length ? list.map(k => docRowHtml(k, true)).join('') : '<div class="small text-secondary mt-1">Belum ada.</div>'}
    </div>`;
  const kategoriLink = `<a href="javascript:void(0)" onclick="knowledgeActiveLayanan=null;renderKnowledgeContent(knowledgeActiveKategori)">halaman kategori</a>`;
  const sopReg = (t) => dokKategori(l.Kategori, t).concat(docsLayanan.filter(k => k.Tipe === t));
  box.innerHTML = `
    <button class="btn btn-link ps-0 mb-2 text-decoration-none" onclick="knowledgeActiveLayanan=null;renderKnowledgeContent(knowledgeActiveKategori)"><i class="bi bi-arrow-left"></i> ${escapeHtml(l.Kategori)}</button>
    <div class="lb-card mb-3">
      <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
        <div>
          <h5 class="fw-bold mb-1">${escapeHtml(l.NamaLayanan)} ${l.Aktif === 'Ya' ? '' : '<span class="badge-status badge-pending align-middle">Nonaktif</span>'}</h5>
          <p class="text-secondary mb-2">${escapeHtml(l.Deskripsi || 'Belum ada deskripsi.')}</p>
        </div>
        <div class="d-flex gap-2 admin-only">
          <button class="btn btn-labuku-primary btn-sm-pill" onclick="openKatalogFormById('${l.ID}')"><i class="bi bi-pencil"></i> Edit Layanan</button>
          <button class="btn btn-labuku-outline btn-sm-pill" title="Hapus layanan" onclick="hapusKatalogUI('${l.ID}')"><i class="bi bi-trash text-danger"></i></button>
        </div>
      </div>
      <div class="small mb-3"><span class="badge-status badge-model">Model hasil: ${escapeHtml(MODEL_LABEL[model])}</span> <span class="text-secondary">${escapeHtml(MODEL_PENJELASAN[model])}</span></div>
      <div class="row g-3">
        <div class="col-md-6"><div class="fw-semibold small mb-1">Persyaratan</div>
          ${persyaratan.length ? '<ol class="small mb-0 ps-3">' + persyaratan.map(p => `<li>${escapeHtml(p)}</li>`).join('') + '</ol>' : '<div class="small text-secondary">Belum diatur.</div>'}</div>
        <div class="col-md-6"><div class="fw-semibold small mb-1">Field isian surat <span class="fw-normal text-secondary">— klik untuk menyalin ke template</span></div>
          ${model === 'Langsung' ? '<div class="small text-secondary">Tidak dipakai (model Langsung).</div>' : fields.length ? '<div class="small">' + fields.map(f => chipSalin(f)).join(' ') + '</div>' : '<div class="small text-secondary">Belum diatur.</div>'}
          ${model === 'Langsung' ? '' : `<details class="mt-2"><summary class="small text-secondary">Data otomatis</summary><div class="small mt-1">${DATA_OTOMATIS.map(f => chipSalin(f)).join(' ')}</div></details>`}</div>
      </div>
    </div>
    ${kartu('SOP', sopReg('SOP'), '', 'Dipasang per kategori — kelola di ' + kategoriLink + '.')}
    ${kartu('Regulasi', sopReg('Regulasi'), '', 'Dipasang per kategori — kelola di ' + kategoriLink + '.')}
    ${kartu('Petunjuk Teknis', docsLayanan.filter(k => k.Tipe === 'Juknis' || k.Tipe === 'WI' || k.Tipe === 'Tutorial'),
      `<button class="btn btn-sm btn-labuku-outline admin-only" onclick="openKnowledgeForm({ KatalogID: '${l.ID}', Tipe: 'Juknis' })"><i class="bi bi-upload"></i> Tambah</button>`, '')}
    ${kartu('Template Surat', docsLayanan.filter(k => k.Tipe === 'Template'),
      `<button class="btn btn-sm btn-labuku-outline admin-only" onclick="openKnowledgeForm({ KatalogID: '${l.ID}', Tipe: 'Template' })"><i class="bi bi-plus-lg"></i> Tambah</button>`,
      'Wajib link Google Docs berisi penanda {{Nama Field}}.')}`;
}

function bukaDokumenKnowledge(url) {
  if (!url) {
    showToast('Info', 'Tautan dokumen ini belum diatur. Klik Edit pada dokumen untuk melengkapinya.', 'warning');
    return;
  }
  window.open(url, '_blank', 'noopener');
}

/** Setelah simpan/hapus: katalog lengkap dimuat ulang sekali, lalu tampilan & daftar Front Office ikut diperbarui. */
function reloadKatalogLayanan(kategori, layananId) {
  if (kategori) knowledgeActiveKategori = kategori;
  knowledgeActiveLayanan = layananId || null;
  muatKatalogLengkap(true);
}

/* ---------- Form layanan (tambah / edit) ---------- */
function openKatalogFormById(id) {
  const L = katalogLengkap();
  const k = L ? L.katalog.find(x => x.ID === id) : null;
  if (k) openKatalogForm(k);
}

function openKatalogForm(katalog, kategoriDefault) {
  katalog = katalog || {};
  /* Pemisah baris memakai konstanta NL (bukan escape garis-miring), agar tidak diubah pengolah kode Google. */
  const persyaratan = splitLinesClient(katalog.PersyaratanJSON);
  const fieldIsian = splitLinesClient(katalog.FieldJSON);
  const kat = katalog.Kategori || kategoriDefault || KATEGORI_LAYANAN_RESMI[0];
  const model = katalog.ID ? modelOf(katalog) : 'TTE';
  openFormModal(katalog.ID ? 'Edit Layanan' : 'Tambah Layanan Baru', `
    <input type="hidden" id="katFormId" value="${katalog.ID || ''}">
    <div class="row g-3">
      <div class="col-md-6"><label class="form-label">Kategori</label>
        <select class="form-select" id="katFormKategori">
          ${KATEGORI_LAYANAN_RESMI.map(k => `<option ${kat === k ? 'selected' : ''}>${k}</option>`).join('')}
        </select>
      </div>
      <div class="col-md-6"><label class="form-label">Nama Layanan</label><input type="text" class="form-control" id="katFormNama" value="${escapeHtml(katalog.NamaLayanan || '')}"></div>
      <div class="col-12"><label class="form-label">Deskripsi</label><textarea class="form-control" id="katFormDeskripsi" rows="2">${escapeHtml(katalog.Deskripsi || '')}</textarea></div>
      <div class="col-12"><label class="form-label">Model hasil layanan</label>
        <select class="form-select" id="katFormModel" onchange="document.getElementById('katFormModelInfo').textContent=MODEL_PENJELASAN[this.value]">
          ${[['TTE', '1. TTE — isi field → PDF → tanda tangan → (unggah bila kirim WA)'], ['PDF', '2. PDF langsung — isi field → tautan PDF dikirim via WA'], ['Arsip', '3. Arsip — isi field → PDF disimpan saja (mis. konsultasi)'], ['Langsung', '4. Langsung — tanpa isian, selesai di Front Office (mis. legalisir)']]
            .map(([v, lb]) => `<option value="${v}" ${v === model ? 'selected' : ''}>${lb}</option>`).join('')}
        </select>
        <div class="small text-secondary mt-1" id="katFormModelInfo">${escapeHtml(MODEL_PENJELASAN[model])}</div></div>
      <div class="col-12"><label class="form-label">Checklist Persyaratan (satu item per baris)</label><textarea class="form-control" id="katFormPersyaratan" rows="4">${escapeHtml(persyaratan.join(NL))}</textarea></div>
      <div class="col-12"><label class="form-label">Field isian surat (satu per baris — tidak dipakai model Langsung)</label><textarea class="form-control" id="katFormField" rows="4" placeholder="Contoh:${'&#10;'}Nomor Surat${'&#10;'}Nama Wali${'&#10;'}Tempat Akad">${escapeHtml(fieldIsian.join(NL))}</textarea>
        <div class="small text-secondary mt-1">Tulis di template Google Docs sebagai penanda. Data otomatis (klik untuk menyalin): ${DATA_OTOMATIS.map(f => chipSalin(f)).join(' ')}</div></div>
      <div class="col-md-6"><label class="form-label">Status</label>
        <select class="form-select" id="katFormAktif"><option value="Ya" ${katalog.Aktif !== 'Tidak' ? 'selected' : ''}>Aktif</option><option value="Tidak" ${katalog.Aktif === 'Tidak' ? 'selected' : ''}>Nonaktif</option></select>
      </div>
    </div>
    <button class="btn btn-labuku-primary w-100 mt-4" id="katFormBtn" onclick="submitKatalogForm()">Simpan</button>
  `);
}

function submitKatalogForm() {
  const persyaratanLines = document.getElementById('katFormPersyaratan').value.replace(CR_RE, '').split(NL).map(s => s.trim()).filter(Boolean);
  const fieldLines = document.getElementById('katFormField').value.replace(CR_RE, '').split(NL).map(s => s.trim()).filter(Boolean);
  const obj = {
    ID: document.getElementById('katFormId').value || undefined,
    Kategori: document.getElementById('katFormKategori').value,
    NamaLayanan: document.getElementById('katFormNama').value.trim(),
    Deskripsi: document.getElementById('katFormDeskripsi').value.trim(),
    ModelHasil: document.getElementById('katFormModel').value,
    PersyaratanJSON: JSON.stringify(persyaratanLines),
    FieldJSON: JSON.stringify(fieldLines),
    TahapanJSON: JSON.stringify(['Pemeriksaan Berkas', 'Verifikasi Data', 'Penjadwalan', 'Penerbitan Hasil']),
    Aktif: document.getElementById('katFormAktif').value
  };
  if (!obj.NamaLayanan) { showToast('Peringatan', 'Nama layanan wajib diisi.', 'warning'); return; }
  const btn = document.getElementById('katFormBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-inline"></span> Menyimpan...'; }
  gsr()
    .withSuccessHandler(res => {
      closeFormModal();
      if (res && res.success) {
        showToast('Berhasil', res.message, 'success');
        reloadKatalogLayanan(obj.Kategori, (res.data && res.data.ID) || obj.ID);
      } else showToast('Gagal', (res && res.message) || 'Server tidak merespons.', 'danger');
    })
    .withFailureHandler(err => { closeFormModal(); showToast('Error', err.message || err, 'danger'); })
    .simpanKatalog(obj);
}

function hapusKatalogUI(id) {
  confirmAction('Hapus Layanan?', 'Layanan ini akan dihapus dari katalog. Data layanan yang sudah berjalan tidak terpengaruh. Untuk menyembunyikan sementara, pilih Edit → Status Nonaktif.', () => {
    gsr()
      .withSuccessHandler(res => {
        if (res && res.success) { showToast('Berhasil', res.message, 'success'); reloadKatalogLayanan(knowledgeActiveKategori, null); }
        else showToast('Gagal', (res && res.message) || 'Server tidak merespons.', 'danger');
      })
      .withFailureHandler(err => showToast('Error', err.message || err, 'danger'))
      .hapusKatalog(id);
  });
}

/* ---------- Form dokumen (SOP/Regulasi per kategori; Petunjuk Teknis/Template per layanan) ---------- */
function openKnowledgeFormById(id) {
  const L = katalogLengkap();
  const doc = L ? L.knowledge.find(x => x.ID === id) : null;
  if (doc) openKnowledgeForm(doc);
}

function openKnowledgeForm(doc) {
  doc = doc || {};
  const isEdit = !!doc.ID;
  const L = katalogLengkap();
  const layanan = doc.KatalogID && L ? L.katalog.find(x => x.ID === doc.KatalogID) : null;
  const tingkatKategori = !doc.KatalogID;
  if (!tingkatKategori && !layanan) { showToast('Peringatan', 'Layanan tidak ditemukan.', 'warning'); return; }
  const kategori = tingkatKategori ? doc.Kategori : layanan.Kategori;
  const tipeOps = tingkatKategori ? [['SOP', 'SOP'], ['Regulasi', 'Regulasi']] : [['Juknis', 'Petunjuk Teknis'], ['Template', 'Template Surat']];
  const tipeNow = doc.Tipe === 'WI' || doc.Tipe === 'Tutorial' ? 'Juknis' : doc.Tipe;
  openFormModal(isEdit ? 'Edit Dokumen' : 'Tambah Dokumen', `
    <input type="hidden" id="kdFormId" value="${doc.ID || ''}">
    <input type="hidden" id="kdFormKatalogId" value="${layanan ? layanan.ID : ''}">
    <input type="hidden" id="kdFormKategori" value="${escapeHtml(kategori)}">
    <div class="small text-secondary mb-3">${tingkatKategori
      ? 'Tingkat <strong>kategori</strong>: ' + escapeHtml(kategori) + ' — berlaku untuk semua layanan di kategori ini.'
      : 'Layanan: <strong>' + escapeHtml(layanan.NamaLayanan) + '</strong> · ' + escapeHtml(kategori)}</div>
    <div class="row g-3">
      <div class="col-md-6"><label class="form-label">Jenis Dokumen</label>
        <select class="form-select" id="kdFormTipe">${tipeOps.map(([v, lb]) => `<option value="${v}" ${tipeNow === v ? 'selected' : ''}>${lb}</option>`).join('')}</select>
      </div>
      <div class="col-md-6"><label class="form-label">Tanggal Efektif <span class="text-secondary fw-normal">(opsional)</span></label><input type="text" class="form-control" id="kdFormTgl" placeholder="cth. 01 Jan 2026" value="${escapeHtml(doc.TglEfektif ? fmtDate(doc.TglEfektif) : '')}"></div>
      <div class="col-12"><label class="form-label">Nama Dokumen ${isEdit ? '' : '<span class="text-secondary fw-normal">(kosongkan bila mengunggah beberapa PDF — memakai nama file)</span>'}</label><input type="text" class="form-control" id="kdFormNama" value="${escapeHtml(doc.NamaDokumen || '')}"></div>
    </div>
    <hr class="my-3">
    <label class="form-label">Berkas PDF ${isEdit ? '(opsional, ganti berkas)' : '— bisa pilih beberapa sekaligus'} <span class="text-secondary fw-normal">maks 10MB per file</span></label>
    <input type="file" class="form-control mb-1" id="kdFormFile" accept="application/pdf,.pdf,.doc,.docx,.xls,.xlsx" ${isEdit ? '' : 'multiple'}>
    <div class="small text-secondary mb-3">Diunggah ke folder <em>Knowledge &amp; Template/&lt;Kategori&gt;${tingkatKategori ? '' : '/&lt;Layanan&gt;'}</em> di Drive saat klik Simpan.</div>
    <label class="form-label">Atau link Google Drive <span class="text-secondary fw-normal">(Template: wajib link Google Docs berisi penanda {{Nama Field}})</span></label>
    <input type="text" class="form-control" id="kdFormLink" placeholder="Terisi otomatis bila memilih berkas" value="${escapeHtml(doc.LinkURL || '')}">
    <button class="btn btn-labuku-primary w-100 mt-4" id="kdSubmitBtn" onclick="submitKnowledgeForm()">Simpan</button>
  `);
}

function bacaBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error('Gagal membaca ' + file.name));
    r.readAsDataURL(file);
  });
}
function gsrPromise(fn, args) {
  return new Promise((resolve, reject) => {
    gsr(res => (res && res.success) ? resolve(res) : reject(new Error((res && res.message) || 'Server tidak merespons.')), reject)[fn].apply(null, args);
  });
}

/** Satu langkah: Simpan → unggah semua PDF (berurutan, dengan progres) → catat semua dokumen sekaligus. */
async function submitKnowledgeForm() {
  const id = document.getElementById('kdFormId').value;
  const katalogId = document.getElementById('kdFormKatalogId').value;
  const kategori = document.getElementById('kdFormKategori').value;
  const tipe = document.getElementById('kdFormTipe').value;
  const nama = document.getElementById('kdFormNama').value.trim();
  const tgl = document.getElementById('kdFormTgl').value.trim();
  const files = Array.prototype.slice.call(document.getElementById('kdFormFile').files || []);
  const btn = document.getElementById('kdSubmitBtn');
  const asal = btn.innerHTML;
  if (files.some(f => f.size > 10 * 1024 * 1024)) { showToast('Peringatan', 'Ukuran berkas maksimal 10MB per file.', 'warning'); return; }
  if (!files.length && !document.getElementById('kdFormLink').value.trim()) { showToast('Peringatan', 'Pilih berkas PDF atau isi link dokumen.', 'warning'); return; }
  if (!files.length && !nama) { showToast('Peringatan', 'Isi nama dokumen.', 'warning'); return; }
  const L = katalogLengkap();
  const layanan = katalogId && L ? L.katalog.find(k => k.ID === katalogId) : null;
  btn.disabled = true;
  try {
    const hasil = [];
    for (let i = 0; i < files.length; i++) {
      btn.innerHTML = '<span class="spinner-inline"></span> Mengunggah ' + (i + 1) + ' / ' + files.length + '...';
      const b64 = await bacaBase64(files[i]);
      const up = await gsrPromise('uploadKnowledgeFile', [b64, files[i].name, files[i].type || 'application/pdf', layanan ? layanan.NamaLayanan : '', kategori]);
      hasil.push({ LinkURL: up.data.fileUrl, NamaDokumen: files.length === 1 && nama ? nama : files[i].name.replace(/\.[^.]+$/, '') });
    }
    btn.innerHTML = '<span class="spinner-inline"></span> Menyimpan...';
    const dasar = { KatalogID: katalogId, Kategori: kategori, Tipe: tipe, TglEfektif: tgl };
    let res;
    if (id) res = await gsrPromise('simpanKnowledge', [Object.assign(dasar, { ID: id, NamaDokumen: nama || (hasil[0] && hasil[0].NamaDokumen) || '', LinkURL: hasil.length ? hasil[0].LinkURL : document.getElementById('kdFormLink').value.trim() })]);
    else if (hasil.length) res = await gsrPromise('simpanKnowledgeBatch', [hasil.map(h => Object.assign({}, dasar, h))]);
    else res = await gsrPromise('simpanKnowledge', [Object.assign(dasar, { NamaDokumen: nama, LinkURL: document.getElementById('kdFormLink').value.trim() })]);
    closeFormModal();
    showToast('Berhasil', res.message, 'success');
    reloadKatalogLayanan(knowledgeActiveKategori, knowledgeActiveLayanan);
  } catch (err) {
    btn.disabled = false; btn.innerHTML = asal;
    showToast('Gagal', err.message || String(err), 'danger');
  }
}

function hapusKnowledgeUI(id) {
  confirmAction('Hapus Dokumen?', 'Dokumen ini akan dihapus dari katalog layanan.', () => {
    gsr()
      .withSuccessHandler(res => {
        if (res && res.success) { showToast('Berhasil', res.message, 'success'); reloadKatalogLayanan(knowledgeActiveKategori, knowledgeActiveLayanan); }
        else showToast('Gagal', (res && res.message) || 'Server tidak merespons.', 'danger');
      })
      .withFailureHandler(err => showToast('Error', err.message || err, 'danger'))
      .hapusKnowledge(id);
  });
}

// ════════════════════════════════════════════════════════
// BAGIAN 12: RIWAYAT DI BACK OFFICE (v4: detail per baris + export CSV)
// ════════════════════════════════════════════════════════
function lihatDetailRiwayat(layananId) {
  openFormModal('Detail Layanan — ' + layananId, loadingBlock('Memuat riwayat layanan...'));
  gsr()
    .withSuccessHandler(res => {
      const body = document.getElementById('formModalBody');
      if (isNullResponse(res, body, `lihatDetailRiwayat('${layananId}')`)) return;
      if (!res.success) { body.innerHTML = emptyState('bi-exclamation-triangle', res.message); return; }
      const { layanan, pemohon, kunjungan, persyaratan, dokumen, jejak } = res.data;
      const p = pemohon || {};
      const model = MODEL_LIST.indexOf(res.data.model) >= 0 ? res.data.model : modelOf(katalogById(layanan.KatalogID));
      const valid = (persyaratan || []).filter(x => x.Status === 'Valid').length;
      body.innerHTML = `
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
          <div><div class="fw-bold">${escapeHtml(layanan.PemohonNama)}</div>
            <div class="small text-secondary">${escapeHtml(layanan.ID)} · ${escapeHtml(layanan.JenisLayanan)}</div></div>
          <div class="text-end"><span class="badge-status ${statusBadgeClass(layanan.Status)}">${escapeHtml(layanan.Status)}</span>
            <div class="small mt-1"><span class="badge-status badge-model">${escapeHtml(MODEL_LABEL[model])}</span></div></div>
        </div>
        <div class="row g-2 small mb-3">
          <div class="col-md-6"><span class="text-secondary">NIK:</span> ${escapeHtml(p.NIK || '-')}</div>
          <div class="col-md-6"><span class="text-secondary">WhatsApp:</span> ${escapeHtml(p.NoHP || '-')}</div>
          <div class="col-12"><span class="text-secondary">Alamat:</span> ${escapeHtml(p.Alamat || '-')}</div>
          <div class="col-md-6"><span class="text-secondary">Masuk:</span> ${fmtDateTime(layanan.TanggalMulai)}</div>
          <div class="col-md-6"><span class="text-secondary">Selesai:</span> ${layanan.TanggalSelesai ? fmtDateTime(layanan.TanggalSelesai) : '-'}</div>
          <div class="col-md-6"><span class="text-secondary">Dikerjakan oleh:</span> ${escapeHtml(layanan.ASNNama || '-')}</div>
          <div class="col-md-6"><span class="text-secondary">Persyaratan:</span> ${valid} / ${(persyaratan || []).length} valid</div>
          ${layanan.CatatanPending ? `<div class="col-12"><span class="text-secondary">Catatan pending:</span> ${escapeHtml(layanan.CatatanPending)}</div>` : ''}
        </div>
        <h6 class="fw-bold small">Riwayat Kunjungan (${kunjungan.length}x)</h6>
        ${kunjungan.map(k => `<div class="small mb-1"><i class="bi bi-calendar-event"></i> ${fmtDateTime(k.Tanggal)} — Antrean ${escapeHtml(k.NomorAntrean)} oleh ${escapeHtml(k.PetugasFO)}</div>`).join('') || '<p class="small text-secondary">Tidak ada data kunjungan.</p>'}
        <hr>
        <h6 class="fw-bold small">Dokumen (${dokumen.length})</h6>
        ${dokumen.map(d => `<div class="small mb-1"><i class="bi bi-file-earmark"></i> ${escapeHtml(d.NamaFile)} <span class="text-secondary">(${escapeHtml(d.Kategori || 'Hasil')})</span> — <a href="${escapeHtml(d.FileURL)}" target="_blank" rel="noopener">buka</a></div>`).join('') || '<p class="small text-secondary">Tidak ada dokumen.</p>'}
        <hr>
        <h6 class="fw-bold small">Jejak Proses</h6>
        ${jejak.map(j => `<div class="timeline-item"><div class="timeline-dot"></div><div><div class="timeline-title">${escapeHtml(j.Aksi)}</div><div class="timeline-time">${escapeHtml(j.Oleh)} · ${fmtDateTime(j.Waktu)}</div>${j.Keterangan ? `<div class="small text-secondary">${escapeHtml(j.Keterangan)}</div>` : ''}</div></div>`).join('')}
        <button class="btn btn-labuku-outline w-100 mt-3" onclick="closeFormModal();openWorkspace('${layanan.ID}')"><i class="bi bi-briefcase"></i> Buka Workspace</button>`;
    })
    .withFailureHandler(err => { document.getElementById('formModalBody').innerHTML = emptyState('bi-exclamation-triangle', 'Gagal memuat detail.'); showToast('Error', err.message || err, 'danger'); })
    .getRiwayatDetail(layananId);
}

/**
 * v5: Export CSV data mentah — satu baris per layanan, kolom terpisah (tanggal yyyy-mm-dd, jam,
 * lama proses, wilayah per tingkat, sumber, jumlah kunjungan). Pemisah titik koma + BOM UTF-8 agar
 * Excel berbahasa Indonesia langsung terbagi per kolom; NIK & No. HP tetap teks (nol di depan aman).
 */
function exportBoCsv() {
  const list = window._boFiltered || [];
  if (list.length === 0) { showToast('Peringatan', 'Tidak ada data untuk diexport.', 'warning'); return; }
  const btn = document.getElementById('boExportBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-inline"></span> Menyiapkan...'; }
  const pulih = () => { if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-download"></i> Export CSV'; } };
  gsr(res => {
    pulih();
    if (!res || !res.success) { showToast('Gagal', (res && res.message) || 'Server tidak merespons.', 'danger'); return; }
    const kolom = [
      ['id', 'ID Layanan'], ['tglMasuk', 'Tanggal Masuk'], ['jamMasuk', 'Jam Masuk'], ['tglSelesai', 'Tanggal Selesai'], ['lama', 'Lama Proses (hari)'],
      ['status', 'Status'], ['tahap', 'Tahap'], ['model', 'Model Hasil'], ['kategori', 'Kategori'], ['layanan', 'Jenis Layanan'],
      ['nama', 'Nama Pemohon'], ['nik', 'NIK'], ['hp', 'No HP'], ['provinsi', 'Provinsi'], ['kab', 'Kabupaten/Kota'], ['kec', 'Kecamatan'],
      ['desa', 'Desa/Kelurahan'], ['kodeWilayah', 'Kode Wilayah'], ['sumber', 'Sumber Pendaftaran'], ['kunjungan', 'Jumlah Kunjungan'],
      ['petugas', 'Dikerjakan Oleh'], ['catatan', 'Catatan Pending']
    ];
    const teks = { nik: true, hp: true, kodeWilayah: true };
    const sel = (k, v) => {
      const s = String(v == null ? '' : v).replace(CR_RE, ' ').split(NL).join(' ');
      if (teks[k] && s) return '="' + s.replace(/"/g, '') + '"';
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const urut = {}; list.forEach((l, i) => { urut[l.ID] = i; });
    const rows = (res.data || []).slice().sort((a, b) => (urut[a.id] || 0) - (urut[b.id] || 0));
    const CRLF = String.fromCharCode(13, 10);
    const csv = String.fromCharCode(65279) + kolom.map(k => '"' + k[1] + '"').join(';') + CRLF +
      rows.map(r => kolom.map(k => sel(k[0], r[k[0]])).join(';')).join(CRLF) + CRLF;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'labuku_back_office_' + ymd(new Date()) + '.csv';
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    showToast('Berhasil', rows.length + ' baris diexport.', 'success');
  }, err => { pulih(); showToast('Error', err.message || err, 'danger'); }).getEksporBackOffice(list.map(l => l.ID));
}

// ════════════════════════════════════════════════════════
// BAGIAN 13: MODUL PENGATURAN (v4: Tim, Template WA, Umum, Keamanan)
// ════════════════════════════════════════════════════════
let manajemenActiveTab = 'users';

function renderManajemenShell() {
  const container = document.getElementById('section-manajemen');
  manajemenActiveTab = 'users';
  container.innerHTML = `
    <h2 class="page-heading">Pengaturan</h2>
    <p class="page-sub">Kelola daftar tim (pilihan "Masuk sebagai"), template pesan WhatsApp, identitas &amp; wilayah, serta keamanan. Katalog layanan dikelola di menu Katalog Layanan.</p>
    <div class="d-flex flex-wrap gap-2 mb-3" id="manajemenTabNav">
      ${[['users', 'Tim / ASN'], ['wa', 'Template WA'], ['pengaturan', 'Umum'], ['keamanan', 'Keamanan']].map(([k, label]) => `
        <button class="btn ${k === 'users' ? 'btn-labuku-primary' : 'btn-labuku-outline'} btn-sm-pill" data-mtab="${k}" onclick="switchManajemenTab('${k}')">${label}</button>
      `).join('')}
    </div>
    <div id="manajemenContentBox"></div>
  `;
  loadManajemenUsers();
}

function switchManajemenTab(tab) {
  manajemenActiveTab = tab;
  document.querySelectorAll('#manajemenTabNav button').forEach(btn => {
    const active = btn.dataset.mtab === tab;
    btn.className = 'btn ' + (active ? 'btn-labuku-primary' : 'btn-labuku-outline') + ' btn-sm-pill';
  });
  if (tab === 'users') loadManajemenUsers();
  else if (tab === 'wa') loadManajemenWa();
  else if (tab === 'keamanan') loadManajemenKeamanan();
  else if (tab === 'pengaturan') loadManajemenPengaturan();
}

/* ---------- Tab: Keamanan (ganti password tim) ---------- */
function loadManajemenKeamanan() {
  const box = document.getElementById('manajemenContentBox');
  box.innerHTML = `
    <div class="lb-card" style="max-width:480px;">
      <h6 class="fw-bold mb-2">Ganti Password Tim</h6>
      <p class="small text-secondary">Satu password dipakai seluruh tim. Setelah diganti, semua perangkat lain otomatis keluar dan harus masuk dengan password baru.</p>
      <input type="password" class="form-control mb-2" id="pwLama" placeholder="Password lama">
      <input type="password" class="form-control mb-2" id="pwBaru" placeholder="Password baru (min. 6 karakter)">
      <input type="password" class="form-control mb-3" id="pwBaru2" placeholder="Ulangi password baru">
      <button class="btn btn-labuku-primary" id="pwBtn" onclick="submitGantiPassword()"><i class="bi bi-shield-lock"></i> Ganti Password</button>
      <p class="small text-secondary mt-3 mb-0">Lupa password? Pemilik script menjalankan <code>resetPassword()</code> di Apps Script Editor, lalu aktivasi ulang dengan kode baru.</p>
    </div>`;
}

function submitGantiPassword() {
  const lama = document.getElementById('pwLama').value;
  const baru = document.getElementById('pwBaru').value;
  const baru2 = document.getElementById('pwBaru2').value;
  if (baru.length < 6) { showToast('Peringatan', 'Password baru minimal 6 karakter.', 'warning'); return; }
  if (baru !== baru2) { showToast('Peringatan', 'Ulangan password baru tidak sama.', 'warning'); return; }
  const btn = document.getElementById('pwBtn');
  btn.disabled = true;
  gsr(res => {
    btn.disabled = false;
    if (res && res.success) {
      window.AppState.token = res.data.token; lsSet(TOKEN_KEY, res.data.token);
      ['pwLama', 'pwBaru', 'pwBaru2'].forEach(id => { document.getElementById(id).value = ''; });
      showToast('Berhasil', res.message, 'success');
    } else showToast('Gagal', (res && res.message) || 'Gagal mengganti password.', 'danger');
  }, err => { btn.disabled = false; showToast('Error', err.message || err, 'danger'); }).changePassword(lama, baru);
}


/* ---------- Tab: Tim (v5: Nama, NIP, Peran, Status; cache dulu lalu segarkan) ---------- */
function loadManajemenUsers(done) {
  const box = document.getElementById('manajemenContentBox');
  if (window._usersCache) renderManajemenUsers({ success: true, data: window._usersCache });
  else box.innerHTML = loadingBlock();
  gsr()
    .withSuccessHandler(res => { if (done) done(); if (res) renderManajemenUsers(res); })
    .withFailureHandler(err => { if (done) done(); if (!window._usersCache) box.innerHTML = emptyState('bi-exclamation-triangle', 'Gagal memuat.'); showToast('Error', err.message || err, 'danger'); })
    .getManajemenUsers();
}

function roleBadgeClass(role) {
  return isAdminRole(role) ? 'badge-selesai' : (ROLE_LIST.indexOf(role) >= 0 ? 'badge-netral' : 'badge-pending');
}

function renderManajemenUsers(res) {
  const box = document.getElementById('manajemenContentBox');
  // Bug fix: respons yang datang setelah pengguna pindah tab tidak boleh menimpa tab lain.
  if (manajemenActiveTab !== 'users' || !box) return;
  if (!res.success) { box.innerHTML = emptyState('bi-exclamation-triangle', res.message); return; }
  const list = res.data;
  window._usersCache = list;
  window.AppState.users = list.filter(u => u.Status === 'Aktif').map(u => ({ Nama: u.Nama, Role: u.Role }));
  saveAppStateCache();
  if (namaMasukHilang()) return;
  applyUserToUI();
  box.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
      <span class="small text-secondary">Peran: <b>Kepala KUA</b> (admin — mengelola Pengaturan &amp; Katalog), Penyuluh, Penghulu, Pelaksana.</span>
      <button class="btn btn-labuku-primary" onclick="openUserForm()"><i class="bi bi-plus-lg"></i> Tambah Anggota</button>
    </div>
    <div class="table-wrap">
      <table class="lb-table">
        <thead><tr><th>Nama</th><th>NIP</th><th>Peran</th><th>Status</th><th style="text-align:right;">Aksi</th></tr></thead>
        <tbody>
          ${list.map(u => `
            <tr>
              <td class="fw-semibold">${escapeHtml(u.Nama)}</td>
              <td>${escapeHtml(u.NIP || '-')}</td>
              <td><span class="badge-status ${roleBadgeClass(u.Role)}">${escapeHtml(roleLabel(u.Role))}</span></td>
              <td><span class="badge-status ${u.Status === 'Aktif' ? 'badge-selesai' : 'badge-terlewat'}">${escapeHtml(u.Status)}</span></td>
              <td style="text-align:right;">
                <button class="btn btn-sm btn-labuku-outline" title="Edit" onclick="openUserFormById('${u.ID}')"><i class="bi bi-pencil"></i></button>
                <button class="btn btn-sm btn-labuku-outline" title="Aktif / nonaktif" onclick="toggleUserStatusUI('${u.ID}')"><i class="bi bi-power"></i></button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function openUserFormById(id) {
  const u = (window._usersCache || []).find(x => x.ID === id);
  if (u) openUserForm(u);
}

function openUserForm(user) {
  user = user || {};
  const role = user.Role === 'Admin' ? 'Kepala KUA' : user.Role;
  openFormModal(user.ID ? 'Edit Anggota Tim' : 'Tambah Anggota Tim', `
    <input type="hidden" id="userFormId" value="${user.ID || ''}">
    <div class="row g-3">
      <div class="col-md-6"><label class="form-label">Nama Lengkap</label><input type="text" class="form-control" id="userFormNama" value="${escapeHtml(user.Nama || '')}"></div>
      <div class="col-md-6"><label class="form-label">NIP</label><input type="text" class="form-control" id="userFormNip" inputmode="numeric" value="${escapeHtml(user.NIP || '')}"></div>
      <div class="col-md-6">
        <label class="form-label">Peran</label>
        <select class="form-select" id="userFormRole">
          ${ROLE_LIST.map(r => `<option value="${r}" ${r === role ? 'selected' : ''}>${r}${r === 'Kepala KUA' ? ' (admin)' : ''}</option>`).join('')}
        </select>
      </div>
      <div class="col-md-6">
        <label class="form-label">Status</label>
        <select class="form-select" id="userFormStatus">
          <option value="Aktif" ${user.Status !== 'Nonaktif' ? 'selected' : ''}>Aktif</option>
          <option value="Nonaktif" ${user.Status === 'Nonaktif' ? 'selected' : ''}>Nonaktif</option>
        </select>
      </div>
    </div>
    <button class="btn btn-labuku-primary w-100 mt-4" id="userFormBtn" onclick="submitUserForm()">Simpan</button>
  `);
}

function submitUserForm() {
  const obj = {
    ID: document.getElementById('userFormId').value || undefined,
    Nama: document.getElementById('userFormNama').value.trim(),
    NIP: document.getElementById('userFormNip').value.trim(),
    Role: document.getElementById('userFormRole').value,
    Status: document.getElementById('userFormStatus').value
  };
  if (!obj.Nama) { showToast('Peringatan', 'Nama wajib diisi.', 'warning'); return; }
  const btn = document.getElementById('userFormBtn');
  if (btn) btn.disabled = true;
  gsr()
    .withSuccessHandler(res => {
      if (btn) btn.disabled = false;
      if (res && res.success) {
        // Bug fix v5.1: mengganti nama sendiri → "Masuk sebagai" ikut memakai nama baru.
        if (res.data && res.data.namaSendiriBaru) {
          window.AppState.who = res.data.namaSendiriBaru;
          lsSet(WHO_KEY, res.data.namaSendiriBaru);
          if (window.AppState.user) window.AppState.user.nama = res.data.namaSendiriBaru;
        }
        window._usersCache = null;
        closeFormModal(); showToast('Berhasil', res.message, 'success'); loadManajemenUsers();
      }
      else showToast('Gagal', (res && res.message) || 'Server tidak merespons.', 'danger');
    })
    .withFailureHandler(err => { if (btn) btn.disabled = false; showToast('Error', err.message || err, 'danger'); })
    .simpanUser(obj);
}

function toggleUserStatusUI(userId) {
  confirmAction('Ubah Status?', 'Status aktif/nonaktif anggota tim akan diubah. Anggota nonaktif tidak muncul di pilihan "Masuk sebagai".', () => {
    gsr()
      .withSuccessHandler(res => {
        if (res && res.success) { showToast('Berhasil', res.message, 'success'); loadManajemenUsers(); }
        else showToast('Gagal', (res && res.message) || 'Server tidak merespons.', 'danger');
      })
      .withFailureHandler(err => showToast('Error', err.message || err, 'danger'))
      .toggleUserStatus(userId);
  });
}

/* ---------- Tab: Template WA ---------- */
const WA_TPL_INFO = [
  ['wa_antrean', 'WA 1 — Nomor antrean (Front Office)', 'Dikirim saat pemohon mendapat nomor antrean.', ['nama', 'nomor', 'layanan', 'instansi', 'tanggal', 'sisa', 'posisi']],
  ['wa_pending', 'WA 2 — Pending (persyaratan kurang)', 'Dikirim dari pop-up verifikasi Front Office. {kekurangan} = daftar persyaratan yang belum dicentang + catatan.', ['nama', 'layanan', 'id', 'instansi', 'tanggal', 'kekurangan']],
  ['wa_tte', 'WA 2 — Selesai, model 1 (TTE)', 'Berisi tautan PDF ber-TTE yang diunggah di Back Office.', ['nama', 'layanan', 'id', 'instansi', 'tanggal', 'link']],
  ['wa_pdf', 'WA 2 — Selesai, model 2 (PDF langsung)', 'Berisi tautan PDF hasil (tanpa TTE).', ['nama', 'layanan', 'id', 'instansi', 'tanggal', 'link']],
  ['wa_arsip', 'WA 2 — Selesai, model 3 (Arsip)', 'Pemberitahuan selesai tanpa PDF (PDF hanya diarsip, mis. konsultasi).', ['nama', 'layanan', 'id', 'instansi', 'tanggal']],
  ['wa_langsung', 'WA 2 — Selesai, model 4 (Langsung di Front Office)', 'Mis. legalisir; dikirim dari pop-up verifikasi Front Office.', ['nama', 'layanan', 'id', 'instansi', 'tanggal']]
];
const WA_CONTOH = {
  nama: 'Ahmad Hidayat', nomor: 'A-007', layanan: 'Legalisasi Buku Nikah', id: 'LYN-2026-00042', tanggal: 'Kamis, 08 Oktober 2026', sisa: 2,
  posisi: 'Saat ini ada 2 antrean sebelum Anda.', kekurangan: '- Fotokopi KK' + String.fromCharCode(10) + '- Pas foto 2x3', link: 'https:' + String.fromCharCode(47, 47) + 'drive.google.com/file/d/contoh/view'
};

function loadManajemenWa() {
  const box = document.getElementById('manajemenContentBox');
  const c = window.AppState.config || {};
  box.innerHTML = `
    <div class="lb-card mb-3" style="max-width:820px;">
      <p class="small text-secondary mb-0">Setiap kunjungan minimal mendapat 2 WA: <b>WA 1</b> nomor antrean, lalu <b>WA 2</b> hasil (Pending + kekurangan, atau Selesai sesuai model hasil layanan). Klik penanda untuk menyisipkannya. Gunakan *teks* untuk huruf tebal di WhatsApp.</p>
    </div>
    ${WA_TPL_INFO.map(([key, judul, ket, ph]) => `
      <div class="lb-card mb-3 wa-tpl" style="max-width:820px;">
        <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap">
          <div><h6 class="fw-bold mb-1">${judul}</h6><div class="small text-secondary mb-2">${escapeHtml(ket)}</div></div>
          <button class="btn btn-link btn-sm p-0" onclick="resetWaTpl('${key}')">Kembalikan bawaan</button>
        </div>
        <div class="mb-2">${ph.map(x => `<span class="wa-ph" onclick="sisipWaPh('${key}','${x}')">{${x}}</span>`).join('')}</div>
        <textarea class="form-control" rows="5" id="waTpl_${key}" oninput="previewWaTpl('${key}')">${escapeHtml(waTpl(key))}</textarea>
        <div class="small text-secondary mt-2 mb-1">Pratinjau:</div>
        <div class="wa-preview" id="waPrev_${key}"></div>
      </div>`).join('')}
    <button class="btn btn-labuku-primary" id="waTplBtn" onclick="simpanWaTpl()"><i class="bi bi-save"></i> Simpan Template WA</button>`;
  WA_TPL_INFO.forEach(([key]) => previewWaTpl(key));
}

function previewWaTpl(key) {
  const ta = document.getElementById('waTpl_' + key);
  const pv = document.getElementById('waPrev_' + key);
  if (ta && pv) pv.textContent = isiTpl(ta.value, Object.assign({ instansi: instansiNama() }, WA_CONTOH));
}

function sisipWaPh(key, ph) {
  const ta = document.getElementById('waTpl_' + key);
  if (!ta) return;
  const teks = '{' + ph + '}';
  const a = ta.selectionStart || ta.value.length, b = ta.selectionEnd || a;
  ta.value = ta.value.slice(0, a) + teks + ta.value.slice(b);
  ta.focus(); ta.selectionStart = ta.selectionEnd = a + teks.length;
  previewWaTpl(key);
}

function resetWaTpl(key) {
  const c = window.AppState.config || {};
  const ta = document.getElementById('waTpl_' + key);
  if (ta && c.waDefault && c.waDefault[key]) { ta.value = c.waDefault[key]; previewWaTpl(key); }
}

function simpanWaTpl() {
  const c = window.AppState.config || {};
  const obj = {};
  WA_TPL_INFO.forEach(([key]) => {
    const v = document.getElementById('waTpl_' + key).value.replace(CR_RE, '');
    /* Sama dengan bawaan → disimpan kosong, agar perbaikan teks bawaan di versi berikutnya tetap terpakai. */
    obj[key] = c.waDefault && v.trim() === String(c.waDefault[key] || '').trim() ? '' : v;
  });
  const btn = document.getElementById('waTplBtn');
  btn.disabled = true;
  gsr(res => {
    btn.disabled = false;
    if (res && res.success) {
      const wa = {};
      WA_TPL_INFO.forEach(([key]) => { wa[key] = obj[key].trim() ? obj[key] : ((c.waDefault && c.waDefault[key]) || ''); });
      window.AppState.config.wa = wa;
      saveAppStateCache();
      showToast('Berhasil', 'Template WA disimpan.', 'success');
    } else showToast('Gagal', (res && res.message) || 'Server tidak merespons.', 'danger');
  }, err => { btn.disabled = false; showToast('Error', err.message || err, 'danger'); }).saveSettings(obj);
}

/* ---------- Tab: Umum (identitas, wilayah utama, tautan, tampilan) ---------- */
function loadManajemenPengaturan() {
  const box = document.getElementById('manajemenContentBox');
  const c = window.AppState.config;
  const home = window.AppState.wilayahHome;
  const utama = c.wilayahUtama || (home && home.utama && home.utama[0]) || '';
  box.innerHTML = `
    <div class="lb-card" style="max-width:560px;">
      <h6 class="fw-bold mb-3">Identitas Aplikasi</h6>
      <div class="mb-3"><label class="form-label">Nama Aplikasi</label>
        <div class="form-control bg-transparent" style="opacity:.85;">LABUKU Desk — Layanan dan Pembukuan KUA</div>
        <div class="small text-secondary mt-1">Nama aplikasi tetap dan tidak dapat diubah.</div></div>
      <div class="mb-3"><label class="form-label">Nama Instansi <span class="text-secondary fw-normal">(tampil di sidebar, form publik, dan pesan WA)</span></label><input type="text" class="form-control" id="setInstansi" value="${escapeHtml(c.instansi || '')}"></div>
      <div class="mb-3"><label class="form-label">Kecamatan utama form antrean</label>
        ${home ? `<select class="form-select" id="setWilayahUtama">${home.kec.map(k => `<option value="${k[0]}" ${k[0] === utama ? 'selected' : ''}>Kec. ${escapeHtml(k[1])}</option>`).join('')}</select>
        <div class="small text-secondary mt-1">${escapeHtml(home.kab[1])}, ${escapeHtml(home.prov[1])}. Pengunjung dari kecamatan ini cukup memilih desa.</div>`
        : '<div class="small text-danger">Data wilayah belum dimuat. Klik Refresh.</div>'}</div>
      <div class="small text-secondary mb-3"><i class="bi bi-link-45deg"></i> Link eksternal (SIMKAH, SRIKANDI, dll.) kini ditambah &amp; diedit langsung di Service Workspace → tab Link Eksternal.</div>
      <button class="btn btn-labuku-primary" onclick="submitPengaturan()"><i class="bi bi-save"></i> Simpan Pengaturan</button>
    </div>
    <div class="lb-card mt-3" style="max-width:560px;">
      <h6 class="fw-bold mb-2">Tampilan</h6>
      <div class="form-check form-switch">
        <input class="form-check-input" type="checkbox" id="darkModeToggleSettings" ${document.documentElement.getAttribute('data-theme') === 'dark' ? 'checked' : ''} onchange="toggleDarkMode()">
        <label class="form-check-label" for="darkModeToggleSettings">Mode Gelap</label>
      </div>
    </div>
  `;
}

function submitPengaturan() {
  const obj = { instansi: document.getElementById('setInstansi').value.trim() };
  const wSel = document.getElementById('setWilayahUtama');
  const wilayahBerubah = !!(wSel && wSel.value && wSel.value !== window.AppState.config.wilayahUtama);
  if (wSel && wSel.value) obj.wilayahUtama = wSel.value;
  gsr()
    .withSuccessHandler(res => {
      if (res && res.success) {
        showToast('Berhasil', res.message, 'success');
        Object.assign(window.AppState.config, obj);
        setSidebarInstansi();
        saveAppStateCache();
        if (wilayahBerubah) fetchBootstrap(false);
      }
      else showToast('Gagal', (res && res.message) || 'Server tidak merespons.', 'danger');
    })
    .withFailureHandler(err => showToast('Error', err.message || err, 'danger'))
    .saveSettings(obj);
}
