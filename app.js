/* ================================================================
   G-Claim — app.js  |  All Application Logic
   Firebase Auth | localStorage DB | Gmail API | Vehicle Lookup
================================================================ */

// ── Firebase Configuration ───────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBWR5ZGKkWS2aQRW0sRPLeQyl7NNkQvfT0",
  authDomain: "g-claim.firebaseapp.com",
  projectId: "g-claim",
  storageBucket: "g-claim.firebasestorage.app",
  messagingSenderId: "268710500867",
  appId: "1:268710500867:web:709697d7624eef5c924c36"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/gmail.readonly');
googleProvider.setCustomParameters({ prompt: 'select_account' });

// ── App State ────────────────────────────────────────────────────
let currentUser     = null;
let currentClaimId  = null;
let claimsFilter    = 'הכל';
let lastClaimsPage  = 'claims';  // to return to from detail
let optBotInterval  = null;
let emailBotInterval= null;
let optBotStats     = { checks: 0, issues: 0, fixes: 0 };

// ── LocalStorage DB ──────────────────────────────────────────────
const db = {
  getClaims:   ()  => JSON.parse(localStorage.getItem('gclaim_claims')   || '[]'),
  saveClaims:  (v) => localStorage.setItem('gclaim_claims',  JSON.stringify(v)),
  getSettings: ()  => JSON.parse(localStorage.getItem('gclaim_settings') || '{}'),
  saveSettings:(v) => localStorage.setItem('gclaim_settings',JSON.stringify(v)),
  getBotStats: ()  => JSON.parse(localStorage.getItem('gclaim_botstats') || '{"checks":0,"issues":0,"fixes":0}'),
  saveBotStats:(v) => localStorage.setItem('gclaim_botstats',JSON.stringify(v)),
};

// ── Utilities ────────────────────────────────────────────────────
const el = id => document.getElementById(id);

