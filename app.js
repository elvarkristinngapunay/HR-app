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
  s.events = s.events || [];
  s.scratchNotes = s.scratchNotes || [];
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
    if (e.key !== 'Escape') return;
    // Close whichever modal is open, in preference order.
    const modalIds = ['scratch-modal', 'event-modal', 'depts-modal'];
    for (const id of modalIds) {
      const m = document.getElementById(id);
      if (m && !m.hidden) { m.hidden = true; return; }
    }
    closeDrawer();
  });

  document.getElementById('depts-btn').addEventListener('click', openDeptModal);
  // Any [data-close-modal] element closes the modal it lives inside.
  document.addEventListener('click', (e) => {
    const closer = e.target.closest('[data-close-modal]');
    if (!closer) return;
    const modal = closer.closest('.modal');
    if (modal) modal.hidden = true;
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

  initSections();
  initEvents();
  initScratch();
}

// ---------- Sections (Allir / Viðburðir / Skjal) ----------
const SECTION_KEY = 'hr-app.section';
function initSections() {
  const nav = document.getElementById('section-nav');
  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('.sidebar-item');
    if (!btn) return;
    switchSection(btn.dataset.section);
  });
  const saved = localStorage.getItem(SECTION_KEY) || 'people';
  switchSection(saved);
}
function switchSection(name) {
  document.querySelectorAll('.sidebar-item').forEach(b => {
    b.classList.toggle('active', b.dataset.section === name);
  });
  document.querySelectorAll('.section').forEach(s => {
    s.hidden = (s.id !== 'section-' + name);
  });
  localStorage.setItem(SECTION_KEY, name);
  if (name === 'events') renderEvents();
  if (name === 'scratch') renderScratch();
}

// ---------- Events ----------
const MONTHS_IS = ['jan', 'feb', 'mar', 'apr', 'maí', 'jún', 'júl', 'ágú', 'sep', 'okt', 'nóv', 'des'];
let editingEventId = null;
let eventView = 'upcoming';
let eventTab = 'guests';
let eventDraftParticipants = [];
let eventDraftTasks = [];
let eventDraftRsvps = {};
let eventDraftExternalGuests = [];
let eventDraftBudget = null;
let eventDraftBudgetItems = []; // legacy flat items — migrated to categories at load
let eventDraftBudgetCategories = [];
let eventDraftTimeline = [];

