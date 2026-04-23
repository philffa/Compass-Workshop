// js/views/project.js — Project shell + tool tabs

import { getProject, onTasks, weekId, formatWeekLabel } from '../firebase.js';
import { navigate } from '../app.js';
import { toast } from '../ui.js';
import { renderBrainDump } from './tools/brainDump.js';
import { renderEisenhower } from './tools/eisenhower.js';
import { renderResourceAudit } from './tools/resourceAudit.js';
import { renderWeeklyPlanner } from './tools/weeklyPlanner.js';
import { renderTodoList } from './tools/todoList.js';
import { renderWeeklyReview } from './tools/weeklyReview.js';
import { renderExport } from './tools/export.js';

const TOOLS = [
  { id: 'todo',     label: "Today's focus" },
  { id: 'brain',    label: 'Brain dump'    },
  { id: 'matrix',   label: 'Priority sort' },
  { id: 'audit',    label: 'My week'       },
  { id: 'planner',  label: 'Week plan'     },
  { id: 'review',   label: 'Week review'   },
];

// Templates that show team coaching context
const TEAM_TEMPLATES = ['school'];
const FREETIME_TEMPLATES = ['freetime'];

export async function renderProject(container, pid) {
  container.innerHTML = `<div class="page"><div class="empty"><div class="empty-icon">⏳</div><p>Loading…</p></div></div>`;

  const project = await getProject(pid);
  if (!project) {
    container.innerHTML = `<div class="page"><p>Project not found.</p><button class="btn btn-secondary" id="back">← Back</button></div>`;
    container.querySelector('#back').addEventListener('click', () => navigate('home'));
    return;
  }

  const currentWeek = weekId();
  const isFreetime = FREETIME_TEMPLATES.includes(project.template);
  const hasTeam = TEAM_TEMPLATES.includes(project.template);

  container.innerHTML = `
    <div class="page-wide">
      <div class="project-header no-print">
        <div class="project-icon" style="background:var(--teal-light);font-size:1.5rem;">${project.icon ?? '📋'}</div>
        <div class="project-header-text">
          <h1>${escHtml(project.name)}</h1>
          ${project.description ? `<p style="margin-top:2px;">${escHtml(project.description)}</p>` : ''}
        </div>
        <div class="project-header-actions">
          <button class="btn btn-secondary btn-sm" id="export-btn">Save / Print</button>
          <button class="btn btn-ghost btn-sm" id="back-btn">← Projects</button>
        </div>
      </div>

      <div class="tool-tabs no-print" id="tool-tabs">
        ${TOOLS.map((t, i) => `
          <button class="tool-tab${i === 0 ? ' active' : ''}" data-tool="${t.id}">${t.label}</button>
        `).join('')}
      </div>

      <div id="tool-content"></div>
    </div>
  `;

  container.querySelector('#back-btn').addEventListener('click', () => navigate('home'));

  // Export button
  container.querySelector('#export-btn').addEventListener('click', () => {
    showTool('export');
  });

  // Tab switching
  const tabs = container.querySelector('#tool-tabs');
  const toolContent = container.querySelector('#tool-content');

  function showTool(toolId) {
    tabs.querySelectorAll('.tool-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tool === toolId);
    });
    toolContent.innerHTML = '';

    const ctx = { pid, project, currentWeek, isFreetime, hasTeam };

    switch (toolId) {
      case 'todo':    renderTodoList(toolContent, ctx);       break;
      case 'brain':   renderBrainDump(toolContent, ctx);      break;
      case 'matrix':  renderEisenhower(toolContent, ctx);     break;
      case 'audit':   renderResourceAudit(toolContent, ctx);  break;
      case 'planner': renderWeeklyPlanner(toolContent, ctx);  break;
      case 'review':  renderWeeklyReview(toolContent, ctx);   break;
      case 'export':  renderExport(toolContent, ctx);         break;
    }
  }

  tabs.addEventListener('click', e => {
    const tab = e.target.closest('.tool-tab');
    if (!tab) return;
    showTool(tab.dataset.tool);
  });

  // Start on today's focus
  showTool('todo');
}

function escHtml(str = '') {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