function fmt(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('he-IL', { day:'2-digit', month:'2-digit', year:'numeric' });
}
function fmtFull(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('he-IL', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function nowISO() { return new Date().toISOString(); }
function genClaimId() {
  const claims = db.getClaims();
  const n = String(claims.length + 1).padStart(4, '0');
  return `CLM-${new Date().getFullYear()}-${n}`;
}
function money(v) {
  if (!v && v !== 0) return '—';
  return '₪' + Number(v).toLocaleString('he-IL');
}

// ── Toast Notifications ──────────────────────────────────────────
function toast(msg, type = 'info', ms = 3500) {
  const icons = { success:'✅', error:'❌', info:'ℹ️', warning:'⚠️' };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${icons[type]||'•'}</span><span>${msg}</span>`;
  el('toast-container').appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity 0.3s';
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 320);
  }, ms);
}

// ── Auth ─────────────────────────────────────────────────────────
auth.onAuthStateChanged(user => {
  if (user) {
    currentUser = user;
    el('page-login').style.display = 'none';
    el('app').style.display = 'flex';
    initApp();
  } else {
    currentUser = null;
    el('page-login').style.display = 'flex';
    el('app').style.display = 'none';
    const btn = el('btn-login');
    if (btn) { btn.disabled = false; btn.innerHTML = loginBtnHTML(); }
  }
});

function loginBtnHTML() {
  return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:22px;height:22px">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg> התחבר עם Google`;
}

function signIn() {
  const btn = el('btn-login');
  btn.disabled = true;
  btn.innerHTML = '<span style="display:inline-block;border:2px solid #ccc;border-top-color:#333;border-radius:50%;width:18px;height:18px;animation:spin 0.7s linear infinite"></span> מתחבר...';
  el('login-error').style.display = 'none';

  auth.signInWithPopup(googleProvider)
    .then(result => {
      const token = result.credential && result.credential.accessToken;
      if (token) {
        localStorage.setItem('gmail_access_token', token);
        toast('Gmail מחובר בהצלחה!', 'success');
      }
    })
    .catch(err => {
      const errEl = el('login-error');
      errEl.style.display = 'block';
      errEl.textContent = 'שגיאה: ' + (err.message || 'נסה שוב');
      btn.disabled = false;
      btn.innerHTML = loginBtnHTML();
    });
}

function signOut() {
  if (!confirm('האם להתנתק מ-G-Claim?')) return;
  if (optBotInterval)   clearInterval(optBotInterval);
  if (emailBotInterval) clearInterval(emailBotInterval);
  auth.signOut().then(() => toast('התנתקת בהצלחה', 'info'));
}

// ── App Initialization ───────────────────────────────────────────
function initApp() {
  // User info
  const name  = currentUser.displayName || currentUser.email || 'משתמש';
  const photo = currentUser.photoURL;
  el('user-name').textContent = name;
  el('settings-name').textContent = name;
  el('settings-email').textContent = currentUser.email || '—';

  const av = el('user-avatar');
  if (photo) {
    av.innerHTML = `<img src="${photo}" alt="${name}">`;
  } else {
    av.textContent = name.charAt(0).toUpperCase();
  }

  // Dashboard greeting
  const hour = new Date().getHours();
  const greet = hour < 5 ? 'לילה טוב' : hour < 12 ? 'בוקר טוב' : hour < 17 ? 'צהריים טובים' : hour < 21 ? 'ערב טוב' : 'לילה טוב';

  if (!sessionStorage.getItem('welcomed')) {
    toast(`ברוך הבא, ${name}! 👋`, 'success', 4000);
    sessionStorage.setItem('welcomed', 'true');
  }

  // Load custom settings (theme)
  const settings = db.getSettings();
  if (settings.themeColor) {
    document.documentElement.style.setProperty('--primary', settings.themeColor);
    document.documentElement.style.setProperty('--primary-dark', shadeColor(settings.themeColor, -20));
    const cp = el('settings-color');
    if (cp) cp.value = settings.themeColor;
  }
  el('dashboard-greeting').textContent = `${greet}, ${name.split(' ')[0]}! 👋`;

  const today = new Date().toLocaleDateString('he-IL', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  el('dashboard-date').textContent = today;

  // Settings checks
  el('settings-pwa').textContent =
    window.matchMedia('(display-mode: standalone)').matches ? '✅ מותקן' : '⚠️ לא מותקן (פתוח בדפדפן)';

  // Bot stats
  optBotStats = db.getBotStats();
  updateOptBotStatsUI();

  // Gmail status
  checkGmailStatus();

  // Load data
  loadDashboard();
  
  // Timer
  startReminderTimer();

  // Restore bot states
  if (settings.optBotAuto) startOptBotAuto();
  if (settings.emailBotAuto) startEmailBotAuto();

  // Mobile button
  if (window.innerWidth <= 768) {
    el('btn-menu').style.display = 'flex';
  }
  window.addEventListener('resize', () => {
    el('btn-menu').style.display = window.innerWidth <= 768 ? 'flex' : 'none';
  });
  window.addEventListener('online',  () => toast('חיבור אינטרנט חזר 🌐', 'success'));
  window.addEventListener('offline', () => toast('אין חיבור אינטרנט ❌', 'error'));

  // Service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(() => { el('settings-sw').textContent = '✅ פעיל'; })
      .catch(() => { el('settings-sw').textContent = '❌ שגיאה'; });
  } else {
    el('settings-sw').textContent = '⚠️ לא נתמך';
  }
}

// ── Navigation ───────────────────────────────────────────────────
function goPage(pageId, navEl) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  // Show target page
  const target = el('page-' + pageId);
  if (target) {
    target.classList.add('active');
    el('main-content').scrollTop = 0;
  }

  // Highlight nav
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (navEl) {
    navEl.classList.add('active');
  } else {
    const navMatch = el('nav-' + pageId);
    if (navMatch) navMatch.classList.add('active');
  }

  // Close sidebar on mobile
  if (window.innerWidth <= 768) closeSidebar();

  // Page-specific init
  if (pageId === 'dashboard')    loadDashboard();
  if (pageId === 'claims')       loadClaimsPage();
  if (pageId === 'settings')     loadSettings();
  if (pageId === 'new-claim')    clearNewClaimForm();
}

function toggleSidebar() {
  el('sidebar').classList.toggle('open');
  el('sidebar-overlay').classList.toggle('show');
}
function closeSidebar() {
  el('sidebar').classList.remove('open');
  el('sidebar-overlay').classList.remove('show');
}
function goBackToClaims() {
  goPage('claims', el('nav-claims'));
}

// ── Dashboard ────────────────────────────────────────────────────
function loadDashboard() {
  const claims = db.getClaims();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const total     = claims.length;
  const inProcess = claims.filter(c => c.status === 'בטיפול').length;
  const completed = claims.filter(c => c.status === 'הושלם').length;
  const newWeek   = claims.filter(c => new Date(c.createdAt) > weekAgo).length;
  const urgent    = claims.filter(c => c.priority === 'דחוף' && c.status !== 'הושלם' && c.status !== 'בוטל');

  el('stat-total').textContent      = total;
  el('stat-processing').textContent = inProcess;
  el('stat-completed').textContent  = completed;
  el('stat-new-week').textContent   = newWeek;
  el('nav-badge-count').textContent = total;
  el('settings-claims-count').textContent = total;

  // Recent claims (latest 6)
  const sorted = [...claims].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  const recent = sorted.slice(0, 6);

  const recentEl = el('dashboard-recent');
  if (!recent.length) {
    recentEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <div class="empty-title">אין תביעות עדיין</div>
        <div class="empty-sub">לחץ "תביעה חדשה" להוסיף את הראשונה</div>
      </div>`;
  } else {
    recentEl.innerHTML = `<div class="claims-grid">${recent.map(renderClaimCard).join('')}</div>`;
  }

  // Urgent
  const urgentSection = el('urgent-section');
  if (urgent.length > 0) {
    urgentSection.style.display = 'block';
    el('dashboard-urgent').innerHTML = `<div class="claims-grid">${urgent.map(renderClaimCard).join('')}</div>`;
  } else {
    urgentSection.style.display = 'none';
  }
}

function setFilterAndGo(filter) {
  claimsFilter = filter;
  goPage('claims', el('nav-claims'));
}

// ── Claims List ──────────────────────────────────────────────────
function loadClaimsPage() {
  filterClaims();
}

function filterClaims() {
  const claims = db.getClaims();
  const query  = (el('search-claims') ? el('search-claims').value : '').toLowerCase().trim();

  const filtered = claims.filter(c => {
    const matchStatus = claimsFilter === 'הכל'
      || c.status === claimsFilter
      || (claimsFilter === 'דחוף' && c.priority === 'דחוף');
    const matchSearch = !query
      || (c.plateNumber  || '').toLowerCase().includes(query)
      || (c.ownerName    || '').toLowerCase().includes(query)
      || (c.claimNumber  || '').toLowerCase().includes(query)
      || (c.id           || '').toLowerCase().includes(query)
      || (c.insuranceCompany || '').toLowerCase().includes(query);
    return matchStatus && matchSearch;
  }).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));

  const countEl = el('claims-count-text');
  if (countEl) countEl.textContent = `${filtered.length} תביעות`;

  const listEl = el('claims-list');
  if (!listEl) return;

  if (!filtered.length) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <div class="empty-title">לא נמצאו תביעות</div>
        <div class="empty-sub">שנה את הסינון או נקה את החיפוש</div>
      </div>`;
    return;
  }
  listEl.innerHTML = filtered.map(renderClaimCard).join('');

  // Sync filter chips UI if coming from dashboard
  if (claimsFilter !== 'הכל') {
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.classList.toggle('active', chip.textContent.includes(claimsFilter));
    });
  }
}