function initEvents() {
  document.getElementById('add-event-btn').addEventListener('click', () => openEventModal(null));
  document.getElementById('events-empty-add-btn').addEventListener('click', () => openEventModal(null));
  document.getElementById('event-form').addEventListener('submit', (e) => {
    e.preventDefault();
    saveEventFromForm();
  });
  document.getElementById('event-delete-btn').addEventListener('click', () => {
    if (!editingEventId) return;
    const ev = state.events.find(x => x.id === editingEventId);
    if (!ev) return;
    if (!confirm(`Eyða viðburði "${ev.title}"?`)) return;
    state.events = state.events.filter(x => x.id !== editingEventId);
    save();
    closeModal('event-modal');
    renderEvents();
  });
  document.getElementById('event-date').addEventListener('input', (e) => {
    const raw = e.target.value;
    const formatted = formatDateStr(raw);
    if (raw !== formatted) {
      const atEnd = e.target.selectionStart >= raw.length;
      e.target.value = formatted;
      if (atEnd) e.target.setSelectionRange(formatted.length, formatted.length);
    }
  });
  document.getElementById('event-participant-add').addEventListener('change', (e) => {
    const id = e.target.value;
    if (!id) return;
    if (!eventDraftParticipants.includes(id)) eventDraftParticipants.push(id);
    refreshGuestsUI();
    autoSaveEventIfEditing();
  });

  // Guest list interactions (RSVP + remove) for both employee + external
  ['guests-list', 'external-guests-list'].forEach(listId => {
    document.getElementById(listId).addEventListener('click', (e) => {
      const row = e.target.closest('[data-guest-id]');
      if (!row) return;
      const gid = row.dataset.guestId;
      const isExternal = row.dataset.external === '1';
      const rsvpBtn = e.target.closest('[data-rsvp]');
      const removeBtn = e.target.closest('[data-action=remove-guest]');
      if (rsvpBtn) {
        const status = rsvpBtn.dataset.rsvp;
        if (isExternal) {
          const g = eventDraftExternalGuests.find(x => x.id === gid);
          if (g) g.rsvp = (g.rsvp === status) ? null : status;
        } else {
          if (eventDraftRsvps[gid] === status) delete eventDraftRsvps[gid];
          else eventDraftRsvps[gid] = status;
        }
        refreshGuestsUI();
        autoSaveEventIfEditing();
      } else if (removeBtn) {
        if (isExternal) {
          eventDraftExternalGuests = eventDraftExternalGuests.filter(x => x.id !== gid);
        } else {
          eventDraftParticipants = eventDraftParticipants.filter(id => id !== gid);
          delete eventDraftRsvps[gid];
        }
        refreshGuestsUI();
        autoSaveEventIfEditing();
      }
    });
  });

  // Add external guest
  document.getElementById('add-external-guest').addEventListener('click', () => {
    const nameEl = document.getElementById('external-guest-name');
    const emailEl = document.getElementById('external-guest-email');
    const name = nameEl.value.trim();
    if (!name) return;
    eventDraftExternalGuests.push({
      id: 'ex_' + Math.random().toString(36).slice(2, 10),
      name,
      email: emailEl.value.trim(),
      rsvp: null,
    });
    nameEl.value = ''; emailEl.value = '';
    refreshGuestsUI();
    autoSaveEventIfEditing();
    nameEl.focus();
  });
  document.getElementById('external-guest-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('add-external-guest').click(); }
  });
  document.getElementById('external-guest-email').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('add-external-guest').click(); }
  });

  // Copy invite link
  document.getElementById('copy-invite-btn').addEventListener('click', copyInviteText);

  // Sub-tabs inside event modal
  document.querySelectorAll('[data-event-tab]').forEach(b => {
    b.addEventListener('click', () => switchEventTab(b.dataset.eventTab));
  });

  // Budget (categorised)
  document.getElementById('event-budget').addEventListener('input', (e) => {
    eventDraftBudget = e.target.value ? Number(e.target.value) : null;
    updateBudgetSummary();
    autoSaveEventIfEditing();
  });
  document.getElementById('add-category-btn').addEventListener('click', addBudgetCategory);
  document.getElementById('new-category-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addBudgetCategory(); }
  });
  document.getElementById('new-category-budget').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addBudgetCategory(); }
  });
  const budgetCats = document.getElementById('budget-categories');
  budgetCats.addEventListener('click', (e) => {
    const catEl = e.target.closest('[data-category-id]');
    if (!catEl) return;
    const cat = eventDraftBudgetCategories.find(c => c.id === catEl.dataset.categoryId);
    if (!cat) return;
    const headerClick = e.target.closest('.budget-category-header');
    if (e.target.closest('[data-action=delete-category]')) {
      e.stopPropagation();
      if (!confirm(`Eyða flokknum "${cat.name}"?`)) return;
      eventDraftBudgetCategories = eventDraftBudgetCategories.filter(c => c.id !== cat.id);
      renderBudget();
      autoSaveEventIfEditing();
    } else if (e.target.closest('[data-action=delete-item]')) {
      const itemEl = e.target.closest('[data-item-id]');
      cat.items = cat.items.filter(i => i.id !== itemEl.dataset.itemId);
      renderBudget();
      autoSaveEventIfEditing();
    } else if (e.target.closest('[data-action=add-item]')) {
      const nameEl = catEl.querySelector('.new-item-name');
      const amtEl = catEl.querySelector('.new-item-amount');
      const name = nameEl.value.trim();
      if (!name) return;
      cat.items.push({
        id: 'bi_' + Math.random().toString(36).slice(2, 10),
        name,
        amount: Number(amtEl.value) || 0,
      });
      nameEl.value = ''; amtEl.value = '';
      renderBudget();
      autoSaveEventIfEditing();
      const openCat = document.querySelector(`.budget-category[data-category-id="${cat.id}"]`);
      if (openCat) openCat.querySelector('.new-item-name').focus();
    } else if (headerClick && !e.target.closest('input, button')) {
      cat.open = !cat.open;
      renderBudget();
    }
  });
  budgetCats.addEventListener('input', (e) => {
    const catEl = e.target.closest('[data-category-id]');
    if (!catEl) return;
    const cat = eventDraftBudgetCategories.find(c => c.id === catEl.dataset.categoryId);
    if (!cat) return;
    if (e.target.classList.contains('budget-category-name')) cat.name = e.target.value;
    else if (e.target.classList.contains('budget-category-estimated')) cat.estimated = e.target.value ? Number(e.target.value) : null;
    else if (e.target.classList.contains('item-name') || e.target.classList.contains('item-amount')) {
      const itemEl = e.target.closest('[data-item-id]');
      const item = cat.items.find(i => i.id === itemEl.dataset.itemId);
      if (!item) return;
      if (e.target.classList.contains('item-name')) item.name = e.target.value;
      else item.amount = Number(e.target.value) || 0;
    }
    updateBudgetSummary();
    autoSaveEventIfEditing();
  });
  budgetCats.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.target.classList.contains('new-item-name') || e.target.classList.contains('new-item-amount'))) {
      e.preventDefault();
      const catEl = e.target.closest('[data-category-id]');
      catEl.querySelector('[data-action=add-item]').click();
    }
  });

  // Timeline
  document.getElementById('timeline-add-btn').addEventListener('click', addTimelineItem);
  document.getElementById('timeline-add-title').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addTimelineItem(); }
  });
  const timelineList = document.getElementById('timeline-list');
  timelineList.addEventListener('click', (e) => {
    const item = e.target.closest('[data-timeline-id]');
    if (!item) return;
    const t = eventDraftTimeline.find(x => x.id === item.dataset.timelineId);
    if (!t) return;
    if (e.target.closest('[data-action=toggle]')) {
      t.done = !t.done;
      renderTimeline();
      autoSaveEventIfEditing();
    } else if (e.target.closest('[data-action=remove]')) {
      eventDraftTimeline = eventDraftTimeline.filter(x => x.id !== t.id);
      renderTimeline();
      autoSaveEventIfEditing();
    }
  });
  timelineList.addEventListener('input', (e) => {
    const item = e.target.closest('[data-timeline-id]');
    if (!item) return;
    const t = eventDraftTimeline.find(x => x.id === item.dataset.timelineId);
    if (!t) return;
    if (e.target.classList.contains('timeline-title')) t.title = e.target.value;
    else if (e.target.classList.contains('timeline-time')) t.time = e.target.value;
    autoSaveEventIfEditing();
  });
  document.querySelectorAll('[data-event-view]').forEach(b => {
    b.addEventListener('click', () => {
      eventView = b.dataset.eventView;
      document.querySelectorAll('[data-event-view]').forEach(x => x.classList.toggle('active', x === b));
      renderEvents();
    });
  });

  document.getElementById('quick-all').addEventListener('click', () => {
    eventDraftParticipants = state.employees.map(e => e.id);
    refreshEventParticipantUI();
  });
  document.getElementById('quick-clear').addEventListener('click', () => {
    eventDraftParticipants = [];
    refreshEventParticipantUI();
  });
  document.getElementById('quick-dept-add').addEventListener('change', (e) => {
    const deptId = e.target.value;
    if (!deptId) return;
    const toAdd = state.employees.filter(emp => emp.department_id === deptId).map(emp => emp.id);
    const set = new Set(eventDraftParticipants);
    toAdd.forEach(id => set.add(id));
    eventDraftParticipants = [...set];
    refreshEventParticipantUI();
    e.target.value = '';
  });

  // Tasks
  const tasksList = document.getElementById('tasks-list');
  const addInput = document.getElementById('task-add-input');
  addInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const title = addInput.value.trim();
    if (!title) return;
    eventDraftTasks.push({
      id: 't_' + Math.random().toString(36).slice(2, 10),
      title,
      done: false,
      assignee_id: '',
      due_date: '',
    });
    addInput.value = '';
    renderTaskList();
    autoSaveTasksIfEditing();
  });
  tasksList.addEventListener('click', (e) => {
    const item = e.target.closest('[data-task-id]');
    if (!item) return;
    const t = eventDraftTasks.find(x => x.id === item.dataset.taskId);
    if (!t) return;
    if (e.target.closest('[data-action=toggle]')) {
      t.done = !t.done;
      renderTaskList();
      autoSaveTasksIfEditing();
    } else if (e.target.closest('[data-action=delete]')) {
      eventDraftTasks = eventDraftTasks.filter(x => x.id !== t.id);
      renderTaskList();
      autoSaveTasksIfEditing();
    }
  });
  tasksList.addEventListener('change', (e) => {
    const item = e.target.closest('[data-task-id]');
    if (!item) return;
    const t = eventDraftTasks.find(x => x.id === item.dataset.taskId);
    if (!t) return;
    if (e.target.closest('[data-action=assign]')) {
      t.assignee_id = e.target.value;
      autoSaveTasksIfEditing();
    } else if (e.target.closest('[data-action=due]')) {
      const formatted = formatDateStr(e.target.value);
      e.target.value = formatted;
      t.due_date = formatted;
      renderTaskList();
      autoSaveTasksIfEditing();
    }
  });
  tasksList.addEventListener('input', (e) => {
    const item = e.target.closest('[data-task-id]');
    if (!item) return;
    const t = eventDraftTasks.find(x => x.id === item.dataset.taskId);
    if (!t) return;
    if (e.target.closest('[data-action=rename]')) {
      t.title = e.target.value;
      autoSaveTasksIfEditing();
    } else if (e.target.closest('[data-action=due]')) {
      const raw = e.target.value;
      const formatted = formatDateStr(raw);
      if (raw !== formatted) {
        const atEnd = e.target.selectionStart >= raw.length;
        e.target.value = formatted;
        if (atEnd) e.target.setSelectionRange(formatted.length, formatted.length);
      }
      t.due_date = formatted;
    }
  });
}

