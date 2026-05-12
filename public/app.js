// ---------- STATE ----------
const State = {
  token: localStorage.getItem('token'),
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  view: 'dashboard',
  currentProject: null,
};

// ---------- API ----------
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (State.token) headers.Authorization = `Bearer ${State.token}`;
  const res = await fetch(path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ---------- HELPERS ----------
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '—');

// ---------- THEME (Modern Emerald & Zinc) ----------
const INPUT_CLS =
  'w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all';
const BTN_PRIMARY =
  'px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-500 shadow-lg shadow-emerald-900/20 transition-all active:scale-95';
const BTN_CANCEL =
  'px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-all';
const CARD_CLS = 'bg-zinc-900/80 border border-zinc-800/50 backdrop-blur-md rounded-xl shadow-xl';
const DIVIDE_CLS = 'divide-y divide-zinc-800';
const MUTED = 'text-zinc-400';
const LINK_CLS = 'text-emerald-400 hover:text-emerald-300 hover:underline transition-colors';
const DANGER_LINK = 'text-rose-400 hover:text-rose-300 hover:underline transition-colors';

const statusLabel = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' };
const statusColor = {
  todo: 'bg-zinc-700 text-zinc-200 border border-zinc-600',
  in_progress: 'bg-sky-500/20 text-sky-300 border border-sky-500/40',
  done: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
};
const roleBadge = (role) =>
  role === 'admin'
    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
    : 'bg-zinc-700 text-zinc-300 border border-zinc-600';

function setAuth(token, user) {
  State.token = token;
  State.user = user;
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  State.token = null;
  State.user = null;
  render();
}

// ---------- AUTH UI ----------
function showAuthError(msg) {
  $('#auth-error').textContent = msg || '';
}

function bindAuthScreen() {
  const tabLogin = $('#tab-login');
  const tabSignup = $('#tab-signup');
  const loginForm = $('#login-form');
  const signupForm = $('#signup-form');

  function showTab(which) {
    showAuthError('');
    if (which === 'login') {
      tabLogin.classList.add('border-emerald-500', 'text-emerald-400');
      tabLogin.classList.remove('border-transparent', 'text-zinc-500');
      tabSignup.classList.remove('border-emerald-500', 'text-emerald-400');
      tabSignup.classList.add('border-transparent', 'text-zinc-500');
      loginForm.classList.remove('hidden');
      signupForm.classList.add('hidden');
    } else {
      tabSignup.classList.add('border-emerald-500', 'text-emerald-400');
      tabSignup.classList.remove('border-transparent', 'text-zinc-500');
      tabLogin.classList.remove('border-emerald-500', 'text-emerald-400');
      tabLogin.classList.add('border-transparent', 'text-zinc-500');
      signupForm.classList.remove('hidden');
      loginForm.classList.add('hidden');
    }
  }
  tabLogin.onclick = () => showTab('login');
  tabSignup.onclick = () => showTab('signup');

  loginForm.onsubmit = async (e) => {
    e.preventDefault();
    showAuthError('');
    const fd = new FormData(loginForm);
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: fd.get('email'), password: fd.get('password') }),
      });
      setAuth(data.token, data.user);
      render();
    } catch (err) {
      showAuthError(err.message);
    }
  };

  signupForm.onsubmit = async (e) => {
    e.preventDefault();
    showAuthError('');
    const fd = new FormData(signupForm);
    try {
      const data = await api('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          name: fd.get('name'),
          email: fd.get('email'),
          password: fd.get('password'),
        }),
      });
      setAuth(data.token, data.user);
      render();
    } catch (err) {
      showAuthError(err.message);
    }
  };
}

// ---------- VIEWS ----------
function taskListItem(t, today_) {
  const overdue = t.status !== 'done' && t.due_date && t.due_date < today_;
  return `
    <div class="py-3 flex flex-wrap items-center justify-between gap-2">
      <div class="min-w-0">
        <div class="font-medium text-zinc-100">${escapeHtml(t.title)}</div>
        <div class="text-xs ${MUTED}">
          ${escapeHtml(t.project_name)} · Assignee: ${t.assignee_name ? escapeHtml(t.assignee_name) : 'Unassigned'} · Due: ${fmtDate(t.due_date)}
          ${overdue ? '<span class="ml-1 text-rose-400 font-bold">OVERDUE</span>' : ''}
        </div>
      </div>
      <span class="px-2 py-0.5 rounded-md text-xs font-semibold ${statusColor[t.status]}">${statusLabel[t.status]}</span>
    </div>`;
}