function setFilter(filter, btn) {
  claimsFilter = filter;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  filterClaims();
}

// ── Claim Card Renderer ──────────────────────────────────────────
function renderClaimCard(claim) {
  const statusMap = {
    'חדש':    'badge-new',
    'בטיפול': 'badge-processing',
    'הושלם':  'badge-completed',
    'בוטל':   'badge-cancelled'
  };
  const statusClass = statusMap[claim.status] || 'badge-new';

  const vehicleParts = [
    claim.vehicleInfo && claim.vehicleInfo.manufacturer,
    claim.vehicleInfo && claim.vehicleInfo.model,
    claim.vehicleInfo && claim.vehicleInfo.year
  ].filter(Boolean);
  const vehicleStr = vehicleParts.join(' ') || '—';

  const urgentBadge = (claim.priority === 'דחוף')
    ? '<span class="badge badge-urgent" style="font-size:0.68rem">דחוף</span>' : '';

  return `
    <div class="claim-card" onclick="openClaim('${claim.id}')">
      <div class="claim-plate">${claim.plateNumber || '—'}</div>
      <div class="claim-info">
        <div class="claim-owner">${claim.ownerName || 'לא ידוע'}</div>
        <div class="claim-meta">
          <span class="claim-meta-item">${vehicleStr}</span>
          <span class="claim-meta-item">${claim.insuranceCompany || '—'}</span>
          <span class="claim-meta-item">${claim.damageType || '—'}</span>
          <span class="claim-meta-item">${fmt(claim.createdAt)}</span>
          ${claim.estimatedCost ? `<span class="claim-meta-item">${money(claim.estimatedCost)}</span>` : ''}
        </div>
      </div>
      <div class="claim-actions">
        <span class="badge ${statusClass}">${claim.status}</span>
        ${urgentBadge}
        <span style="font-size:0.7rem;color:var(--text-dim)">${claim.id}</span>
      </div>
    </div>`;
}

// ── New Claim Form ───────────────────────────────────────────────
function clearNewClaimForm() {
  const fields = [
    'inp-plate','inp-owner-name','inp-owner-phone','inp-owner-email','inp-owner-id',
    'inp-insurance','inp-claim-num','inp-policy-num','inp-appraiser',
    'inp-damage-type','inp-cost','inp-damage-desc','inp-garage-notes'
  ];
  fields.forEach(id => { if (el(id)) el(id).value = ''; });
  if (el('inp-status'))   el('inp-status').value   = 'חדש';
  if (el('inp-priority')) el('inp-priority').value = 'רגיל';
  if (el('vehicle-box'))  el('vehicle-box').classList.remove('show');
  // Reset vehicle info
  ['vi-maker','vi-model','vi-year','vi-color','vi-owner','vi-type'].forEach(id => {
    if (el(id)) el(id).textContent = '—';
  });
}

function saveClaim() {
  const plate     = (el('inp-plate').value || '').trim();
  const ownerName = (el('inp-owner-name').value || '').trim();

  if (!plate)     { toast('נא להזין מספר לוחית רישוי', 'error'); el('inp-plate').focus(); return; }
  if (!ownerName) { toast('נא להזין שם הלקוח', 'error'); el('inp-owner-name').focus(); return; }

  const vehicleBoxShown = el('vehicle-box').classList.contains('show');
  const vehicleInfo = vehicleBoxShown ? {
    manufacturer: el('vi-maker').textContent,
    model:        el('vi-model').textContent,
    year:         el('vi-year').textContent,
    color:        el('vi-color').textContent,
    ownerType:    el('vi-owner').textContent,
    type:         el('vi-type').textContent
  } : {};

  const claim = {
    id:               genClaimId(),
    plateNumber:      plate,
    vehicleInfo,
    ownerName,
    ownerPhone:       (el('inp-owner-phone').value  || '').trim(),
    ownerEmail:       (el('inp-owner-email').value  || '').trim(),
    ownerId:          (el('inp-owner-id').value     || '').trim(),
    insuranceCompany: el('inp-insurance').value,
    claimNumber:      (el('inp-claim-num').value    || '').trim(),
    policyNumber:     (el('inp-policy-num').value   || '').trim(),
    appraiser:        (el('inp-appraiser').value    || '').trim(),
    damageType:       el('inp-damage-type').value,
    status:           el('inp-status').value,
    priority:         el('inp-priority').value,
    estimatedCost:    el('inp-cost').value || 0,
    damageDescription:(el('inp-damage-desc').value  || '').trim(),
    garageNotes:      (el('inp-garage-notes').value || '').trim(),
    notes:            [],
    emails:           [],
    createdAt:        nowISO(),
    updatedAt:        nowISO(),
    createdBy:        currentUser ? currentUser.email : 'unknown'
  };

  const claims = db.getClaims();
  claims.push(claim);
  db.saveClaims(claims);

  toast('✅ התביעה נשמרה בהצלחה! ' + claim.id, 'success');
  loadDashboard();
  goPage('claims', el('nav-claims'));
}

