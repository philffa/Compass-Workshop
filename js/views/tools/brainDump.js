// js/views/tools/brainDump.js

import { onTasks, createTask, updateTask, softDeleteTask, restoreTask, duplicateTask, reorderTasks } from '../../firebase.js';
import { makeSortable, toast, confirmModal } from '../../ui.js';
import { renderCoachingCard, coachingContext } from '../../coaching.js';

export function renderBrainDump(container, { pid, project, isFreetime, shared = false }) {
  container.innerHTML = `
    <div class="print-section">
      <div class="row-between" style="margin-bottom:1rem;">
        <div>
          <h2>Brain dump</h2>
          <p>Get everything out of your head. Don't filter — just write it all down.</p>
        </div>
      </div>

      <div id="coaching-area" style="margin-bottom:1rem;"></div>

      <div class="card" style="margin-bottom:1rem;">
        <div class="row" style="gap:8px;">
          <input type="text" id="new-task-input" placeholder="Add a task…" style="flex:1;" />
          <button class="btn btn-primary" id="add-task-btn">Add</button>
        </div>
        <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;" id="quick-tags">
          <span class="text-xs text-muted" style="align-self:center;">Tag as:</span>
          ${['Project','Team','Admin','Personal'].map(tag =>
            `<button class="btn btn-secondary btn-sm tag-btn" data-tag="${tag}">${tag}</button>`
          ).join('')}
        </div>
      </div>

      <div id="task-list" class="stack"></div>
      <div id="empty-state"></div>

      <!-- Trash section -->
      <div id="trash-section" style="margin-top:1.5rem;display:none;">
        <div class="row-between" style="margin-bottom:0.5rem;">
          <h3 style="font-size:0.88rem;color:var(--text-muted);">Trash</h3>
          <button class="btn btn-ghost btn-sm" id="toggle-trash">Show</button>
        </div>
        <div id="trash-list" class="stack hidden"></div>
      </div>
    </div>
  `;

  let activeTag = null;
  let unsubscribe;

  container.querySelectorAll('.tag-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const same = btn.dataset.tag === activeTag;
      container.querySelectorAll('.tag-btn').forEach(b => { b.classList.remove('btn-primary'); b.classList.add('btn-secondary'); });
      activeTag = same ? null : btn.dataset.tag;
      if (!same) { btn.classList.add('btn-primary'); btn.classList.remove('btn-secondary'); }
    });
  });

  async function addTask() {
    const input = container.querySelector('#new-task-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    await createTask(pid, { text, tags: activeTag ? [activeTag] : [], shared });
  }

  container.querySelector('#add-task-btn').addEventListener('click', addTask);
  container.querySelector('#new-task-input').addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });

  const listEl = container.querySelector('#task-list');

  function makeTaskEl(task, inTrash = false) {
    const el = document.createElement('div');
    el.className = `task-item${task.status === 'complete' ? ' completed' : ''}`;
    if (!inTrash) { el.draggable = true; el.dataset.id = task.id; }
    el.innerHTML = `
      ${!inTrash ? `<div class="drag-handle">⠿</div>` : ''}
      ${!inTrash ? `<div class="task-check${task.status === 'complete' ? ' checked' : ''}"></div>` : ''}
      <div style="flex:1;min-width:0;">
        <div class="task-text">${esc(task.text)}</div>
        ${task.tags?.length ? `<div class="task-meta">${task.tags.map(t => `<span class="badge badge-teal">${t}</span>`).join('')}</div>` : ''}
      </div>
      <div class="task-actions" style="display:flex;gap:2px;">
        ${inTrash
          ? `<button class="btn btn-ghost btn-icon btn-sm restore-btn" title="Restore">↩</button>`
          : `
            <button class="btn btn-ghost btn-icon btn-sm dupe-btn" title="Duplicate">⧉</button>
            <button class="btn btn-ghost btn-icon btn-sm delete-btn" title="Delete">✕</button>
          `}
      </div>
    `;

    if (!inTrash) {
      el.querySelector('.task-check').addEventListener('click', async () => {
        await updateTask(pid, task.id, { status: task.status === 'complete' ? 'active' : 'complete' }, shared);
      });
      el.querySelector('.dupe-btn').addEventListener('click', async () => {
        await duplicateTask(pid, task.id, shared);
        toast('Task duplicated');
      });
      el.querySelector('.delete-btn').addEventListener('click', async () => {
        await softDeleteTask(pid, task.id, shared);
        toast('Moved to trash');
      });
      el.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', task.id); e.dataTransfer.effectAllowed = 'move'; });
    } else {
      el.querySelector('.restore-btn').addEventListener('click', async () => {
        await restoreTask(pid, task.id, shared);
        toast('Task restored');
      });
    }
    return el;
  }

  container.querySelector('#toggle-trash').addEventListener('click', () => {
    const list = container.querySelector('#trash-list');
    const btn = container.querySelector('#toggle-trash');
    const hidden = list.classList.toggle('hidden');
    btn.textContent = hidden ? 'Show' : 'Hide';
  });

  unsubscribe = onTasks(pid, shared, taskList => {
    const active = taskList.filter(t => t.status !== 'deleted');
    const trashed = taskList.filter(t => t.status === 'deleted');

    listEl.innerHTML = '';
    const emptyEl = container.querySelector('#empty-state');

    if (active.length === 0) {
      emptyEl.innerHTML = `<div class="empty"><div class="empty-icon">🧠</div><h3>Nothing here yet</h3><p>Add anything on your mind.</p></div>`;
    } else {
      emptyEl.innerHTML = '';
      active.forEach(task => listEl.appendChild(makeTaskEl(task)));
      makeSortable(listEl, ids => reorderTasks(pid, ids, shared));
    }

    // Trash
    const trashSection = container.querySelector('#trash-section');
    const trashList = container.querySelector('#trash-list');
    trashSection.style.display = trashed.length > 0 ? 'block' : 'none';
    trashList.innerHTML = '';
    trashed.forEach(task => trashList.appendChild(makeTaskEl(task, true)));

    // Coaching
    const coachingArea = container.querySelector('#coaching-area');
    if (coachingArea.children.length === 0) {
      const ctx = coachingContext({ taskCount: active.filter(t => t.status === 'active').length, isFreetime, hasTeamComponent: project?.template === 'school', isReviewing: false });
      renderCoachingCard(ctx, coachingArea);
    }
  });

  container._cleanup = () => unsubscribe?.();
}

function esc(str = '') { return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