async function viewDashboard() {
  const main = $('#main-content');
  main.innerHTML = `<p class="${MUTED} animate-pulse">Loading overview…</p>`;
  try {
    const { counts, projectsCount, myTasks, allTasks } = await api('/api/dashboard');
    const today_ = today();
    main.innerHTML = `
      <h2 class="text-3xl font-bold mb-1 text-white">Dashboard</h2>
      <p class="text-sm ${MUTED} mb-6">Welcome back, ${escapeHtml(State.user.name)}.</p>

      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        ${statCard('Projects', projectsCount, 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20')}
        ${statCard('Tasks', counts.total, 'bg-zinc-800/40 text-zinc-200 border border-zinc-700/50')}
        ${statCard('To Do', counts.todo, 'bg-zinc-800/40 text-zinc-400 border border-zinc-700/50')}
        ${statCard('Active', counts.in_progress, 'bg-sky-500/10 text-sky-300 border border-sky-500/20')}
        ${statCard('Done', counts.done, 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20')}
        ${statCard('Overdue', counts.overdue, 'bg-rose-500/10 text-rose-300 border border-rose-500/20')}
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="${CARD_CLS} p-5">
          <div class="flex items-center justify-between mb-4 border-b border-zinc-800 pb-3">
            <h3 class="font-bold text-zinc-100 flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-emerald-500"></span> My Tasks
            </h3>
            <span class="text-xs font-medium px-2 py-1 bg-zinc-800 rounded-full text-zinc-400">${counts.my_total} total</span>
          </div>
          ${myTasks.length === 0
            ? `<p class="${MUTED} text-sm py-4">No tasks assigned to you yet.</p>`
            : `<div class="${DIVIDE_CLS}">${myTasks.map((t) => taskListItem(t, today_)).join('')}</div>`}
        </div>

        <div class="${CARD_CLS} p-5">
          <div class="flex items-center justify-between mb-4 border-b border-zinc-800 pb-3">
            <h3 class="font-bold text-zinc-100 flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-sky-500"></span> Recent Activity
            </h3>
          </div>
          ${allTasks.length === 0
            ? `<p class="${MUTED} text-sm py-4">No tasks found in your projects.</p>`
            : `<div class="${DIVIDE_CLS}">${allTasks.slice(0, 10).map((t) => taskListItem(t, today_)).join('')}</div>`}
        </div>
      </div>
    `;
  } catch (err) {
    main.innerHTML = `<p class="text-rose-400 p-4 bg-rose-500/10 border border-rose-500/20 rounded-lg">${escapeHtml(err.message)}</p>`;
  }
}

function statCard(label, value, color) {
  return `<div class="rounded-xl p-4 ${color} transition-transform hover:-translate-y-1">
    <div class="text-xs uppercase tracking-wider font-bold opacity-70">${label}</div>
    <div class="text-3xl font-black mt-1">${value}</div>
  </div>`;
}

async function viewProjects() {
  const main = $('#main-content');
  main.innerHTML = `<p class="${MUTED} animate-pulse">Loading projects…</p>`;
  try {
    const { projects } = await api('/api/projects');
    main.innerHTML = `
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-3xl font-bold text-white">Projects</h2>
        <button id="new-project-btn" class="${BTN_PRIMARY}">+ New Project</button>
      </div>
      ${projects.length === 0
        ? `<div class="${CARD_CLS} p-12 text-center ${MUTED}">Get started by creating your first project.</div>`
        : `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">${projects
            .map(
              (p) => `
          <div class="${CARD_CLS} p-6 hover:border-emerald-500 hover:ring-1 hover:ring-emerald-500/30 cursor-pointer transition-all group project-card" data-id="${p.id}">
            <div class="flex justify-between items-start mb-3 gap-2">
              <h3 class="font-bold text-xl text-white group-hover:text-emerald-400 transition-colors">${escapeHtml(p.name)}</h3>
              <span class="text-[10px] uppercase tracking-widest px-2 py-1 rounded font-bold ${roleBadge(p.role)}">${p.role}</span>
            </div>
            <p class="text-sm ${MUTED} line-clamp-2 mb-4 leading-relaxed">${escapeHtml(p.description || 'No description provided.')}</p>
            <div class="text-xs font-semibold text-emerald-500/80 group-hover:text-emerald-400">View Details →</div>
          </div>`
            )
            .join('')}</div>`}
    `;
    $('#new-project-btn').onclick = openNewProjectModal;
    $$('.project-card').forEach((el) => {
      el.onclick = () => openProject(Number(el.dataset.id));
    });
  } catch (err) {
    main.innerHTML = `<p class="text-rose-400 p-4 bg-rose-500/10 border border-rose-500/20 rounded-lg">${escapeHtml(err.message)}</p>`;
  }
}