function autoSaveTasksIfEditing() { autoSaveEventIfEditing(); }

function refreshEventParticipantUI() {
  populateEventParticipantSelect();
  populateQuickDeptSelect();
  refreshGuestsUI();
}

function populateQuickDeptSelect() {
  const el = document.getElementById('quick-dept-add');
  const options = ['<option value="">+ Bæta heilli deild…</option>'];
  state.departments
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'is'))
    .forEach(d => {
      const memberCount = state.employees.filter(e => e.department_id === d.id).length;
      if (memberCount === 0) return;
      options.push(`<option value="${d.id}">${escapeHtml(d.name)} (${memberCount})</option>`);
    });
  el.innerHTML = options.join('');
  el.value = '';
}

function updateParticipantHint() { /* kept for compat; UI hint replaced by stat tiles */ }

function openEventModal(id) {
  editingEventId = id;
  const ev = id ? state.events.find(x => x.id === id) : null;
  document.getElementById('event-modal-title').textContent = ev ? 'Breyta viðburði' : 'Nýr viðburður';
  document.getElementById('event-title').value = ev?.title || '';
  document.getElementById('event-date').value = ev?.date || '';
  document.getElementById('event-time').value = ev?.time || '';
  document.getElementById('event-location').value = ev?.location || '';
  document.getElementById('event-description').value = ev?.description || '';
  document.getElementById('event-remind').value = ev?.remind_at ? toLocalDatetime(ev.remind_at) : '';
  eventDraftParticipants = ev ? [...(ev.participant_ids || [])] : [];
  eventDraftTasks = ev ? deepCloneTasks(ev.tasks || []) : [];
  eventDraftRsvps = ev ? { ...(ev.rsvps || {}) } : {};
  eventDraftExternalGuests = ev ? (ev.external_guests || []).map(g => ({ ...g })) : [];
  eventDraftBudget = ev ? (ev.budget ?? null) : null;
  eventDraftBudgetCategories = migrateBudgetCategories(ev);
  eventDraftBudgetItems = [];
  eventDraftTimeline = ev ? (ev.timeline_items || []).map(t => ({ ...t })) : [];
  document.getElementById('event-delete-btn').hidden = !ev;
  document.getElementById('event-budget').value = eventDraftBudget ?? '';
  refreshEventParticipantUI();
  renderTaskList();
  renderBudget();
  renderTimeline();
  switchEventTab('guests');
  document.getElementById('event-modal').hidden = false;
  setTimeout(() => document.getElementById('event-title').focus(), 50);
}

