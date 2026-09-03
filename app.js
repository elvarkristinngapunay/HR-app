// ---------- State & storage ----------
const STORAGE_KEY = 'hr-app.v1';
const AVATAR_COLORS = [
  '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#059669',
  '#0891b2', '#4f46e5', '#c026d3', '#dc2626', '#65a30d',
  '#0284c7', '#9333ea', '#e11d48', '#d97706', '#0d9488',
];
const DEPT_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
  '#06b6d4', '#3b82f6', '#a855f7', '#ef4444', '#84cc16',
  '#0ea5e9', '#d946ef', '#f97316', '#14b8a6', '#64748b',
];

let state = migrate(load());
let selectedId = null;
let zoom = 1;
let saveTimer = null;

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return seed();
}

function seed() {
  const depts = [
    { id: 'd_stjorn', name: 'Stjórn', color: '#6366f1' },
    { id: 'd_taekni', name: 'Tækni', color: '#10b981' },
    { id: 'd_fjarmal', name: 'Fjármál', color: '#f59e0b' },
  ];
  return {
    departments: depts,
    employees: [
      demo('ceo', 'Anna Björnsdóttir', 'Framkvæmdastjóri', null, {
        department_id: 'd_stjorn',
        email: 'anna@fyrirtaeki.is',
        phone: '+354 555 0100',
        location: 'Reykjavík',
      }),
      demo('cto', 'Björn Sigurðsson', 'Tæknistjóri', 'ceo', {
        department_id: 'd_taekni',
        email: 'bjorn@fyrirtaeki.is',
        phone: '+354 555 0110',
      }),
      demo('cfo', 'Elín Þórsdóttir', 'Fjármálastjóri', 'ceo', {
        department_id: 'd_fjarmal',
        email: 'elin@fyrirtaeki.is',
        phone: '+354 555 0120',
      }),
      demo('dev1', 'Kristján Guðmundsson', 'Hugbúnaðarsérfræðingur', 'cto', {
        department_id: 'd_taekni',
        email: 'kristjan@fyrirtaeki.is',
      }),
      demo('dev2', 'Hanna Ólafsdóttir', 'Hugbúnaðarsérfræðingur', 'cto', {
        department_id: 'd_taekni',
        email: 'hanna@fyrirtaeki.is',
      }),
      demo('acc1', 'Sigurður Jónsson', 'Bókari', 'cfo', {
        department_id: 'd_fjarmal',
        email: 'sigurdur@fyrirtaeki.is',
      }),
    ],
  };
}

function migrate(s) {
  s.departments = s.departments || [];
  s.employees = s.employees || [];
  s.employees.forEach(emp => {
    if (!('department_id' in emp)) emp.department_id = null;
    if (emp.department && !emp.department_id) {
      let dept = s.departments.find(d => d.name.toLowerCase() === emp.department.toLowerCase());
      if (!dept) {
        dept = {
          id: 'd_' + Math.random().toString(36).slice(2, 9),
          name: emp.department,
          color: DEPT_COLORS[s.departments.length % DEPT_COLORS.length],
        };
        s.departments.push(dept);
      }
      emp.department_id = dept.id;
    }
    delete emp.department;
    delete emp.address;
    emp.birthdate = isoToDmy(emp.birthdate);
    emp.start_date = isoToDmy(emp.start_date);
    // Legacy single manager_id → manager_ids array
    if (!Array.isArray(emp.manager_ids)) {
      emp.manager_ids = emp.manager_id ? [emp.manager_id] : [];
    }
    delete emp.manager_id;
  });
  // Prune manager IDs that no longer exist
  const validIds = new Set(s.employees.map(e => e.id));
  s.employees.forEach(emp => {
    emp.manager_ids = emp.manager_ids.filter(id => validIds.has(id));
  });
  return s;
}

function isoToDmy(v) {
  if (!v) return v || '';
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : v;
}

function demo(id, name, role, manager_id, extra = {}) {
  return {
    id,
    name,
    role,
    manager_ids: manager_id ? [manager_id] : [],
    department_id: extra.department_id || null,
    phone: extra.phone || '',
    email: extra.email || '',
    birthdate: extra.birthdate || '',
    start_date: extra.start_date || '',
    location: extra.location || '',
    ssn: extra.ssn || '',
    avatar_color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
    notes: [],
  };
}