async function openProject(projectId) {
  State.currentProject = projectId;
  State.view = 'project';
  const main = $('#main-content');
  main.innerHTML = `<p class="${MUTED} animate-pulse">Opening project details…</p>`;
  try {
    const [{ project, members }, { tasks }] = await Promise.all([
      api(`/api/projects/${projectId}`),
      api(`/api/projects/${projectId}/tasks`),
    ]);
    const isAdmin = project.role === 'admin';
    const today_ = today();

    main.innerHTML = `
      <div class="mb-6">
        <button id="back-btn" class="text-sm font-semibold flex items-center gap-1 ${LINK_CLS}">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg>
          Back to Projects
        </button>
      </div>
      
      <div class="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8 bg-zinc-900/40 p-6 rounded-2xl border border-zinc-800">
        <div class="flex-1">
          <div class="flex items-center gap-3 mb-1">
            <h2 class="text-3xl font-black text-white">${escapeHtml(project.name)}</h2>
            <span class="text-[10px] uppercase tracking-widest px-2 py-1 rounded bg-zinc-800 text-emerald-400 border border-zinc-700">${project.role}</span>
          </div>
          <p class="${MUTED} text-md max-w-2xl">${escapeHtml(project.description || 'No description provided.')}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          ${isAdmin ? `<button id="add-member-btn" class="bg-zinc-800 border border-zinc-700 text-zinc-100 px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-700 transition-all">+ Add Member</button>` : ''}
          ${isAdmin ? `<button id="new-task-btn" class="${BTN_PRIMARY}">+ New Task</button>` : ''}
          ${isAdmin ? `<button id="delete-project-btn" class="bg-rose-500/10 text-rose-400 border border-rose-500/30 px-4 py-2 rounded-lg text-sm font-bold hover:bg-rose-500 hover:text-white transition-all">Delete</button>` : ''}
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 space-y-4">
          <div class="flex items-center justify-between mb-2">
             <h3 class="font-bold text-zinc-100 uppercase tracking-widest text-xs">Project Tasks (${tasks.length})</h3>
          </div>
          ${tasks.length === 0
            ? `<div class="${CARD_CLS} p-10 text-center ${MUTED} italic">No tasks created yet.</div>`
            : `<div class="space-y-3">${tasks.map((t) => taskRow(t, project, today_)).join('')}</div>`}
        </div>
        
        <div class="space-y-4">
          <h3 class="font-bold text-zinc-100 uppercase tracking-widest text-xs">Team Members (${members.length})</h3>
          <div class="${CARD_CLS} p-4">
            <div class="${DIVIDE_CLS}">
              ${members
                .map(
                  (m) => `
                <div class="py-3 flex items-center justify-between gap-2">
                  <div class="min-w-0">
                    <div class="font-bold truncate text-zinc-100 text-sm">${escapeHtml(m.name)} ${m.id === project.owner_id ? `<span class="text-[10px] text-emerald-500 ml-1 font-black underline">OWNER</span>` : ''}</div>
                    <div class="text-xs ${MUTED} truncate">${escapeHtml(m.email)}</div>
                  </div>
                  <div class="flex items-center gap-1">
                    <span class="text-[10px] px-2 py-0.5 rounded font-bold ${roleBadge(m.role)}">${m.role}</span>
                    ${isAdmin && m.id !== project.owner_id
                      ? `<button data-uid="${m.id}" data-role="${m.role}" class="role-toggle p-1 rounded hover:bg-zinc-800 ${LINK_CLS}" title="Change Role">↻</button>
                         <button data-uid="${m.id}" class="remove-member p-1 rounded hover:bg-rose-500/20 ${DANGER_LINK}" title="Remove Member">×</button>`
                      : ''}
                  </div>
                </div>`
                )
                .join('')}
            </div>
          </div>
        </div>
      </div>
    `;

    $('#back-btn').onclick = () => {
      State.view = 'projects';
      State.currentProject = null;
      render();
    };
    
    // Admin Actions Setup
    if (isAdmin) {
      $('#new-task-btn').onclick = () => openTaskModal(project, members);
      $('#add-member-btn').onclick = () => openAddMemberModal(project);
      $('#delete-project-btn').onclick = async () => {
        if (!confirm(`Permanently delete project "${project.name}"?`)) return;
        try {
          await api(`/api/projects/${project.id}`, { method: 'DELETE' });
          State.view = 'projects';
          State.currentProject = null;
          render();
        } catch (err) {
          alert(err.message);
        }
      };
      
      $$('.role-toggle').forEach((b) => {
        b.onclick = async () => {
          const newRole = b.dataset.role === 'admin' ? 'member' : 'admin';
          try {
            await api(`/api/projects/${project.id}/members/${b.dataset.uid}`, {
              method: 'PUT',
              body: JSON.stringify({ role: newRole }),
            });
            openProject(project.id);
          } catch (err) {
            alert(err.message);
          }
        };
      });

      $$('.remove-member').forEach((b) => {
        b.onclick = async () => {
          if (!confirm('Kick member from project?')) return;
          try {
            await api(`/api/projects/${project.id}/members/${b.dataset.uid}`, { method: 'DELETE' });
            openProject(project.id);
          } catch (err) {
            alert(err.message);
          }
        };
      });
    }

    $$('.task-status-select').forEach((sel) => {
      sel.onchange = async () => {
        try {
          await api(`/api/tasks/${sel.dataset.id}`, {
            method: 'PUT',
            body: JSON.stringify({ status: sel.value }),
          });
          openProject(project.id);
        } catch (err) {
          alert(err.message);
        }
      };
    });

    $$('.task-edit').forEach((b) => {
      b.onclick = () => {
        const t = tasks.find((x) => x.id === Number(b.dataset.id));
        openTaskModal(project, members, t);
      };
    });

    $$('.task-delete').forEach((b) => {
      b.onclick = async () => {
        if (!confirm('Delete this task?')) return;
        try {
          await api(`/api/tasks/${b.dataset.id}`, { method: 'DELETE' });
          openProject(project.id);
        } catch (err) {
          alert(err.message);
        }
      };
    });
  } catch (err) {
    main.innerHTML = `<p class="text-rose-400 p-4 bg-rose-500/10 border border-rose-500/20 rounded-lg">${escapeHtml(err.message)}</p>`;
  }
}