// ── Claim Detail ─────────────────────────────────────────────────
function openClaim(id) {
  const claims = db.getClaims();
  const claim  = claims.find(c => c.id === id);
  if (!claim) { toast('התביעה לא נמצאה', 'error'); return; }

  currentClaimId = id;
  lastClaimsPage = document.querySelector('.page.active')?.id || 'page-claims';

  // Header
  el('detail-id-sub').textContent     = claim.id;
  el('detail-plate').textContent       = claim.plateNumber || '—';
  el('detail-owner').textContent       = claim.ownerName   || '—';

  const vArr = [
    claim.vehicleInfo && claim.vehicleInfo.manufacturer,
    claim.vehicleInfo && claim.vehicleInfo.model,
    claim.vehicleInfo && claim.vehicleInfo.year,
    claim.vehicleInfo && claim.vehicleInfo.color ? `(${claim.vehicleInfo.color})` : null
  ].filter(Boolean);
  el('detail-vehicle').textContent = vArr.join(' ') || '—';

  // Status badge
  el('detail-status-select').value = claim.status;
  setDetailStatusBadge(claim.status);

  // Fields
  el('detail-phone').textContent      = claim.ownerPhone        || '—';
  el('detail-email').textContent      = claim.ownerEmail        || '—';
  el('detail-id-num').textContent     = claim.ownerId           || '—';
  el('detail-insurance').textContent  = claim.insuranceCompany  || '—';
  el('detail-claim-num').textContent  = claim.claimNumber       || '—';
  el('detail-policy').textContent     = claim.policyNumber      || '—';
  el('detail-damage').textContent     = claim.damageType        || '—';
  el('detail-cost').textContent       = money(claim.estimatedCost);
  el('detail-priority').textContent   = claim.priority          || '—';
  el('detail-appraiser').textContent  = claim.appraiser         || '—';
  el('detail-created').textContent    = fmtFull(claim.createdAt);
  el('detail-updated').textContent    = fmtFull(claim.updatedAt);

  // Desc
  el('detail-desc-text').textContent    = claim.damageDescription || '(ללא תיאור)';
  el('detail-garage-notes').textContent = claim.garageNotes       || '(ללא הערות)';

  // Notes & Emails tabs
  renderNotesTab(claim);
  renderEmailsTab(claim);

  // Reset tabs to first
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector('.tab').classList.add('active');
  el('tab-desc').classList.add('active');

  goPage('claim-detail');
}

function setDetailStatusBadge(status) {
  const map = {
    'חדש':    'badge-new',
    'בטיפול': 'badge-processing',
    'הושלם':  'badge-completed',
    'בוטל':   'badge-cancelled'
  };
  const badge = el('detail-status-badge');
  badge.className = 'badge ' + (map[status] || 'badge-new');
  badge.textContent = status;
}

function updateClaimStatus() {
  const newStatus = el('detail-status-select').value;
  const claims = db.getClaims();
  const idx = claims.findIndex(c => c.id === currentClaimId);
  if (idx < 0) return;
  claims[idx].status    = newStatus;
  claims[idx].updatedAt = nowISO();
  db.saveClaims(claims);
  setDetailStatusBadge(newStatus);
  loadDashboard();
  toast(`סטטוס עודכן: ${newStatus}`, 'success');
}

function deleteClaim() {
  if (!confirm(`למחוק את התביעה ${currentClaimId}?\nלא ניתן לשחזר!`)) return;
  let claims = db.getClaims();
  claims = claims.filter(c => c.id !== currentClaimId);
  db.saveClaims(claims);
  toast('התביעה נמחקה', 'info');
  loadDashboard();
  goPage('claims', el('nav-claims'));
}

// ── Notes Tab ────────────────────────────────────────────────────
function addNote() {
  const text = (el('inp-new-note').value || '').trim();
  if (!text) { toast('כתוב הערה תחילה', 'warning'); return; }

  const claims = db.getClaims();
  const idx    = claims.findIndex(c => c.id === currentClaimId);
  if (idx < 0) return;

  const note = {
    id:   Date.now(),
    text,
    time: nowISO(),
    user: currentUser ? (currentUser.displayName || currentUser.email) : 'משתמש'
  };
  if (!claims[idx].notes) claims[idx].notes = [];
  claims[idx].notes.unshift(note);
  claims[idx].updatedAt = nowISO();
  db.saveClaims(claims);

  el('inp-new-note').value = '';
  renderNotesTab(claims[idx]);
  toast('הערה נוספה', 'success');
}

