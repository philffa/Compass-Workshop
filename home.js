// js/views/home.js — Project dashboard

import { onProjects, deleteProject } from '../firebase.js';
import { navigate } from '../app.js';
import { toast, confirmModal } from '../ui.js';

const TEMPLATE_META = {
  school:    { icon: '📚', label: 'School project',      badge: 'badge-teal'   },
  extra:     { icon: '⚡', label: 'Extracurricular',      badge: 'badge-purple' },
  freetime:  { icon: '✨', label: 'Something to explore', badge: 'badge-amber'  },
  blank:     { icon: '📋', label: 'Custom project',       badge: 'badge-gray'   },
};

export function renderHome(container) {
  container.innerHTML = `
    <div class="page">
      <div class="row-between" style="margin-bottom:0.25rem;">
        <h1>Your projects</h1>
      </div>
      <p style="margin-bottom:0.25rem;">Pick up where you left off, or start something new.</p>
      <div id="project-grid" class="project-grid">
        <div class="new-project-card" id="new-project-btn">
          <div class="plus">+</div>
          <span>New project</span>
        </div>
      </div>
    </div>
  `;

  container.querySelector('#new-project-btn').addEventListener('click', () => {
    navigate('new-project');
  });

  const grid = container.querySelector('#project-grid');

  onProjects(projects => {
    // Clear existing project cards (keep the new button)
    grid.querySelectorAll('.project-card').forEach(c => c.remove());

    if (projects.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'grid-column:1/-1;padding:1.5rem 0;';
      empty.innerHTML = `<p style="color:var(--text-muted);font-size:0.9rem;">No projects yet — hit <strong>New project</strong> to get started.</p>`;
      grid.appendChild(empty);
      return;
    }

    projects.forEach(project => {
      const meta = TEMPLATE_META[project.template] ?? TEMPLATE_META.blank;
      const isShared = !project._personal;
      const card = document.createElement('div');
      card.className = 'project-card';
      card.innerHTML = `
        <div class="project-card-top">
          <div style="font-size:1.4rem;">${meta.icon}</div>
          <div style="flex:1;min-width:0;">
            <div class="project-card-name">${escHtml(project.name)}</div>
            <span class="badge ${meta.badge}">${meta.label}</span>${isShared ? '<span class="badge badge-purple" style="margin-left:4px;">Team</span>' : ''}
          </div>
          <button class="btn btn-ghost btn-icon delete-btn" title="Delete project">✕</button>
        </div>
        ${project.description
          ? `<div class="project-card-desc">${escHtml(project.description)}</div>`
          : ''}
        <div class="project-card-footer">
          <span class="project-card-stats text-xs text-muted">
            ${project.createdAt
              ? `Started ${formatDate(project.createdAt.toDate?.() ?? new Date(project.createdAt))}`
              : 'Just created'}
          </span>
          <button class="btn btn-primary btn-sm open-btn">Open →</button>
        </div>
      `;

      card.querySelector('.open-btn').addEventListener('click', e => {
        e.stopPropagation();
        navigate('project', { pid: project.id });
      });
      card.addEventListener('click', () => navigate('project', { pid: project.id }));

      card.querySelector('.delete-btn').addEventListener('click', e => {
        e.stopPropagation();
        confirmModal(
          `Delete "${project.name}"? This can't be undone.`,
          async () => {
            await deleteProject(project.id);
            toast('Project deleted');
          }
        );
      });

      grid.appendChild(card);
    });
  });
}

function formatDate(date) {
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