function taskRow(t, project, today_) {
  const isAdmin = project.role === 'admin';
  const canChangeStatus = isAdmin || t.assignee_id === State.user.id;
  const overdue = t.status !== 'done' && t.due_date && t.due_date < today_;
  const statusOptions = ['todo', 'in_progress', 'done']
    .map((s) => `<option value="${s}" ${t.status === s ? 'selected' : ''}>${statusLabel[s]}</option>`)
    .join('');
    
  return `
    <div class="border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 hover:border-emerald-500/50 hover:shadow-lg transition-all group">
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 mb-1">
           <span class="font-bold text-zinc-100 group-hover:text-white transition-colors">${escapeHtml(t.title)}</span>
           ${overdue ? '<span class="text-[9px] bg-rose-500/20 text-rose-400 border border-rose-500/30 px-1.5 py-0.5 rounded-full font-black">OVERDUE</span>' : ''}
        </div>
        ${t.description ? `<div class="text-sm text-zinc-400 line-clamp-1 mb-2">${escapeHtml(t.description)}</div>` : ''}
        <div class="flex items-center gap-3 text-[10px] font-bold ${MUTED} uppercase tracking-tighter">
          <span class="flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" /></svg> ${t.assignee_name ? escapeHtml(t.assignee_name) : 'UNASSIGNED'}</span>
          <span class="flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd" /></svg> ${fmtDate(t.due_date)}</span>
        </div>
      </div>
      <div class="flex items-center gap-3">
        ${canChangeStatus
          ? `<select data-id="${t.id}" class="task-status-select bg-zinc-800 border border-zinc-700 text-zinc-100 rounded-lg px-3 py-1.5 text-xs font-bold focus:outline-none focus:border-emerald-500 cursor-pointer">${statusOptions}</select>`
          : `<span class="text-[10px] px-3 py-1.5 rounded-lg font-black uppercase ${statusColor[t.status]}">${statusLabel[t.status]}</span>`}
        
        ${isAdmin
          ? `<div class="flex items-center gap-1 border-l border-zinc-800 pl-3">
               <button data-id="${t.id}" class="task-edit p-1.5 rounded hover:bg-emerald-500/10 ${LINK_CLS}" title="Edit Task"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
               <button data-id="${t.id}" class="task-delete p-1.5 rounded hover:bg-rose-500/10 ${DANGER_LINK}" title="Delete Task"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
             </div>`
          : ''}
      </div>
    </div>
  `;
}