function findDept(id) { return state.departments.find(d => d.id === id); }
function deptName(id) { const d = findDept(id); return d ? d.name : ''; }
function deptColor(id) { const d = findDept(id); return d ? d.color : '#94a3b8'; }

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_) {}
}

function scheduleSave() {
  const status = document.getElementById('save-status');
  status.textContent = 'Vistar…';
  status.className = 'save-status saving';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    save();
    status.textContent = 'Vistað';
    status.className = 'save-status saved';
    setTimeout(() => { status.className = 'save-status'; }, 1200);
  }, 300);
}

// ---------- Helpers ----------
function uid() {
  return 'e_' + Math.random().toString(36).slice(2, 9);
}
function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map(p => p[0]).join('').toUpperCase();
}
// Parse "dd.mm.yyyy" or "d.m.yyyy" or ISO "yyyy-mm-dd" → Date, or null
function parseFlexibleDate(str) {
  if (!str) return null;
  str = str.trim();
  // dd.mm.yyyy
  let m = str.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})$/);
  if (m) {
    let [_, d, mo, y] = m;
    d = +d; mo = +mo; y = +y;
    if (y < 100) y += y < 30 ? 2000 : 1900;
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d) return dt;
    return null;
  }
  // ISO yyyy-mm-dd (legacy)
  m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const dt = new Date(+m[1], +m[2] - 1, +m[3]);
    if (!isNaN(dt)) return dt;
  }
  return null;
}

// Auto-format a raw string into "dd.mm.yyyy" (as much as available).
function formatDateStr(s) {
  const digits = String(s || '').replace(/\D/g, '').slice(0, 8);
  const parts = [];
  if (digits.length > 0) parts.push(digits.slice(0, 2));
  if (digits.length > 2) parts.push(digits.slice(2, 4));
  if (digits.length > 4) parts.push(digits.slice(4, 8));
  return parts.join('.');
}

function ageFromBirthdate(bd) {
  const d = parseFlexibleDate(bd);
  if (!d) return '';
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? age + ' ára' : '';
}

