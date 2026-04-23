// js/views/newProject.js — Template picker + project creation

import { createProject } from '../firebase.js';
import { navigate } from '../app.js';
import { toast } from '../ui.js';

const TEMPLATES = [
  {
    id: 'school',
    icon: '📚',
    name: 'School project',
    desc: 'Works with individual, team, and community components',
    fields: [
      { key: 'individual', label: 'Individual part', placeholder: 'What are you doing on your own?' },
      { key: 'team', label: 'Team part', placeholder: 'What are you doing with others?' },
      { key: 'community', label: 'Community part', placeholder: 'How does this connect to the wider world?' },
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
      { key: 'goal', label: 'What are you working towards?', placeholder: 'e.g. Making the first team, the performance' },
    ]
  },
  {
    id: 'freetime',
    icon: '✨',
    name: "I've got time",
    desc: 'Explore something you\'re curious about, with no pressure',
    fields: [
      { key: 'curious', label: "What's caught your attention lately?", placeholder: 'Anything — it doesn\'t have to make sense yet' },
    ]
  },
  {
    id: 'blank',
    icon: '📋',
    name: 'Blank project',
    desc: 'Start from scratch — you decide the shape',
    fields: []
  },
];

export function renderNewProject(container) {
  let selectedTemplate = null;

  container.innerHTML = `
    <div class="page" style="max-width:560px;">
      <button class="btn btn-ghost" id="back-btn" style="margin-bottom:1rem;">← Back</button>
      <h1 style="margin-bottom:0.25rem;">New project</h1>
      <p style="margin-bottom:1.5rem;">Pick a type to get started — you can always change things later.</p>

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
  `;

  container.querySelector('#back-btn').addEventListener('click', () => navigate('home'));
  container.querySelector('#cancel-btn').addEventListener('click', () => navigate('home'));

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
    const form = container.querySelector('#project-form');
    form.classList.remove('hidden');

    // Render template-specific fields
    const fieldsEl = container.querySelector('#template-fields');
    fieldsEl.innerHTML = template.fields.map(f => `
      <div class="field">
        <label>${f.label}</label>
        <input type="text" data-key="${f.key}" placeholder="${f.placeholder}" />
      </div>
    `).join('');

    // Focus name field
    container.querySelector('#project-name').focus();
  }

  container.querySelector('#create-btn').addEventListener('click', async () => {
    const name = container.querySelector('#project-name').value.trim();
    if (!name) {
      toast('Give your project a name first');
      container.querySelector('#project-name').focus();
      return;
    }
    if (!selectedTemplate) {
      toast('Pick a project type first');
      return;
    }

    const desc = container.querySelector('#project-desc').value.trim();
    const templateData = {};
    container.querySelectorAll('#template-fields [data-key]').forEach(input => {
      templateData[input.dataset.key] = input.value.trim();
    });

    const btn = container.querySelector('#create-btn');
    btn.textContent = 'Creating…';
    btn.disabled = true;

    try {
      const pid = await createProject({
        name,
        description: desc,
        template: selectedTemplate.id,
        icon: selectedTemplate.icon,
        templateData,
      });
      toast('Project created', 'success');
      navigate('project', { pid });
    } catch(e) {
      toast('Something went wrong — try again', 'error');
      btn.textContent = 'Create project';
      btn.disabled = false;
    }
  });
}
