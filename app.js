// ---------- State & storage ----------
const STORAGE_KEY = 'hr-app.v1';
const AVATAR_COLORS = [
  '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#059669',
  '#0891b2', '#4f46e5', '#c026d3', '#dc2626', '#65a30d',
  '#0284c7', '#9333ea', '#e11d48', '#d97706', '#0d9488',
];

let state = load();
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
  return {
    employees: [
      demo('ceo', 'Anna Björnsdóttir', 'Framkvæmdastjóri', null, {
        department: 'Stjórn',
        email: 'anna@fyrirtaeki.is',
        phone: '+354 555 0100',
        location: 'Reykjavík',
      }),
      demo('cto', 'Björn Sigurðsson', 'Tæknistjóri', 'ceo', {
        department: 'Tækni',
        email: 'bjorn@fyrirtaeki.is',
        phone: '+354 555 0110',
      }),
      demo('cfo', 'Elín Þórsdóttir', 'Fjármálastjóri', 'ceo', {
        department: 'Fjármál',
        email: 'elin@fyrirtaeki.is',
        phone: '+354 555 0120',
      }),
      demo('dev1', 'Kristján Guðmundsson', 'Hugbúnaðarsérfræðingur', 'cto', {
        department: 'Tækni',
        email: 'kristjan@fyrirtaeki.is',
      }),
      demo('dev2', 'Hanna Ólafsdóttir', 'Hugbúnaðarsérfræðingur', 'cto', {
        department: 'Tækni',
        email: 'hanna@fyrirtaeki.is',
      }),
      demo('acc1', 'Sigurður Jónsson', 'Bókari', 'cfo', {
        department: 'Fjármál',
        email: 'sigurdur@fyrirtaeki.is',
      }),
    ],
  };
}

function demo(id, name, role, manager_id, extra = {}) {
  return {
    id,
    name,
    role,
    manager_id,
    department: extra.department || '',
    phone: extra.phone || '',
    email: extra.email || '',
    birthdate: extra.birthdate || '',
    start_date: extra.start_date || '',
    location: extra.location || '',
    address: extra.address || '',
    ssn: extra.ssn || '',
    avatar_color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
    notes: [],
  };
}

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
function ageFromBirthdate(bd) {
  if (!bd) return '';
  const d = new Date(bd);
  if (isNaN(d)) return '';
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? age + ' ára' : '';
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
function childrenOf(id) { return state.employees.filter(e => e.manager_id === id); }
function roots() { return state.employees.filter(e => !e.manager_id || !findEmp(e.manager_id)); }

// Prevent picking a manager that would create a cycle
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
      const hay = [e.name, e.role, e.department, e.email, e.phone].join(' ').toLowerCase();
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

  card.innerHTML = `
    <div class="avatar" style="background:${emp.avatar_color}">${initials(emp.name)}</div>
    <div class="card-name">${escapeHtml(emp.name || 'Nafnlaust')}</div>
    <div class="card-role">${escapeHtml(emp.role || '—')}</div>
    ${emp.department ? `<div class="card-department">${escapeHtml(emp.department)}</div>` : ''}
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
  setVal('d-address', emp.address);
  setVal('d-ssn', emp.ssn);
  setVal('d-age', ageFromBirthdate(emp.birthdate));

  populateManagerSelect(emp);
  renderNotes(emp);
  renderTree();

  // Default to info tab
  switchTab('info');
}

function setVal(id, v) { document.getElementById(id).value = v || ''; }
function getVal(id) { return document.getElementById(id).value; }

function populateManagerSelect(emp) {
  const el = document.getElementById('d-manager');
  const options = ['<option value="">— Enginn (efst) —</option>'];
  state.employees
    .filter(e => e.id !== emp.id && !isDescendant(e.id, emp.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'is'))
    .forEach(e => {
      const selAttr = emp.manager_id === e.id ? ' selected' : '';
      options.push(`<option value="${e.id}"${selAttr}>${escapeHtml(e.name)}${e.role ? ' — ' + escapeHtml(e.role) : ''}</option>`);
    });
  el.innerHTML = options.join('');
  el.value = emp.manager_id || '';
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
  const notes = (emp.notes || []).slice().sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  count.textContent = notes.length;
  if (!notes.length) {
    list.innerHTML = '<div class="notes-empty">Engir minnispunktar ennþá.</div>';
    return;
  }
  list.innerHTML = notes.map(n => `
    <li class="note" data-note-id="${n.id}">
      <div class="note-meta">
        <span>${escapeHtml(formatDateTime(n.created_at))}</span>
        <button class="note-delete" data-action="delete-note" title="Eyða">✕</button>
      </div>
      <div class="note-text">${escapeHtml(n.text)}</div>
    </li>
  `).join('');
}

function addNote() {
  const input = document.getElementById('note-input');
  const text = input.value.trim();
  if (!text || !selectedId) return;
  const emp = findEmp(selectedId);
  emp.notes = emp.notes || [];
  emp.notes.push({
    id: 'n_' + Math.random().toString(36).slice(2, 9),
    text,
    created_at: new Date().toISOString(),
  });
  input.value = '';
  save();
  renderNotes(emp);
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
  const emp = {
    id: uid(),
    name: 'Nýr starfsmaður',
    role: '',
    manager_id: managerId,
    department: '',
    phone: '',
    email: '',
    birthdate: '',
    start_date: new Date().toISOString().slice(0, 10),
    location: '',
    address: '',
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
  // Reparent children to the deleted employee's manager
  kids.forEach(k => k.manager_id = emp.manager_id || null);
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
    ['d-department', 'department'],
    ['d-phone', 'phone'],
    ['d-email', 'email'],
    ['d-start', 'start_date'],
    ['d-location', 'location'],
    ['d-address', 'address'],
    ['d-ssn', 'ssn'],
  ];
  fields.forEach(([id, key]) => {
    document.getElementById(id).addEventListener('input', () => {
      const emp = findEmp(selectedId);
      if (!emp) return;
      emp[key] = getVal(id);
      scheduleSave();
      if (key === 'name' || key === 'role' || key === 'department') {
        // Update card + header avatar
        renderTree();
        if (key === 'name') {
          const av = document.getElementById('d-avatar');
          av.textContent = initials(emp.name);
        }
      }
    });
  });

  document.getElementById('d-birthdate').addEventListener('input', () => {
    const emp = findEmp(selectedId);
    if (!emp) return;
    emp.birthdate = getVal('d-birthdate');
    setVal('d-age', ageFromBirthdate(emp.birthdate));
    scheduleSave();
  });

  document.getElementById('d-manager').addEventListener('change', () => {
    const emp = findEmp(selectedId);
    if (!emp) return;
    const newMgr = getVal('d-manager') || null;
    if (newMgr && isDescendant(newMgr, emp.id)) {
      alert('Er ekki hægt: sá starfsmaður er undirmaður þessa.');
      populateManagerSelect(emp);
      return;
    }
    emp.manager_id = newMgr;
    save();
    renderTree();
  });
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
    if (e.key === 'Escape') closeDrawer();
  });

  bindDrawerFields();
  renderTree();
  applyZoom();
}

document.addEventListener('DOMContentLoaded', init);