function bindDateInput(id, key, onValue) {
  const input = document.getElementById(id);
  input.addEventListener('input', () => {
    const emp = findEmp(selectedId);
    if (!emp) return;
    const raw = input.value;
    const formatted = formatDateStr(raw);
    if (raw !== formatted) {
      const atEnd = input.selectionStart >= raw.length;
      input.value = formatted;
      if (atEnd) input.setSelectionRange(formatted.length, formatted.length);
    }
    emp[key] = formatted;
    if (onValue) onValue(formatted);
    scheduleSave();
  });
}
function formatDateTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleString('is-IS', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
function findEmp(id) { return state.employees.find(e => e.id === id); }
function primaryManagerId(emp) { return (emp.manager_ids && emp.manager_ids[0]) || null; }
function childrenOf(id) { return state.employees.filter(e => primaryManagerId(e) === id); }
function roots() { return state.employees.filter(e => !primaryManagerId(e)); }

// Prevent picking a manager that would create a cycle in the tree.
// Only checks descendants via the *primary* manager (which shapes the tree).
function isDescendant(candidateId, ofId) {
  if (candidateId === ofId) return true;
  const stack = childrenOf(ofId).map(c => c.id);
  while (stack.length) {
    const id = stack.pop();
    if (id === candidateId) return true;
    stack.push(...childrenOf(id).map(c => c.id));
  }
  return false;
}

// ---------- Rendering: tree ----------
function renderTree() {
  const tree = document.getElementById('tree');
  const empty = document.getElementById('empty-state');
  const count = document.getElementById('count-label');

  count.textContent = state.employees.length + ' ' +
    (state.employees.length === 1 ? 'starfsmaður' : 'starfsmenn');

  if (state.employees.length === 0) {
    tree.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  const query = (document.getElementById('search').value || '').toLowerCase().trim();
  const matchedIds = new Set();
  if (query) {
    state.employees.forEach(e => {
      const hay = [e.name, e.role, deptName(e.department_id), e.email, e.phone].join(' ').toLowerCase();
      if (hay.includes(query)) matchedIds.add(e.id);
    });
  }

  const rootList = roots();
  tree.innerHTML = '';

  if (rootList.length > 1) {
    // Wrap multiple roots in a horizontal row
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.gap = '40px';
    wrap.style.alignItems = 'flex-start';
    rootList.forEach(r => wrap.appendChild(renderNode(r, query, matchedIds)));
    tree.appendChild(wrap);
  } else if (rootList.length === 1) {
    tree.appendChild(renderNode(rootList[0], query, matchedIds));
  }
}

function renderNode(emp, query, matchedIds) {
  const group = document.createElement('div');
  group.className = 'node-group';
  const kids = childrenOf(emp.id);
  if (kids.length) group.classList.add('has-children');

  group.appendChild(renderCard(emp, query, matchedIds));

  if (kids.length) {
    const wrap = document.createElement('div');
    wrap.className = 'node-children';
    kids.forEach(c => wrap.appendChild(renderNode(c, query, matchedIds)));
    group.appendChild(wrap);
  }
  return group;
}

function renderCard(emp, query, matchedIds) {
  const card = document.createElement('div');
  card.className = 'card';
  if (emp.id === selectedId) card.classList.add('selected');
  if (query && !matchedIds.has(emp.id)) card.classList.add('dim');

  const dept = findDept(emp.department_id);
  const deptHtml = dept
    ? `<div class="card-department" style="background:${hexToRgba(dept.color, 0.12)};color:${dept.color}">${escapeHtml(dept.name)}</div>`
    : '';

  const extraManagers = (emp.manager_ids || []).length - 1;
  const extraMgrHtml = extraManagers > 0
    ? `<div class="card-extra-managers" title="Fleiri yfirmenn">+${extraManagers} yfirmaður</div>`
    : '';

  card.innerHTML = `
    <div class="avatar" style="background:${emp.avatar_color}">${initials(emp.name)}</div>
    <div class="card-name">${escapeHtml(emp.name || 'Nafnlaust')}</div>
    <div class="card-role">${escapeHtml(emp.role || '—')}</div>
    ${deptHtml}
    ${extraMgrHtml}
    <div class="card-actions">
      <button title="Bæta undirmanni við" data-action="add-child">+</button>
    </div>
  `;
  card.addEventListener('click', (e) => {
    if (e.target.closest('[data-action=add-child]')) {
      addEmployee(emp.id);
      return;
    }
    openDrawer(emp.id);
  });
  return card;
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ---------- Drawer ----------
function openDrawer(id) {
  selectedId = id;
  const emp = findEmp(id);
  if (!emp) return;

  document.getElementById('drawer').hidden = false;
  document.getElementById('scrim').hidden = false;

  const av = document.getElementById('d-avatar');
  av.textContent = initials(emp.name);
  av.style.background = emp.avatar_color;

  setVal('d-name', emp.name);
  setVal('d-role', emp.role);
  setVal('d-department', emp.department);
  setVal('d-phone', emp.phone);
  setVal('d-email', emp.email);
  setVal('d-birthdate', emp.birthdate);
  setVal('d-start', emp.start_date);
  setVal('d-location', emp.location);
  setVal('d-ssn', emp.ssn);
  setVal('d-age', ageFromBirthdate(emp.birthdate));

  populateManagerSelect(emp);
  populateDeptSelect(emp);
  renderNotes(emp);
  renderDocs(emp);
  renderTree();

  // Default to info tab
  switchTab('info');
}

function populateDeptSelect(emp) {
  const el = document.getElementById('d-department');
  const options = ['<option value="">— Engin —</option>'];
  state.departments
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'is'))
    .forEach(d => {
      const sel = emp.department_id === d.id ? ' selected' : '';
      options.push(`<option value="${d.id}"${sel}>${escapeHtml(d.name)}</option>`);
    });
  options.push('<option value="__new__">+ Ný deild…</option>');
  el.innerHTML = options.join('');
  el.value = emp.department_id || '';
}

function setVal(id, v) { document.getElementById(id).value = v || ''; }
function getVal(id) { return document.getElementById(id).value; }

function populateManagerSelect(emp) {
  renderManagerChips(emp);
  renderManagerAddSelect(emp);
}

function renderManagerChips(emp) {
  const chips = document.getElementById('manager-chips');
  const ids = emp.manager_ids || [];
  chips.innerHTML = ids.map((id, i) => {
    const m = findEmp(id);
    if (!m) return '';
    const label = escapeHtml(m.name) + (m.role ? ` · <span style="opacity:.7">${escapeHtml(m.role)}</span>` : '');
    return `<span class="manager-chip${i === 0 ? ' primary' : ''}" data-mgr-id="${id}">
      <span class="chip-name">${label}</span>
      <button type="button" class="chip-remove" data-remove-mgr="${id}" title="Fjarlægja">✕</button>
    </span>`;
  }).join('');
}

function renderManagerAddSelect(emp) {
  const el = document.getElementById('d-manager-add');
  const taken = new Set(emp.manager_ids || []);
  const options = ['<option value="">+ Bæta við yfirmanni…</option>'];
  state.employees
    .filter(e => e.id !== emp.id && !taken.has(e.id) && !isDescendant(e.id, emp.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'is'))
    .forEach(e => {
      options.push(`<option value="${e.id}">${escapeHtml(e.name)}${e.role ? ' — ' + escapeHtml(e.role) : ''}</option>`);
    });
  el.innerHTML = options.join('');
  el.value = '';
}

function closeDrawer() {
  document.getElementById('drawer').hidden = true;
  document.getElementById('scrim').hidden = true;
  selectedId = null;
  renderTree();
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === name);
  });
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('active', p.dataset.panel === name);
  });
}

