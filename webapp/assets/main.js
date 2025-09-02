const STORAGE_KEY = 'charter_app_state_v1';
const SELECTED_PROJECT_KEY = 'selected_project_id_v1';

function generateId(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { projects: [], charters: [] };
    const parsed = JSON.parse(raw);
    return {
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      charters: Array.isArray(parsed.charters) ? parsed.charters : []
    };
  } catch (_e) {
    return { projects: [], charters: [] };
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getSelectedProjectId(state) {
  const stored = localStorage.getItem(SELECTED_PROJECT_KEY) || '';
  if (stored && state.projects.some(p => p.id === stored)) return stored;
  return state.projects[0]?.id || '';
}

function setSelectedProjectId(projectId) {
  localStorage.setItem(SELECTED_PROJECT_KEY, projectId || '');
}

function upsertProject(project) {
  const state = loadState();
  const index = state.projects.findIndex(p => p.id === project.id);
  if (index >= 0) state.projects[index] = project; else state.projects.push(project);
  saveState(state);
}

function deleteProject(projectId) {
  const state = loadState();
  state.projects = state.projects.filter(p => p.id !== projectId);
  state.charters = state.charters.filter(c => c.projectId !== projectId);
  saveState(state);
  const selected = getSelectedProjectId(state);
  if (selected !== projectId) return;
  const nextSelected = state.projects[0]?.id || '';
  setSelectedProjectId(nextSelected);
}

function upsertCharter(charter) {
  const state = loadState();
  const index = state.charters.findIndex(c => c.id === charter.id);
  if (index >= 0) state.charters[index] = charter; else state.charters.push(charter);
  saveState(state);
}

function deleteCharter(charterId) {
  const state = loadState();
  state.charters = state.charters.filter(c => c.id !== charterId);
  saveState(state);
}

function navigate(hash) {
  window.location.hash = hash;
}

function parseRoute() {
  const raw = window.location.hash.slice(1) || '/dashboard';
  const parts = raw.split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'dashboard', params: {} };
  if (parts[0] === 'dashboard') return { name: 'dashboard', params: {} };
  if (parts[0] === 'projects') return { name: 'projects', params: {} };
  if (parts[0] === 'charter' && parts[1] === 'new') return { name: 'charter-new', params: {} };
  if (parts[0] === 'charter' && parts[2] === 'edit') return { name: 'charter-edit', params: { id: parts[1] } };
  return { name: 'dashboard', params: {} };
}

function clear(element) {
  while (element.firstChild) element.removeChild(element.firstChild);
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== undefined && value !== null) node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
}

function renderDashboard(root) {
  const state = loadState();
  clear(root);

  if (state.projects.length === 0) {
    const empty = el('div', { class: 'empty' }, [
      el('p', { text: 'No projects yet.' }),
      el('a', { href: '#/projects', class: 'btn btn-primary' }, ['Add your first project'])
    ]);
    root.append(empty);
    return;
  }

  const selectedProjectId = getSelectedProjectId(state);

  const controls = el('div', { class: 'toolbar' }, [
    el('label', { for: 'projectSelect', class: 'label' }, ['Project']),
    (() => {
      const select = el('select', { id: 'projectSelect' });
      for (const project of state.projects) {
        const opt = el('option', { value: project.id, text: project.name });
        if (project.id === selectedProjectId) opt.selected = true;
        select.append(opt);
      }
      select.addEventListener('change', (e) => {
        const nextId = e.target.value;
        setSelectedProjectId(nextId);
        renderApp();
      });
      return select;
    })(),
    el('div', { class: 'spacer' }),
    el('button', { class: 'btn btn-primary', onClick: () => navigate('#/charter/new') }, ['Add Charter'])
  ]);

  root.append(controls);

  const table = el('table', { class: 'table' });
  const thead = el('thead', {}, [
    el('tr', {}, [
      el('th', { text: 'Area(s)' }),
      el('th', { text: 'Charter' }),
      el('th', { text: 'Tags' }),
      el('th', { text: 'Sessions' }),
      el('th', { text: '' })
    ])
  ]);
  const tbody = el('tbody');
  const rows = loadState().charters.filter(c => c.projectId === selectedProjectId);
  for (const c of rows) {
    const tr = el('tr', {}, [
      el('td', { text: (c.areas || []).join(', ') }),
      el('td', {}, [el('strong', { text: c.name }), c.description ? el('div', { class: 'muted', text: c.description }) : '']),
      el('td', { text: (c.tags || []).join(', ') }),
      el('td', { text: String(c.sessionsCount ?? 0) }),
      el('td', { class: 'actions' }, [
        el('button', { class: 'btn btn-secondary', onClick: () => navigate(`#/charter/${c.id}/edit`) }, ['Edit']),
        el('button', { class: 'btn btn-danger', onClick: () => { if (confirm('Delete this charter?')) { deleteCharter(c.id); renderApp(); } } }, ['Delete'])
      ])
    ]);
    tbody.append(tr);
  }
  table.append(thead, tbody);
  root.append(table);
}