function renderNotesTab(claim) {
  const container = el('detail-notes-list');
  if (!container) return;
  if (!claim.notes || !claim.notes.length) {
    container.innerHTML = `<div style="color:var(--text-dim);font-size:0.85rem;padding:0.5rem 0">אין הערות עדיין</div>`;
    return;
  }
  container.innerHTML = claim.notes.map(n => `
    <div class="note-item">
      <div class="note-text">${escapeHtml(n.text)}</div>
      <div class="note-meta">${escapeHtml(n.user || '')} · ${fmtFull(n.time)}</div>
    </div>`).join('');
}

// ── Emails Tab ───────────────────────────────────────────────────
function renderEmailsTab(claim) {
  const container = el('detail-emails-list');
  if (!container) return;
  if (!claim.emails || !claim.emails.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✉</div>
        <div class="empty-title">אין אימיילים מקושרים</div>
        <div class="empty-sub">הפעל את Email Bot לסריקה</div>
      </div>`;
    return;
  }
  container.innerHTML = claim.emails.map(e => `
    <div class="email-item linked">
      <div class="email-top">
        <div class="email-from">${escapeHtml(e.from || '—')}</div>
        <span class="badge badge-completed" style="font-size:0.68rem">🔗 מקושר</span>
      </div>
      <div class="email-subject">${escapeHtml(e.subject || '(ללא נושא)')}</div>
      <div class="email-snippet">${escapeHtml(e.snippet || '')}</div>
      <div class="email-footer"><span>${fmt(e.date)}</span></div>
    </div>`).join('');
}

// ── Tabs ─────────────────────────────────────────────────────────
function switchTab(tabId, tabEl) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  tabEl.classList.add('active');
  const content = el('tab-' + tabId);
  if (content) content.classList.add('active');
}

// ── Vehicle Lookup (data.gov.il) ─────────────────────────────────
async function lookupVehicle() {
  const rawPlate = (el('inp-plate').value || '').trim();
  const plate = rawPlate.replace(/-/g, '');

  if (plate.length < 5) {
    toast('הזן מספר לוחית תקין (לפחות 5 ספרות)', 'error');
    return;
  }

  const btn = el('btn-lookup');
  btn.disabled  = true;
  btn.textContent = '⏳ מחפש...';
  el('vehicle-box').classList.remove('show');

  try {
    const url = `https://data.gov.il/api/3/action/datastore_search?resource_id=053cea08-09bc-40ec-8f7a-156f0677aff3&q=${plate}&limit=5`;
    const res  = await fetch(url);
    const data = await res.json();

    if (data.success && data.result && data.result.records.length > 0) {
      const r = data.result.records[0];
      el('vi-maker').textContent = r['tozeret_nm']    || r['tozeret_cd']  || '—';
      el('vi-model').textContent = r['kinuy_mishari'] || r['degem_nm']   || '—';
      el('vi-year').textContent  = r['shnat_yitzur']  || '—';
      el('vi-color').textContent = r['tzeva_rechev']  || '—';
      el('vi-owner').textContent = r['baalut']        || '—';
      el('vi-type').textContent  = r['sug_degem_nm']  || r['sug_rechev_nm'] || '—';
      el('vehicle-box').classList.add('show');
      toast('✅ רכב נמצא במרשם הלאומי', 'success');
    } else {
      toast('לוחית לא נמצאה במרשם הרכב', 'warning');
    }
  } catch (e) {
    toast('שגיאה בחיפוש רכב: ' + e.message, 'error');
  } finally {
    btn.disabled  = false;
    btn.textContent = '🔍 חפש רכב';
  }
}

// ── Optimization Bot ─────────────────────────────────────────────
function addOptLog(msg, type = 'info') {
  const logEl = el('optbot-log');
  if (!logEl) return;
  const time = new Date().toLocaleTimeString('he-IL');
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `<span class="log-time">${time}</span><span class="log-msg ${type}">${msg}</span>`;
  logEl.insertBefore(entry, logEl.firstChild);
  while (logEl.children.length > 200) logEl.removeChild(logEl.lastChild);
}

function clearOptLog() {
  const logEl = el('optbot-log');
  if (logEl) logEl.innerHTML = `
    <div class="log-entry">
      <span class="log-time">--:--:--</span>
      <span class="log-msg">לוג נוקה.</span>
    </div>`;
}

function updateOptBotStatsUI() {
  if (el('optbot-checks')) el('optbot-checks').textContent = optBotStats.checks;
  if (el('optbot-issues')) el('optbot-issues').textContent = optBotStats.issues;
  if (el('optbot-fixes'))  el('optbot-fixes').textContent  = optBotStats.fixes;
}

