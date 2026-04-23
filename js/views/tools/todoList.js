// js/views/tools/todoList.js

import { onTasks, updateTask, reorderTasks } from '../../firebase.js';
import { makeSortable, toast } from '../../ui.js';
import { renderCoachingCard, coachingContext } from '../../coaching.js';
import { weekId } from '../../firebase.js';

const WINDOW_SIZE = 3;

export function renderTodoList(container, { pid, project, currentWeek, isFreetime, hasTeam }) {
  container.innerHTML = `
    <div>
      <div class="row-between" style="margin-bottom:1rem;">
        <div>
          <h2>Today's focus</h2>
          <p>Your next three tasks. Drag to change the order.</p>
        </div>
      </div>

      <div id="todo-coaching" style="margin-bottom:1rem;"></div>

      <div class="todo-window" id="todo-window">
        <div class="todo-header">
          <h3 style="font-size:0.95rem;">Up next</h3>
          <span class="todo-count" id="todo-count">0</span>
          <div class="nav-spacer"></div>
          <button class="btn btn-ghost btn-sm no-print" id="smart-sort-btn" title="Reset to smart order">↺ Smart sort</button>
        </div>
        <div class="todo-list" id="todo-list"></div>
        <div class="todo-more" id="todo-more" style="display:none;">
          <span id="more-label"></span>
          <button class="btn btn-ghost btn-sm" id="show-more">Show more</button>
        </div>
      </div>

      <div style="margin-top:1.5rem;" id="done-section" class="hidden">
        <div class="row-between" style="margin-bottom:0.5rem;">
          <h3 style="font-size:0.9rem;color:var(--text-muted);">Completed</h3>
          <button class="btn btn-ghost btn-sm" id="toggle-done">Show</button>
        </div>
        <div id="done-list" class="stack hidden"></div>
      </div>
    </div>
  `;

  let windowOffset = 0;
  let allActive = [];
  let unsubscribe;

  function smartSort(tasks) {
    // Priority order:
    // 1. Assigned to current week AND quadrant = do
    // 2. Assigned to current week (any quadrant)
    // 3. Overdue (assigned to previous week, not complete)
    // 4. Quadrant = do (not assigned)
    // 5. Rest by sortOrder
    return [...tasks].sort((a, b) => {
      const score = t => {
        const thisWeek = t.weekSlot?.weekId === currentWeek;
        const overdue = t.weekSlot && t.weekSlot.weekId < currentWeek;
        if (thisWeek && t.quadrant === 'do') return 0;
        if (thisWeek) return 1;
        if (overdue) return 2;
        if (t.quadrant === 'do') return 3;
        if (t.quadrant === 'plan') return 4;
        return 5;
      };
      const sd = score(a) - score(b);
      if (sd !== 0) return sd;
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    });
  }

  function render(tasks) {
    const active = tasks.filter(t => t.status === 'active');
    const done = tasks.filter(t => t.status === 'complete');

    allActive = smartSort(active);

    const listEl = container.querySelector('#todo-list');
    const countEl = container.querySelector('#todo-count');
    const moreEl = container.querySelector('#todo-more');
    const moreLabel = container.querySelector('#more-label');

    countEl.textContent = active.length;
    listEl.innerHTML = '';

    if (active.length === 0) {
      listEl.innerHTML = `
        <div class="empty" style="padding:1.5rem;">
          <div class="empty-icon">✅</div>
          <h3>Nothing left to do</h3>
          <p>Add tasks in Brain dump, or you're actually done — nice work.</p>
        </div>`;
      moreEl.style.display = 'none';
      return;
    }

    const visible = allActive.slice(windowOffset, windowOffset + WINDOW_SIZE);
    const remaining = allActive.length - windowOffset - visible.length;

    visible.forEach(task => {
      const el = document.createElement('div');
      el.className = 'task-item';
      el.draggable = true;
      el.dataset.id = task.id;

      const isThisWeek = task.weekSlot?.weekId === currentWeek;
      const isOverdue = task.weekSlot && task.weekSlot.weekId < currentWeek;

      el.innerHTML = `
        <div class="drag-handle" title="Drag to reorder">⠿</div>
        <div class="task-check" data-tid="${task.id}"></div>
        <div style="flex:1;min-width:0;">
          <div class="task-text">${escHtml(task.text)}</div>
          <div class="task-meta">
            ${task.quadrant === 'do' ? `<span class="badge badge-teal">Priority</span>` : ''}
            ${isThisWeek ? `<span class="badge badge-blue">This week</span>` : ''}
            ${isOverdue ? `<span class="badge badge-coral">Overdue</span>` : ''}
            ${task.tags?.length ? `<span class="badge badge-gray">${task.tags[0]}</span>` : ''}
          </div>
        </div>
      `;

      el.querySelector('.task-check').addEventListener('click', async () => {
        await updateTask(pid, task.id, { status: 'complete' });
        toast('Done! ✓', 'success');
      });

      listEl.appendChild(el);
    });

    // Drag to reorder (updates sortOrder for full list)
    makeSortable(listEl, async (visibleIds) => {
      // Merge visible reorder back into full list
      const newOrder = [
        ...visibleIds,
        ...allActive.filter(t => !visibleIds.includes(t.id)).map(t => t.id)
      ];
      await reorderTasks(pid, newOrder);
    });

    // More / back controls
    if (remaining > 0 || windowOffset > 0) {
      moreEl.style.display = 'flex';
      moreLabel.textContent = remaining > 0
        ? `${remaining} more task${remaining !== 1 ? 's' : ''}`
        : 'Showing last tasks';
      container.querySelector('#show-more').textContent =
        windowOffset > 0 ? '← Back' : `Show next ${Math.min(remaining, WINDOW_SIZE)}`;
    } else {
      moreEl.style.display = 'none';
    }

    // Completed section
    const doneSection = container.querySelector('#done-section');
    doneSection.classList.toggle('hidden', done.length === 0);
    const doneList = container.querySelector('#done-list');
    doneList.innerHTML = '';
    done.forEach(task => {
      const el = document.createElement('div');
      el.className = 'task-item completed';
      el.innerHTML = `
        <div class="task-check checked"></div>
        <div class="task-text">${escHtml(task.text)}</div>
        <button class="btn btn-ghost btn-icon btn-sm undo-btn" title="Mark as not done">↩</button>
      `;
      el.querySelector('.undo-btn').addEventListener('click', async () => {
        await updateTask(pid, task.id, { status: 'active' });
      });
      doneList.appendChild(el);
    });
  }

  // Show more / back
  container.querySelector('#show-more').addEventListener('click', () => {
    if (windowOffset > 0) {
      windowOffset = Math.max(0, windowOffset - WINDOW_SIZE);
    } else {
      windowOffset += WINDOW_SIZE;
    }
    // Re-render with cached tasks
    const tasks = allActive.map(t => t); // shallow copy
    // Need to re-fetch; just re-render from last known state
    if (allActive.length > 0) {
      renderFromCache();
    }
  });

  function renderFromCache() {
    const listEl = container.querySelector('#todo-list');
    const moreEl = container.querySelector('#todo-more');
    const moreLabel = container.querySelector('#more-label');
    listEl.innerHTML = '';

    const visible = allActive.slice(windowOffset, windowOffset + WINDOW_SIZE);
    const remaining = allActive.length - windowOffset - visible.length;

    visible.forEach(task => {
      const el = document.createElement('div');
      el.className = 'task-item';
      el.draggable = true;
      el.dataset.id = task.id;
      const isThisWeek = task.weekSlot?.weekId === currentWeek;
      const isOverdue = task.weekSlot && task.weekSlot.weekId < currentWeek;
      el.innerHTML = `
        <div class="drag-handle">⠿</div>
        <div class="task-check" data-tid="${task.id}"></div>
        <div style="flex:1;min-width:0;">
          <div class="task-text">${escHtml(task.text)}</div>
          <div class="task-meta">
            ${task.quadrant === 'do' ? `<span class="badge badge-teal">Priority</span>` : ''}
            ${isThisWeek ? `<span class="badge badge-blue">This week</span>` : ''}
            ${isOverdue ? `<span class="badge badge-coral">Overdue</span>` : ''}
          </div>
        </div>`;
      el.querySelector('.task-check').addEventListener('click', async () => {
        await updateTask(pid, task.id, { status: 'complete' });
        toast('Done! ✓', 'success');
      });
      listEl.appendChild(el);
    });

    makeSortable(listEl, async (visibleIds) => {
      const newOrder = [...visibleIds, ...allActive.filter(t => !visibleIds.includes(t.id)).map(t => t.id)];
      await reorderTasks(pid, newOrder);
    });

    if (remaining > 0 || windowOffset > 0) {
      moreEl.style.display = 'flex';
      moreLabel.textContent = remaining > 0 ? `${remaining} more task${remaining !== 1 ? 's' : ''}` : '';
      container.querySelector('#show-more').textContent = windowOffset > 0 ? '← Back' : `Show next ${Math.min(remaining, WINDOW_SIZE)}`;
    } else {
      moreEl.style.display = 'none';
    }
  }

  // Smart sort reset
  container.querySelector('#smart-sort-btn').addEventListener('click', async () => {
    windowOffset = 0;
    renderFromCache();
    toast('Sorted by priority');
  });

  // Toggle done list
  container.querySelector('#toggle-done').addEventListener('click', () => {
    const doneList = container.querySelector('#done-list');
    const btn = container.querySelector('#toggle-done');
    const hidden = doneList.classList.toggle('hidden');
    btn.textContent = hidden ? 'Show' : 'Hide';
  });

  // Coaching question — only show if tasks exist
  unsubscribe = onTasks(pid, tasks => {
    render(tasks);

    const coachingArea = container.querySelector('#todo-coaching');
    if (coachingArea.children.length === 0 && tasks.filter(t => t.status === 'active').length > 0) {
      const ctx = coachingContext({
        taskCount: tasks.filter(t => t.status === 'active').length,
        isFreetime,
        hasTeamComponent: hasTeam,
        isReviewing: false,
      });
      renderCoachingCard(ctx, coachingArea);
    }
  });

  container._cleanup = () => unsubscribe?.();
}

function escHtml(str = '') {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