// ---------- MODALS ----------
function modal(html) {
  const root = $('#modal-root');
  root.innerHTML = `
    <div class="fixed inset-0 bg-zinc-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
      <div class="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl max-w-md w-full p-8 text-zinc-100 transform animate-in slide-in-from-bottom-4 duration-300">
        ${html}
      </div>
    </div>
  `;
  return {
    close: () => {
      root.innerHTML = '';
    },
    root,
  };
}

function openNewProjectModal() {
  const m = modal(`
    <h3 class="text-2xl font-black mb-6 text-white">Create Project</h3>
    <form id="np-form" class="space-y-5">
      <div>
        <label class="block text-xs font-black uppercase tracking-widest text-zinc-500 mb-2">Project Name</label>
        <input name="name" placeholder="E.g. Website Redesign" required class="${INPUT_CLS}" />
      </div>
      <div>
        <label class="block text-xs font-black uppercase tracking-widest text-zinc-500 mb-2">Description</label>
        <textarea name="description" placeholder="What is this project about?" rows="3" class="${INPUT_CLS}"></textarea>
      </div>
      <p id="np-error" class="text-sm text-rose-400 font-medium"></p>
      <div class="flex justify-end gap-3 pt-2">
        <button type="button" id="np-cancel" class="${BTN_CANCEL}">Dismiss</button>
        <button class="${BTN_PRIMARY}">Launch Project</button>
      </div>
    </form>
  `);
  $('#np-cancel', m.root).onclick = m.close;
  $('#np-form', m.root).onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name: fd.get('name'), description: fd.get('description') }),
      });
      m.close();
      viewProjects();
    } catch (err) {
      $('#np-error', m.root).textContent = err.message;
    }
  };
}