function optBotRunNow() {
  const claims = db.getClaims();
  addOptLog(`🚀 מריץ בדיקה על ${claims.length} תביעות...`, 'info');

  if (el('optbot-status-dot')) el('optbot-status-dot').className = 'dot orange pulse';
  if (el('optbot-dot'))        el('optbot-dot').className        = 'dot orange pulse';
  if (el('optbot-status-text'))el('optbot-status-text').textContent = 'רץ...';

  setTimeout(() => {
    let issues  = 0;
    let fixes   = 0;
    let changed = false;

    claims.forEach(claim => {
      optBotStats.checks++;

      // Missing owner name
      if (!claim.ownerName || !claim.ownerName.trim()) {
        addOptLog(`⚠️  ${claim.id}: חסר שם לקוח`, 'warning');
        issues++;
      }
      // Missing phone
      if (!claim.ownerPhone) {
        addOptLog(`⚠️  ${claim.id}: חסר טלפון`, 'warning');
        issues++;
      }
      // Missing insurance
      if (!claim.insuranceCompany) {
        addOptLog(`⚠️  ${claim.id}: חסרת חברת ביטוח`, 'warning');
        issues++;
      }
      // Stale "בטיפול" (> 30 days)
      const ageDays = (Date.now() - new Date(claim.createdAt)) / 864e5;
      if (claim.status === 'בטיפול' && ageDays > 30) {
        addOptLog(`🔴 ${claim.id}: בטיפול כבר ${Math.round(ageDays)} ימים — מומלץ לעדכן`, 'error');
        issues++;
      }
      // Auto-fix: trim plate
      if (claim.plateNumber && claim.plateNumber !== claim.plateNumber.trim()) {
        claim.plateNumber = claim.plateNumber.trim();
        changed = true; fixes++;
        addOptLog(`🔧 ${claim.id}: הוסרו רווחים מלוחית הרישוי`, 'success');
      }
      // Auto-fix: normalize status
      const validStatuses = ['חדש','בטיפול','הושלם','בוטל'];
      if (claim.status && !validStatuses.includes(claim.status)) {
        claim.status = 'חדש';
        changed = true; fixes++;
        addOptLog(`🔧 ${claim.id}: סטטוס לא תקין תוקן ל"חדש"`, 'success');
      }
    });

    if (changed) db.saveClaims(claims);

    optBotStats.issues += issues;
    optBotStats.fixes  += fixes;
    db.saveBotStats(optBotStats);
    updateOptBotStatsUI();

    if (issues === 0 && fixes === 0) {
      addOptLog('✅ כל הנתונים תקינים! אין בעיות.', 'success');
    } else {
      addOptLog(`📊 סיכום: ${issues} בעיות, ${fixes} תוקנו`, issues > 0 ? 'warning' : 'success');
    }

    if (el('optbot-status-dot')) el('optbot-status-dot').className = 'dot green';
    if (el('optbot-dot'))        el('optbot-dot').className        = 'dot green';
    if (el('optbot-status-text'))el('optbot-status-text').textContent = 'פעיל';
    if (el('optbot-last-run'))   el('optbot-last-run').textContent   = 'ריצה אחרונה: ' + new Date().toLocaleTimeString('he-IL');

    loadDashboard();
  }, 800);
}

function toggleOptBot() {
  const toggle   = el('optbot-toggle');
  const settings = db.getSettings();
  if (optBotInterval) {
    clearInterval(optBotInterval);
    optBotInterval = null;
    if (toggle) toggle.classList.remove('on');
    if (el('optbot-status-dot')) el('optbot-status-dot').className = 'dot';
    if (el('optbot-dot'))        el('optbot-dot').className        = 'dot';
    if (el('optbot-status-text'))el('optbot-status-text').textContent = 'כובה';
    settings.optBotAuto = false;
    toast('בוט אופטימיזציה כובה', 'info');
  } else {
    startOptBotAuto();
    settings.optBotAuto = true;
    toast('בוט הופעל — ירוץ כל 5 דקות', 'success');
  }
  db.saveSettings(settings);
}

function startOptBotAuto() {
  const toggle = el('optbot-toggle');
  if (toggle) toggle.classList.add('on');
  optBotRunNow();
  optBotInterval = setInterval(optBotRunNow, 5 * 60 * 1000);
}

// ── Email Bot ────────────────────────────────────────────────────
function checkGmailStatus() {
  const token = localStorage.getItem('gmail_access_token');
  const connected = !!token;
  if (el('emailbot-dot'))        el('emailbot-dot').className        = connected ? 'dot green' : 'dot orange';
  if (el('emailbot-status-dot')) el('emailbot-status-dot').className = connected ? 'dot green' : 'dot orange';
  if (el('emailbot-status-text'))el('emailbot-status-text').textContent = connected ? 'מחובר ל-Gmail ✅' : 'לא מחובר ל-Gmail';
  if (el('settings-gmail'))      el('settings-gmail').textContent = connected ? '✅ מחובר' : '❌ לא מחובר';
}

function connectGmail() {
  toast('פותח חלון Google...', 'info');
  auth.signInWithPopup(googleProvider)
    .then(result => {
      const token = result.credential && result.credential.accessToken;
      if (token) {
        localStorage.setItem('gmail_access_token', token);
        checkGmailStatus();
        toast('Gmail מחובר בהצלחה! ✅', 'success');
      } else {
        toast('לא התקבל access token. נסה שוב.', 'error');
      }
    })
    .catch(e => toast('שגיאה: ' + e.message, 'error'));
}