// ---------- Notes ----------
function renderNotes(emp) {
  const list = document.getElementById('notes-list');
  const count = document.getElementById('notes-count');
  const notes = (emp.notes || []).slice().sort((a, b) => {
    const ka = a.date_iso || a.created_at || '';
    const kb = b.date_iso || b.created_at || '';
    return kb.localeCompare(ka);
  });
  count.textContent = notes.length;
  if (!notes.length) {
    list.innerHTML = '<div class="notes-empty">Engir minnispunktar ennþá.</div>';
    return;
  }
  const now = Date.now();
  list.innerHTML = notes.map(n => {
    const displayDate = n.date_iso
      ? new Date(n.date_iso).toLocaleDateString('is-IS', { year: 'numeric', month: 'long', day: 'numeric' })
      : formatDateTime(n.created_at);
    let reminderHtml = '';
    if (n.remind_at) {
      const rTime = new Date(n.remind_at).getTime();
      const overdue = rTime <= now;
      const remindStr = new Date(n.remind_at).toLocaleString('is-IS', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      reminderHtml = `<div class="note-reminder${overdue ? ' overdue' : ''}" title="Áminning">
        <span class="bell">🔔</span> ${escapeHtml(remindStr)}${overdue ? ' · komin' : ''}
      </div>`;
    }
    return `
      <li class="note" data-note-id="${n.id}">
        <div class="note-meta">
          <span>${escapeHtml(displayDate)}</span>
          <button class="note-delete" data-action="delete-note" title="Eyða">✕</button>
        </div>
        <div class="note-text">${escapeHtml(n.text)}</div>
        ${reminderHtml}
      </li>
    `;
  }).join('');
}

function addNote() {
  const input = document.getElementById('note-input');
  const dateInput = document.getElementById('note-date');
  const remindInput = document.getElementById('note-remind');
  const text = input.value.trim();
  if (!text || !selectedId) return;
  const emp = findEmp(selectedId);
  emp.notes = emp.notes || [];

  const parsedDate = parseFlexibleDate(dateInput.value);
  const dateIso = parsedDate ? parsedDate.toISOString().slice(0, 10) : null;
  const remindAt = remindInput.value ? new Date(remindInput.value).toISOString() : null;

  emp.notes.push({
    id: 'n_' + Math.random().toString(36).slice(2, 9),
    text,
    created_at: new Date().toISOString(),
    date_iso: dateIso,
    remind_at: remindAt,
    reminded: false,
  });
  input.value = '';
  dateInput.value = '';
  remindInput.value = '';
  save();
  renderNotes(emp);
  if (remindAt) ensureNotificationPermission();
}

// ---------- Reminders / notifications ----------
function ensureNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}

