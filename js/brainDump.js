// js/views/tools/brainDump.js

import { onTasks, createTask, updateTask, deleteTask, reorderTasks } from '../../firebase.js';
import { makeSortable, toast, confirmModal } from '../../ui.js';
import { renderCoachingCard, coachingContext } from '../../coaching.js';

export function renderBrainDump(container, { pid, project, isFreetime }) {
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
    </div>
  `;

  let activeTag = null;
  let tasks = [];
  let unsubscribe;

  // Tag buttons
  container.querySelectorAll('.tag-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const same = btn.dataset.tag === activeTag;
      container.querySelectorAll('.tag-btn').forEach(b => b.classList.remove('btn-primary'));
      container.querySelectorAll('.tag-btn').forEach(b => b.classList.add('btn-secondary'));
      if (same) {
        activeTag = null;
      } else {
        btn.classList.add('btn-primary');
        btn.classList.remove('btn-secondary');
        activeTag = btn.dataset.tag;
      }
    });
  });

  // Add task
  async function addTask() {
    const input = container.querySelector('#new-task-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    await createTask(pid, { text, tags: activeTag ? [activeTag] : [] });
  }

  container.querySelector('#add-task-btn').addEventListener('click', addTask);
  container.querySelector('#new-task-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') addTask();
  });

  // Task list
  const listEl = container.querySelector('#task-list');

  function renderTasks(taskList) {
    tasks = taskList;
    listEl.innerHTML = '';

    const empty = container.querySelector('#empty-state');

    if (taskList.length === 0) {
      empty.innerHTML = `
        <div class="empty">
          <div class="empty-icon">🧠</div>
          <h3>Nothing here yet</h3>
          <p>Add anything on your mind — project stuff, chores, ideas, whatever.</p>
        </div>`;
      return;
    }
    empty.innerHTML = '';

    taskList.forEach(task => {
      const el = document.createElement('div');
      el.className = `task-item${task.status === 'complete' ? ' completed' : ''}`;
      el.draggable = true;
      el.dataset.id = task.id;
      el.innerHTML = `
        <div class="drag-handle" title="Drag to reorder">⠿</div>
        <div class="task-check${task.status === 'complete' ? ' checked' : ''}" data-tid="${task.id}"></div>
        <div style="flex:1;min-width:0;">
          <div class="task-text">${escHtml(task.text)}</div>
          ${task.tags?.length ? `
            <div class="task-meta">
              ${task.tags.map(t => `<span class="badge badge-teal">${t}</span>`).join('')}
            </div>` : ''}
        </div>
        <div class="task-actions">
          <button class="btn btn-ghost btn-icon btn-sm delete-btn" title="Delete">✕</button>
        </div>
      `;

      // Check/uncheck
      el.querySelector('.task-check').addEventListener('click', async () => {
        const newStatus = task.status === 'complete' ? 'active' : 'complete';
        await updateTask(pid, task.id, { status: newStatus });
      });

      // Delete
      el.querySelector('.delete-btn').addEventListener('click', () => {
        confirmModal(`Delete "${task.text}"?`, async () => {
          await deleteTask(pid, task.id);
        });
      });

      // Drag events for Eisenhower
      el.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', task.id);
        e.dataTransfer.effectAllowed = 'move';
      });

      listEl.appendChild(el);
    });

    // Make sortable
    makeSortable(listEl, async (orderedIds) => {
      await reorderTasks(pid, orderedIds);
    });
  }

  // Coaching question
  const coachingArea = container.querySelector('#coaching-area');
  unsubscribe = onTasks(pid, taskList => {
    renderTasks(taskList);
    // Show coaching card once, based on context
    if (coachingArea.children.length === 0) {
      const ctx = coachingContext({
        taskCount: taskList.filter(t => t.status !== 'complete').length,
        isFreetime,
        hasTeamComponent: project.template === 'school',
        isReviewing: false,
      });
      renderCoachingCard(ctx, coachingArea);
    }
  });

  // Cleanup on navigation
  container._cleanup = () => unsubscribe?.();
}

function escHtml(str = '') {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
