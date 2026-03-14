// app.js — RFID Attendance Portal Frontend Logic
'use strict';

const API = ''; // Same origin — backend serves frontend

// ─── Admin Key (stored in sessionStorage) ────────────────────────
// The admin key is entered by the user in the login modal and stored
// for the session. It is sent as X-Admin-Key on protected requests.
// It is NEVER hardcoded here — enter it via the Admin Login button.

function getAdminKey() {
  return sessionStorage.getItem('adminKey') || '';
}

function isAdmin() {
  return !!getAdminKey();
}

// ─── Clock ────────────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  document.getElementById('header-clock').textContent =
    now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
setInterval(updateClock, 1000);
updateClock();

// ─── Tab Navigation ───────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`panel-${target}`).classList.add('active');
    // Load data for the activated tab
    if (target === 'dashboard')  { loadStats(); loadTodayAttendance(); }
    if (target === 'attendance') { loadAttendanceByDate(); }
    if (target === 'students')   loadStudents();
    if (target === 'absent')     loadAbsent();
  });
});

// ─── Toast Notifications ──────────────────────────────────────────
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'success' ? 'success-t' : 'error-t'}`;
  toast.innerHTML = `<span>${type === 'success' ? '✅' : '❌'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ─── API Helper ───────────────────────────────────────────────────
async function apiFetch(url, options = {}) {
  try {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    // Attach admin key for any mutating request that needs it
    const adminKey = getAdminKey();
    if (adminKey) headers['X-Admin-Key'] = adminKey;
    const res = await fetch(url, { headers, ...options });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, data: { error: err.message } };
  }
}

// ─── XSS sanitizer ────────────────────────────────────────────────
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Format helpers ───────────────────────────────────────────────
function formatTime(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Admin Login Modal ────────────────────────────────────────────
function openAdminModal() {
  document.getElementById('admin-modal').classList.add('open');
  document.getElementById('admin-key-input').value = '';
  document.getElementById('admin-key-error').style.display = 'none';
  setTimeout(() => document.getElementById('admin-key-input').focus(), 100);
}

function closeAdminModal() {
  document.getElementById('admin-modal').classList.remove('open');
}

function closeAdminModalIfBg(event) {
  if (event.target.id === 'admin-modal') closeAdminModal();
}

async function submitAdminKey() {
  const key = document.getElementById('admin-key-input').value.trim();
  if (!key) return;

  const btn = document.getElementById('modal-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Verifying…';

  // Verify the key by attempting a protected endpoint (GET /api/students is open,
  // so we do a dummy check: try to GET students and verify the X-Admin-Key is accepted
  // by the server via a lightweight probe against /api/ping (which won't reject it, but
  // we store the key and test it on the next actual mutating action).
  // Better: verify by calling a protected endpoint. We'll POST a fake student lookup check.
  // Simplest reliable test: call POST /api/students with an intentionally bad (incomplete) body
  // and see if we get 400 (key accepted) vs 401 (key wrong).
  const res = await fetch('/api/students', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Key': key },
    body: JSON.stringify({}), // incomplete — will return 400 if auth passed, 401 if not
  });

  btn.disabled = false;
  btn.textContent = 'Unlock Admin';

  if (res.status === 401) {
    document.getElementById('admin-key-error').style.display = 'block';
    return;
  }

  // Key accepted (400 = validation error = auth passed ✅)
  sessionStorage.setItem('adminKey', key);
  closeAdminModal();
  updateAdminUI();
  showToast('Admin access granted! 🔑');
  loadStudents(); // reload to show delete buttons
}

function adminLogout() {
  sessionStorage.removeItem('adminKey');
  updateAdminUI();
  showToast('Logged out of admin mode.');
  loadStudents();
}

// ─── Update UI based on admin status ─────────────────────────────
function updateAdminUI() {
  const admin = isAdmin();

  // Header badge & buttons
  const badge = document.getElementById('admin-badge');
  badge.textContent = admin ? '🔑 Admin' : '👁 View Only';
  badge.className   = `admin-badge ${admin ? 'is-admin' : 'view-only'}`;
  document.getElementById('admin-login-btn').style.display  = admin ? 'none' : '';
  document.getElementById('admin-logout-btn').style.display = admin ? '' : 'none';

  // Students tab
  const form   = document.getElementById('add-student-form');
  const notice = document.getElementById('admin-required-notice');
  form.style.display   = admin ? '' : 'none';
  notice.style.display = admin ? 'none' : '';

  // Hide/show action column header
  const actionCol = document.getElementById('action-col-header');
  if (actionCol) actionCol.style.display = admin ? '' : 'none';

  // SMS tab
  const smsNotice = document.getElementById('sms-admin-notice');
  const notifyBtn = document.getElementById('notify-btn');
  if (smsNotice) smsNotice.style.display = admin ? 'none' : '';
  if (notifyBtn) notifyBtn.style.display = admin ? '' : 'none';
}

// ─── Dashboard ────────────────────────────────────────────────────
async function loadStats() {
  const { ok, data } = await apiFetch('/api/stats');
  if (!ok) return;
  document.getElementById('stat-present').textContent = data.presentToday ?? '—';
  document.getElementById('stat-absent').textContent  = data.absentToday  ?? '—';
  document.getElementById('stat-total').textContent   = data.totalStudents ?? '—';
  document.getElementById('stat-date').textContent    = formatDate(data.date + 'T00:00:00');
  document.getElementById('badge-absent').textContent  = data.absentToday ?? '0';
}

async function loadTodayAttendance() {
  const today = new Date().toISOString().slice(0, 10);
  const { ok, data } = await apiFetch(`/api/attendance?date=${today}`);
  const tbody = document.getElementById('today-table-body');

  if (!ok || !data.records || data.records.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="es-icon">📭</div><p>No attendance yet today.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = data.records.map((r, i) => `
    <tr>
      <td style="color:var(--text-muted)">${i + 1}</td>
      <td><strong>${esc(r.name)}</strong></td>
      <td>${esc(r.roll_no)}</td>
      <td>${esc(r.class)}</td>
      <td style="color:var(--success)">${formatTime(r.scan_time)}</td>
    </tr>
  `).join('');
}

// ─── Attendance by Date ───────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0, 10); }

// Set default date to today
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('att-date').value = todayStr();
  updateAdminUI();
  loadStats();
  loadTodayAttendance();
  loadStudents();
});