function scanReminders() {
  const now = Date.now();
  let changed = false;
  state.employees.forEach(emp => {
    (emp.notes || []).forEach(n => {
      if (!n.remind_at || n.reminded) return;
      if (new Date(n.remind_at).getTime() > now) return;
      n.reminded = true;
      changed = true;
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(`Áminning: ${emp.name}`, {
            body: n.text.slice(0, 140),
            tag: n.id,
          });
        } catch (_) {}
      }
    });
  });
  if (changed) save();
}

function deleteNote(noteId) {
  if (!selectedId) return;
  const emp = findEmp(selectedId);
  emp.notes = (emp.notes || []).filter(n => n.id !== noteId);
  save();
  renderNotes(emp);
}

// ---------- Add / delete employee ----------
function addEmployee(managerId = null) {
  const managerDept = managerId ? findEmp(managerId)?.department_id : null;
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yyyy = today.getFullYear();
  const emp = {
    id: uid(),
    name: 'Nýr starfsmaður',
    role: '',
    manager_ids: managerId ? [managerId] : [],
    department_id: managerDept || null,
    phone: '',
    email: '',
    birthdate: '',
    start_date: `${dd}.${mm}.${yyyy}`,
    location: '',
    ssn: '',
    avatar_color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
    notes: [],
  };
  state.employees.push(emp);
  save();
  renderTree();
  openDrawer(emp.id);
  setTimeout(() => {
    const nameInput = document.getElementById('d-name');
    nameInput.focus();
    nameInput.select();
  }, 100);
}

function deleteEmployee(id) {
  const emp = findEmp(id);
  if (!emp) return;
  const kids = childrenOf(id);
  const msg = kids.length
    ? `Eyða "${emp.name}"? Undirmenn (${kids.length}) færast upp á yfirmanninn.`
    : `Eyða "${emp.name}"?`;
  if (!confirm(msg)) return;
  // Remove deleted employee from everyone's manager list; if that leaves
  // a report managerless, adopt the deleted employee's own managers.
  state.employees.forEach(other => {
    if (!other.manager_ids?.includes(id)) return;
    other.manager_ids = other.manager_ids.filter(m => m !== id);
    if (other.manager_ids.length === 0 && emp.manager_ids?.length) {
      other.manager_ids = [...emp.manager_ids];
    }
  });
  (emp.documents || []).forEach(d => { removeBlob(d.id).catch(() => {}); });
  state.employees = state.employees.filter(e => e.id !== id);
  save();
  closeDrawer();
  renderTree();
}

// ---------- Field binding ----------
function bindDrawerFields() {
  const fields = [
    ['d-name', 'name'],
    ['d-role', 'role'],
    ['d-phone', 'phone'],
    ['d-email', 'email'],
    ['d-location', 'location'],
    ['d-ssn', 'ssn'],
  ];
  fields.forEach(([id, key]) => {
    document.getElementById(id).addEventListener('input', () => {
      const emp = findEmp(selectedId);
      if (!emp) return;
      emp[key] = getVal(id);
      scheduleSave();
      if (key === 'name' || key === 'role') {
        renderTree();
        if (key === 'name') {
          const av = document.getElementById('d-avatar');
          av.textContent = initials(emp.name);
        }
      }
    });
  });

  document.getElementById('d-department').addEventListener('change', () => {
    const emp = findEmp(selectedId);
    if (!emp) return;
    const v = getVal('d-department');
    if (v === '__new__') {
      const name = prompt('Nafn nýrrar deildar:');
      if (name && name.trim()) {
        const dept = createDepartment(name.trim());
        emp.department_id = dept.id;
      } else {
        // Revert
      }
      populateDeptSelect(emp);
    } else {
      emp.department_id = v || null;
    }
    save();
    renderTree();
  });

  bindDateInput('d-birthdate', 'birthdate', (v) => {
    setVal('d-age', ageFromBirthdate(v));
  });
  bindDateInput('d-start', 'start_date');

  document.getElementById('d-manager-add').addEventListener('change', () => {
    const emp = findEmp(selectedId);
    if (!emp) return;
    const newMgr = getVal('d-manager-add') || null;
    if (!newMgr) return;
    if (isDescendant(newMgr, emp.id)) {
      alert('Er ekki hægt: sá starfsmaður er undirmaður þessa.');
      renderManagerAddSelect(emp);
      return;
    }
    emp.manager_ids = emp.manager_ids || [];
    if (!emp.manager_ids.includes(newMgr)) emp.manager_ids.push(newMgr);
    save();
    renderManagerChips(emp);
    renderManagerAddSelect(emp);
    renderTree();
  });

  document.getElementById('manager-chips').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-mgr]');
    if (!btn) return;
    const emp = findEmp(selectedId);
    if (!emp) return;
    emp.manager_ids = (emp.manager_ids || []).filter(id => id !== btn.dataset.removeMgr);
    save();
    renderManagerChips(emp);
    renderManagerAddSelect(emp);
    renderTree();
  });
}