async function emailBotScan() {
  const token = localStorage.getItem('gmail_access_token');
  if (!token) {
    toast('נדרש חיבור Gmail תחילה', 'warning');
    connectGmail();
    return;
  }

  const scanBtn = el('btn-email-scan');
  if (scanBtn) { scanBtn.disabled = true; scanBtn.innerHTML = '⏳ סורק...'; }
  if (el('emailbot-dot')) el('emailbot-dot').className = 'dot orange pulse';

  try {
    const query = encodeURIComponent('רכב OR תביעה OR ביטוח OR מוסך');
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=25`,
      { headers: { Authorization: 'Bearer ' + token } }
    );

    if (!listRes.ok) {
      if (listRes.status === 401) {
        localStorage.removeItem('gmail_access_token');
        checkGmailStatus();
        toast('הסשן פג תוקף. נא להתחבר שוב ל-Gmail.', 'error');
        return;
      }
      throw new Error(`Gmail API error: ${listRes.status}`);
    }

    const listData = await listRes.json();
    const messages = listData.messages || [];
    if (el('emailbot-count')) el('emailbot-count').textContent = `${messages.length} אימיילים`;

    if (!messages.length) {
      el('emailbot-list').innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <div class="empty-title">לא נמצאו אימיילים רלוונטיים</div>
          <div class="empty-sub">נסה לשנות את מילות החיפוש</div>
        </div>`;
      return;
    }

    // Fetch details for first 15 messages
    const detailsArr = await Promise.all(
      messages.slice(0, 15).map(m =>
        fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          { headers: { Authorization: 'Bearer ' + token } }
        ).then(r => r.json())
      )
    );

    // -- Update Claims based on Emails --
    let claims = db.getClaims();
    let updatedClaims = false;
    const plateRegex = /\\b\\d{2}-?\\d{3}-?\\d{2,3}\\b/g;

    detailsArr.forEach(email => {
      const headers = (email.payload && email.payload.headers) || [];
      const subject = (headers.find(h => h.name === 'Subject') || {}).value || '(ללא נושא)';
      const from    = (headers.find(h => h.name === 'From')    || {}).value || '—';
      const date    = (headers.find(h => h.name === 'Date')    || {}).value || null;
      const snippet = email.snippet || '';

      const combined = subject + ' ' + snippet;
      const plates   = (combined.match(plateRegex) || []);

      if (plates.length > 0) {
        const claimIdx = claims.findIndex(c => plates.some(p => (c.plateNumber||'').replace(/-/g,'') === p.replace(/-/g,'')));
        if (claimIdx !== -1) {
          const claim = claims[claimIdx];
          if (!claim.emails) claim.emails = [];

          // Save email to claim if not already saved
          if (!claim.emails.some(e => e.id === email.id)) {
            claim.emails.unshift({
              id: email.id,
              subject,
              from: from.replace(/<[^>]+>/g,'').trim(),
              snippet: snippet.substring(0, 150),
              date: date ? new Date(date).toISOString() : nowISO()
            });
            updatedClaims = true;

            // Auto-update status based on email content
            const text = combined.toLowerCase();
            if (text.includes('אישור') || text.includes('סגירה') || text.includes('הושלם') || text.includes('תשלום') || text.includes('approved')) {
              claim.status = 'הושלם';
            } else if (text.includes('שמאות') || text.includes('בדיקה') || text.includes('חסר') || text.includes('מסמכים') || text.includes('pending')) {
              if (claim.status === 'חדש') claim.status = 'בטיפול';
            }
            claim.updatedAt = nowISO();
          }
        }
      }
    });

    if (updatedClaims) {
      db.saveClaims(claims);
      loadDashboard();
      if (document.querySelector('#page-claims.active')) filterClaims();
    }

    renderEmailBotList(detailsArr, claims);
    if (el('emailbot-dot')) el('emailbot-dot').className = 'dot green';
    toast(`נמצאו ${messages.length} אימיילים וקושרו לתביעות`, 'success');

  } catch (e) {
    toast('שגיאה בסריקה: ' + e.message, 'error');
    if (el('emailbot-dot')) el('emailbot-dot').className = 'dot orange';
  } finally {
    if (scanBtn) { scanBtn.disabled = false; scanBtn.innerHTML = '📧 סרוק אימיילים'; }
  }
}

function renderEmailBotList(emails, latestClaims) {
  const claims  = latestClaims || db.getClaims();
  const listEl  = el('emailbot-list');
  if (!listEl) return;

  const plateRegex = /\b\d{2}-?\d{3}-?\d{2,3}\b/g;

  const html = emails.map(email => {
    const headers = (email.payload && email.payload.headers) || [];
    const subject = (headers.find(h => h.name === 'Subject') || {}).value || '(ללא נושא)';
    const from    = (headers.find(h => h.name === 'From')    || {}).value || '—';
    const date    = (headers.find(h => h.name === 'Date')    || {}).value || null;
    const snippet = email.snippet || '';

    const combined = subject + ' ' + snippet;
    const plates   = (combined.match(plateRegex) || []);
    const linkedClaim = plates.length
      ? claims.find(c => plates.some(p => (c.plateNumber||'').replace(/-/g,'') === p.replace(/-/g,'')))
      : null;

    const linkedBadge = linkedClaim
      ? `<span class="badge badge-completed" style="font-size:0.68rem;flex-shrink:0">🔗 ${linkedClaim.id}</span>`
      : (plates.length ? `<span class="badge badge-new" style="font-size:0.68rem;flex-shrink:0">🔢 ${plates[0]}</span>` : '');

    const fromName = from.replace(/<[^>]+>/g,'').trim();

    return `
      <div class="email-item ${linkedClaim ? 'linked' : ''}" onclick="handleEmailClick('${email.id}','${linkedClaim ? linkedClaim.id : ''}')">
        <div class="email-top">
          <div class="email-from">${escapeHtml(fromName)}</div>
          ${linkedBadge}
        </div>
        <div class="email-subject">${escapeHtml(subject)}</div>
        <div class="email-snippet">${escapeHtml(snippet.substring(0, 120))}${snippet.length > 120 ? '...' : ''}</div>
        <div class="email-footer">
          <span>${date ? new Date(date).toLocaleDateString('he-IL') : '—'}</span>
          ${plates.length ? `<span>לוחית: ${plates.join(', ')}</span>` : ''}
        </div>
      </div>`;
  }).join('');

  listEl.innerHTML = html;
}