// Auto-refresh dashboard every 15s
setInterval(() => {
  const dash = document.getElementById('panel-dashboard');
  if (dash.classList.contains('active')) { loadStats(); loadTodayAttendance(); }
}, 15000);

let attData = []; // for export

async function loadAttendanceByDate() {
  const date = document.getElementById('att-date').value || todayStr();
  const { ok, data } = await apiFetch(`/api/attendance?date=${date}`);
  const tbody = document.getElementById('att-table-body');

  if (!ok || !data.records || data.records.length === 0) {
    attData = [];
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="es-icon">📭</div><p>No attendance records for ${date}.</p></div></td></tr>`;
    return;
  }

  attData = data.records;
  tbody.innerHTML = data.records.map((r, i) => `
    <tr>
      <td style="color:var(--text-muted)">${i + 1}</td>
      <td><strong>${esc(r.name)}</strong></td>
      <td>${esc(r.roll_no)}</td>
      <td>${esc(r.class)}</td>
      <td><span class="chip uid">${esc(r.uid)}</span></td>
      <td>${formatTime(r.scan_time)}</td>
    </tr>
  `).join('');
}

function exportCSV() {
  if (!attData.length) { showToast('No data to export', 'error'); return; }
  const date = document.getElementById('att-date').value || todayStr();
  const header = 'Name,Roll No,Class,UID,Scan Time';
  const rows = attData.map(r => `${r.name},${r.roll_no},${r.class},${r.uid},${r.scan_time}`);
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `attendance_${date}.csv`;
  a.click();
  showToast('CSV exported!');
}

// ─── Students Management ──────────────────────────────────────────
async function loadStudents() {
  const { ok, data } = await apiFetch('/api/students');
  const tbody = document.getElementById('students-table-body');

  document.getElementById('badge-students').textContent =
    (ok && data.students) ? data.students.length : '0';

  if (!ok || !data.students || data.students.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="es-icon">👨‍🎓</div><p>No students registered yet. Add one above.</p></div></td></tr>`;
    return;
  }

  const admin = isAdmin();
  tbody.innerHTML = data.students.map((s, i) => `
    <tr>
      <td style="color:var(--text-muted)">${i + 1}</td>
      <td><strong>${esc(s.name)}</strong></td>
      <td>${esc(s.roll_no)}</td>
      <td>${esc(s.class)}</td>
      <td><span class="chip uid">${esc(s.uid)}</span></td>
      <td>${esc(s.parent_phone)}</td>
      <td style="color:var(--text-muted);font-size:0.8rem">${formatDate(s.created_at)}</td>
      <td>${admin
        ? `<button class="btn btn-danger btn-sm btn-icon" title="Remove student"
             onclick="removeStudent('${esc(s.uid)}', '${esc(s.name)}')">🗑</button>`
        : `<span style="color:var(--text-muted);font-size:0.8rem">—</span>`
      }</td>
    </tr>
  `).join('');
}