// ---------- Documents (PDF storage via IndexedDB) ----------
const MAX_DOC_BYTES = 25 * 1024 * 1024;

let _dbPromise = null;
function docsDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open('hr-app-docs', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('files');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

async function storeBlob(id, blob) {
  const db = await docsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function readBlob(id) {
  const db = await docsDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction('files').objectStore('files').get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function removeBlob(id) {
  const db = await docsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function formatBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

async function addFiles(fileList) {
  if (!selectedId) return;
  const emp = findEmp(selectedId);
  emp.documents = emp.documents || [];
  const errors = [];
  for (const file of fileList) {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      errors.push(`${file.name}: aðeins PDF-skjöl leyfð`);
      continue;
    }
    if (file.size > MAX_DOC_BYTES) {
      errors.push(`${file.name}: of stórt (max 25 MB)`);
      continue;
    }
    const id = 'doc_' + Math.random().toString(36).slice(2, 12);
    try {
      await storeBlob(id, file);
      emp.documents.push({
        id,
        name: file.name,
        size: file.size,
        mime: file.type || 'application/pdf',
        added_at: new Date().toISOString(),
      });
    } catch (err) {
      errors.push(`${file.name}: ${err.message || 'gat ekki vistað'}`);
    }
  }
  save();
  renderDocs(emp);
  if (errors.length) alert(errors.join('\n'));
}

async function openDoc(docId) {
  const blob = await readBlob(docId);
  if (!blob) { alert('Skjalið fannst ekki'); return; }
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function downloadDoc(docId, name) {
  const blob = await readBlob(docId);
  if (!blob) { alert('Skjalið fannst ekki'); return; }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function deleteDoc(docId) {
  if (!selectedId) return;
  const emp = findEmp(selectedId);
  const doc = (emp.documents || []).find(d => d.id === docId);
  if (!doc) return;
  if (!confirm(`Eyða skjalinu "${doc.name}"?`)) return;
  try { await removeBlob(docId); } catch (_) {}
  emp.documents = emp.documents.filter(d => d.id !== docId);
  save();
  renderDocs(emp);
}

function renderDocs(emp) {
  const list = document.getElementById('docs-list');
  const count = document.getElementById('docs-count');
  const docs = (emp.documents || []).slice().sort((a, b) => (b.added_at || '').localeCompare(a.added_at || ''));
  count.textContent = docs.length;
  if (!docs.length) {
    list.innerHTML = '<div class="docs-empty">Engin skjöl ennþá. Bættu við fyrsta PDF-skjalinu.</div>';
    return;
  }
  list.innerHTML = docs.map(d => `
    <li class="doc-item" data-doc-id="${d.id}">
      <div class="doc-icon">PDF</div>
      <div class="doc-meta">
        <div class="doc-name" title="${escapeHtml(d.name)}">${escapeHtml(d.name)}</div>
        <div class="doc-sub">${formatBytes(d.size)} · ${escapeHtml(formatDateTime(d.added_at))}</div>
      </div>
      <div class="doc-actions">
        <button class="icon-btn" data-action="open" title="Opna">↗</button>
        <button class="icon-btn" data-action="download" title="Sækja">↓</button>
        <button class="icon-btn danger" data-action="delete" title="Eyða">✕</button>
      </div>
    </li>
  `).join('');
}

// ---------- Departments ----------
function createDepartment(name, color) {
  const usedColors = new Set(state.departments.map(d => d.color));
  const chosenColor = color || DEPT_COLORS.find(c => !usedColors.has(c)) || DEPT_COLORS[state.departments.length % DEPT_COLORS.length];
  const dept = {
    id: 'd_' + Math.random().toString(36).slice(2, 9),
    name: name.trim(),
    color: chosenColor,
  };
  state.departments.push(dept);
  save();
  return dept;
}

function renameDepartment(id, newName) {
  const d = findDept(id);
  if (!d) return;
  d.name = newName.trim() || d.name;
  save();
}

function recolorDepartment(id, color) {
  const d = findDept(id);
  if (!d) return;
  d.color = color;
  save();
}

function cycleDeptColor(id) {
  const d = findDept(id);
  if (!d) return;
  const i = DEPT_COLORS.indexOf(d.color);
  d.color = DEPT_COLORS[(i + 1) % DEPT_COLORS.length];
  save();
  renderDeptList();
  renderTree();
}

function deleteDepartment(id) {
  const d = findDept(id);
  if (!d) return;
  const count = state.employees.filter(e => e.department_id === id).length;
  const msg = count
    ? `Eyða deildinni "${d.name}"? ${count} starfsmenn missa deild.`
    : `Eyða deildinni "${d.name}"?`;
  if (!confirm(msg)) return;
  state.employees.forEach(e => { if (e.department_id === id) e.department_id = null; });
  state.departments = state.departments.filter(x => x.id !== id);
  save();
  renderTree();
  renderDeptList();
  if (selectedId) populateDeptSelect(findEmp(selectedId));
}

function openDeptModal() {
  document.getElementById('depts-modal').hidden = false;
  document.getElementById('new-dept-name').value = '';
  renderColorPicker(null);
  renderDeptList();
  setTimeout(() => document.getElementById('new-dept-name').focus(), 50);
}

function closeDeptModal() {
  document.getElementById('depts-modal').hidden = true;
}

let pendingColor = null;

function renderColorPicker(selected) {
  const el = document.getElementById('new-dept-color');
  const usedColors = new Set(state.departments.map(d => d.color));
  const suggestion = DEPT_COLORS.find(c => !usedColors.has(c)) || DEPT_COLORS[0];
  pendingColor = selected || suggestion;
  el.innerHTML = DEPT_COLORS.map(c => `
    <button type="button" class="swatch${c === pendingColor ? ' selected' : ''}"
      style="background:${c}" data-color="${c}" title="${c}"></button>
  `).join('');
  el.onclick = (e) => {
    const b = e.target.closest('.swatch');
    if (!b) return;
    pendingColor = b.dataset.color;
    el.querySelectorAll('.swatch').forEach(s => s.classList.toggle('selected', s.dataset.color === pendingColor));
  };
}

function renderDeptList() {
  const el = document.getElementById('dept-list');
  const list = state.departments.slice().sort((a, b) => a.name.localeCompare(b.name, 'is'));
  if (!list.length) {
    el.innerHTML = '<div class="dept-empty">Engar deildir ennþá. Bættu við þeirri fyrstu að ofan.</div>';
    return;
  }
  el.innerHTML = list.map(d => {
    const count = state.employees.filter(e => e.department_id === d.id).length;
    return `
      <li class="dept-item" data-dept-id="${d.id}">
        <span class="dept-dot" style="background:${d.color}" data-action="recolor" title="Breyta lit"></span>
        <input class="dept-name" value="${escapeHtml(d.name)}" data-action="rename" />
        <span class="dept-count">${count} ${count === 1 ? 'starfsmaður' : 'starfsmenn'}</span>
        <div class="dept-actions">
          <button class="icon-btn danger" data-action="delete" title="Eyða">🗑</button>
        </div>
      </li>
    `;
  }).join('');
}

// ---------- Zoom ----------
function applyZoom() {
  const tree = document.getElementById('tree');
  tree.style.transform = `scale(${zoom})`;
  document.querySelector('[data-zoom=reset]').textContent = Math.round(zoom * 100) + '%';
}

// ---------- Event wiring ----------
function init() {
  document.getElementById('add-employee-btn').addEventListener('click', () => addEmployee(null));
  document.getElementById('empty-add-btn').addEventListener('click', () => addEmployee(null));
  document.getElementById('drawer-close').addEventListener('click', closeDrawer);
  document.getElementById('scrim').addEventListener('click', closeDrawer);
  document.getElementById('delete-btn').addEventListener('click', () => deleteEmployee(selectedId));
  document.getElementById('add-note-btn').addEventListener('click', addNote);

  document.getElementById('note-input').addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') addNote();
  });

  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => switchTab(t.dataset.tab));
  });

  document.getElementById('notes-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action=delete-note]');
    if (btn) {
      const li = btn.closest('[data-note-id]');
      if (li) deleteNote(li.dataset.noteId);
    }
  });

  const fileInput = document.getElementById('file-input');
  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length) addFiles(fileInput.files);
    fileInput.value = '';
  });

  const dz = document.getElementById('dropzone');
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, (e) => {
    e.preventDefault(); e.stopPropagation();
    dz.classList.add('dragover');
  }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, (e) => {
    e.preventDefault(); e.stopPropagation();
    dz.classList.remove('dragover');
  }));
  dz.addEventListener('drop', (e) => {
    if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  });

  document.getElementById('docs-list').addEventListener('click', (e) => {
    const item = e.target.closest('[data-doc-id]');
    if (!item) return;
    const id = item.dataset.docId;
    const emp = findEmp(selectedId);
    const doc = emp && (emp.documents || []).find(d => d.id === id);
    if (e.target.closest('[data-action=open]')) openDoc(id);
    else if (e.target.closest('[data-action=download]')) downloadDoc(id, doc?.name || 'skjal.pdf');
    else if (e.target.closest('[data-action=delete]')) deleteDoc(id);
  });

  document.getElementById('search').addEventListener('input', renderTree);

  document.querySelectorAll('[data-zoom]').forEach(b => {
    b.addEventListener('click', () => {
      const kind = b.dataset.zoom;
      if (kind === 'in') zoom = Math.min(2, zoom + 0.1);
      else if (kind === 'out') zoom = Math.max(0.4, zoom - 0.1);
      else zoom = 1;
      applyZoom();
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!document.getElementById('depts-modal').hidden) closeDeptModal();
      else closeDrawer();
    }
  });

  document.getElementById('depts-btn').addEventListener('click', openDeptModal);
  document.querySelectorAll('[data-close-modal]').forEach(el => {
    el.addEventListener('click', closeDeptModal);
  });

  document.getElementById('dept-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('new-dept-name').value.trim();
    if (!name) return;
    if (state.departments.some(d => d.name.toLowerCase() === name.toLowerCase())) {
      alert('Deild með þessu nafni er þegar til.');
      return;
    }
    createDepartment(name, pendingColor);
    document.getElementById('new-dept-name').value = '';
    renderColorPicker(null);
    renderDeptList();
    if (selectedId) populateDeptSelect(findEmp(selectedId));
  });

  const deptList = document.getElementById('dept-list');
  deptList.addEventListener('click', (e) => {
    const item = e.target.closest('[data-dept-id]');
    if (!item) return;
    const id = item.dataset.deptId;
    if (e.target.closest('[data-action=delete]')) {
      deleteDepartment(id);
    } else if (e.target.closest('[data-action=recolor]')) {
      cycleDeptColor(id);
    }
  });
  deptList.addEventListener('change', (e) => {
    const input = e.target.closest('[data-action=rename]');
    if (!input) return;
    const item = input.closest('[data-dept-id]');
    renameDepartment(item.dataset.deptId, input.value);
    renderDeptList();
    renderTree();
    if (selectedId) populateDeptSelect(findEmp(selectedId));
  });

  bindDrawerFields();
  renderTree();
  applyZoom();

  // Auto-format the note date input (dd.mm.yyyy)
  const noteDate = document.getElementById('note-date');
  if (noteDate) {
    noteDate.addEventListener('input', () => {
      const raw = noteDate.value;
      const formatted = formatDateStr(raw);
      if (raw !== formatted) {
        const atEnd = noteDate.selectionStart >= raw.length;
        noteDate.value = formatted;
        if (atEnd) noteDate.setSelectionRange(formatted.length, formatted.length);
      }
    });
  }

  // Fire reminders now and then every minute
  scanReminders();
  setInterval(scanReminders, 60_000);
}

document.addEventListener('DOMContentLoaded', init);