function handleEmailClick(emailId, claimId) {
  if (claimId) {
    toast(`פותח תביעה ${claimId}`, 'info');
    openClaim(claimId);
  } else {
    toast('לא נמצאה תביעה מתאימה לאימייל זה', 'info');
  }
}

function toggleEmailBot() {
  const toggle   = el('emailbot-toggle');
  const settings = db.getSettings();
  if (emailBotInterval) {
    clearInterval(emailBotInterval);
    emailBotInterval = null;
    if (toggle) toggle.classList.remove('on');
    settings.emailBotAuto = false;
    toast('Email Bot כובה', 'info');
  } else {
    startEmailBotAuto();
    settings.emailBotAuto = true;
    toast('Email Bot הופעל — סריקה כל שעה', 'success');
  }
  db.saveSettings(settings);
}

function startEmailBotAuto() {
  const toggle = el('emailbot-toggle');
  if (toggle) toggle.classList.add('on');
  emailBotScan();
  emailBotInterval = setInterval(emailBotScan, 60 * 60 * 1000);
}

function quickScan() {
  toast('⏳ מריץ סריקת Gmail...', 'info');
  emailBotScan();
}

// ── Settings ─────────────────────────────────────────────────────
function loadSettings() {
  const count = db.getClaims().length;
  if (el('settings-claims-count')) el('settings-claims-count').textContent = count;
  if (el('settings-name'))  el('settings-name').textContent  = currentUser ? (currentUser.displayName || '—') : '—';
  if (el('settings-email')) el('settings-email').textContent = currentUser ? (currentUser.email || '—') : '—';
  checkGmailStatus();
}

function exportData() {
  const payload = {
    claims:      db.getClaims(),
    exportDate:  nowISO(),
    exportedBy:  currentUser ? currentUser.email : 'unknown',
    version:     '1.0'
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `gclaim-export-${new Date().toLocaleDateString('he-IL').replace(/\//g,'-')}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('נתונים יוצאו בהצלחה 📤', 'success');
}

function importData() {
  const input = document.createElement('input');
  input.type  = 'file';
  input.accept = '.json';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!Array.isArray(data.claims)) throw new Error('מבנה JSON לא תקין — חסר "claims"');
        if (!confirm(`ייבוא ${data.claims.length} תביעות?\nתביעות קיימות ישמרו (מיזוג לפי ID).`)) return;
        const existing = db.getClaims();
        const existingIds = new Set(existing.map(c => c.id));
        const toAdd = data.claims.filter(c => !existingIds.has(c.id));
        db.saveClaims([...existing, ...toAdd]);
        loadDashboard();
        toast(`יובאו ${toAdd.length} תביעות חדשות`, 'success');
      } catch (err) {
        toast('שגיאה בייבוא: ' + err.message, 'error');
      }
    };
    reader.readAsText(file, 'utf-8');
  };
  input.click();
}

function clearAllData() {
  if (!confirm('מחיקת כל נתוני G-Claim?\nפעולה בלתי הפיכה!')) return;
  if (!confirm('לחץ אישור שוב לאישור סופי.')) return;
  localStorage.removeItem('gclaim_claims');
  localStorage.removeItem('gclaim_botstats');
  optBotStats = { checks: 0, issues: 0, fixes: 0 };
  updateOptBotStatsUI();
  loadDashboard();
  toast('כל הנתונים נמחקו', 'info');
}

// ── Helper: HTML Escape ──────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── PWA Service Worker ───────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(console.error);
  });
}

// ── Key Bindings ─────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  // Esc → close sidebar on mobile
  if (e.key === 'Escape') closeSidebar();
});

// ── Timer Logic ──────────────────────────────────────────────────
let reminderTimer = 300; // 5 minutes in seconds
let reminderInterval = null;

function startReminderTimer() {
  if (reminderInterval) clearInterval(reminderInterval);
  updateTimerUI();
  reminderInterval = setInterval(() => {
    reminderTimer--;
    if (reminderTimer <= 0) {
      reminderTimer = 0;
      clearInterval(reminderInterval);
      toast('🔔 תזכורת! הגיע הזמן לבדוק נתונים', 'warning', 6000);
      const navTimer = el('nav-timer');
      if (navTimer) navTimer.classList.add('timer-alert');
    }
    updateTimerUI();
  }, 1000);
}

function resetTimer() {
  reminderTimer = 300;
  const navTimer = el('nav-timer');
  if (navTimer) navTimer.classList.remove('timer-alert');
  startReminderTimer();
  toast('טיימר אופס בהצלחה ל-5 דקות', 'success');
}

function updateTimerUI() {
  const m = Math.floor(reminderTimer / 60).toString().padStart(2, '0');
  const s = (reminderTimer % 60).toString().padStart(2, '0');
  const txt = el('timer-text');
  if (txt) txt.textContent = `תזכורת: ${m}:${s}`;
}
