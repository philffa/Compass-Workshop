// js/views/newProject.js — Template picker + project creation + join by code

import { createProject, createSharedProject, joinProjectByCode } from '../firebase.js';
import { navigate } from '../app.js';
import { toast } from '../ui.js';

const TEMPLATES = [
  {
    id: 'school',
    icon: '📚',
    name: 'School project',
    desc: 'Individual, team, and community components',
    fields: [
      { key: 'individual', label: 'Individual part', placeholder: 'What are you doing on your own?' },
      { key: 'team', label: 'Team part', placeholder: 'What are you doing with others?' },
      { key: 'community', label: 'Community part', placeholder: 'How does it connect to the wider world?' },
      { key: 'coach', label: 'Coach check-in day', placeholder: 'e.g. Thursday 2pm' },
    ]
  },
  {
    id: 'extra',
    icon: '⚡',
    name: 'Extracurricular',
    desc: 'Sport, drama, music, clubs — anything outside class',
    fields: [
      { key: 'activity', label: 'Activity', placeholder: 'e.g. Basketball, Drama, Robotics' },
      { key: 'schedule', label: 'Regular sessions', placeholder: 'e.g. Tuesday and Thursday 4pm' },
      { key: 'goal', label: 'What are you working towards?', placeholder: 'e.g. Making the first team' },
    ]
  },
  {
    id: 'freetime',
    icon: '✨',
    name: "I've got time",
    desc: 'Explore something you\'re curious about',
    fields: [
      { key: 'curious', label: "What's caught your attention lately?", placeholder: 'Anything — it doesn\'t have to make sense yet' },
    ]
  },
  {
    id: 'blank',
    icon: '📋',
    name: 'Blank project',
    desc: 'Start from scratch',
    fields: []
  },
];

