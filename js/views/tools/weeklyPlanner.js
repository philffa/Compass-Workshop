// js/views/tools/weeklyPlanner.js

import {
  onTasks, getWeekPlan, saveWeekPlan, getFixedBlocks,
  assignTaskToSlot, removeTaskFromSlot, updateTask,
  weekId, nextWeekId, prevWeekId, formatWeekLabel, weekDates
} from '../../firebase.js';
import { makeSlotDroppable, toast } from '../../ui.js';

const DAYS = ['Mon','Tue','Wed','Thu','Fri'];
const SLOTS = [
  { id: 'morning',   label: 'Morning'     },
  { id: 'lunch',     label: 'Lunchtime'   },
  { id: 'afternoon', label: 'After school' },
  { id: 'evening',   label: 'Evening'     },
];

export async function renderWeeklyPlanner(container, { pid, currentWeek }) {
  let activeWeek = currentWeek;
  let unsubscribe;

  function buildShell() {
    container.innerHTML = `
      <div class="print-section">
        <div class="row-between" style="margin-bottom:1rem;">
          <div>
            <h2>Week plan</h2>
            <p>Drag tasks from the list on the right into your week.</p>
          </div>
        </div>

        <div class="week-nav no-print">
          <button class="btn btn-ghost btn-sm" id="prev-week">←</button>
          <span class="week-label" id="week-label"></span>
          <span class="week-badge" id="week-badge" style="display:none;">This week</span>
          <button class="btn btn-ghost btn-sm" id="next-week">→</button>
        </div>

        <div style="display:grid;grid-template-columns:1fr 220px;gap:1rem;align-items:start;" id="planner-layout">
          <div>
            <div class="scroll-x">
              <div class="week-grid" id="planner-grid"></div>
            </div>
            <div style="margin-top:0.75rem;">
              <textarea id="week-notes" placeholder="Any notes for this week…" rows="2"
                style="width:100%;font-size:0.85rem;"></textarea>
            </div>
          </div>
          <div>
            <div class="text-xs text-muted fw-500" style="text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px;">
              Tasks to assign
            </div>
            <div id="unassigned-tasks" class="stack"></div>
            <div id="unassigned-empty" class="text-xs text-muted" style="display:none;padding:8px 0;">
              All tasks are assigned this week.
            </div>
          </div>
        </div>
      </div>
    `;

    container.querySelector('#prev-week').addEventListener('click', () => {
      activeWeek = prevWeekId(activeWeek);
      loadWeek();
    });
    container.querySelector('#next-week').addEventListener('click', () => {
      activeWeek = nextWeekId(activeWeek);
      loadWeek();
    });

    // Notes autosave
    let notesTimer;
    container.querySelector('#week-notes').addEventListener('input', e => {
      clearTimeout(notesTimer);
      notesTimer = setTimeout(async () => {
        const plan = await getWeekPlan(pid, activeWeek);
        await saveWeekPlan(pid, activeWeek, { ...plan, notes: e.target.value });
      }, 800);
    });
  }

  async function loadWeek() {
    // Update week label
    container.querySelector('#week-label').textContent = formatWeekLabel(activeWeek);
    const isCurrentWeek = activeWeek === currentWeek;
    const badge = container.querySelector('#week-badge');
    badge.style.display = isCurrentWeek ? 'inline-flex' : 'none';

    const [plan, fixedBlocks] = await Promise.all([
      getWeekPlan(pid, activeWeek),
      getFixedBlocks(pid)
    ]);

    // Load notes
    container.querySelector('#week-notes').value = plan.notes ?? '';

    // Build grid
    buildGrid(fixedBlocks);

    // Subscribe to tasks
    unsubscribe?.();
    unsubscribe = onTasks(pid, tasks => {
      populateGrid(tasks, fixedBlocks);
      populateUnassigned(tasks);
    });
  }

  function buildGrid(fixedBlocks) {
    const grid = container.querySelector('#planner-grid');
    grid.innerHTML = '';

    // Header
    const corner = document.createElement('div');
    corner.className = 'wg-cell header';
    grid.appendChild(corner);
    DAYS.forEach(d => {
      const h = document.createElement('div');
      h.className = 'wg-cell header';
      h.textContent = d;
      grid.appendChild(h);
    });

    // Rows
    SLOTS.forEach(slot => {
      const label = document.createElement('div');
      label.className = 'wg-cell time-label';
      label.textContent = slot.label;
      grid.appendChild(label);

      DAYS.forEach(day => {
        const key = `${day}-${slot.id}`;
        const fixed = fixedBlocks[key];
        const cell = document.createElement('div');
        cell.dataset.key = key;
        cell.dataset.day = day;
        cell.dataset.slot = slot.id;

        if (fixed) {
          cell.className = 'wg-cell fixed';
          cell.textContent = fixed;
        } else {
          cell.className = 'wg-cell drop-zone';
          // Make droppable
          makeSlotDroppable(cell, day, slot.id, async (taskId, d, s) => {
            await assignTaskToSlot(pid, taskId, activeWeek, d, s);
            toast('Task added to plan');
          });
        }
        grid.appendChild(cell);
      });
    });
  }

  function populateGrid(tasks, fixedBlocks) {
    const grid = container.querySelector('#planner-grid');

    // Clear task chips from drop zones
    grid.querySelectorAll('.drop-zone').forEach(cell => {
      cell.querySelectorAll('.slot-task').forEach(t => t.remove());
    });

    // Place tasks assigned to this week
    tasks
      .filter(t => t.weekSlot?.weekId === activeWeek)
      .forEach(task => {
        const key = `${task.weekSlot.day}-${task.weekSlot.slot}`;
        const cell = grid.querySelector(`[data-key="${key}"].drop-zone`);
        if (!cell) return;

        const chip = document.createElement('div');
        chip.className = `slot-task${task.status === 'complete' ? ' completed' : ''}`;
        chip.draggable = true;
        chip.dataset.id = task.id;
        chip.innerHTML = `
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(task.text)}</span>
          <span class="remove-slot" title="Remove from this slot">✕</span>
        `;
        chip.addEventListener('dragstart', e => {
          e.dataTransfer.setData('text/plain', task.id);
          e.dataTransfer.effectAllowed = 'move';
        });
        chip.querySelector('.remove-slot').addEventListener('click', async e => {
          e.stopPropagation();
          await removeTaskFromSlot(pid, task.id);
        });
        // Toggle complete on click
        chip.addEventListener('click', async e => {
          if (e.target.classList.contains('remove-slot')) return;
          await updateTask(pid, task.id, {
            status: task.status === 'complete' ? 'active' : 'complete'
          });
        });
        cell.appendChild(chip);
      });
  }

  function populateUnassigned(tasks) {
    const panel = container.querySelector('#unassigned-tasks');
    const empty = container.querySelector('#unassigned-empty');
    panel.innerHTML = '';

    const unassigned = tasks.filter(t =>
      t.status === 'active' &&
      (!t.weekSlot || t.weekSlot.weekId !== activeWeek)
    );

    if (unassigned.length === 0) {
      empty.style.display = 'block';
    } else {
      empty.style.display = 'none';
      unassigned.forEach(task => {
        const chip = document.createElement('div');
        chip.className = 'task-item';
        chip.draggable = true;
        chip.dataset.id = task.id;
        chip.style.cssText = 'padding:7px 10px;cursor:grab;font-size:0.82rem;';
        chip.innerHTML = `
          ${task.quadrant === 'do'
            ? `<span style="width:6px;height:6px;background:var(--teal);border-radius:50%;flex-shrink:0;margin-top:5px;"></span>`
            : `<span style="width:6px;height:6px;background:var(--gray-200);border-radius:50%;flex-shrink:0;margin-top:5px;"></span>`}
          <span class="task-text" style="font-size:0.82rem;">${escHtml(task.text)}</span>
          ${task.tags?.length ? `<span class="badge badge-teal" style="flex-shrink:0;">${task.tags[0]}</span>` : ''}
        `;
        chip.addEventListener('dragstart', e => {
          e.dataTransfer.setData('text/plain', task.id);
          e.dataTransfer.effectAllowed = 'move';
          chip.style.opacity = '0.4';
        });
        chip.addEventListener('dragend', () => { chip.style.opacity = '1'; });
        panel.appendChild(chip);
      });
    }
  }

  buildShell();
  await loadWeek();

  container._cleanup = () => unsubscribe?.();
}

function escHtml(str = '') {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