function deepCloneTasks(tasks) {
  return tasks.map(t => ({ ...t }));
}

function toLocalDatetime(iso) {
  // Convert ISO to "YYYY-MM-DDTHH:MM" for datetime-local input
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function populateEventParticipantSelect() {
  const el = document.getElementById('event-participant-add');
  const taken = new Set(eventDraftParticipants);
  const options = ['<option value="">+ Bæta við þátttakanda…</option>'];
  state.employees
    .filter(e => !taken.has(e.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'is'))
    .forEach(e => {
      options.push(`<option value="${e.id}">${escapeHtml(e.name)}${e.role ? ' — ' + escapeHtml(e.role) : ''}</option>`);
    });
  el.innerHTML = options.join('');
  el.value = '';
}

function switchEventTab(name) {
  eventTab = name;
  document.querySelectorAll('[data-event-tab]').forEach(b => {
    b.classList.toggle('active', b.dataset.eventTab === name);
  });
  document.querySelectorAll('[data-event-panel]').forEach(p => {
    p.hidden = (p.dataset.eventPanel !== name);
  });
}

function refreshGuestsUI() {
  populateEventParticipantSelect();
  populateQuickDeptSelect();
  renderGuests();
  updateGuestStats();
}

function updateGuestStats() {
  const total = eventDraftParticipants.length + eventDraftExternalGuests.length;
  let yes = 0, no = 0, maybe = 0;
  eventDraftParticipants.forEach(id => {
    const r = eventDraftRsvps[id];
    if (r === 'yes') yes++; else if (r === 'no') no++; else if (r === 'maybe') maybe++;
  });
  eventDraftExternalGuests.forEach(g => {
    if (g.rsvp === 'yes') yes++; else if (g.rsvp === 'no') no++; else if (g.rsvp === 'maybe') maybe++;
  });
  const pending = total - yes - no - maybe;
  document.getElementById('stat-invited').textContent = total;
  document.getElementById('stat-yes').textContent = yes;
  document.getElementById('stat-no').textContent = no;
  document.getElementById('stat-maybe').textContent = maybe;
  document.getElementById('stat-pending').textContent = pending;
  document.getElementById('guests-count-badge').textContent = total;
  document.getElementById('quick-clear').hidden = eventDraftParticipants.length === 0;
}

function renderGuests() {
  const list = document.getElementById('guests-list');
  list.innerHTML = eventDraftParticipants.map(id => {
    const e = findEmp(id);
    if (!e) return '';
    const rsvp = eventDraftRsvps[id] || '';
    return renderGuestRow({
      id: e.id,
      name: e.name,
      color: e.avatar_color,
      rsvp,
      external: false,
    });
  }).join('') || '<p class="field-hint" style="padding: 8px 0;">Engir starfsmenn skráðir. Notaðu "Velja alla" eða bættu einstökum við.</p>';

  const ext = document.getElementById('external-guests-list');
  ext.innerHTML = eventDraftExternalGuests.map(g => renderGuestRow({
    id: g.id,
    name: g.name,
    color: '#94a3b8',
    rsvp: g.rsvp || '',
    external: true,
  })).join('');
}

function renderGuestRow({ id, name, color, rsvp, external }) {
  return `
    <li class="guest-row" data-guest-id="${id}" data-external="${external ? 1 : 0}">
      <span class="chip-avatar" style="background:${color}">${initials(name)}</span>
      <span class="guest-name ${external ? 'external' : ''}">${escapeHtml(name)}</span>
      <div class="rsvp-toggle">
        <button type="button" class="rsvp-btn ${rsvp === 'yes' ? 'active' : ''}" data-rsvp="yes" title="Mætir">✓ Mætir</button>
        <button type="button" class="rsvp-btn ${rsvp === 'maybe' ? 'active' : ''}" data-rsvp="maybe" title="Kannski">? Kannski</button>
        <button type="button" class="rsvp-btn ${rsvp === 'no' ? 'active' : ''}" data-rsvp="no" title="Mætir ekki">✕ Nei</button>
      </div>
      <button type="button" class="guest-remove" data-action="remove-guest" title="Fjarlægja">✕</button>
    </li>
  `;
}

function copyInviteText() {
  const title = document.getElementById('event-title').value.trim() || 'Viðburður';
  const date = document.getElementById('event-date').value.trim();
  const time = document.getElementById('event-time').value;
  const location = document.getElementById('event-location').value.trim();
  const description = document.getElementById('event-description').value.trim();
  const parts = [`📅 ${title}`];
  if (date) parts.push(`${date}${time ? ' kl. ' + time : ''}`);
  if (location) parts.push(`📍 ${location}`);
  if (description) parts.push('', description);
  parts.push('', 'Getur þú mætt? Sendu mér "Já" / "Nei" / "Kannski" til baka.');
  const text = parts.join('\n');
  navigator.clipboard.writeText(text).then(() => showToast('Boðstexti afritaður!')).catch(() => showToast('Náði ekki að afrita'));
}

function showToast(msg) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

function migrateBudgetCategories(ev) {
  if (!ev) return [];
  if (Array.isArray(ev.budget_categories) && ev.budget_categories.length) {
    return ev.budget_categories.map(c => ({
      ...c,
      items: (c.items || []).map(i => ({ ...i })),
      open: c.open ?? false,
    }));
  }
  // Legacy flat items → wrap in one "Almennt" category
  const legacy = ev.budget_items || [];
  if (!legacy.length) return [];
  return [{
    id: 'bc_legacy',
    name: 'Almennt',
    estimated: null,
    open: true,
    items: legacy.map(b => ({
      id: b.id || ('bi_' + Math.random().toString(36).slice(2, 10)),
      name: b.label || b.name || '',
      amount: b.amount || 0,
    })),
  }];
}

function addBudgetCategory() {
  const nameEl = document.getElementById('new-category-name');
  const estEl = document.getElementById('new-category-budget');
  const name = nameEl.value.trim();
  if (!name) return;
  eventDraftBudgetCategories.push({
    id: 'bc_' + Math.random().toString(36).slice(2, 10),
    name,
    estimated: estEl.value ? Number(estEl.value) : null,
    items: [],
    open: true,
  });
  nameEl.value = ''; estEl.value = '';
  renderBudget();
  autoSaveEventIfEditing();
  nameEl.focus();
}

function categoryActual(cat) {
  return cat.items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
}

function totalActual() {
  return eventDraftBudgetCategories.reduce((s, c) => s + categoryActual(c), 0);
}

function fmtKr(n) { return (n || 0).toLocaleString('is-IS'); }

function renderBudget() {
  const el = document.getElementById('budget-categories');
  el.innerHTML = eventDraftBudgetCategories.map(cat => {
    const actual = categoryActual(cat);
    const over = cat.estimated && actual > cat.estimated;
    const itemsHtml = cat.items.map(i => `
      <li class="budget-item" data-item-id="${i.id}">
        <input class="budget-label item-name" value="${escapeHtml(i.name)}" />
        <input class="budget-amount item-amount" type="number" value="${i.amount || 0}" min="0" step="100" />
        <button type="button" class="budget-item-remove" data-action="delete-item" title="Eyða">✕</button>
      </li>
    `).join('');
    return `
      <div class="budget-category ${cat.open ? 'open' : ''}" data-category-id="${cat.id}">
        <div class="budget-category-header">
          <button type="button" class="budget-category-toggle" title="Opna/loka">▸</button>
          <input class="budget-category-name" value="${escapeHtml(cat.name)}" />
          <div class="budget-category-numbers">
            <input class="budget-category-estimated" type="number" value="${cat.estimated ?? ''}" placeholder="áætlun" min="0" step="1000" />
            <span class="budget-category-actual ${over ? 'over' : ''}">${fmtKr(actual)} kr.</span>
          </div>
          <button type="button" class="budget-category-delete" data-action="delete-category" title="Eyða flokki">✕</button>
        </div>
        <div class="budget-category-body">
          <ul class="budget-list">${itemsHtml}</ul>
          <div class="budget-add-item-row">
            <input type="text" class="new-item-name" placeholder="Nýr hlutur" />
            <input type="number" class="new-item-amount" placeholder="kr." min="0" step="100" />
            <button type="button" class="btn" data-action="add-item">+</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
  updateBudgetSummary();
  const totalItems = eventDraftBudgetCategories.reduce((s, c) => s + c.items.length, 0);
  const badge = document.getElementById('planning-count-badge');
  if (badge) badge.textContent = eventDraftTasks.length + totalItems;
}

function updateBudgetSummary() {
  const spent = totalActual();
  const budget = eventDraftBudget;
  const summary = document.getElementById('budget-summary');
  const bar = document.getElementById('budget-progress');
  const fill = document.getElementById('budget-progress-fill');
  const hasAnyItems = eventDraftBudgetCategories.some(c => c.items.length);
  if (!hasAnyItems && !budget) {
    summary.textContent = 'Enginn kostnaður skráður';
    summary.classList.remove('over');
    if (bar) bar.style.display = 'none';
    return;
  }
  if (budget) {
    const over = spent > budget;
    summary.textContent = `${fmtKr(spent)} kr. af ${fmtKr(budget)} kr. ${over ? '· umfram!' : `(${Math.round((spent / budget) * 100)}%)`}`;
    summary.classList.toggle('over', over);
    if (bar) {
      bar.style.display = '';
      fill.style.width = Math.min(100, (spent / budget) * 100) + '%';
      fill.classList.toggle('over', over);
    }
  } else {
    summary.textContent = `Samtals ${fmtKr(spent)} kr.`;
    summary.classList.remove('over');
    if (bar) bar.style.display = 'none';
  }
}

function addTimelineItem() {
  const time = document.getElementById('timeline-add-time').value;
  const title = document.getElementById('timeline-add-title').value.trim();
  if (!title) return;
  eventDraftTimeline.push({
    id: 'tl_' + Math.random().toString(36).slice(2, 10),
    time,
    title,
    done: false,
  });
  document.getElementById('timeline-add-time').value = '';
  document.getElementById('timeline-add-title').value = '';
  renderTimeline();
  autoSaveEventIfEditing();
  document.getElementById('timeline-add-title').focus();
}

function renderTimeline() {
  const list = document.getElementById('timeline-list');
  const sorted = eventDraftTimeline.slice().sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
  list.innerHTML = sorted.map(t => `
    <li class="timeline-item ${t.done ? 'done' : ''}" data-timeline-id="${t.id}">
      <button type="button" class="timeline-done-toggle" data-action="toggle" title="Merkja"></button>
      <input type="time" class="timeline-time" value="${escapeHtml(t.time || '')}" />
      <input class="timeline-title" value="${escapeHtml(t.title)}" />
      <button type="button" class="timeline-remove" data-action="remove" title="Eyða">✕</button>
    </li>
  `).join('');
  document.getElementById('timeline-count-badge').textContent = eventDraftTimeline.length;
}

function autoSaveEventIfEditing() {
  if (!editingEventId) return;
  const ev = state.events.find(x => x.id === editingEventId);
  if (!ev) return;
  ev.participant_ids = [...eventDraftParticipants];
  ev.rsvps = { ...eventDraftRsvps };
  ev.external_guests = eventDraftExternalGuests.map(g => ({ ...g }));
  ev.tasks = deepCloneTasks(eventDraftTasks);
  ev.budget = eventDraftBudget;
  ev.budget_categories = eventDraftBudgetCategories.map(c => ({ ...c, items: c.items.map(i => ({ ...i })) })); delete ev.budget_items;
  ev.timeline_items = eventDraftTimeline.map(t => ({ ...t }));
  save();
  renderEvents();
}

function renderEventParticipants() {
  const el = document.getElementById('event-participants');
  if (!el) return;
  el.innerHTML = eventDraftParticipants.map(id => {
    const e = findEmp(id);
    if (!e) return '';
    return `<span class="participant-chip" data-emp-id="${id}">
      <span class="chip-avatar" style="background:${e.avatar_color}">${initials(e.name)}</span>
      <span>${escapeHtml(e.name)}</span>
      <button type="button" class="chip-remove" data-remove-participant="${id}" title="Fjarlægja">✕</button>
    </span>`;
  }).join('');
}

function renderTaskList() {
  const list = document.getElementById('tasks-list');
  const progressText = document.getElementById('tasks-progress');
  const progressFill = document.getElementById('tasks-progress-fill');
  const total = eventDraftTasks.length;
  const done = eventDraftTasks.filter(t => t.done).length;
  progressText.textContent = total
    ? `${done} af ${total} lokið`
    : 'Engin verkefni ennþá';
  progressFill.style.width = total ? `${(done / total) * 100}%` : '0';
  const planningBadge = document.getElementById('planning-count-badge');
  if (planningBadge) planningBadge.textContent = total + eventDraftBudgetItems.length;
  if (!total) { list.innerHTML = ''; return; }

  const assigneeOptions = state.employees
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'is'))
    .map(e => `<option value="${e.id}">${escapeHtml(e.name)}</option>`)
    .join('');

  const todayIso = new Date().toISOString().slice(0, 10);

  list.innerHTML = eventDraftTasks.map(t => {
    const dueIso = t.due_date ? (parseFlexibleDate(t.due_date)?.toISOString().slice(0, 10) || '') : '';
    const overdue = !t.done && dueIso && dueIso < todayIso;
    return `
      <li class="task-item ${t.done ? 'done' : ''}" data-task-id="${t.id}">
        <button type="button" class="task-checkbox" data-action="toggle" title="Merkja"></button>
        <input class="task-title" value="${escapeHtml(t.title)}" data-action="rename" />
        <select class="task-assignee-select" data-action="assign">
          <option value="">— Enginn —</option>
          ${assigneeOptions.replace(`value="${t.assignee_id}"`, `value="${t.assignee_id}" selected`)}
        </select>
        <input class="task-due-input ${overdue ? 'overdue' : ''}" type="text" value="${escapeHtml(t.due_date || '')}" placeholder="dd.mm.áá" data-action="due" />
        <button type="button" class="task-delete" data-action="delete" title="Eyða">✕</button>
      </li>
    `;
  }).join('');
}

function saveEventFromForm() {
  const title = document.getElementById('event-title').value.trim();
  const date = document.getElementById('event-date').value.trim();
  if (!title || !date) return;
  const parsed = parseFlexibleDate(date);
  if (!parsed) { alert('Ógild dagsetning'); return; }
  const time = document.getElementById('event-time').value;
  const location = document.getElementById('event-location').value.trim();
  const description = document.getElementById('event-description').value.trim();
  const remindVal = document.getElementById('event-remind').value;
  const remind_at = remindVal ? new Date(remindVal).toISOString() : null;

  const iso = parsed.toISOString().slice(0, 10);
  const ev = editingEventId
    ? state.events.find(x => x.id === editingEventId)
    : { id: 'ev_' + Math.random().toString(36).slice(2, 10), created_at: new Date().toISOString() };
  ev.title = title;
  ev.date = date;
  ev.date_iso = iso;
  ev.time = time;
  ev.location = location;
  ev.description = description;
  ev.remind_at = remind_at;
  ev.reminded = ev.reminded || false;
  ev.participant_ids = [...eventDraftParticipants];
  ev.rsvps = { ...eventDraftRsvps };
  ev.external_guests = eventDraftExternalGuests.map(g => ({ ...g }));
  ev.tasks = deepCloneTasks(eventDraftTasks);
  ev.budget = eventDraftBudget;
  ev.budget_categories = eventDraftBudgetCategories.map(c => ({ ...c, items: c.items.map(i => ({ ...i })) })); delete ev.budget_items;
  ev.timeline_items = eventDraftTimeline.map(t => ({ ...t }));
  if (!editingEventId) state.events.push(ev);
  save();
  closeModal('event-modal');
  renderEvents();
}

function closeModal(id) {
  document.getElementById(id).hidden = true;
}

function renderEvents() {
  const list = document.getElementById('events-list');
  const empty = document.getElementById('events-empty');
  const all = (state.events || []).slice();
  const todayIso = new Date().toISOString().slice(0, 10);
  let items;
  if (eventView === 'upcoming') items = all.filter(e => (e.date_iso || '') >= todayIso).sort((a, b) => (a.date_iso + (a.time || '')).localeCompare(b.date_iso + (b.time || '')));
  else if (eventView === 'past') items = all.filter(e => (e.date_iso || '') < todayIso).sort((a, b) => (b.date_iso + (b.time || '')).localeCompare(a.date_iso + (a.time || '')));
  else items = all.sort((a, b) => (b.date_iso + (b.time || '')).localeCompare(a.date_iso + (a.time || '')));

  if (!items.length) {
    list.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  list.innerHTML = items.map(ev => renderEventCard(ev, todayIso)).join('');
  list.querySelectorAll('.event-card').forEach(card => {
    card.addEventListener('click', () => openEventModal(card.dataset.eventId));
  });
}

function renderEventCard(ev, todayIso) {
  const d = ev.date_iso ? new Date(ev.date_iso) : null;
  const day = d ? d.getDate() : '?';
  const month = d ? MONTHS_IS[d.getMonth()] : '';
  const past = (ev.date_iso || '') < todayIso;
  const participants = (ev.participant_ids || []).map(id => findEmp(id)).filter(Boolean);
  const shown = participants.slice(0, 4);
  const extra = participants.length - shown.length;
  const avatarsHtml = participants.length
    ? shown.map(e => `<span class="event-avatar" style="background:${e.avatar_color}" title="${escapeHtml(e.name)}">${initials(e.name)}</span>`).join('') + (extra > 0 ? `<span class="event-participants-more">+${extra}</span>` : '')
    : `<span class="event-participants-more">Öllum boðið</span>`;
  const meta = [];
  if (ev.time) meta.push(`<span>🕐 ${escapeHtml(ev.time)}</span>`);
  if (ev.location) meta.push(`<span>📍 ${escapeHtml(ev.location)}</span>`);
  const tasks = ev.tasks || [];
  const doneCount = tasks.filter(t => t.done).length;
  const totalCount = tasks.length;
  const complete = totalCount > 0 && doneCount === totalCount;
  const pct = totalCount ? (doneCount / totalCount) * 100 : 0;
  const progressHtml = totalCount ? `
    <div class="event-progress">
      <div class="event-progress-bar">
        <div class="event-progress-fill ${complete ? '' : 'pending'}" style="width:${pct}%"></div>
      </div>
      <span class="event-progress-count">${doneCount}/${totalCount}</span>
    </div>
  ` : '';
  return `
    <div class="event-card ${past ? 'past' : ''}" data-event-id="${ev.id}">
      <div class="event-date-badge">
        <div class="month">${escapeHtml(month)}</div>
        <div class="day">${day}</div>
        ${ev.time ? `<div class="time">${escapeHtml(ev.time)}</div>` : ''}
      </div>
      <div class="event-body">
        <div class="event-title">${escapeHtml(ev.title)}</div>
        ${meta.length ? `<div class="event-meta">${meta.join('')}</div>` : ''}
        ${ev.description ? `<div class="event-description">${escapeHtml(ev.description)}</div>` : ''}
        <div class="event-participants">${avatarsHtml}</div>
        ${progressHtml}
      </div>
    </div>
  `;
}

// ---------- Scratch pad (personal notes with tagging) ----------
let editingScratchId = null;
let scratchDraftTags = [];

function initScratch() {
  document.getElementById('add-scratch-btn').addEventListener('click', () => openScratchModal(null));
  document.getElementById('scratch-empty-add-btn').addEventListener('click', () => openScratchModal(null));
  document.getElementById('scratch-form').addEventListener('submit', (e) => {
    e.preventDefault();
    saveScratchFromForm();
  });
  document.getElementById('scratch-delete-btn').addEventListener('click', () => {
    if (!editingScratchId) return;
    const s = state.scratchNotes.find(x => x.id === editingScratchId);
    if (!s) return;
    if (!confirm('Eyða þessari glósu?')) return;
    state.scratchNotes = state.scratchNotes.filter(x => x.id !== editingScratchId);
    save();
    closeModal('scratch-modal');
    renderScratch();
  });
  document.getElementById('scratch-tag-add').addEventListener('change', (e) => {
    const id = e.target.value;
    if (!id) return;
    if (!scratchDraftTags.includes(id)) scratchDraftTags.push(id);
    renderScratchTags();
    populateScratchTagSelect();
  });
  document.getElementById('scratch-tags').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-participant]');
    if (!btn) return;
    scratchDraftTags = scratchDraftTags.filter(id => id !== btn.dataset.removeParticipant);
    renderScratchTags();
    populateScratchTagSelect();
  });
  document.getElementById('scratch-search').addEventListener('input', renderScratch);
}

function openScratchModal(id) {
  editingScratchId = id;
  const sn = id ? state.scratchNotes.find(x => x.id === id) : null;
  document.getElementById('scratch-modal-title').textContent = sn ? 'Breyta glósu' : 'Ný glósa';
  document.getElementById('scratch-title').value = sn?.title || '';
  document.getElementById('scratch-body').value = sn?.body || '';
  document.getElementById('scratch-event').value = sn?.event_at ? toLocalDatetime(sn.event_at) : '';
  document.getElementById('scratch-remind').value = sn?.remind_at ? toLocalDatetime(sn.remind_at) : '';
  scratchDraftTags = sn ? [...(sn.tag_ids || [])] : [];
  document.getElementById('scratch-delete-btn').hidden = !sn;
  renderScratchTags();
  populateScratchTagSelect();
  document.getElementById('scratch-modal').hidden = false;
  setTimeout(() => document.getElementById(sn ? 'scratch-body' : 'scratch-body').focus(), 50);
}

function populateScratchTagSelect() {
  const el = document.getElementById('scratch-tag-add');
  const taken = new Set(scratchDraftTags);
  const options = ['<option value="">+ Tagga starfsmann…</option>'];
  state.employees
    .filter(e => !taken.has(e.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'is'))
    .forEach(e => {
      options.push(`<option value="${e.id}">${escapeHtml(e.name)}</option>`);
    });
  el.innerHTML = options.join('');
  el.value = '';
}

function renderScratchTags() {
  const el = document.getElementById('scratch-tags');
  el.innerHTML = scratchDraftTags.map(id => {
    const e = findEmp(id);
    if (!e) return '';
    return `<span class="participant-chip" data-emp-id="${id}">
      <span class="chip-avatar" style="background:${e.avatar_color}">${initials(e.name)}</span>
      <span>${escapeHtml(e.name)}</span>
      <button type="button" class="chip-remove" data-remove-participant="${id}" title="Fjarlægja">✕</button>
    </span>`;
  }).join('');
}

function saveScratchFromForm() {
  const title = document.getElementById('scratch-title').value.trim();
  const body = document.getElementById('scratch-body').value.trim();
  if (!body) return;
  const eventVal = document.getElementById('scratch-event').value;
  const event_at = eventVal ? new Date(eventVal).toISOString() : null;
  const remindVal = document.getElementById('scratch-remind').value;
  const remind_at = remindVal ? new Date(remindVal).toISOString() : null;

  const now = new Date().toISOString();
  const sn = editingScratchId
    ? state.scratchNotes.find(x => x.id === editingScratchId)
    : { id: 'sn_' + Math.random().toString(36).slice(2, 10), created_at: now };
  sn.title = title;
  sn.body = body;
  sn.event_at = event_at;
  sn.event_notified = sn.event_notified || false;
  sn.remind_at = remind_at;
  sn.reminded = sn.reminded || false;
  sn.tag_ids = [...scratchDraftTags];
  sn.updated_at = now;
  if (!editingScratchId) state.scratchNotes.push(sn);
  save();
  closeModal('scratch-modal');
  renderScratch();
}

function renderScratch() {
  const list = document.getElementById('scratch-list');
  const empty = document.getElementById('scratch-empty');
  const q = (document.getElementById('scratch-search')?.value || '').toLowerCase().trim();
  let items = (state.scratchNotes || []).slice();
  if (q) items = items.filter(s => (s.title + ' ' + s.body).toLowerCase().includes(q));
  items.sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || ''));
  if (!items.length) {
    list.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  const now = Date.now();
  list.innerHTML = items.map(sn => renderScratchCard(sn, now)).join('');
  list.querySelectorAll('.scratch-card').forEach(card => {
    card.addEventListener('click', () => openScratchModal(card.dataset.scratchId));
  });
}

function renderScratchCard(sn, now) {
  const tags = (sn.tag_ids || []).map(id => findEmp(id)).filter(Boolean);
  const tagHtml = tags.slice(0, 6).map(e => `
    <span class="participant-chip" title="${escapeHtml(e.name)}">
      <span class="chip-avatar" style="background:${e.avatar_color}">${initials(e.name)}</span>
      <span>${escapeHtml(e.name)}</span>
    </span>
  `).join('');
  const pills = [];
  if (sn.event_at) {
    const t = new Date(sn.event_at).getTime();
    const overdue = t <= now;
    const str = new Date(sn.event_at).toLocaleString('is-IS', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    pills.push(`<span class="scratch-card-reminder${overdue ? ' overdue' : ''}" title="Dagsetning">📅 ${escapeHtml(str)}</span>`);
  }
  if (sn.remind_at) {
    const t = new Date(sn.remind_at).getTime();
    const overdue = t <= now;
    const str = new Date(sn.remind_at).toLocaleString('is-IS', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    pills.push(`<span class="scratch-card-reminder${overdue ? ' overdue' : ''}" title="Minna á">🔔 ${escapeHtml(str)}</span>`);
  }
  const dateStr = new Date(sn.updated_at || sn.created_at).toLocaleDateString('is-IS', { year: 'numeric', month: 'short', day: 'numeric' });
  return `
    <div class="scratch-card" data-scratch-id="${sn.id}">
      ${sn.title ? `<div class="scratch-card-title">${escapeHtml(sn.title)}</div>` : ''}
      <div class="scratch-card-body">${escapeHtml(sn.body)}</div>
      ${tags.length ? `<div class="scratch-card-tags">${tagHtml}</div>` : ''}
      <div class="scratch-card-footer">
        <span>${dateStr}</span>
        <div class="scratch-card-pills">${pills.join('')}</div>
      </div>
    </div>
  `;
}

// ---------- Extend scanReminders to include events and scratch notes ----------
const _origScanReminders = scanReminders;
scanReminders = function () {
  _origScanReminders();
  const now = Date.now();
  let changed = false;
  (state.events || []).forEach(ev => {
    if (!ev.remind_at || ev.reminded) return;
    if (new Date(ev.remind_at).getTime() > now) return;
    ev.reminded = true; changed = true;
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification(`Viðburður: ${ev.title}`, { body: ev.date + (ev.time ? ' · ' + ev.time : ''), tag: ev.id }); } catch (_) {}
    }
  });
  (state.scratchNotes || []).forEach(sn => {
    if (sn.remind_at && !sn.reminded && new Date(sn.remind_at).getTime() <= now) {
      sn.reminded = true; changed = true;
      if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification(`Undirbúa: ${sn.title || 'Glósa'}`, { body: sn.body.slice(0, 140), tag: sn.id + '_r' }); } catch (_) {}
      }
    }
    if (sn.event_at && !sn.event_notified && new Date(sn.event_at).getTime() <= now) {
      sn.event_notified = true; changed = true;
      if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification(sn.title || 'Glósa', { body: sn.body.slice(0, 140), tag: sn.id + '_e' }); } catch (_) {}
      }
    }
  });
  if (changed) save();
};

document.addEventListener('DOMContentLoaded', init);