async function addStudent(e) {
  e.preventDefault();
  const btn = document.getElementById('add-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Registering…';

  const payload = {
    uid:          document.getElementById('f-uid').value.trim().toUpperCase(),
    name:         document.getElementById('f-name').value.trim(),
    roll_no:      document.getElementById('f-roll').value.trim(),
    class:        document.getElementById('f-class').value.trim(),
    phone:        document.getElementById('f-phone').value.trim(),
    parent_phone: document.getElementById('f-parent').value.trim(),
  };

  const { ok, data } = await apiFetch('/api/students', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  btn.disabled = false;
  btn.innerHTML = '➕ Register Student';

  if (ok) {
    showToast(`${payload.name} registered!`);
    document.getElementById('add-student-form').reset();
    loadStudents();
    loadStats();
  } else if (data.error && data.error.toLowerCase().includes('unauthorized')) {
    showToast('Admin key incorrect or expired. Please log in again.', 'error');
    adminLogout();
  } else {
    showToast(data.error || 'Failed to register', 'error');
  }
}

async function removeStudent(uid, name) {
  if (!confirm(`Remove ${name} (UID: ${uid})? This will also delete their attendance history.`)) return;

  const { ok, data } = await apiFetch(`/api/students/${uid}`, { method: 'DELETE' });

  if (ok) {
    showToast(`${name} removed.`);
    loadStudents();
    loadStats();
    loadAbsent();
  } else if (data.error && data.error.toLowerCase().includes('unauthorized')) {
    showToast('Admin key incorrect or expired. Please log in again.', 'error');
    adminLogout();
  } else {
    showToast(data.error || 'Failed to remove', 'error');
  }
}

// ─── Absent Today ─────────────────────────────────────────────────
async function loadAbsent() {
  const { ok, data } = await apiFetch('/api/absent');
  const tbody = document.getElementById('absent-table-body');

  document.getElementById('badge-absent').textContent =
    (ok && data.students) ? data.students.length : '0';

  if (!ok || !data.students || data.students.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="es-icon">🎉</div><p>All students are present today!</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = data.students.map((s, i) => `
    <tr>
      <td style="color:var(--text-muted)">${i + 1}</td>
      <td><strong>${esc(s.name)}</strong></td>
      <td>${esc(s.roll_no)}</td>
      <td>${esc(s.class)}</td>
      <td><span class="chip uid">${esc(s.uid)}</span></td>
      <td>${esc(s.parent_phone)}</td>
    </tr>
  `).join('');
}

// ─── SMS Notification ─────────────────────────────────────────────
async function triggerNotification() {
  const btn = document.getElementById('notify-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Sending SMS…';

  appendLog('info', 'Manual notification triggered…');

  const { ok, data } = await apiFetch('/api/notify', { method: 'POST' });

  btn.disabled = false;
  btn.innerHTML = '📤 Send SMS to All Absent Students\' Parents';

  if (ok) {
    appendLog('ok', `Done — ${data.notified} SMS sent, ${data.failed} failed.`);
    if (data.students && data.students.length) {
      data.students.forEach(s => {
        const icon = s.success ? '✅' : '❌';
        appendLog(s.success ? 'ok' : 'err', `${icon} ${s.student || s.phone} — ${s.success ? 'Sent' : (s.error || 'Failed')}`);
      });
    }
    if (data.notified === 0 && data.failed === 0) {
      appendLog('info', 'No absent students found. All present!');
    }
    showToast(`${data.notified} SMS sent!`);
  } else if (data.error && data.error.toLowerCase().includes('unauthorized')) {
    appendLog('err', 'Admin key required. Please log in as admin first.');
    showToast('Admin login required to send SMS', 'error');
    adminLogout();
  } else {
    appendLog('err', `Error: ${data.error || 'Unknown error'}`);
    showToast('Failed to send notifications', 'error');
  }
}

function appendLog(type, message) {
  const log = document.getElementById('notif-log');
  const now = new Date().toLocaleTimeString('en-IN');
  const div = document.createElement('div');
  div.className = `log-line ${type}`;
  div.textContent = `[${now}] ${message}`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function clearLog() {
  document.getElementById('notif-log').innerHTML =
    '<div class="log-line info">[System] Log cleared.</div>';
}

// ─── Poll for new scans (dashboard live update) ───────────────────
let lastScanCount = 0;

async function pollScans() {
  const today = new Date().toISOString().slice(0, 10);
  const { ok, data } = await apiFetch(`/api/attendance?date=${today}`);
  if (!ok) return;

  const count = data.records ? data.records.length : 0;
  if (count > lastScanCount && lastScanCount > 0) {
    const latest = data.records[count - 1];
    showLastScan(latest?.name, latest?.roll_no, latest?.class, 'success');
    loadStats();
  }
  lastScanCount = count;
}

setInterval(pollScans, 5000);

function showLastScan(name, rollNo, cls, type) {
  const el = document.getElementById('last-scan');
  document.getElementById('ls-icon').textContent   = type === 'success' ? '✅' : '❌';
  document.getElementById('ls-name').textContent   = name || 'Unknown Card';
  document.getElementById('ls-detail').textContent = rollNo ? `${rollNo} · ${cls} · ${new Date().toLocaleTimeString('en-IN')}` : 'Card not registered';
  el.className = `last-scan ${type}`;
}