export function renderNewProject(container) {
  let selectedTemplate = null;
  let isShared = false;

  container.innerHTML = `
    <div class="page" style="max-width:560px;">
      <button class="btn btn-ghost" id="back-btn" style="margin-bottom:1rem;">← Back</button>

      <!-- Mode toggle -->
      <div style="display:flex;gap:8px;margin-bottom:1.5rem;">
        <button class="btn btn-primary" id="mode-new" style="flex:1;">New project</button>
        <button class="btn btn-secondary" id="mode-join" style="flex:1;">Join with code</button>
      </div>

      <!-- New project panel -->
      <div id="panel-new">
        <h1 style="margin-bottom:0.25rem;">New project</h1>
        <p style="margin-bottom:1.25rem;">Pick a type to get started.</p>

        <div class="template-grid" id="template-grid">
          ${TEMPLATES.map(t => `
            <div class="template-option" data-id="${t.id}">
              <div class="t-icon">${t.icon}</div>
              <div class="t-name">${t.name}</div>
              <div class="t-desc">${t.desc}</div>
            </div>
          `).join('')}
        </div>

        <div id="project-form" class="hidden">
          <div class="divider"></div>

          <!-- Shared toggle -->
          <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--teal-light);border-radius:var(--radius-md);margin-bottom:1rem;">
            <input type="checkbox" id="shared-toggle" style="width:16px;height:16px;accent-color:var(--teal);flex-shrink:0;" />
            <label for="shared-toggle" style="font-size:0.88rem;cursor:pointer;flex:1;">
              <strong>Team project</strong> — others can join with an invite code
            </label>
          </div>

          <div class="field">
            <label>Project name</label>
            <input type="text" id="project-name" placeholder="Give it a name" maxlength="60" />
          </div>
          <div class="field">
            <label>Description <span style="font-weight:400;text-transform:none;">(optional)</span></label>
            <textarea id="project-desc" placeholder="A sentence or two about what this is" rows="2"></textarea>
          </div>
          <div id="template-fields"></div>
          <div style="display:flex;gap:8px;margin-top:1rem;">
            <button class="btn btn-primary" id="create-btn">Create project</button>
            <button class="btn btn-secondary" id="cancel-btn">Cancel</button>
          </div>
        </div>
      </div>

      <!-- Join project panel -->
      <div id="panel-join" class="hidden">
        <h1 style="margin-bottom:0.25rem;">Join a project</h1>
        <p style="margin-bottom:1.25rem;">Enter the 6-character code your teammate shared with you.</p>
        <div class="card">
          <div class="field" style="margin-bottom:0.75rem;">
            <label>Invite code</label>
            <input type="text" id="join-code" placeholder="e.g. ABC123"
              maxlength="6" style="font-size:1.4rem;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;text-align:center;" />
          </div>
          <button class="btn btn-primary" id="join-btn" style="width:100%;">Join project</button>
        </div>
      </div>
    </div>
  `;

  // Mode toggle
  const btnNew  = container.querySelector('#mode-new');
  const btnJoin = container.querySelector('#mode-join');
  const panelNew  = container.querySelector('#panel-new');
  const panelJoin = container.querySelector('#panel-join');

  btnNew.addEventListener('click', () => {
    btnNew.className = 'btn btn-primary'; btnJoin.className = 'btn btn-secondary';
    panelNew.classList.remove('hidden'); panelJoin.classList.add('hidden');
  });
  btnJoin.addEventListener('click', () => {
    btnJoin.className = 'btn btn-primary'; btnNew.className = 'btn btn-secondary';
    panelJoin.classList.remove('hidden'); panelNew.classList.add('hidden');
    container.querySelector('#join-code').focus();
  });

  container.querySelector('#back-btn').addEventListener('click', () => navigate('home'));
  container.querySelector('#cancel-btn').addEventListener('click', () => navigate('home'));

  // Auto-uppercase join code
  container.querySelector('#join-code').addEventListener('input', e => {
    e.target.value = e.target.value.toUpperCase();
  });

  // Template selection
  container.querySelectorAll('.template-option').forEach(opt => {
    opt.addEventListener('click', () => {
      container.querySelectorAll('.template-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      selectedTemplate = TEMPLATES.find(t => t.id === opt.dataset.id);
      showForm(selectedTemplate);
    });
  });

  function showForm(template) {
    container.querySelector('#project-form').classList.remove('hidden');
    const fieldsEl = container.querySelector('#template-fields');
    fieldsEl.innerHTML = template.fields.map(f => `
      <div class="field">
        <label>${f.label}</label>
        <input type="text" data-key="${f.key}" placeholder="${f.placeholder}" />
      </div>
    `).join('');
    container.querySelector('#project-name').focus();
  }

  // Create project
  container.querySelector('#create-btn').addEventListener('click', async () => {
    const name = container.querySelector('#project-name').value.trim();
    if (!name) { toast('Give your project a name first'); return; }
    if (!selectedTemplate) { toast('Pick a project type first'); return; }

    const desc = container.querySelector('#project-desc').value.trim();
    const templateData = {};
    container.querySelectorAll('#template-fields [data-key]').forEach(input => {
      templateData[input.dataset.key] = input.value.trim();
    });
    const shared = container.querySelector('#shared-toggle').checked;

    const btn = container.querySelector('#create-btn');
    btn.textContent = 'Creating…'; btn.disabled = true;

    try {
      const createFn = shared ? createSharedProject : createProject;
      const pid = await createFn({ name, description: desc, template: selectedTemplate.id, icon: selectedTemplate.icon, templateData });
      toast('Project created', 'success');
      navigate('project', { pid });
    } catch(e) {
      toast('Something went wrong — try again', 'error');
      btn.textContent = 'Create project'; btn.disabled = false;
    }
  });

  // Join project
  container.querySelector('#join-btn').addEventListener('click', async () => {
    const code = container.querySelector('#join-code').value.trim().toUpperCase();
    if (code.length !== 6) { toast('Enter the full 6-character code'); return; }

    const btn = container.querySelector('#join-btn');
    btn.textContent = 'Joining…'; btn.disabled = true;

    try {
      const pid = await joinProjectByCode(code);
      toast('Joined project!', 'success');
      navigate('project', { pid });
    } catch(e) {
      toast(e.message || 'Could not join — check the code and try again', 'error');
      btn.textContent = 'Join project'; btn.disabled = false;
    }
  });
}