function openTaskModal(project, members, task) {
  const editing = !!task;
  const memberOpts = members
    .map(
      (mem) =>
        `<option value="${mem.id}" ${task && task.assignee_id === mem.id ? 'selected' : ''}>${escapeHtml(mem.name)}</option>`
    )
    .join('');
    
  const m = modal(`
    <h3 class="text-2xl font-black mb-6 text-white">${editing ? 'Update Task' : 'Add New Task'}</h3>
    <form id="t-form" class="space-y-4">
      <div>
        <label class="block text-xs font-black uppercase tracking-widest text-zinc-500 mb-1.5">Task Title</label>
        <input name="title" placeholder="What needs to be done?" required value="${escapeHtml(task?.title || '')}" class="${INPUT_CLS}" />
      </div>
      <div>
        <label class="block text-xs font-black uppercase tracking-widest text-zinc-500 mb-1.5">Context / Details</label>
        <textarea name="description" placeholder="Add some notes..." rows="3" class="${INPUT_CLS}">${escapeHtml(task?.description || '')}</textarea>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-black uppercase tracking-widest text-zinc-500 mb-1.5">Assignee</label>
          <select name="assignee_id" class="${INPUT_CLS}">
            <option value="">Unassigned</option>
            ${memberOpts}
          </select>
        </div>
        <div>
          <label class="block text-xs font-black uppercase tracking-widest text-zinc-500 mb-1.5">Due Date</label>
          <input name="due_date" type="date" value="${task?.due_date || ''}" class="${INPUT_CLS}" />
        </div>
      </div>
      <div>
        <label class="block text-xs font-black uppercase tracking-widest text-zinc-500 mb-1.5">Current Status</label>
        <select name="status" class="${INPUT_CLS}">
          <option value="todo" ${task?.status === 'todo' || !task ? 'selected' : ''}>To Do</option>
          <option value="in_progress" ${task?.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
          <option value="done" ${task?.status === 'done' ? 'selected' : ''}>Completed</option>
        </select>
      </div>
      <p id="t-error" class="text-sm text-rose-400 font-medium"></p>
      <div class="flex justify-end gap-3 pt-4">
        <button type="button" id="t-cancel" class="${BTN_CANCEL}">Cancel</button>
        <button class="${BTN_PRIMARY}">${editing ? 'Save Changes' : 'Create Task'}</button>
      </div>
    </form>
  `);
  
  $('#t-cancel', m.root).onclick = m.close;
  $('#t-form', m.root).onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      title: fd.get('title'),
      description: fd.get('description'),
      assignee_id: fd.get('assignee_id') ? Number(fd.get('assignee_id')) : null,
      due_date: fd.get('due_date') || null,
      status: fd.get('status'),
    };
    try {
      if (editing) {
        await api(`/api/tasks/${task.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await api(`/api/projects/${project.id}/tasks`, { method: 'POST', body: JSON.stringify(body) });
      }
      m.close();
      openProject(project.id);
    } catch (err) {
      $('#t-error', m.root).textContent = err.message;
    }
  };
}

function openAddMemberModal(project) {
  const m = modal(`
    <h3 class="text-2xl font-black mb-2 text-white">Add Member</h3>
    <p class="text-xs ${MUTED} mb-6">Enter the email of an existing user to invite them.</p>
    <form id="am-form" class="space-y-4">
      <div>
        <label class="block text-xs font-black uppercase tracking-widest text-zinc-500 mb-2">Email Address</label>
        <input name="email" type="email" placeholder="user@example.com" required class="${INPUT_CLS}" />
      </div>
      <div>
        <label class="block text-xs font-black uppercase tracking-widest text-zinc-500 mb-2">Permission Level</label>
        <select name="role" class="${INPUT_CLS}">
          <option value="member">Project Member</option>
          <option value="admin">Project Admin</option>
        </select>
      </div>
      <p id="am-error" class="text-sm text-rose-400 font-medium"></p>
      <div class="flex justify-end gap-3 pt-4">
        <button type="button" id="am-cancel" class="${BTN_CANCEL}">Cancel</button>
        <button class="${BTN_PRIMARY}">Add to Team</button>
      </div>
    </form>
  `);
  $('#am-cancel', m.root).onclick = m.close;
  $('#am-form', m.root).onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api(`/api/projects/${project.id}/members`, {
        method: 'POST',
        body: JSON.stringify({ email: fd.get('email'), role: fd.get('role') }),
      });
      m.close();
      openProject(project.id);
    } catch (err) {
      $('#am-error', m.root).textContent = err.message;
    }
  };
}

// ---------- ROUTING ----------
function render() {
  if (!State.token || !State.user) {
    $('#auth-screen').classList.remove('hidden');
    $('#app-screen').classList.add('hidden');
    return;
  }
  $('#auth-screen').classList.add('hidden');
  $('#app-screen').classList.remove('hidden');
  
  const greetingName = $('#user-name');
  if (greetingName) greetingName.textContent = State.user.name;

  if (State.view === 'project' && State.currentProject) {
    openProject(State.currentProject);
  } else if (State.view === 'projects') {
    viewProjects();
  } else {
    State.view = 'dashboard';
    viewDashboard();
  }
}

function bindNav() {
  $$('.nav-btn').forEach((b) => {
    b.onclick = () => {
      State.view = b.dataset.view;
      State.currentProject = null;
      render();
    };
  });
  const logoutBtn = $('#logout-btn');
  if (logoutBtn) logoutBtn.onclick = logout;
}

// ---------- INIT ----------
bindAuthScreen();
bindNav();
render();