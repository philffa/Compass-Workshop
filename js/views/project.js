// js/views/project.js — Project shell + tool tabs

import { getProject, updateProject, generateInviteCode, getPendingReviews, purgeOldDeletedTasks, prevWeekId, weekId } from '../firebase.js';
import { navigate } from '../app.js';
import { toast, showModal } from '../ui.js';
import { renderBrainDump } from './tools/brainDump.js';
import { renderEisenhower } from './tools/eisenhower.js';
import { renderResourceAudit } from './tools/resourceAudit.js';
import { renderWeeklyPlanner } from './tools/weeklyPlanner.js';
import { renderTodoList } from './tools/todoList.js';
import { renderWeeklyReview } from './tools/weeklyReview.js';
import { renderExport } from './tools/export.js';

const TOOLS = [
  { id: 'todo',    label: "Today's focus" },
  { id: 'brain',   label: 'Brain dump'    },
  { id: 'matrix',  label: 'Priority sort' },
  { id: 'audit',   label: 'My week'       },
  { id: 'planner', label: 'Week plan'     },
  { id: 'review',  label: 'Week review'   },
];

export async function renderProject(container, pid) {
  container.innerHTML = `<div class="page"><div class="empty"><p>Loading…</p></div></div>`;

  const project = await getProject(pid);
  if (!project) {
    container.innerHTML = `<div class="page"><p>Project not found.</p><button class="btn btn-secondary" id="back">← Back</button></div>`;
    container.querySelector('#back').addEventListener('click', () => navigate('home'));
    return;
  }

  const shared = !project._personal;
  const currentWeek = weekId();
  const isFreetime = project.template === 'freetime';
  const hasTeam = project.template === 'school';

  // Lazy trash cleanup (fire and forget)
  purgeOldDeletedTasks(pid, shared).catch(() => {});

  container.innerHTML = `
    <div class="page-wide">
      <!-- Project header -->
      <div class="project-header no-print">
        <div class="project-icon" style="background:var(--teal-light);font-size:1.5rem;">${project.icon ?? '📋'}</div>
        <div class="project-header-text">
          <h1>${esc(project.name)}</h1>
          ${project.description ? `<p style="margin-top:2px;">${esc(project.description)}</p>` : ''}
          <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">
            ${shared ? `<span class="badge badge-purple">Team project</span>` : ''}
            <span class="badge badge-gray">${project.template ?? 'project'}</span>
          </div>
        </div>
        <div class="project-header-actions" style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-start;">
          ${shared && project.ownerId ? `<button class="btn btn-secondary btn-sm" id="invite-btn">Invite code</button>` : ''}
          <button class="btn btn-secondary btn-sm" id="settings-btn">⚙ Settings</button>
          <button class="btn btn-secondary btn-sm" id="export-btn">Save / Print</button>
          <button class="btn btn-ghost btn-sm" id="back-btn">← Projects</button>
        </div>
      </div>

      <!-- Pending review prompt -->
      <div id="review-prompt" style="display:none;" class="no-print"></div>

      <!-- Tool tabs -->
      <div class="tool-tabs no-print" id="tool-tabs">
        ${TOOLS.map((t, i) => `
          <button class="tool-tab${i === 0 ? ' active' : ''}" data-tool="${t.id}">${t.label}</button>
        `).join('')}
      </div>

      <div id="tool-content"></div>
    </div>
  `;

  container.querySelector('#back-btn').addEventListener('click', () => navigate('home'));

  // Invite code button (shared projects owned by this user)
  container.querySelector('#invite-btn')?.addEventListener('click', async () => {
    const btn = container.querySelector('#invite-btn');
    btn.textContent = 'Generating…'; btn.disabled = true;
    try {
      const code = await generateInviteCode(pid);
      const m = showModal({
        title: 'Invite code',
        content: (() => {
          const d = document.createElement('div');
          d.innerHTML = `
            <p style="margin-bottom:1rem;font-size:0.88rem;color:var(--text-muted);">
              Share this code with your teammate. It can only be used once.
            </p>
            <div style="text-align:center;font-size:2rem;font-weight:700;letter-spacing:0.2em;
              color:var(--teal);background:var(--teal-light);padding:1rem;border-radius:var(--radius-md);
              margin-bottom:1rem;">${code}</div>
            <p style="font-size:0.8rem;color:var(--text-muted);">They go to the app, click "Join with code", and type this in.</p>
          `;
          return d;
        })(),
      });
    } catch(e) {
      toast('Could not generate code — try again', 'error');
    } finally {
      btn.textContent = 'Invite code'; btn.disabled = false;
    }
  });

  // Settings button — weekend + planner view toggles
  container.querySelector('#settings-btn').addEventListener('click', () => {
    const d = document.createElement('div');
    d.innerHTML = `
      <div class="stack" style="gap:12px;">
        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:0.9rem;">
          <input type="checkbox" id="s-weekend" ${project.showWeekend ? 'checked' : ''}
            style="width:16px;height:16px;accent-color:var(--teal);" />
          Show Saturday &amp; Sunday in week views
        </label>
        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:0.9rem;">
          <input type="checkbox" id="s-hourly" ${project.plannerView === 'hourly' ? 'checked' : ''}
            style="width:16px;height:16px;accent-color:var(--teal);" />
          Enable hourly planner view (alongside slot view)
        </label>
      </div>
    `;
    const footer = document.createElement('div');
    footer.className = 'modal-footer';
    footer.innerHTML = `<button class="btn btn-primary" id="s-save">Save</button>`;
    const m = showModal({ title: 'Project settings', content: d, footer });
    footer.querySelector('#s-save').addEventListener('click', async () => {
      const showWeekend = d.querySelector('#s-weekend').checked;
      const plannerView = d.querySelector('#s-hourly').checked ? 'hourly' : 'slots';
      await updateProject(pid, { showWeekend, plannerView });
      project.showWeekend = showWeekend;
      project.plannerView = plannerView;
      toast('Settings saved');
      m.close();
      // Refresh current tool
      const activeTab = container.querySelector('.tool-tab.active');
      if (activeTab) showTool(activeTab.dataset.tool);
    });
  });

  // Export button
  container.querySelector('#export-btn').addEventListener('click', () => showTool('export'));

  // Pending review check
  getPendingReviews(pid, shared).then(prevWid => {
    if (!prevWid) return;
    const prompt = container.querySelector('#review-prompt');
    prompt.style.display = 'block';
    prompt.innerHTML = `
      <div style="background:var(--amber-light);border:1px solid rgba(133,79,11,0.15);
        border-radius:var(--radius-lg);padding:0.875rem 1.1rem;margin-bottom:1rem;
        display:flex;align-items:center;gap:12px;">
        <div style="font-size:1.1rem;">📋</div>
        <div style="flex:1;font-size:0.88rem;color:var(--amber);">
          <strong>Take a minute to review last week?</strong>
          It only takes a few minutes and helps you plan this week better.
        </div>
        <button class="btn btn-sm" id="review-prompt-btn"
          style="background:var(--amber);color:white;border:none;white-space:nowrap;">
          Review now
        </button>
        <button class="btn btn-ghost btn-sm" id="review-dismiss" style="color:var(--amber);">✕</button>
      </div>`;
    prompt.querySelector('#review-prompt-btn').addEventListener('click', () => showTool('review'));
    prompt.querySelector('#review-dismiss').addEventListener('click', () => { prompt.style.display = 'none'; });
  }).catch(() => {});

  // Tool tabs
  const tabs = container.querySelector('#tool-tabs');
  const toolContent = container.querySelector('#tool-content');

  function showTool(toolId) {
    tabs.querySelectorAll('.tool-tab').forEach(t => t.classList.toggle('active', t.dataset.tool === toolId));
    toolContent.innerHTML = '';
    if (toolContent._cleanup) { toolContent._cleanup(); toolContent._cleanup = null; }

    const ctx = { pid, project, currentWeek, isFreetime, hasTeam, shared };

    switch (toolId) {
      case 'todo':    renderTodoList(toolContent, ctx);       break;
      case 'brain':   renderBrainDump(toolContent, ctx);      break;
      case 'matrix':  renderEisenhower(toolContent, ctx);     break;
      case 'audit':   renderResourceAudit(toolContent, ctx);  break;
      case 'planner': renderWeeklyPlanner(toolContent, ctx);  break;
      case 'review':  renderWeeklyReview(toolContent, ctx);   break;
      case 'export':  renderExport(toolContent, ctx);         break;
    }
    toolContent._cleanup = toolContent._cleanup;
  }

  tabs.addEventListener('click', e => {
    const tab = e.target.closest('.tool-tab');
    if (tab) showTool(tab.dataset.tool);
  });

  showTool('todo');
}

function esc(str = '') {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