function renderProjectsPage(root) {
  clear(root);
  const header = el('div', { class: 'toolbar' }, [
    el('div', { class: 'title', text: 'Projects' }),
    el('div', { class: 'spacer' }),
    el('button', { class: 'btn btn-primary', onClick: () => {
      const name = prompt('Project name');
      if (!name) return;
      const project = { id: generateId('prj'), name: name.trim() };
      upsertProject(project);
      if (!getSelectedProjectId(loadState())) setSelectedProjectId(project.id);
      renderApp();
    } }, ['Add Project'])
  ]);

  const table = el('table', { class: 'table' });
  table.append(
    el('thead', {}, [el('tr', {}, [el('th', { text: 'Name' }), el('th', { text: '' })])]),
    el('tbody')
  );
  const tbody = table.querySelector('tbody');
  const state = loadState();
  for (const p of state.projects) {
    const tr = el('tr', {}, [
      el('td', { text: p.name }),
      el('td', { class: 'actions' }, [
        el('button', { class: 'btn btn-secondary', onClick: () => {
          const next = prompt('Rename project', p.name);
          if (!next) return;
          upsertProject({ ...p, name: next.trim() });
          renderApp();
        } }, ['Edit']),
        el('button', { class: 'btn btn-danger', onClick: () => {
          if (!confirm('Delete this project? All its charters will be removed.')) return;
          deleteProject(p.id);
          renderApp();
        } }, ['Delete'])
      ])
    ]);
    tbody.append(tr);
  }

  root.append(header, table);
}

function renderCharterEditor(root, params) {
  clear(root);
  const state = loadState();

  if (state.projects.length === 0) {
    const warn = el('div', { class: 'empty' }, [
      el('p', { text: 'You need at least one project before adding charters.' }),
      el('a', { href: '#/projects', class: 'btn btn-primary' }, ['Manage Projects'])
    ]);
    root.append(warn);
    return;
  }

  const isEdit = Boolean(params && params.id);
  const editing = isEdit ? state.charters.find(c => c.id === params.id) : null;

  const form = el('form', { class: 'form' });

  const projectSelect = (() => {
    const select = el('select', { id: 'charterProject' });
    const selectedProjectId = isEdit ? editing.projectId : getSelectedProjectId(state) || state.projects[0].id;
    for (const p of state.projects) {
      const opt = el('option', { value: p.id, text: p.name });
      if (p.id === selectedProjectId) opt.selected = true;
      select.append(opt);
    }
    return select;
  })();

  const nameInput = el('input', { id: 'charterName', type: 'text', value: editing?.name || '', placeholder: 'Charter name', required: 'true' });
  const descInput = el('textarea', { id: 'charterDesc', rows: '4', placeholder: 'Description' }, [editing?.description || '']);
  const areasInput = el('input', { id: 'charterAreas', type: 'text', value: (editing?.areas || []).join(', '), placeholder: 'Areas (comma-separated)' });
  const tagsInput = el('input', { id: 'charterTags', type: 'text', value: (editing?.tags || []).join(', '), placeholder: 'Tags (comma-separated)' });

  form.append(
    el('div', { class: 'form-row' }, [el('label', { for: 'charterProject', class: 'label', text: 'Project' }), projectSelect]),
    el('div', { class: 'form-row' }, [el('label', { for: 'charterName', class: 'label', text: 'Name' }), nameInput]),
    el('div', { class: 'form-row' }, [el('label', { for: 'charterDesc', class: 'label', text: 'Description' }), descInput]),
    el('div', { class: 'form-row' }, [el('label', { for: 'charterAreas', class: 'label', text: 'Project Areas' }), areasInput]),
    el('div', { class: 'form-row' }, [el('label', { for: 'charterTags', class: 'label', text: 'Tags' }), tagsInput])
  );

  const actions = el('div', { class: 'form-actions' }, [
    el('button', { type: 'submit', class: 'btn btn-primary' }, ['Save']),
    el('button', { type: 'button', class: 'btn', onClick: () => navigate('#/dashboard') }, ['Cancel'])
  ]);
  form.append(actions);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) { alert('Name is required'); return; }
    const description = descInput.value.trim();
    const projectId = projectSelect.value;
    const areas = areasInput.value.split(',').map(s => s.trim()).filter(Boolean);
    const tags = tagsInput.value.split(',').map(s => s.trim()).filter(Boolean);

    if (isEdit) {
      const updated = { ...editing, projectId, name, description, areas, tags };
      upsertCharter(updated);
    } else {
      const newCharter = {
        id: generateId('cht'),
        projectId,
        name,
        description,
        areas,
        tags,
        sessionsCount: 0
      };
      upsertCharter(newCharter);
    }
    navigate('#/dashboard');
  });

  root.append(el('div', { class: 'title', text: isEdit ? 'Edit Charter' : 'New Charter' }), form);
}

function renderApp() {
  const container = document.getElementById('app');
  const route = parseRoute();
  if (!container) return;
  if (route.name === 'dashboard') return renderDashboard(container);
  if (route.name === 'projects') return renderProjectsPage(container);
  if (route.name === 'charter-new') return renderCharterEditor(container, {});
  if (route.name === 'charter-edit') return renderCharterEditor(container, { id: route.params.id });
  return renderDashboard(container);
}

window.addEventListener('hashchange', renderApp);

function mount() {
  if (!window.location.hash) navigate('#/dashboard');
  renderApp();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
