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
  s.checklists = s.checklists || [];
  s.employees.forEach(e => { e.training = e.training || []; });
  s.departments.forEach(d => {
    if (!('parent_id' in d)) d.parent_id = null;
    if (!('manager_id' in d)) d.manager_id = null;
  });
  // Prune parent_ids that no longer exist
  const validDeptIds = new Set(s.departments.map(d => d.id));
  const validEmpIds = new Set(s.employees.map(e => e.id));
  s.departments.forEach(d => {
    if (d.parent_id && !validDeptIds.has(d.parent_id)) d.parent_id = null;
    if (d.manager_id && !validEmpIds.has(d.manager_id)) d.manager_id = null;
  });
  return s;
}

// ---------- Department tree helpers ----------
function deptChildren(id) { return state.departments.filter(d => d.parent_id === id); }
function deptRoots() { return state.departments.filter(d => !d.parent_id); }
function deptDepth(id, cache = {}) {
  if (id in cache) return cache[id];
  const d = findDept(id);
  if (!d || !d.parent_id) return cache[id] = 0;
  return cache[id] = 1 + deptDepth(d.parent_id, cache);
}
function deptPath(id) {
  const chain = [];
  let cur = findDept(id);
  while (cur) {
    chain.unshift(cur);
    cur = cur.parent_id ? findDept(cur.parent_id) : null;
    if (chain.length > 20) break; // safety
  }
  return chain;
}
function isDeptDescendant(candidateId, ofId) {
  if (candidateId === ofId) return true;
  const stack = deptChildren(ofId).map(d => d.id);
  while (stack.length) {
    const id = stack.pop();
    if (id === candidateId) return true;
    stack.push(...deptChildren(id).map(d => d.id));
  }
  return false;
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

// Sort siblings so people in the same department stand next to each other.
// Order: by department name (empty last), then by employee name.
function sortSiblingsByDept(list) {
  return list.slice().sort((a, b) => {
    const da = deptName(a.department_id) || '￿';
    const db = deptName(b.department_id) || '￿';
    if (da !== db) return da.localeCompare(db, 'is');
    return (a.name || '').localeCompare(b.name || '', 'is');
  });
}

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
const PEOPLE_VIEW_KEY = 'hr-app.people-view';
let peopleView = localStorage.getItem(PEOPLE_VIEW_KEY) || 'tree';

function switchPeopleView(name) {
  peopleView = name;
  localStorage.setItem(PEOPLE_VIEW_KEY, name);
  document.querySelectorAll('[data-people-view]').forEach(b => {
    b.classList.toggle('active', b.dataset.peopleView === name);
  });
  document.getElementById('canvas-wrap').hidden = (name !== 'tree');
  document.getElementById('people-list-main').hidden = (name !== 'list');
  renderTree();
}

function renderPeopleList() {
  const body = document.getElementById('people-list-body');
  const empty = document.getElementById('people-list-empty');
  const query = (document.getElementById('search').value || '').toLowerCase().trim();
  let list = state.employees.slice();
  if (query) {
    list = list.filter(e => {
      const hay = [e.name, e.role, deptName(e.department_id), e.email, e.phone].join(' ').toLowerCase();
      return hay.includes(query);
    });
  }
  list.sort((a, b) => {
    const da = deptName(a.department_id) || '￿';
    const db = deptName(b.department_id) || '￿';
    if (da !== db) return da.localeCompare(db, 'is');
    return (a.name || '').localeCompare(b.name || '', 'is');
  });

  if (!list.length) {
    body.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  body.innerHTML = list.map(e => {
    const dept = findDept(e.department_id);
    const dotColor = dept?.color || 'var(--text-3)';
    const rightBits = [];
    if (e.role) rightBits.push(escapeHtml(e.role));
    if (dept) rightBits.push(escapeHtml(dept.name));
    return `
      <li class="people-line" data-emp-id="${e.id}">
        <span class="people-line-dot" style="background:${dotColor}"></span>
        <span class="people-line-name">${escapeHtml(e.name || 'Nafnlaust')}</span>
        <span class="people-line-meta">${rightBits.join(' · ')}</span>
      </li>
    `;
  }).join('');

  body.querySelectorAll('li').forEach(row => {
    row.addEventListener('click', () => openDrawer(row.dataset.empId));
  });
}

function renderTree() {
  const tree = document.getElementById('tree');
  const empty = document.getElementById('empty-state');
  const count = document.getElementById('count-label');

  count.textContent = state.employees.length + ' ' +
    (state.employees.length === 1 ? 'starfsmaður' : 'starfsmenn');

  // Also render list view (so tab switching is instant)
  renderPeopleList();

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

  const rootList = sortSiblingsByDept(roots());
  tree.innerHTML = '';

  if (rootList.length > 1) {
    // Wrap multiple roots in a horizontal row
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.gap = '16px';
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
  const kids = sortSiblingsByDept(childrenOf(emp.id));
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

  const avatarColor = dept?.color || emp.avatar_color;
  card.innerHTML = `
    <div class="avatar" style="background:${avatarColor}">${initials(emp.name)}</div>
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
  const drawerDept = findDept(emp.department_id);
  av.style.background = drawerDept?.color || emp.avatar_color;

  setVal('d-name', emp.name);
  setVal('d-role', emp.role);
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
  const hidden = document.getElementById('d-department');
  hidden.value = emp.department_id || '';
  const label = document.getElementById('dept-picker-current');
  if (emp.department_id) {
    const chain = deptPath(emp.department_id);
    label.textContent = chain.length ? chain.map(c => c.name).join(' › ') : '— Engin —';
  } else {
    label.textContent = '— Engin —';
  }
  renderDeptPickerTree(emp.department_id);
}

function renderDeptPickerTree(selectedId) {
  const tree = document.getElementById('dept-picker-tree');
  if (!tree) return;
  const query = (document.getElementById('dept-picker-search')?.value || '').toLowerCase().trim();
  const parts = [];
  parts.push(renderPickerRow(null, '— Engin —', null, selectedId, 0, false));
  const walk = (parentId, depth) => {
    state.departments
      .filter(d => d.parent_id === parentId)
      .sort((a, b) => a.name.localeCompare(b.name, 'is'))
      .forEach(d => {
        const match = !query || d.name.toLowerCase().includes(query);
        if (match) parts.push(renderPickerRow(d.id, d.name, d.color, selectedId, depth, true));
        walk(d.id, depth + 1);
      });
  };
  walk(null, 0);
  if (parts.length === 1 && query) {
    tree.innerHTML = '<div class="dept-picker-empty">Engin deild fannst.</div>';
  } else {
    tree.innerHTML = parts.join('');
  }
}

function initDeptPicker() {
  const picker = document.getElementById('dept-picker');
  const btn = document.getElementById('dept-picker-btn');
  const popover = document.getElementById('dept-picker-popover');
  const search = document.getElementById('dept-picker-search');
  const tree = document.getElementById('dept-picker-tree');
  const addRoot = document.getElementById('dept-picker-add-root');
  if (!picker || !btn) return;

  const openPopover = () => {
    picker.classList.add('open');
    popover.hidden = false;
    search.value = '';
    if (selectedId) renderDeptPickerTree(findEmp(selectedId)?.department_id || null);
    setTimeout(() => search.focus(), 30);
  };
  const closePopover = () => {
    picker.classList.remove('open');
    popover.hidden = true;
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (popover.hidden) openPopover(); else closePopover();
  });

  document.addEventListener('click', (e) => {
    if (popover.hidden) return;
    if (!picker.contains(e.target)) closePopover();
  });

  search.addEventListener('input', () => {
    const emp = findEmp(selectedId);
    renderDeptPickerTree(emp?.department_id || null);
  });

  tree.addEventListener('click', (e) => {
    const emp = findEmp(selectedId);
    if (!emp) return;
    const addBtn = e.target.closest('[data-action=add-child]');
    if (addBtn) {
      e.stopPropagation();
      const parentId = addBtn.dataset.parent || null;
      const parent = parentId ? findDept(parentId) : null;
      const name = prompt(`Nafn undirdeildar${parent ? ' undir "' + parent.name + '"' : ''}:`);
      if (!name || !name.trim()) return;
      const dept = createDepartment(name.trim(), null, parentId);
      emp.department_id = dept.id;
      populateDeptSelect(emp);
      renderTree();
      renderDeptPickerTree(emp.department_id);
      save();
      return;
    }
    const row = e.target.closest('[data-action=pick]');
    if (row) {
      const id = row.dataset.deptId || null;
      emp.department_id = id;
      populateDeptSelect(emp);
      renderTree();
      save();
      closePopover();
    }
  });

  addRoot.addEventListener('click', () => {
    const emp = findEmp(selectedId);
    if (!emp) return;
    const name = prompt('Nafn nýrrar deildar (efst):');
    if (!name || !name.trim()) return;
    const dept = createDepartment(name.trim(), null, null);
    emp.department_id = dept.id;
    populateDeptSelect(emp);
    renderTree();
    save();
    closePopover();
  });
}

function renderPickerRow(id, name, color, selectedId, depth, addable) {
  const selected = (id === (selectedId || null)) ? ' selected' : '';
  const dotHtml = color
    ? `<span class="dept-picker-dot" style="background:${color}"></span>`
    : '<span class="dept-picker-dot" style="background:transparent;border:1px dashed var(--border-strong)"></span>';
  const indentStyle = depth > 0 ? `padding-left: ${10 + depth * 18}px;` : '';
  const addBtn = addable
    ? `<button type="button" class="dept-picker-add" data-action="add-child" data-parent="${id}" title="Bæta við undirdeild">+</button>`
    : '';
  const dept = id ? findDept(id) : null;
  const mgr = dept?.manager_id ? findEmp(dept.manager_id) : null;
  const mgrHtml = mgr
    ? `<span class="dept-picker-mgr" title="Umsjónarmaður: ${escapeHtml(mgr.name)}">
        <span class="dept-picker-mgr-avatar" style="background:${mgr.avatar_color}">${initials(mgr.name)}</span>
      </span>`
    : '';
  return `
    <div class="dept-picker-row${selected}" data-action="pick" data-dept-id="${id ?? ''}" style="${indentStyle}">
      ${dotHtml}
      <span class="dept-picker-name">${escapeHtml(name)}</span>
      ${mgrHtml}
      ${addBtn}
    </div>
  `;
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

  initDeptPicker();

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
function createDepartment(name, color, parent_id = null) {
  const usedColors = new Set(state.departments.map(d => d.color));
  const chosenColor = color || DEPT_COLORS.find(c => !usedColors.has(c)) || DEPT_COLORS[state.departments.length % DEPT_COLORS.length];
  const dept = {
    id: 'd_' + Math.random().toString(36).slice(2, 9),
    name: name.trim(),
    color: chosenColor,
    parent_id,
    manager_id: null,
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
  const subs = deptChildren(id);
  const empCount = state.employees.filter(e => e.department_id === id).length;
  const parts = [];
  if (empCount) parts.push(`${empCount} starfsmenn missa deild`);
  if (subs.length) parts.push(`${subs.length} undirdeildir færast upp á yfirdeild`);
  const msg = `Eyða deildinni "${d.name}"?` + (parts.length ? ' ' + parts.join(' · ') + '.' : '');
  if (!confirm(msg)) return;
  subs.forEach(s => { s.parent_id = d.parent_id || null; });
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
  if (!state.departments.length) {
    el.innerHTML = '<div class="dept-empty">Engar deildir ennþá. Bættu við þeirri fyrstu að ofan.</div>';
    return;
  }
  const roots = deptRoots().slice().sort((a, b) => a.name.localeCompare(b.name, 'is'));
  el.innerHTML = roots.map(d => renderDeptRow(d, 0)).join('');
}

function renderDeptRow(d, depth) {
  const count = state.employees.filter(e => e.department_id === d.id).length;
  const subs = deptChildren(d.id).slice().sort((a, b) => a.name.localeCompare(b.name, 'is'));
  // Parent options — any dept that isn't this one or a descendant of it
  const parentOptions = ['<option value="">— Yfirdeild —</option>'];
  const walk = (parentId, pdepth) => {
    state.departments
      .filter(x => x.parent_id === parentId && !isDeptDescendant(x.id, d.id) && x.id !== d.id)
      .sort((a, b) => a.name.localeCompare(b.name, 'is'))
      .forEach(x => {
        const sel = d.parent_id === x.id ? ' selected' : '';
        const indent = '  '.repeat(pdepth * 2);
        parentOptions.push(`<option value="${x.id}"${sel}>${indent}${pdepth > 0 ? '↳ ' : ''}${escapeHtml(x.name)}</option>`);
        walk(x.id, pdepth + 1);
      });
  };
  walk(null, 0);
  // Manager options — every employee, sorted by name
  const mgrOptions = ['<option value="">— Umsjónarmaður —</option>'];
  state.employees
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'is'))
    .forEach(e => {
      const sel = d.manager_id === e.id ? ' selected' : '';
      mgrOptions.push(`<option value="${e.id}"${sel}>${escapeHtml(e.name)}${e.role ? ' — ' + escapeHtml(e.role) : ''}</option>`);
    });
  const managerEmp = d.manager_id ? findEmp(d.manager_id) : null;
  const managerChip = managerEmp
    ? `<span class="dept-manager-chip" title="Umsjónarmaður: ${escapeHtml(managerEmp.name)}">
        <span class="dept-manager-avatar" style="background:${managerEmp.avatar_color}">${initials(managerEmp.name)}</span>
        <span>${escapeHtml(managerEmp.name.split(' ')[0])}</span>
      </span>`
    : '';
  return `
    <li class="dept-item" data-dept-id="${d.id}" data-depth="${depth}" style="margin-left:${depth * 24}px">
      <span class="dept-dot" style="background:${d.color}" data-action="recolor" title="Breyta lit"></span>
      <div class="dept-main">
        <input class="dept-name" value="${escapeHtml(d.name)}" data-action="rename" />
        <div class="dept-meta-row">
          ${managerChip}
          <select class="dept-manager-select" data-action="set-manager" title="Umsjónarmaður">${mgrOptions.join('')}</select>
          <select class="dept-parent" data-action="set-parent" title="Undir hvaða deild">${parentOptions.join('')}</select>
        </div>
      </div>
      <span class="dept-count">${count} ${count === 1 ? 'starfsmaður' : 'starfsmenn'}</span>
      <div class="dept-actions">
        <button class="icon-btn" data-action="add-sub" title="Bæta við undirdeild">+</button>
        <button class="icon-btn danger" data-action="delete" title="Eyða">🗑</button>
      </div>
    </li>
    ${subs.map(s => renderDeptRow(s, depth + 1)).join('')}
  `;
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
    const modalIds = ['training-detail-modal', 'assign-training-modal', 'checklist-editor-modal', 'item-modal', 'scratch-modal', 'event-modal', 'depts-modal'];
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
    } else if (e.target.closest('[data-action=add-sub]')) {
      const parent = findDept(id);
      const name = prompt(`Nafn undirdeildar undir "${parent?.name || ''}":`);
      if (!name || !name.trim()) return;
      createDepartment(name.trim(), null, id);
      renderDeptList();
      renderTree();
      if (selectedId) populateDeptSelect(findEmp(selectedId));
    }
  });
  deptList.addEventListener('change', (e) => {
    const item = e.target.closest('[data-dept-id]');
    if (!item) return;
    const id = item.dataset.deptId;
    if (e.target.classList.contains('dept-name')) {
      renameDepartment(id, e.target.value);
      renderDeptList();
      renderTree();
      if (selectedId) populateDeptSelect(findEmp(selectedId));
    } else if (e.target.classList.contains('dept-parent')) {
      const newParent = e.target.value || null;
      const d = findDept(id);
      if (!d) return;
      if (newParent && isDeptDescendant(newParent, id)) {
        alert('Er ekki hægt: sú deild er undirdeild þessarar.');
        renderDeptList();
        return;
      }
      d.parent_id = newParent;
      save();
      renderDeptList();
      renderTree();
      if (selectedId) populateDeptSelect(findEmp(selectedId));
    } else if (e.target.classList.contains('dept-manager-select')) {
      const d = findDept(id);
      if (!d) return;
      d.manager_id = e.target.value || null;
      save();
      renderDeptList();
    }
  });

  bindDrawerFields();
  renderTree();
  applyZoom();

  // People view toggle
  document.querySelectorAll('[data-people-view]').forEach(b => {
    b.addEventListener('click', () => switchPeopleView(b.dataset.peopleView));
  });
  switchPeopleView(peopleView);

  // Training section wiring
  document.getElementById('training-search').addEventListener('input', renderTraining);

  // Í dag refresh button
  const todayRefresh = document.getElementById('today-refresh');
  if (todayRefresh) todayRefresh.addEventListener('click', renderToday);
  const newCLBtn = document.getElementById('new-checklist-btn');
  if (newCLBtn) newCLBtn.addEventListener('click', () => openChecklistEditor(null));

  // Checklist editor
  const editorForm = document.getElementById('checklist-editor-form');
  const editorItems = document.getElementById('checklist-editor-items');
  const newItemInput = document.getElementById('checklist-new-item');

  editorForm.addEventListener('submit', (e) => { e.preventDefault(); saveChecklist(); });
  document.getElementById('checklist-delete-btn').addEventListener('click', () => deleteChecklist(editingChecklistId));

  const addNewItems = (raw) => {
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return false;
    lines.forEach(line => {
      // Detect leading whitespace/dashes to guess indent
      let indent = 0;
      const leading = line.match(/^([ \t]+|[\s]*[-•·]+\s*)/);
      if (leading) {
        const spaces = (leading[0].match(/\t|  /g) || []).length;
        indent = Math.min(3, spaces);
      }
      editingChecklistDraft.items.push({
        id: 'ci_' + Math.random().toString(36).slice(2, 10),
        title: line.replace(/^[\s\-•·]+/, '').trim(),
        indent,
      });
    });
    newItemInput.value = '';
    renderChecklistEditorItems();
    updateChecklistItemCount();
    setTimeout(() => newItemInput.focus(), 0);
    return true;
  };
  newItemInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    addNewItems(newItemInput.value);
  });
  document.getElementById('checklist-add-item-btn').addEventListener('click', () => {
    addNewItems(newItemInput.value);
  });
  newItemInput.addEventListener('paste', (e) => {
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (text && text.includes('\n')) {
      e.preventDefault();
      addNewItems(text);
    }
  });

  editorItems.addEventListener('click', (e) => {
    const li = e.target.closest('[data-item-id]');
    if (!li) return;
    const item = editingChecklistDraft.items.find(i => i.id === li.dataset.itemId);
    if (!item) return;
    if (e.target.closest('[data-action=delete]')) {
      editingChecklistDraft.items = editingChecklistDraft.items.filter(i => i.id !== li.dataset.itemId);
      renderChecklistEditorItems();
    } else if (e.target.closest('[data-action=indent]')) {
      item.indent = Math.min(3, (item.indent || 0) + 1);
      renderChecklistEditorItems();
    } else if (e.target.closest('[data-action=outdent]')) {
      item.indent = Math.max(0, (item.indent || 0) - 1);
      renderChecklistEditorItems();
    }
  });
  editorItems.addEventListener('input', (e) => {
    if (e.target.matches('[data-action=rename]')) {
      const li = e.target.closest('[data-item-id]');
      const item = editingChecklistDraft.items.find(i => i.id === li.dataset.itemId);
      if (item) item.title = e.target.value;
    }
  });
  editorItems.addEventListener('keydown', (e) => {
    if (!e.target.matches('[data-action=rename]')) return;
    const li = e.target.closest('[data-item-id]');
    const item = editingChecklistDraft.items.find(i => i.id === li.dataset.itemId);
    if (!item) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      const delta = e.shiftKey ? -1 : 1;
      item.indent = Math.max(0, Math.min(3, (item.indent || 0) + delta));
      renderChecklistEditorItems();
      // Restore focus
      const still = document.querySelector(`[data-item-id="${item.id}"] input`);
      still?.focus();
      still?.setSelectionRange(item.title.length, item.title.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const idx = editingChecklistDraft.items.findIndex(i => i.id === item.id);
      const newItem = { id: 'ci_' + Math.random().toString(36).slice(2, 10), title: '', indent: item.indent || 0 };
      editingChecklistDraft.items.splice(idx + 1, 0, newItem);
      renderChecklistEditorItems();
      const next = document.querySelector(`[data-item-id="${newItem.id}"] input`);
      next?.focus();
    } else if (e.key === 'Backspace' && e.target.value === '' && editingChecklistDraft.items.length > 1) {
      e.preventDefault();
      const idx = editingChecklistDraft.items.findIndex(i => i.id === item.id);
      editingChecklistDraft.items.splice(idx, 1);
      renderChecklistEditorItems();
      const prev = editingChecklistDraft.items[Math.max(0, idx - 1)];
      if (prev) {
        const el2 = document.querySelector(`[data-item-id="${prev.id}"] input`);
        el2?.focus();
        el2?.setSelectionRange(prev.title.length, prev.title.length);
      }
    }
  });

  // Assign
  document.getElementById('assign-training-form').addEventListener('submit', (e) => {
    e.preventDefault(); saveAssignTraining();
  });
  document.getElementById('assign-deadline').addEventListener('input', (e) => {
    const raw = e.target.value;
    const formatted = formatDateStr(raw);
    if (raw !== formatted) {
      const atEnd = e.target.selectionStart >= raw.length;
      e.target.value = formatted;
      if (atEnd) e.target.setSelectionRange(formatted.length, formatted.length);
    }
  });

  // Training detail remove
  document.getElementById('training-detail-remove-btn').addEventListener('click', removeTrainingAssignment);

  // Sidebar toggle (Claude-style)
  const SIDEBAR_KEY = 'hr-app.sidebar-collapsed';
  const appEl = document.querySelector('.app');
  if (localStorage.getItem(SIDEBAR_KEY) === '1') appEl.classList.add('sidebar-collapsed');
  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    appEl.classList.toggle('sidebar-collapsed');
    localStorage.setItem(SIDEBAR_KEY, appEl.classList.contains('sidebar-collapsed') ? '1' : '0');
  });

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
  initItemSheet();
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
  const saved = localStorage.getItem(SECTION_KEY) || 'today';
  switchSection(saved);
}
function switchSection(name) {
  // Close any modal or drawer so the user isn't stuck behind them.
  ['event-modal', 'scratch-modal', 'depts-modal', 'item-modal',
   'checklist-editor-modal', 'assign-training-modal', 'training-detail-modal'].forEach(id => {
    const m = document.getElementById(id);
    if (m) m.hidden = true;
  });
  const drawer = document.getElementById('drawer');
  if (drawer && !drawer.hidden) closeDrawer();

  document.querySelectorAll('.sidebar-item').forEach(b => {
    b.classList.toggle('active', b.dataset.section === name);
  });
  document.querySelectorAll('.section').forEach(s => {
    s.hidden = (s.id !== 'section-' + name);
  });
  localStorage.setItem(SECTION_KEY, name);
  if (name === 'events') renderEvents();
  if (name === 'scratch') renderScratch();
  if (name === 'training') renderTraining();
  if (name === 'today') renderToday();
}

// ---------- Í dag (home dashboard) ----------
function renderToday() {
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const dayLabel = `${cap(WEEKDAYS_IS[now.getDay()])}, ${now.getDate()}. ${MONTHS_IS_LONG[now.getMonth()]} ${now.getFullYear()}`;
  document.getElementById('today-date').textContent = dayLabel;

  const wrap = document.getElementById('today-main');
  const blocks = [];

  // 1. Afmæli í dag
  const birthdays = state.employees.filter(e => {
    const bd = parseFlexibleDate(e.birthdate);
    if (!bd) return false;
    return bd.getDate() === now.getDate() && bd.getMonth() === now.getMonth();
  });
  if (birthdays.length) {
    blocks.push(todayBlock('🎂', 'Afmæli í dag', birthdays.length, false, birthdays.map(e => {
      const bd = parseFlexibleDate(e.birthdate);
      const age = now.getFullYear() - bd.getFullYear() - (
        now.getMonth() < bd.getMonth() || (now.getMonth() === bd.getMonth() && now.getDate() < bd.getDate()) ? 1 : 0
      );
      const dept = findDept(e.department_id);
      const color = dept?.color || e.avatar_color;
      return `
        <li class="today-item" data-nav="drawer" data-emp-id="${e.id}">
          <span class="today-item-time no-time">🎉</span>
          <span class="today-item-avatar" style="background:${color}">${initials(e.name)}</span>
          <span class="today-item-title">${escapeHtml(e.name)}</span>
          <span class="today-item-meta">${age} ára</span>
        </li>
      `;
    }).join('')));
  }

  // 1b. Afmæli í þessum mánuði (except today, which is above)
  const monthBirthdays = state.employees
    .map(e => {
      const bd = parseFlexibleDate(e.birthdate);
      if (!bd) return null;
      if (bd.getMonth() !== now.getMonth()) return null;
      if (bd.getDate() === now.getDate()) return null; // shown in "í dag" already
      return { emp: e, bd };
    })
    .filter(Boolean)
    .sort((a, b) => a.bd.getDate() - b.bd.getDate());
  if (monthBirthdays.length) {
    blocks.push(todayBlock('🎂', `Afmæli í ${MONTHS_IS_LONG[now.getMonth()]}`, monthBirthdays.length, false,
      monthBirthdays.map(x => {
        const age = now.getFullYear() - x.bd.getFullYear();
        const dept = findDept(x.emp.department_id);
        const color = dept?.color || x.emp.avatar_color;
        const past = x.bd.getDate() < now.getDate();
        const daysAway = x.bd.getDate() - now.getDate();
        let dateLabel;
        if (past) dateLabel = `${x.bd.getDate()}. ${MONTHS_IS[x.bd.getMonth()]}`;
        else if (daysAway === 1) dateLabel = 'á morgun';
        else if (daysAway < 7) dateLabel = daysAway + ' dagar';
        else dateLabel = `${x.bd.getDate()}. ${MONTHS_IS[x.bd.getMonth()]}`;
        return `
          <li class="today-item ${past ? 'today-item-past' : ''}" data-nav="drawer" data-emp-id="${x.emp.id}">
            <span class="today-item-time ${past ? 'past' : ''}">${escapeHtml(dateLabel)}</span>
            <span class="today-item-avatar" style="background:${color}">${initials(x.emp.name)}</span>
            <span class="today-item-title">${escapeHtml(x.emp.name)}</span>
            <span class="today-item-meta">${age} ára${past ? ' · liðið' : ''}</span>
          </li>
        `;
      }).join('')));
  }

  // 2. Viðburðir í dag
  const eventsToday = (state.events || []).filter(ev => ev.date_iso === todayIso)
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  if (eventsToday.length) {
    blocks.push(todayBlock('📅', 'Viðburðir í dag', eventsToday.length, false,
      eventsToday.map(ev => `
        <li class="today-item" data-nav="event" data-event-id="${ev.id}">
          <span class="today-item-time ${ev.time && ev.time < now.toTimeString().slice(0, 5) ? 'past' : ''}">${ev.time || '—'}</span>
          <span class="today-item-title">${escapeHtml(ev.title)}</span>
          <span class="today-item-meta">${ev.location ? '📍 ' + escapeHtml(ev.location) : ''}</span>
        </li>
      `).join('')));
  }

  // 3. Verkefni sem eiga að vera búin (from event tasks + party items pickup today or overdue)
  const eventTasksDue = [];
  (state.events || []).forEach(ev => {
    (ev.tasks || []).forEach(t => {
      if (t.done) return;
      if (!t.due_date) return;
      const due = parseFlexibleDate(t.due_date);
      if (!due) return;
      const dueIso = due.toISOString().slice(0, 10);
      if (dueIso <= todayIso) {
        eventTasksDue.push({ ev, task: t, dueIso });
      }
    });
  });
  if (eventTasksDue.length) {
    eventTasksDue.sort((a, b) => a.dueIso.localeCompare(b.dueIso));
    blocks.push(todayBlock('✅', 'Verkefni sem eiga að vera búin', eventTasksDue.length, true,
      eventTasksDue.map(x => {
        const overdue = x.dueIso < todayIso;
        const assignee = x.task.assignee_id ? findEmp(x.task.assignee_id) : null;
        return `
          <li class="today-item" data-nav="event" data-event-id="${x.ev.id}">
            <span class="today-item-time ${overdue ? 'past' : ''}">${x.dueIso === todayIso ? 'í dag' : x.task.due_date}</span>
            <span class="today-item-title">${escapeHtml(x.task.title)}</span>
            <span class="today-item-meta">${escapeHtml(x.ev.title)}${assignee ? ' · ' + escapeHtml(assignee.name.split(' ')[0]) : ''}</span>
            ${overdue ? '<span class="today-item-badge overdue">yfir</span>' : ''}
          </li>
        `;
      }).join('')));
  }

  // 4. Þarf að sækja / afhent í dag (party items)
  const itemsToday = [];
  (state.events || []).forEach(ev => {
    const walkCats = (cats) => {
      cats.forEach(c => {
        c.items.forEach(i => {
          if (i.done) return;
          if (!i.pickup_date) return;
          const d = parseFlexibleDate(i.pickup_date);
          if (!d) return;
          const iso = d.toISOString().slice(0, 10);
          if (iso === todayIso) itemsToday.push({ ev, item: i });
        });
        walkCats(c.subcategories || []);
      });
    };
    walkCats(ev.budget_categories || []);
  });
  if (itemsToday.length) {
    itemsToday.sort((a, b) => (a.item.pickup_time || '').localeCompare(b.item.pickup_time || ''));
    blocks.push(todayBlock('🛒', 'Þarf að sækja / afhent í dag', itemsToday.length, false,
      itemsToday.map(x => `
        <li class="today-item" data-nav="event" data-event-id="${x.ev.id}">
          <span class="today-item-time ${x.item.pickup_time || 'no-time'}">${x.item.pickup_time || '—'}</span>
          <span class="today-item-title">${escapeHtml(x.item.name)}</span>
          <span class="today-item-meta">${x.item.pickup_type === 'pickup' ? '🛒 Ná í' : '🚚 Til mín'}${x.item.pickup_location ? ' · ' + escapeHtml(x.item.pickup_location) : ''} · ${escapeHtml(x.ev.title)}</span>
        </li>
      `).join('')));
  }

  // 5. Dagskrár-atriði (timeline) í dag
  const scheduleToday = [];
  (state.events || []).forEach(ev => {
    (ev.timeline_items || []).forEach(t => {
      const d = parseFlexibleDate(t.date);
      if (!d) return;
      if (d.toISOString().slice(0, 10) === todayIso) {
        scheduleToday.push({ ev, item: t });
      }
    });
  });
  if (scheduleToday.length) {
    scheduleToday.sort((a, b) => (a.item.time || '').localeCompare(b.item.time || ''));
    blocks.push(todayBlock('🕐', 'Dagskrá í dag', scheduleToday.length, false,
      scheduleToday.map(x => `
        <li class="today-item" data-nav="event" data-event-id="${x.ev.id}">
          <span class="today-item-time">${x.item.time || '—'}</span>
          <span class="today-item-title ${x.item.done ? 'done' : ''}">${escapeHtml(x.item.title)}</span>
          <span class="today-item-meta">${escapeHtml(x.ev.title)}</span>
        </li>
      `).join('')));
  }

  // 6. Áminningar úr Skjal
  const reminders = [];
  (state.scratchNotes || []).forEach(sn => {
    if (sn.event_at) {
      const d = new Date(sn.event_at);
      if (d.toISOString().slice(0, 10) === todayIso) reminders.push({ sn, kind: 'event' });
    }
    if (sn.remind_at) {
      const d = new Date(sn.remind_at);
      if (d.toISOString().slice(0, 10) === todayIso) reminders.push({ sn, kind: 'remind' });
    }
  });
  if (reminders.length) {
    blocks.push(todayBlock('🔔', 'Áminningar í dag', reminders.length, false,
      reminders.map(x => {
        const at = new Date(x.kind === 'event' ? x.sn.event_at : x.sn.remind_at);
        const time = `${String(at.getHours()).padStart(2,'0')}:${String(at.getMinutes()).padStart(2,'0')}`;
        return `
          <li class="today-item" data-nav="scratch" data-scratch-id="${x.sn.id}">
            <span class="today-item-time">${time}</span>
            <span class="today-item-title">${escapeHtml(x.sn.title || x.sn.body.slice(0, 60))}</span>
            <span class="today-item-meta">${x.kind === 'event' ? 'Skjal · dagsetning' : 'Skjal · minna á'}</span>
          </li>
        `;
      }).join('')));
  }

  // 7. Þjálfun með fresti í dag eða yfir tíma
  const trainingDue = [];
  state.employees.forEach(e => {
    (e.training || []).forEach(a => {
      if (!a.deadline) return;
      const d = parseFlexibleDate(a.deadline);
      if (!d) return;
      const iso = d.toISOString().slice(0, 10);
      if (iso > todayIso) return;
      const p = trainingProgress(a);
      if (p.total && p.done === p.total) return;
      trainingDue.push({ emp: e, a, iso });
    });
  });
  if (trainingDue.length) {
    trainingDue.sort((a, b) => a.iso.localeCompare(b.iso));
    blocks.push(todayBlock('🎓', 'Þjálfun með fresti', trainingDue.length, true,
      trainingDue.map(x => {
        const cl = findChecklist(x.a.checklist_id);
        const p = trainingProgress(x.a);
        const overdue = x.iso < todayIso;
        const dept = findDept(x.emp.department_id);
        const color = dept?.color || x.emp.avatar_color;
        return `
          <li class="today-item" data-nav="training" data-emp-id="${x.emp.id}" data-assignment-id="${x.a.id}">
            <span class="today-item-time ${overdue ? 'past' : ''}">${x.a.deadline}</span>
            <span class="today-item-avatar" style="background:${color}">${initials(x.emp.name)}</span>
            <span class="today-item-title">${escapeHtml(x.emp.name)}</span>
            <span class="today-item-meta">${escapeHtml(cl?.name || 'Þjálfun')} · ${p.done}/${p.total}</span>
            ${overdue ? '<span class="today-item-badge overdue">yfir</span>' : ''}
          </li>
        `;
      }).join('')));
  }

  // "Næst á dagskrá" — always shown when today has little going on (or as a supplement)
  const upcomingBlock = buildUpcomingBlock(now, todayIso);
  if (upcomingBlock) blocks.push(upcomingBlock);

  if (!blocks.length) {
    wrap.innerHTML = `
      <div class="today-wrap">
        <div class="today-empty">
          <div class="icon">☕</div>
          <h3>Ekkert á dagskrá í dag eða á næstunni</h3>
          <p>Njóttu dagsins — engir viðburðir, verkefni eða áminningar.</p>
        </div>
      </div>
    `;
    return;
  }

  wrap.innerHTML = `<div class="today-wrap">${blocks.join('')}</div>`;

  // Wire click navigation
  wrap.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => {
      const nav = el.dataset.nav;
      if (nav === 'drawer') { openDrawer(el.dataset.empId); }
      else if (nav === 'event') {
        switchSection('events');
        setTimeout(() => openEventModal(el.dataset.eventId), 60);
      }
      else if (nav === 'scratch') {
        switchSection('scratch');
        setTimeout(() => openScratchModal(el.dataset.scratchId), 60);
      }
      else if (nav === 'training') {
        switchSection('training');
        setTimeout(() => openTrainingDetail(el.dataset.empId, el.dataset.assignmentId), 60);
      }
    });
  });
}

function buildUpcomingBlock(now, todayIso) {
  const items = [];
  const WINDOW_DAYS = 14;
  const in7days = new Date(now); in7days.setDate(in7days.getDate() + WINDOW_DAYS);
  const in7iso = in7days.toISOString().slice(0, 10);

  // Upcoming birthdays (next 30 days)
  state.employees.forEach(e => {
    const bd = parseFlexibleDate(e.birthdate);
    if (!bd) return;
    for (let year of [now.getFullYear(), now.getFullYear() + 1]) {
      const next = new Date(year, bd.getMonth(), bd.getDate());
      const daysAway = Math.round((next - now) / 86400000);
      if (daysAway > 0 && daysAway <= 30) {
        const age = year - bd.getFullYear();
        items.push({
          date: next,
          sortKey: next.toISOString().slice(0, 10),
          icon: '🎂',
          title: e.name,
          meta: `${age} ára afmæli`,
          nav: { type: 'drawer', emp_id: e.id },
          color: findDept(e.department_id)?.color || e.avatar_color,
        });
        break;
      }
    }
  });

  // Upcoming events (after today, within window)
  (state.events || []).forEach(ev => {
    if (!ev.date_iso) return;
    if (ev.date_iso <= todayIso) return;
    if (ev.date_iso > in7iso) return;
    items.push({
      date: new Date(ev.date_iso),
      sortKey: ev.date_iso + 'T' + (ev.time || '00:00'),
      icon: '📅',
      title: ev.title,
      meta: (ev.time ? ev.time + ' · ' : '') + (ev.location || 'Viðburður'),
      nav: { type: 'event', event_id: ev.id },
    });
  });

  // Upcoming scratch notes (event_at or remind_at)
  (state.scratchNotes || []).forEach(sn => {
    ['event_at', 'remind_at'].forEach(k => {
      const val = sn[k];
      if (!val) return;
      const d = new Date(val);
      const iso = d.toISOString().slice(0, 10);
      if (iso <= todayIso || iso > in7iso) return;
      items.push({
        date: d,
        sortKey: d.toISOString(),
        icon: k === 'event_at' ? '🔔' : '🔔',
        title: sn.title || sn.body.slice(0, 60),
        meta: k === 'event_at' ? 'Glósa · dagsetning' : 'Glósa · minna á',
        nav: { type: 'scratch', scratch_id: sn.id },
      });
    });
  });

  // Upcoming party items (pickup within window)
  (state.events || []).forEach(ev => {
    const walk = (cats) => {
      cats.forEach(c => {
        c.items.forEach(i => {
          if (i.done) return;
          const d = parseFlexibleDate(i.pickup_date);
          if (!d) return;
          const iso = d.toISOString().slice(0, 10);
          if (iso <= todayIso || iso > in7iso) return;
          items.push({
            date: d,
            sortKey: iso + 'T' + (i.pickup_time || '00:00'),
            icon: i.pickup_type === 'pickup' ? '🛒' : '🚚',
            title: i.name,
            meta: `${i.pickup_type === 'pickup' ? 'Ná í' : 'Til mín'}${i.pickup_time ? ' · ' + i.pickup_time : ''} · ${ev.title}`,
            nav: { type: 'event', event_id: ev.id },
          });
        });
        walk(c.subcategories || []);
      });
    };
    walk(ev.budget_categories || []);
  });

  // Upcoming event tasks (due within window)
  (state.events || []).forEach(ev => {
    (ev.tasks || []).forEach(t => {
      if (t.done || !t.due_date) return;
      const d = parseFlexibleDate(t.due_date);
      if (!d) return;
      const iso = d.toISOString().slice(0, 10);
      if (iso <= todayIso || iso > in7iso) return;
      items.push({
        date: d,
        sortKey: iso,
        icon: '✅',
        title: t.title,
        meta: `Verkefni · ${ev.title}`,
        nav: { type: 'event', event_id: ev.id },
      });
    });
  });

  // Ongoing training (not overdue, not complete) — show a few
  const ongoingTraining = [];
  state.employees.forEach(e => {
    (e.training || []).forEach(a => {
      const p = trainingProgress(a);
      if (p.total && p.done < p.total && !isAssignmentOverdue(a)) {
        ongoingTraining.push({ emp: e, a, p });
      }
    });
  });
  ongoingTraining
    .sort((a, b) => (a.a.deadline || '9999').localeCompare(b.a.deadline || '9999'))
    .slice(0, 5)
    .forEach(x => {
      const cl = findChecklist(x.a.checklist_id);
      items.push({
        date: new Date(9999, 0, 1), // put after date-based items
        sortKey: 'zzz-training-' + x.emp.id,
        icon: '🎓',
        title: x.emp.name,
        meta: `${cl?.name || 'Þjálfun'} · ${x.p.done}/${x.p.total}${x.a.deadline ? ' · frestur ' + x.a.deadline : ''}`,
        nav: { type: 'training', emp_id: x.emp.id, assignment_id: x.a.id },
        color: findDept(x.emp.department_id)?.color || x.emp.avatar_color,
      });
    });

  if (!items.length) return null;

  items.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  const top = items.slice(0, 15);

  const rows = top.map(x => {
    const nav = Object.entries(x.nav).map(([k, v]) => `data-${k.replace(/_/g, '-')}="${v}"`).join(' ');
    const type = x.nav.type;
    const dateLabel = x.date.getFullYear() === 9999 ? 'í gangi' : friendlyRelDate(x.date, now);
    const avatarHtml = x.color
      ? `<span class="today-item-avatar" style="background:${x.color}">${initials(x.title)}</span>`
      : `<span class="today-item-time no-time" style="min-width:24px;">${x.icon}</span>`;
    return `
      <li class="today-item" data-nav="${type}" ${nav}>
        <span class="today-item-time">${escapeHtml(dateLabel)}</span>
        ${avatarHtml}
        <span class="today-item-title">${escapeHtml(x.title)}</span>
        <span class="today-item-meta">${escapeHtml(x.meta)}</span>
      </li>
    `;
  }).join('');

  return `
    <div class="today-block">
      <div class="today-block-head">
        <h3><span class="icon">📌</span> Næst á dagskrá</h3>
        <span class="today-block-count">${top.length}</span>
      </div>
      <ul class="today-list">${rows}</ul>
    </div>
  `;
}

function friendlyRelDate(d, now) {
  const days = Math.round((d - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  if (days === 1) return 'á morgun';
  if (days > 1 && days < 7) return days + ' dagar';
  return `${d.getDate()}. ${MONTHS_IS[d.getMonth()]}`;
}

function todayBlock(icon, title, count, warn, itemsHtml) {
  return `
    <div class="today-block">
      <div class="today-block-head">
        <h3><span class="icon">${icon}</span> ${escapeHtml(title)}</h3>
        <span class="today-block-count ${warn ? 'count-warn' : ''}">${count}</span>
      </div>
      <ul class="today-list">${itemsHtml}</ul>
    </div>
  `;
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ---------- Training — checklists + per-employee assignments ----------
function findChecklist(id) { return (state.checklists || []).find(c => c.id === id); }

function trainingProgress(assignment) {
  const list = findChecklist(assignment.checklist_id);
  if (!list) return { done: 0, total: 0, pct: 0 };
  const total = list.items.length;
  const doneSet = new Set(assignment.done_items || []);
  const done = list.items.filter(i => doneSet.has(i.id)).length;
  const pct = total ? (done / total) * 100 : 0;
  return { done, total, pct };
}

function isAssignmentOverdue(a) {
  if (!a.deadline) return false;
  const d = parseFlexibleDate(a.deadline);
  if (!d) return false;
  const p = trainingProgress(a);
  return p.done < p.total && d.getTime() < Date.now();
}

function renderTraining() {
  renderChecklistsGrid();
  const list = document.getElementById('training-list');
  const summary = document.getElementById('training-summary');
  const inlineSummary = document.getElementById('training-summary-inline');
  const q = (document.getElementById('training-search').value || '').toLowerCase().trim();

  // Employees with any assignment
  const trainees = state.employees
    .filter(e => (e.training || []).length > 0)
    .filter(e => {
      if (!q) return true;
      const listNames = (e.training || []).map(a => findChecklist(a.checklist_id)?.name || '').join(' ');
      return (e.name + ' ' + listNames).toLowerCase().includes(q);
    });

  // Stats (across all assignments)
  let inProgress = 0, completed = 0, overdue = 0;
  state.employees.forEach(e => {
    (e.training || []).forEach(a => {
      const p = trainingProgress(a);
      if (p.total && p.done === p.total) completed++;
      else inProgress++;
      if (isAssignmentOverdue(a)) overdue++;
    });
  });
  document.getElementById('training-in-progress').textContent = inProgress;
  document.getElementById('training-completed').textContent = completed;
  document.getElementById('training-overdue').textContent = overdue;

  if (!trainees.length) {
    list.innerHTML = '';
    summary.hidden = true;
    if (state.employees.every(e => !(e.training || []).length)) {
      inlineSummary.textContent = state.checklists.length
        ? 'Enginn í þjálfun ennþá. Smelltu „Senda á starfsmann" á tékklista til að úthluta.'
        : 'Búðu til fyrsta tékklistann fyrir ofan.';
    } else {
      inlineSummary.textContent = 'Engin þjálfun samsvarar leitinni.';
    }
    return;
  }
  inlineSummary.textContent = '';
  summary.hidden = false;

  list.innerHTML = trainees.map(e => {
    const dept = findDept(e.department_id);
    const avatarColor = dept?.color || e.avatar_color;
    const assigns = e.training || [];
    let totalDone = 0, totalItems = 0;
    assigns.forEach(a => {
      const p = trainingProgress(a);
      totalDone += p.done; totalItems += p.total;
    });
    const pct = totalItems ? (totalDone / totalItems) * 100 : 0;
    const chips = assigns.map(a => {
      const cl = findChecklist(a.checklist_id);
      if (!cl) return '';
      const p = trainingProgress(a);
      const complete = p.total && p.done === p.total;
      const over = isAssignmentOverdue(a);
      const klass = complete ? 'complete' : (over ? 'overdue' : '');
      return `<span class="training-module-chip ${klass}" data-emp-id="${e.id}" data-assignment-id="${a.id}">${escapeHtml(cl.name)} · ${p.done}/${p.total}${over ? ' · yfir tíma' : ''}</span>`;
    }).join('');
    return `
      <li class="training-card" data-emp-id="${e.id}">
        <div class="training-card-head">
          <span class="training-card-avatar" style="background:${avatarColor}">${initials(e.name)}</span>
          <div class="training-card-name">
            <div class="name">${escapeHtml(e.name)}</div>
            ${e.role ? `<div class="role">${escapeHtml(e.role)}</div>` : ''}
          </div>
          <span class="training-card-progress-text">${totalDone}/${totalItems}</span>
        </div>
        <div class="training-card-progress-bar"><div class="training-card-progress-fill" style="width:${pct}%"></div></div>
        <div class="training-card-modules">${chips}</div>
      </li>
    `;
  }).join('');

  list.querySelectorAll('.training-module-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      openTrainingDetail(chip.dataset.empId, chip.dataset.assignmentId);
    });
  });
  list.querySelectorAll('.training-card').forEach(card => {
    card.addEventListener('click', () => {
      const emp = findEmp(card.dataset.empId);
      const firstAssignment = (emp?.training || [])[0];
      if (firstAssignment) openTrainingDetail(emp.id, firstAssignment.id);
    });
  });
}

// ---------- Checklist grid (inline in Þjálfun) ----------
function renderChecklistsGrid() {
  const grid = document.getElementById('checklists-grid');
  if (!grid) return;
  const lists = state.checklists || [];
  const cards = lists.map(cl => {
    const usedBy = state.employees.reduce((s, e) => s + ((e.training || []).some(a => a.checklist_id === cl.id) ? 1 : 0), 0);
    const preview = cl.items.slice(0, 6).map(i => {
      const level = Math.max(0, Math.min(3, i.indent || 0));
      return `<li class="preview-item indent-${level}"><span class="preview-bullet bullet-${level}"></span>${escapeHtml(i.title)}</li>`;
    }).join('');
    const more = cl.items.length > 6 ? `<li class="preview-more">…og ${cl.items.length - 6} til viðbótar</li>` : '';
    return `
      <div class="checklist-card" data-checklist-id="${cl.id}">
        <div class="checklist-card-head">
          <div class="checklist-card-name">${escapeHtml(cl.name)}</div>
        </div>
        <div class="checklist-card-meta">${cl.items.length} atriði · ${usedBy} ${usedBy === 1 ? 'starfsmaður' : 'starfsmenn'}</div>
        <ul class="checklist-card-preview">${preview}${more}</ul>
        <div class="checklist-card-actions">
          <button type="button" class="btn" data-action="view">Skoða</button>
          <button type="button" class="btn primary" data-action="assign">+ Starfsmaður</button>
        </div>
      </div>
    `;
  }).join('');
  grid.innerHTML = cards + `<button type="button" class="checklist-add-card" data-action="new-checklist">+ Nýr tékklisti</button>`;

  grid.querySelectorAll('[data-action=new-checklist]').forEach(b => {
    b.addEventListener('click', () => openChecklistEditor(null));
  });
  grid.querySelectorAll('[data-checklist-id]').forEach(card => {
    const id = card.dataset.checklistId;
    card.querySelector('[data-action=view]').addEventListener('click', (e) => {
      e.stopPropagation();
      openChecklistEditor(id);
    });
    card.querySelector('[data-action=assign]').addEventListener('click', (e) => {
      e.stopPropagation();
      openAssignTraining(id);
    });
  });
}

// ---------- Checklist editor ----------
let editingChecklistId = null;
let editingChecklistDraft = null;

function openChecklistEditor(id) {
  editingChecklistId = id;
  const cl = id ? findChecklist(id) : null;
  editingChecklistDraft = cl
    ? { name: cl.name, description: cl.description || '', items: cl.items.map(i => ({ ...i })) }
    : { name: '', description: '', items: [] };
  document.getElementById('checklist-editor-title').textContent = cl ? 'Breyta tékklista' : 'Nýr tékklisti';
  document.getElementById('checklist-name').value = editingChecklistDraft.name;
  document.getElementById('checklist-description').value = editingChecklistDraft.description;
  document.getElementById('checklist-delete-btn').hidden = !cl;
  document.getElementById('checklist-new-item').value = '';
  renderChecklistEditorItems();
  document.getElementById('checklist-editor-modal').hidden = false;
  setTimeout(() => document.getElementById('checklist-name').focus(), 50);
}

function renderChecklistEditorItems() {
  const el = document.getElementById('checklist-editor-items');
  el.innerHTML = editingChecklistDraft.items.map(i => {
    const level = Math.max(0, Math.min(3, i.indent || 0));
    return `
      <li class="checklist-editor-item indent-${level}" data-item-id="${i.id}">
        <span class="checklist-editor-bullet bullet-${level}" aria-hidden="true"></span>
        <input value="${escapeHtml(i.title)}" data-action="rename" placeholder="Nafn atriðis" />
        <div class="checklist-editor-actions">
          <button type="button" data-action="outdent" title="Færa vinstri (Shift+Tab)" ${level === 0 ? 'disabled' : ''}>←</button>
          <button type="button" data-action="indent" title="Færa hægri — gera undirlið (Tab)" ${level >= 3 ? 'disabled' : ''}>→</button>
          <button type="button" data-action="delete" title="Eyða">✕</button>
        </div>
      </li>
    `;
  }).join('');
  updateChecklistItemCount();
}

function updateChecklistItemCount() {
  const el = document.getElementById('checklist-item-count');
  if (!el) return;
  const n = editingChecklistDraft.items.length;
  el.textContent = n ? `(${n})` : '';
}

function saveChecklist() {
  const name = document.getElementById('checklist-name').value.trim();
  const description = document.getElementById('checklist-description').value.trim();
  if (!name) return;
  editingChecklistDraft.name = name;
  editingChecklistDraft.description = description;
  state.checklists = state.checklists || [];
  if (editingChecklistId) {
    const existing = findChecklist(editingChecklistId);
    if (existing) Object.assign(existing, editingChecklistDraft);
  } else {
    state.checklists.push({
      id: 'cl_' + Math.random().toString(36).slice(2, 10),
      ...editingChecklistDraft,
      created_at: new Date().toISOString(),
    });
  }
  save();
  document.getElementById('checklist-editor-modal').hidden = true;
  renderTraining();
}

function deleteChecklist(id) {
  const cl = findChecklist(id);
  if (!cl) return;
  const usedBy = state.employees.reduce((s, e) => s + ((e.training || []).some(a => a.checklist_id === id) ? 1 : 0), 0);
  const msg = usedBy
    ? `Eyða tékklistanum "${cl.name}"? ${usedBy} starfsmenn missa úthlutunina.`
    : `Eyða tékklistanum "${cl.name}"?`;
  if (!confirm(msg)) return;
  state.employees.forEach(e => {
    e.training = (e.training || []).filter(a => a.checklist_id !== id);
  });
  state.checklists = state.checklists.filter(c => c.id !== id);
  save();
  document.getElementById('checklist-editor-modal').hidden = true;
  renderTraining();
}

// ---------- Assign training ----------
function openAssignTraining(preselectChecklistId) {
  const clSel = document.getElementById('assign-checklist-select');
  const empSel = document.getElementById('assign-employee-select');
  const lists = state.checklists || [];
  if (!lists.length) {
    alert('Búðu til tékklista fyrst.');
    return;
  }
  clSel.innerHTML = lists.map(c => `<option value="${c.id}"${c.id === preselectChecklistId ? ' selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
  empSel.innerHTML = state.employees
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'is'))
    .map(e => `<option value="${e.id}">${escapeHtml(e.name)}${e.role ? ' — ' + escapeHtml(e.role) : ''}</option>`).join('');
  document.getElementById('assign-deadline').value = '';
  document.getElementById('assign-training-modal').hidden = false;
  setTimeout(() => clSel.focus(), 50);
}

function saveAssignTraining() {
  const clId = document.getElementById('assign-checklist-select').value;
  const empId = document.getElementById('assign-employee-select').value;
  const deadline = document.getElementById('assign-deadline').value.trim();
  if (!clId || !empId) return;
  const emp = findEmp(empId);
  if (!emp) return;
  emp.training = emp.training || [];
  // Prevent duplicate assignment
  if (emp.training.some(a => a.checklist_id === clId)) {
    if (!confirm('Þessi tékklisti er þegar úthlutaður. Bæta við nýrri úthlutun samt?')) return;
  }
  emp.training.push({
    id: 'a_' + Math.random().toString(36).slice(2, 10),
    checklist_id: clId,
    assigned_at: new Date().toISOString(),
    deadline: deadline || null,
    done_items: [],
  });
  save();
  document.getElementById('assign-training-modal').hidden = true;
  renderTraining();
}

// ---------- Training detail (view/tick items) ----------
let detailEmpId = null;
let detailAssignmentId = null;

function openTrainingDetail(empId, assignmentId) {
  detailEmpId = empId;
  detailAssignmentId = assignmentId;
  renderTrainingDetail();
  document.getElementById('training-detail-modal').hidden = false;
}

function renderTrainingDetail() {
  const emp = findEmp(detailEmpId);
  if (!emp) return;
  const a = (emp.training || []).find(x => x.id === detailAssignmentId);
  if (!a) return;
  const cl = findChecklist(a.checklist_id);
  if (!cl) return;
  document.getElementById('training-detail-title').textContent = cl.name;
  document.getElementById('training-detail-subtitle').textContent = emp.name + (a.deadline ? ' · frestur ' + a.deadline : '');
  const p = trainingProgress(a);
  document.getElementById('training-detail-fill').style.width = p.pct + '%';
  document.getElementById('training-detail-progress').textContent = `${p.done} af ${p.total}`;
  const doneSet = new Set(a.done_items || []);
  const list = document.getElementById('training-detail-items');
  list.innerHTML = cl.items.map(i => {
    const level = Math.max(0, Math.min(3, i.indent || 0));
    return `
      <li class="indent-${level} ${doneSet.has(i.id) ? 'done' : ''}" data-item-id="${i.id}">
        <span class="check"></span>
        <span class="title">${escapeHtml(i.title)}</span>
      </li>
    `;
  }).join('');
  list.querySelectorAll('[data-item-id]').forEach(li => {
    li.addEventListener('click', () => {
      const itemId = li.dataset.itemId;
      const done = new Set(a.done_items || []);
      if (done.has(itemId)) done.delete(itemId); else done.add(itemId);
      a.done_items = [...done];
      save();
      renderTrainingDetail();
      renderTraining();
    });
  });
}

function removeTrainingAssignment() {
  const emp = findEmp(detailEmpId);
  if (!emp) return;
  const a = (emp.training || []).find(x => x.id === detailAssignmentId);
  if (!a) return;
  const cl = findChecklist(a.checklist_id);
  if (!confirm(`Fjarlægja "${cl?.name || 'þjálfun'}" úthlutun frá ${emp.name}?`)) return;
  emp.training = emp.training.filter(x => x.id !== detailAssignmentId);
  save();
  document.getElementById('training-detail-modal').hidden = true;
  renderTraining();
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
const filterState = { tasks: 'todo', items: 'todo', timeline: 'todo' };

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

  // Guest search box — inline results dropdown of matching employees
  const searchInput = document.getElementById('guest-search-input');
  const resultsBox = document.getElementById('guest-search-results');

  const renderGuestSearchResults = () => {
    const q = searchInput.value.toLowerCase().trim();
    if (!q) { resultsBox.hidden = true; resultsBox.innerHTML = ''; return; }
    const taken = new Set(eventDraftParticipants);
    const matches = state.employees
      .filter(emp => !taken.has(emp.id))
      .filter(emp => (emp.name + ' ' + (emp.role || '') + ' ' + deptName(emp.department_id)).toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'is'))
      .slice(0, 20);
    if (!matches.length) {
      resultsBox.innerHTML = '<div class="guest-search-empty">Enginn starfsmaður fannst.</div>';
    } else {
      resultsBox.innerHTML = matches.map(e => `
        <div class="guest-search-result" data-emp-id="${e.id}">
          <span class="chip-avatar" style="background:${findDept(e.department_id)?.color || e.avatar_color}">${initials(e.name)}</span>
          <span>${escapeHtml(e.name)}</span>
          ${e.role ? `<span class="role">${escapeHtml(e.role)}</span>` : ''}
        </div>
      `).join('');
    }
    resultsBox.hidden = false;
  };

  searchInput.addEventListener('input', renderGuestSearchResults);
  searchInput.addEventListener('focus', renderGuestSearchResults);
  searchInput.addEventListener('blur', () => {
    // small delay so click on result registers first
    setTimeout(() => { resultsBox.hidden = true; }, 150);
  });
  resultsBox.addEventListener('mousedown', (e) => {
    const row = e.target.closest('[data-emp-id]');
    if (!row) return;
    e.preventDefault();
    if (!eventDraftParticipants.includes(row.dataset.empId)) {
      eventDraftParticipants.push(row.dataset.empId);
    }
    searchInput.value = '';
    resultsBox.hidden = true;
    refreshGuestsUI();
    autoSaveEventIfEditing();
    searchInput.focus();
  });

  // Copy invite link
  document.getElementById('copy-invite-btn').addEventListener('click', copyInviteText);

  // Sub-tabs inside event modal
  document.querySelectorAll('[data-event-tab]').forEach(b => {
    b.addEventListener('click', () => switchEventTab(b.dataset.eventTab));
  });

  // Filter toggles (Til að gera / Búið / Allt)
  document.querySelectorAll('.filter-toggle').forEach(toggle => {
    toggle.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter]');
      if (!btn) return;
      const scope = toggle.dataset.filterScope;
      filterState[scope] = btn.dataset.filter;
      toggle.querySelectorAll('[data-filter]').forEach(b =>
        b.classList.toggle('active', b === btn));
      if (scope === 'tasks') renderTaskList();
      else if (scope === 'items') renderBudget();
      else if (scope === 'timeline') renderTimeline();
    });
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
    const cat = findCategoryDeep(catEl.dataset.categoryId);
    if (!cat) return;
    // Only respond to header actions when the header belongs to THIS category
    const headerEl = e.target.closest('.budget-category-header');
    const headerCatEl = headerEl?.closest('[data-category-id]');
    const isThisHeader = headerCatEl === catEl;
    if (e.target.closest('[data-action=delete-category]') && isThisHeader) {
      e.stopPropagation();
      if (!confirm(`Eyða flokknum "${cat.name}"?`)) return;
      const parentInfo = findCategoryParent(cat.id);
      if (parentInfo) parentInfo.list.splice(parentInfo.list.indexOf(cat), 1);
      renderBudget();
      autoSaveEventIfEditing();
    } else if (e.target.closest('[data-action=add-subcategory]')) {
      e.stopPropagation();
      const name = prompt('Nafn undirflokks:');
      if (!name || !name.trim()) return;
      cat.subcategories = cat.subcategories || [];
      cat.subcategories.push({
        id: 'bc_' + Math.random().toString(36).slice(2, 10),
        name: name.trim(),
        estimated: null,
        open: true,
        manager_ids: [],
        subcategories: [],
        items: [],
      });
      cat.open = true;
      renderBudget();
      autoSaveEventIfEditing();
    } else if (e.target.closest('[data-action=add-manager]') && isThisHeader) {
      e.stopPropagation();
      openCategoryManagerPicker(cat, e.target.closest('[data-action=add-manager]'));
    } else if (e.target.closest('[data-action=delete-item]')) {
      const itemEl = e.target.closest('[data-item-id]');
      cat.items = cat.items.filter(i => i.id !== itemEl.dataset.itemId);
      renderBudget();
      autoSaveEventIfEditing();
    } else if (e.target.closest('[data-action=open-item-sheet]')) {
      openItemSheet(cat.id, null);
    } else if (e.target.closest('[data-action=toggle-done]')) {
      const itemEl = e.target.closest('[data-item-id]');
      const item = cat.items.find(i => i.id === itemEl.dataset.itemId);
      if (item) {
        item.done = !item.done;
        renderBudget();
        autoSaveEventIfEditing();
      }
    } else if (e.target.closest('.cat-manager-chip')) {
      // Click manager chip: remove
      const chip = e.target.closest('.cat-manager-chip');
      const idx = [...chip.parentNode.children].indexOf(chip);
      if (cat.manager_ids && cat.manager_ids[idx] !== undefined) {
        if (confirm(`Fjarlægja umsjónarmann?`)) {
          cat.manager_ids.splice(idx, 1);
          renderBudget();
          autoSaveEventIfEditing();
        }
      }
    } else if (e.target.closest('.party-item-card')) {
      const itemEl = e.target.closest('[data-item-id]');
      const itemCat = findCategoryOfItem(itemEl.dataset.itemId);
      if (itemCat) openItemSheet(itemCat.id, itemEl.dataset.itemId);
    } else if (isThisHeader && !e.target.closest('input, button')) {
      cat.open = !cat.open;
      renderBudget();
    }
  });
  budgetCats.addEventListener('input', (e) => {
    const catEl = e.target.closest('[data-category-id]');
    if (!catEl) return;
    const cat = findCategoryDeep(catEl.dataset.categoryId);
    if (!cat) return;
    const headerEl = e.target.closest('.budget-category-header');
    const headerCatEl = headerEl?.closest('[data-category-id]');
    const isThisHeader = headerCatEl === catEl;
    if (isThisHeader && e.target.classList.contains('budget-category-name')) cat.name = e.target.value;
    else if (isThisHeader && e.target.classList.contains('budget-category-estimated')) cat.estimated = e.target.value ? Number(e.target.value) : null;
    else if (e.target.classList.contains('item-name') || e.target.classList.contains('item-amount')) {
      const itemEl = e.target.closest('[data-item-id]');
      const itemCat = findCategoryOfItem(itemEl.dataset.itemId);
      if (!itemCat) return;
      const item = itemCat.items.find(i => i.id === itemEl.dataset.itemId);
      if (!item) return;
      if (e.target.classList.contains('item-name')) item.name = e.target.value;
      else item.amount = Number(e.target.value) || 0;
    } else return;
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
    else if (e.target.classList.contains('timeline-date-input')) {
      const raw = e.target.value;
      const formatted = formatDateStr(raw);
      if (raw !== formatted) {
        const atEnd = e.target.selectionStart >= raw.length;
        e.target.value = formatted;
        if (atEnd) e.target.setSelectionRange(formatted.length, formatted.length);
      }
      t.date = formatted;
    }
    autoSaveEventIfEditing();
  });

  // Auto-format date field in the "add timeline item" row
  document.getElementById('timeline-add-date').addEventListener('input', (e) => {
    const raw = e.target.value;
    const formatted = formatDateStr(raw);
    if (raw !== formatted) {
      const atEnd = e.target.selectionStart >= raw.length;
      e.target.value = formatted;
      if (atEnd) e.target.setSelectionRange(formatted.length, formatted.length);
    }
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
  switchEventTab('basic');
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

  const payload = {
    id: editingEventId || 'draft',
    title, date, time, location, description,
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const base = location_.origin + location_.pathname;
  const inviteUrl = `${base}#invite=${encoded}`;

  const parts = [`📅 ${title}`];
  if (date) parts.push(`${date}${time ? ' kl. ' + time : ''}`);
  if (location) parts.push(`📍 ${location}`);
  if (description) parts.push('', description);
  parts.push('', 'Ýttu á tengilinn til að láta okkur vita hvort þú kemur:', inviteUrl);
  const text = parts.join('\n');
  navigator.clipboard.writeText(text).then(() => showToast('Boðslink afritaður!')).catch(() => showToast('Náði ekki að afrita'));
}

// window.location has a `location` property that would shadow inside this
// scope if we shadowed it — use `location_` alias to avoid the conflict
// with the `location` variable used in copyInviteText above.
const location_ = window.location;

function base64UrlEncode(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64UrlDecode(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  return decodeURIComponent(escape(atob(s)));
}

// ---------- Public invite / RSVP view ----------
function maybeRenderInvitePage() {
  const hash = window.location.hash || '';
  const m = hash.match(/^#invite=(.+)$/);
  if (!m) return false;
  let payload;
  try { payload = JSON.parse(base64UrlDecode(m[1])); }
  catch (_) { return false; }
  showInvitePage(payload);
  return true;
}

const INVITE_RSVP_KEY_PREFIX = 'hr-app.invite-rsvp.';

function showInvitePage(payload) {
  // Hide the main app entirely
  document.querySelector('.app').style.display = 'none';
  document.getElementById('invite-page').hidden = false;
  document.title = `${payload.title} — Bjóð til`;

  const storageKey = INVITE_RSVP_KEY_PREFIX + payload.id;
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch (_) {}

  if (saved) renderInviteConfirmation(payload, saved, storageKey);
  else renderInviteForm(payload, storageKey);
}

function renderInviteForm(payload, storageKey) {
  const card = document.getElementById('invite-card');
  const dateStr = formatInviteDate(payload.date);
  card.innerHTML = `
    <div class="invite-icon">📅</div>
    <h1 class="invite-title">${escapeHtml(payload.title)}</h1>
    <div class="invite-meta">
      ${dateStr ? `<span class="invite-meta-row"><span class="invite-meta-icon">🗓</span> ${escapeHtml(dateStr)}${payload.time ? ` <strong>kl. ${escapeHtml(payload.time)}</strong>` : ''}</span>` : ''}
      ${payload.location ? `<span class="invite-meta-row"><span class="invite-meta-icon">📍</span> ${escapeHtml(payload.location)}</span>` : ''}
    </div>
    ${payload.description ? `<div class="invite-description">${escapeHtml(payload.description)}</div>` : ''}
    <div class="invite-question">Getur þú mætt?</div>
    <input class="invite-name-input" id="invite-name" placeholder="Þitt nafn (valfrjálst)" />
    <div class="invite-rsvp-buttons">
      <button type="button" class="invite-rsvp-btn yes" data-rsvp="yes">
        <span class="emoji">✅</span>
        <span>Já, mæti</span>
      </button>
      <button type="button" class="invite-rsvp-btn maybe" data-rsvp="maybe">
        <span class="emoji">🤔</span>
        <span>Kannski</span>
      </button>
      <button type="button" class="invite-rsvp-btn no" data-rsvp="no">
        <span class="emoji">❌</span>
        <span>Nei</span>
      </button>
    </div>
    <p class="invite-footer">Svarið er sent til gestgjafans sjálfkrafa.</p>
  `;
  card.querySelectorAll('[data-rsvp]').forEach(btn => {
    btn.addEventListener('click', () => {
      const rsvp = btn.dataset.rsvp;
      const name = document.getElementById('invite-name').value.trim();
      const response = { rsvp, name, at: new Date().toISOString() };
      try { localStorage.setItem(storageKey, JSON.stringify(response)); } catch (_) {}
      // TODO: When Firebase is enabled, also push to firestore /invite_responses/{eventId}/{token}
      renderInviteConfirmation(payload, response, storageKey);
    });
  });
}

function renderInviteConfirmation(payload, response, storageKey) {
  const card = document.getElementById('invite-card');
  const rsvpLabel = {
    yes: { title: 'Frábært, sjáumst!', icon: '✓', klass: '' },
    maybe: { title: 'Takk fyrir svarið!', icon: '?', klass: 'maybe' },
    no: { title: 'Takk fyrir að láta vita', icon: '✕', klass: 'no' },
  }[response.rsvp] || { title: 'Takk!', icon: '✓', klass: '' };
  card.innerHTML = `
    <div class="invite-confirmation">
      <div class="invite-confirm-icon ${rsvpLabel.klass}">${rsvpLabel.icon}</div>
      <div class="invite-confirm-title">${rsvpLabel.title}</div>
      <div class="invite-confirm-msg">
        Þú svaraðir <strong>${response.rsvp === 'yes' ? 'Já' : response.rsvp === 'no' ? 'Nei' : 'Kannski'}</strong>
        á <strong>${escapeHtml(payload.title)}</strong>.
        ${response.name ? `<br/><br/>Skráð sem: <strong>${escapeHtml(response.name)}</strong>` : ''}
      </div>
      <button class="invite-change-btn" id="invite-change">Skipta um skoðun</button>
    </div>
  `;
  document.getElementById('invite-change').addEventListener('click', () => {
    try { localStorage.removeItem(storageKey); } catch (_) {}
    renderInviteForm(payload, storageKey);
  });
}

const WEEKDAYS_IS = ['sunnudagur', 'mánudagur', 'þriðjudagur', 'miðvikudagur', 'fimmtudagur', 'föstudagur', 'laugardagur'];
const MONTHS_IS_LONG = ['janúar', 'febrúar', 'mars', 'apríl', 'maí', 'júní', 'júlí', 'ágúst', 'september', 'október', 'nóvember', 'desember'];

function formatInviteDate(dmy) {
  const d = parseFlexibleDate(dmy);
  if (!d) return dmy || '';
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  return `${cap(WEEKDAYS_IS[d.getDay()])}, ${d.getDate()}. ${MONTHS_IS_LONG[d.getMonth()]} ${d.getFullYear()}`;
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
    return ev.budget_categories.map(migrateCategoryNode);
  }
  // Legacy flat items → wrap in one "Almennt" category
  const legacy = ev.budget_items || [];
  if (!legacy.length) return [];
  return [{
    id: 'bc_legacy',
    name: 'Almennt',
    estimated: null,
    open: true,
    manager_ids: [],
    subcategories: [],
    items: legacy.map(b => ({
      id: b.id || ('bi_' + Math.random().toString(36).slice(2, 10)),
      name: b.label || b.name || '',
      amount: b.amount || 0,
    })),
  }];
}

function migrateCategoryNode(c) {
  return {
    ...c,
    items: (c.items || []).map(i => ({ ...i })),
    subcategories: (c.subcategories || []).map(migrateCategoryNode),
    manager_ids: Array.isArray(c.manager_ids) ? [...c.manager_ids] : [],
    open: c.open ?? false,
  };
}

function findCategoryDeep(id, cats = eventDraftBudgetCategories) {
  for (const c of cats) {
    if (c.id === id) return c;
    if (c.subcategories?.length) {
      const f = findCategoryDeep(id, c.subcategories);
      if (f) return f;
    }
  }
  return null;
}

function findCategoryParent(id, cats = eventDraftBudgetCategories) {
  for (const c of cats) {
    if (c.id === id) return { parent: null, list: cats };
    if (c.subcategories?.length) {
      for (const sc of c.subcategories) {
        if (sc.id === id) return { parent: c, list: c.subcategories };
      }
      const f = findCategoryParent(id, c.subcategories);
      if (f) return f;
    }
  }
  return null;
}

function categoryDepth(id, cats = eventDraftBudgetCategories, depth = 0) {
  for (const c of cats) {
    if (c.id === id) return depth;
    if (c.subcategories?.length) {
      const d = categoryDepth(id, c.subcategories, depth + 1);
      if (d !== -1) return d;
    }
  }
  return -1;
}

function categoryActualDeep(cat) {
  const own = cat.items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const subs = (cat.subcategories || []).reduce((s, c) => s + categoryActualDeep(c), 0);
  return own + subs;
}

function categoryItemCountDeep(cat) {
  return cat.items.length + (cat.subcategories || []).reduce((s, c) => s + categoryItemCountDeep(c), 0);
}

function categoryDoneCountDeep(cat) {
  const own = cat.items.filter(i => i.done).length;
  return own + (cat.subcategories || []).reduce((s, c) => s + categoryDoneCountDeep(c), 0);
}

function findCategoryOfItem(itemId, cats = eventDraftBudgetCategories) {
  for (const c of cats) {
    if (c.items.some(i => i.id === itemId)) return c;
    if (c.subcategories?.length) {
      const f = findCategoryOfItem(itemId, c.subcategories);
      if (f) return f;
    }
  }
  return null;
}

function openCategoryManagerPicker(cat, anchorEl) {
  // Simple inline picker via prompt (list employees)
  const taken = new Set(cat.manager_ids || []);
  const candidates = state.employees
    .filter(e => !taken.has(e.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'is'));
  if (!candidates.length) { alert('Engir starfsmenn eftir til að bæta við.'); return; }
  const listStr = candidates.map((e, i) => `${i + 1}. ${e.name}${e.role ? ' — ' + e.role : ''}`).join('\n');
  const pick = prompt(`Veldu umsjónarmann fyrir "${cat.name}":\n\n${listStr}\n\nSláðu inn númer:`);
  if (!pick) return;
  const idx = parseInt(pick, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= candidates.length) return;
  cat.manager_ids = cat.manager_ids || [];
  cat.manager_ids.push(candidates[idx].id);
  renderBudget();
  autoSaveEventIfEditing();
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
  return categoryActualDeep(cat);
}

function totalActual() {
  return eventDraftBudgetCategories.reduce((s, c) => s + categoryActualDeep(c), 0);
}

function fmtKr(n) { return (n || 0).toLocaleString('is-IS'); }

function guessCategoryEmoji(name) {
  const n = (name || '').toLowerCase();
  const map = [
    [/(veiting|matur|drykk|matj|drykkj)/, '🍽'],
    [/(skraut|skreyt|blö[dð]r|bloedr)/, '🎈'],
    [/(gjaf|gjöf)/, '🎁'],
    [/(hlj[óo][ðd]|d[ýj]|tón|band|dj|karaoke)/, '🎵'],
    [/(skemmt|dagskr|leik)/, '🎭'],
    [/(salur|sta[ðd]setning|leiga|le[iý]ga)/, '🏛'],
    [/(flutning|rúta|bíl|akstur|leig)/, '🚌'],
    [/(mynd|ljós|foto|photo)/, '📸'],
    [/(t[æa]kn|comput|proj)/, '💻'],
    [/(bl[oö]m|blomapunt)/, '💐'],
    [/(kaka|kokur|kaffi|brau[ðd])/, '🍰'],
    [/(bj[oó]r|víno|vin|alkohol)/, '🍷'],
  ];
  for (const [re, e] of map) if (re.test(n)) return e;
  return '📦';
}

function renderBudget() {
  const el = document.getElementById('budget-categories');
  el.innerHTML = eventDraftBudgetCategories.map(cat => renderCategoryNode(cat, 0)).join('');
  updateBudgetSummary();
  const totalItems = eventDraftBudgetCategories.reduce((s, c) => s + categoryItemCountDeep(c), 0);
  const badge = document.getElementById('budget-count-badge');
  if (badge) badge.textContent = totalItems;
}

// ---------- Party item sheet ----------
let itemSheetCategoryId = null;
let itemSheetItemId = null;
let itemSheetPickupType = 'delivered';

function initItemSheet() {
  const form = document.getElementById('item-form');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    saveItemFromSheet();
  });
  document.querySelectorAll('#item-modal [data-pickup]').forEach(btn => {
    btn.addEventListener('click', () => {
      itemSheetPickupType = btn.dataset.pickup;
      document.querySelectorAll('#item-modal [data-pickup]').forEach(b => {
        b.classList.toggle('active', b === btn);
      });
      updateItemLocationLabel();
    });
  });
  document.getElementById('item-date').addEventListener('input', (e) => {
    const raw = e.target.value;
    const formatted = formatDateStr(raw);
    if (raw !== formatted) {
      const atEnd = e.target.selectionStart >= raw.length;
      e.target.value = formatted;
      if (atEnd) e.target.setSelectionRange(formatted.length, formatted.length);
    }
  });
  document.getElementById('item-delete-btn').addEventListener('click', () => {
    if (!itemSheetCategoryId || !itemSheetItemId) return;
    const cat = findCategoryDeep(itemSheetCategoryId);
    if (!cat) return;
    const it = cat.items.find(i => i.id === itemSheetItemId);
    if (!it) return;
    if (!confirm(`Eyða "${it.name}"?`)) return;
    cat.items = cat.items.filter(i => i.id !== itemSheetItemId);
    closeModal('item-modal');
    renderBudget();
    autoSaveEventIfEditing();
  });
}

function updateItemLocationLabel() {
  const label = document.getElementById('item-location-label');
  const field = document.getElementById('item-location-field');
  const input = document.getElementById('item-location');
  if (itemSheetPickupType === 'pickup') {
    label.textContent = 'Sótt á';
    input.placeholder = 't.d. Söru, Bæjarhraun 14';
    field.hidden = false;
  } else {
    label.textContent = 'Athugasemd (valfrjálst)';
    input.placeholder = 't.d. skiltast fyrir hurð';
    field.hidden = false;
  }
}

function openItemSheet(categoryId, itemId) {
  itemSheetCategoryId = categoryId;
  itemSheetItemId = itemId;
  const cat = findCategoryDeep(categoryId);
  if (!cat) return;
  const item = itemId ? cat.items.find(i => i.id === itemId) : null;
  document.getElementById('item-modal-title').textContent = item ? 'Breyta hlut' : 'Nýr hlutur';
  document.getElementById('item-modal-subtitle').textContent = cat.name;
  document.getElementById('item-name').value = item?.name || '';
  document.getElementById('item-date').value = item?.pickup_date || '';
  document.getElementById('item-time').value = item?.pickup_time || '';
  document.getElementById('item-location').value = item?.pickup_location || '';
  document.getElementById('item-amount').value = item?.amount || '';
  itemSheetPickupType = item?.pickup_type || 'delivered';
  document.querySelectorAll('#item-modal [data-pickup]').forEach(b => {
    b.classList.toggle('active', b.dataset.pickup === itemSheetPickupType);
  });
  updateItemLocationLabel();
  document.getElementById('item-delete-btn').hidden = !item;
  document.getElementById('item-modal').hidden = false;
  setTimeout(() => document.getElementById('item-name').focus(), 60);
}

function saveItemFromSheet() {
  const cat = findCategoryDeep(itemSheetCategoryId);
  if (!cat) return;
  const name = document.getElementById('item-name').value.trim();
  if (!name) return;
  const item = itemSheetItemId
    ? cat.items.find(i => i.id === itemSheetItemId)
    : { id: 'bi_' + Math.random().toString(36).slice(2, 10) };
  item.name = name;
  item.pickup_type = itemSheetPickupType;
  item.pickup_date = document.getElementById('item-date').value.trim();
  item.pickup_time = document.getElementById('item-time').value;
  item.pickup_location = document.getElementById('item-location').value.trim();
  item.amount = Number(document.getElementById('item-amount').value) || 0;
  if (!itemSheetItemId) cat.items.push(item);
  closeModal('item-modal');
  renderBudget();
  autoSaveEventIfEditing();
}

function renderCategoryNode(cat, depth) {
  const filter = filterState.items;
  const actual = categoryActualDeep(cat);
  const over = cat.estimated && actual > cat.estimated;
  const emoji = guessCategoryEmoji(cat.name);
  const doneCount = categoryDoneCountDeep(cat);
  const totalCount = categoryItemCountDeep(cat);
  const visibleItems = cat.items.filter(i => itemMatchesFilter(i, filter));
  const hiddenCount = cat.items.length - visibleItems.length;
  const itemsHtml = visibleItems.map(renderPartyItem).join('') +
    (hiddenCount ? `<p class="field-hint" style="margin: 8px 4px; font-size: 12.5px;">${hiddenCount} hluti/hlutir falinn (breyttu í „Allt“)</p>` : '');
  const subsHtml = (cat.subcategories || []).map(sc => renderCategoryNode(sc, depth + 1)).join('');
  const managers = (cat.manager_ids || []).map(id => findEmp(id)).filter(Boolean);
  const managersHtml = managers.length
    ? `<div class="cat-managers">
        ${managers.map(m => `<span class="cat-manager-chip" title="${escapeHtml(m.name)}">
          <span class="cat-manager-avatar" style="background:${m.avatar_color}">${initials(m.name)}</span>
          <span class="cat-manager-name">${escapeHtml(m.name.split(' ')[0])}</span>
        </span>`).join('')}
      </div>`
    : '';
  const maxDepth = 3;
  const canAddSub = depth < maxDepth - 1;
  return `
    <div class="budget-category ${cat.open ? 'open' : ''} ${depth > 0 ? 'sub sub-' + depth : ''}" data-category-id="${cat.id}" data-depth="${depth}">
      <div class="budget-category-header">
        <button type="button" class="budget-category-toggle" title="Opna/loka">▸</button>
        ${depth === 0 ? `<span class="budget-category-emoji">${emoji}</span>` : ''}
        <div class="budget-category-name-wrap">
          <input class="budget-category-name" value="${escapeHtml(cat.name)}" />
          <div class="cat-meta-row">
            ${totalCount ? `<span class="budget-category-count">${doneCount} af ${totalCount} búið</span>` : ''}
            ${managersHtml}
            <button type="button" class="cat-manager-add-btn" data-action="add-manager" title="Bæta við umsjónarmanni">+ Umsjónarmaður</button>
          </div>
        </div>
        <div class="budget-category-numbers">
          <input class="budget-category-estimated" type="number" value="${cat.estimated ?? ''}" placeholder="áætlun" min="0" step="1000" />
          <span class="budget-category-actual ${over ? 'over' : ''}">${fmtKr(actual)} kr.</span>
        </div>
        <button type="button" class="budget-category-delete" data-action="delete-category" title="Eyða flokki">✕</button>
      </div>
      <div class="budget-category-body">
        ${subsHtml ? `<div class="subcategories-wrap">${subsHtml}</div>` : ''}
        <div class="party-items-list">${itemsHtml}</div>
        <div class="cat-actions">
          <button type="button" class="party-add-item" data-action="open-item-sheet">+ Bæta við hlut</button>
          ${canAddSub ? `<button type="button" class="party-add-subcat" data-action="add-subcategory">+ Ný undirflokkur</button>` : ''}
        </div>
      </div>
    </div>
  `;
}

function renderPartyItem(item) {
  const pickup = item.pickup_type || 'delivered';
  const done = !!item.done;
  const pickupLabel = done ? 'Sótt' : (pickup === 'pickup' ? 'Ná í' : 'Til mín');
  const pickupIcon = done ? '✓' : (pickup === 'pickup' ? '🛒' : '🚚');
  const pillClass = done ? 'done' : pickup;
  const parts = [];
  if (item.pickup_date) {
    const d = parseFlexibleDate(item.pickup_date);
    const dateStr = d
      ? `${d.getDate()}. ${MONTHS_IS[d.getMonth()]}`
      : item.pickup_date;
    parts.push(dateStr + (item.pickup_time ? ` kl. ${item.pickup_time}` : ''));
  }
  if (item.pickup_location) parts.push(item.pickup_location);
  const metaHtml = parts.map(p => `<span>${escapeHtml(p)}</span>`).join('<span class="party-item-meta-sep">•</span>');
  const overdue = !done && (() => {
    if (!item.pickup_date) return false;
    const d = parseFlexibleDate(item.pickup_date);
    if (!d) return false;
    if (item.pickup_time) {
      const [h, m] = item.pickup_time.split(':');
      d.setHours(+h || 0, +m || 0);
    } else {
      d.setHours(23, 59);
    }
    return d.getTime() < Date.now();
  })();
  return `
    <div class="party-item-card ${done ? 'done' : ''}" data-item-id="${item.id}">
      <button type="button" class="party-item-check" data-action="toggle-done" title="Merkja sem sótt"></button>
      <div class="party-item-body">
        <div class="party-item-head">
          <div class="party-item-name">${escapeHtml(item.name)}</div>
          <div class="party-item-cost">${item.amount ? fmtKr(item.amount) + ' kr.' : '—'}</div>
        </div>
        <div class="party-item-meta">
          <span class="party-item-pill ${pillClass} ${overdue ? 'overdue' : ''}">${pickupIcon} ${pickupLabel}</span>
          ${metaHtml ? `<span class="party-item-meta-sep">•</span>${metaHtml}` : ''}
        </div>
      </div>
    </div>
  `;
}

function itemMatchesFilter(item, filter) {
  if (filter === 'all') return true;
  if (filter === 'done') return !!item.done;
  return !item.done;
}
function taskMatchesFilter(task, filter) {
  if (filter === 'all') return true;
  if (filter === 'done') return !!task.done;
  return !task.done;
}
function timelineMatchesFilter(t, filter) {
  if (filter === 'all') return true;
  if (filter === 'done') return !!t.done;
  return !t.done;
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
  const date = document.getElementById('timeline-add-date').value.trim();
  const time = document.getElementById('timeline-add-time').value;
  const title = document.getElementById('timeline-add-title').value.trim();
  if (!title) return;
  eventDraftTimeline.push({
    id: 'tl_' + Math.random().toString(36).slice(2, 10),
    date,
    time,
    title,
    done: false,
  });
  document.getElementById('timeline-add-date').value = '';
  document.getElementById('timeline-add-time').value = '';
  document.getElementById('timeline-add-title').value = '';
  renderTimeline();
  autoSaveEventIfEditing();
  document.getElementById('timeline-add-title').focus();
}

function timelineSortKey(t) {
  const d = parseFlexibleDate(t.date);
  const iso = d ? d.toISOString().slice(0, 10) : '9999-99-99';
  return iso + 'T' + (t.time || '99:99');
}

function renderTimeline() {
  const list = document.getElementById('timeline-list');
  if (!list) return;
  const filter = filterState.timeline;
  const sorted = eventDraftTimeline.slice().sort((a, b) => timelineSortKey(a).localeCompare(timelineSortKey(b)));
  const visible = sorted.filter(t => timelineMatchesFilter(t, filter));
  const hidden = sorted.length - visible.length;

  // Group by date
  const groups = new Map();
  visible.forEach(t => {
    const key = t.date || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  });

  const parts = [];
  for (const [dateKey, items] of groups) {
    const label = dateKey ? formatTimelineDateLabel(dateKey) : 'Ekki tímasett';
    parts.push(`<div class="timeline-date-header">${escapeHtml(label)}</div>`);
    parts.push(...items.map(t => `
      <li class="timeline-item ${t.done ? 'done' : ''}" data-timeline-id="${t.id}">
        <button type="button" class="timeline-done-toggle" data-action="toggle" title="Merkja"></button>
        <input type="text" class="timeline-date-input" value="${escapeHtml(t.date || '')}" placeholder="dd.mm.áá" data-action="date" />
        <input type="time" class="timeline-time" value="${escapeHtml(t.time || '')}" />
        <input class="timeline-title" value="${escapeHtml(t.title)}" />
        <button type="button" class="timeline-remove" data-action="remove" title="Eyða">✕</button>
      </li>
    `));
  }
  if (hidden) parts.push(`<li class="field-hint" style="padding: 8px 4px; list-style:none;">${hidden} falin (breyttu í „Allt" til að sjá)</li>`);
  list.innerHTML = parts.join('');
  const badge = document.getElementById('schedule-count-badge');
  if (badge) badge.textContent = eventDraftTimeline.length;
}

function formatTimelineDateLabel(dmy) {
  const d = parseFlexibleDate(dmy);
  if (!d) return dmy;
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const label = `${WEEKDAYS_IS[d.getDay()]}, ${d.getDate()}. ${MONTHS_IS_LONG[d.getMonth()]}`;
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  return cap(label) + (isToday ? ' · í dag' : '');
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
  const tasksBadge = document.getElementById('tasks-count-badge');
  if (tasksBadge) tasksBadge.textContent = total;
  if (!total) { list.innerHTML = ''; return; }

  const assigneeOptions = state.employees
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'is'))
    .map(e => `<option value="${e.id}">${escapeHtml(e.name)}</option>`)
    .join('');

  const todayIso = new Date().toISOString().slice(0, 10);
  const filter = filterState.tasks;
  const visibleTasks = eventDraftTasks.filter(t => taskMatchesFilter(t, filter));
  const hidden = eventDraftTasks.length - visibleTasks.length;

  list.innerHTML = visibleTasks.map(t => {
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
  }).join('') + (hidden ? `<li class="field-hint" style="padding: 8px 4px; list-style:none;">${hidden} falin (breyttu í „Allt" til að sjá)</li>` : '');
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

  const meta = [];
  if (ev.time) meta.push(`<span>🕐 ${escapeHtml(ev.time)}</span>`);
  if (ev.location) meta.push(`<span>📍 ${escapeHtml(ev.location)}</span>`);

  // RSVP / attendance summary
  const partIds = ev.participant_ids || [];
  const rsvps = ev.rsvps || {};
  const external = ev.external_guests || [];
  const total = partIds.length + external.length;
  let yes = 0, no = 0, maybe = 0;
  partIds.forEach(id => {
    const r = rsvps[id];
    if (r === 'yes') yes++; else if (r === 'no') no++; else if (r === 'maybe') maybe++;
  });
  external.forEach(g => {
    if (g.rsvp === 'yes') yes++; else if (g.rsvp === 'no') no++; else if (g.rsvp === 'maybe') maybe++;
  });
  let attendanceHtml = '';
  if (total === 0) {
    attendanceHtml = `<div class="event-attendance"><span class="event-attendance-empty">Öllum boðið</span></div>`;
  } else {
    const yesPct = total ? (yes / total) * 100 : 0;
    const maybePlusYesPct = total ? ((yes + maybe) / total) * 100 : 0;
    const maybeSuffix = maybe ? ` <span class="event-attendance-maybe">+ ${maybe} kannski</span>` : '';
    attendanceHtml = `
      <div class="event-attendance">
        <div class="event-attendance-head">
          <span class="event-attendance-label">${yes} af ${total} staðfest${maybeSuffix}</span>
          <span class="event-attendance-pct">${Math.round(yesPct)}%</span>
        </div>
        <div class="event-attendance-bar">
          <div class="event-attendance-fill maybe" style="width:${maybePlusYesPct}%"></div>
          <div class="event-attendance-fill yes" style="width:${yesPct}%"></div>
        </div>
      </div>
    `;
  }

  // Tasks progress (kept)
  const tasks = ev.tasks || [];
  const doneCount = tasks.filter(t => t.done).length;
  const totalTasks = tasks.length;
  const complete = totalTasks > 0 && doneCount === totalTasks;
  const pct = totalTasks ? (doneCount / totalTasks) * 100 : 0;
  const tasksHtml = totalTasks ? `
    <div class="event-progress">
      <div class="event-progress-bar">
        <div class="event-progress-fill ${complete ? '' : 'pending'}" style="width:${pct}%"></div>
      </div>
      <span class="event-progress-count">${doneCount}/${totalTasks} verkefni</span>
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
        ${attendanceHtml}
        ${tasksHtml}
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

document.addEventListener('DOMContentLoaded', () => {
  if (maybeRenderInvitePage()) return;
  init();
});
window.addEventListener('hashchange', () => {
  if (window.location.hash.startsWith('#invite=')) {
    location.reload();
  }
});
