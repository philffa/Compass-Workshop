// js/views/tools/weeklyPlanner.js — slot view + hourly view, weekends, multi-slot tasks

import {
  onTasks, getWeekPlan, saveWeekPlan, getFixedBlocks,
  addTaskToSlot, removeTaskFromSlot, updateTask,
  weekId, nextWeekId, prevWeekId, formatWeekLabel, weekDates, todayDayLabel
} from '../../firebase.js';
import { makeSlotDroppable, toast } from '../../ui.js';

const SLOT_DEFS = [
  { id: 'morning',   label: 'Morning'      },
  { id: 'lunch',     label: 'Lunchtime'    },
  { id: 'afternoon', label: 'After school' },
  { id: 'evening',   label: 'Evening'      },
];

// 5am–10pm hourly slots
const HOURS = Array.from({ length: 18 }, (_, i) => {
  const h = i + 5;
  const label = h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`;
  const period = h < 12 ? 'am' : 'pm';
  return { id: `h${String(h).padStart(2,'0')}`, label, h, period };
});

export async function renderWeeklyPlanner(container, { pid, project, currentWeek, shared = false }) {
  let activeWeek = currentWeek;
  let viewMode = project.plannerView ?? 'slots'; // 'slots' | 'hourly'
  const showWeekend = project.showWeekend ?? false;
  const days = showWeekend
    ? ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
    : ['Mon','Tue','Wed','Thu','Fri'];
  let activeDay = todayDayLabel(showWeekend);
  let unsubscribe;

  function buildShell() {
    container.innerHTML = `
      <div class="print-section">
        <div class="row-between" style="margin-bottom:1rem;">
          <div>
            <h2>Week plan</h2>
            <p>Drag tasks from the list on the right into your week.</p>
          </div>
          ${project.plannerView === 'hourly' ? `
            <div style="display:flex;gap:4px;" class="no-print">
              <button class="btn btn-sm ${viewMode==='slots'?'btn-primary':'btn-secondary'}" id="view-slots">Slots</button>
              <button class="btn btn-sm ${viewMode==='hourly'?'btn-primary':'btn-secondary'}" id="view-hourly">Hourly</button>
            </div>` : ''}
        </div>

        <div class="week-nav no-print">
          <button class="btn btn-ghost btn-sm" id="prev-week">←</button>
          <span class="week-label" id="week-label"></span>
          <span class="week-badge" id="week-badge" style="display:none;">This week</span>
          <button class="btn btn-ghost btn-sm" id="next-week">→</button>
        </div>

        <div style="display:grid;grid-template-columns:1fr 200px;gap:1rem;align-items:start;" id="planner-layout">
          <div>
            <div id="planner-grid-wrap"></div>
            <textarea id="week-notes" placeholder="Any notes for this week…" rows="2"
              style="width:100%;font-size:0.85rem;margin-top:0.75rem;"></textarea>
          </div>
          <div class="no-print">
            <div class="text-xs text-muted fw-500" style="text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px;">Tasks to assign</div>
            <div id="unassigned-tasks" class="stack"></div>
            <div id="unassigned-empty" class="text-xs text-muted" style="display:none;padding:8px 0;">All tasks assigned.</div>
          </div>
        </div>
      </div>
    `;

    // View toggle
    container.querySelector('#view-slots')?.addEventListener('click', () => { viewMode = 'slots'; rebuildGrid(); refreshViewButtons(); });
    container.querySelector('#view-hourly')?.addEventListener('click', () => { viewMode = 'hourly'; rebuildGrid(); refreshViewButtons(); });

    function refreshViewButtons() {
      container.querySelector('#view-slots')?.classList.toggle('btn-primary', viewMode === 'slots');
      container.querySelector('#view-slots')?.classList.toggle('btn-secondary', viewMode !== 'slots');
      container.querySelector('#view-hourly')?.classList.toggle('btn-primary', viewMode === 'hourly');
      container.querySelector('#view-hourly')?.classList.toggle('btn-secondary', viewMode !== 'hourly');
    }

    container.querySelector('#prev-week').addEventListener('click', () => { activeWeek = prevWeekId(activeWeek); loadWeek(); });
    container.querySelector('#next-week').addEventListener('click', () => { activeWeek = nextWeekId(activeWeek); loadWeek(); });

    let notesTimer;
    container.querySelector('#week-notes').addEventListener('input', e => {
      clearTimeout(notesTimer);
      notesTimer = setTimeout(async () => {
        const plan = await getWeekPlan(pid, activeWeek, shared);
        await saveWeekPlan(pid, activeWeek, { ...plan, notes: e.target.value }, shared);
      }, 800);
    });
  }

  function buildDayPicker() {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;gap:4px;margin-bottom:10px;flex-wrap:wrap;';
    days.forEach(day => {
      const btn = document.createElement('button');
      btn.className = `btn btn-sm ${day === activeDay ? 'btn-primary' : 'btn-secondary'}`;
      btn.textContent = day;
      btn.dataset.day = day;
      btn.addEventListener('click', () => {
        activeDay = day;
        wrap.querySelectorAll('button').forEach(b => {
          b.className = `btn btn-sm ${b.dataset.day === activeDay ? 'btn-primary' : 'btn-secondary'}`;
        });
        rebuildGrid();
      });
      wrap.appendChild(btn);
    });
    return wrap;
  }

  function buildSlotGrid(tasks, fixedBlocks) {
    const grid = document.createElement('div');
    grid.className = 'week-grid scroll-x';
    grid.style.gridTemplateColumns = `80px repeat(${days.length}, 1fr)`;

    // Header
    const corner = document.createElement('div'); corner.className = 'wg-cell header'; grid.appendChild(corner);
    days.forEach(d => { const h = document.createElement('div'); h.className = 'wg-cell header'; h.textContent = d; grid.appendChild(h); });

    SLOT_DEFS.forEach(slot => {
      const label = document.createElement('div'); label.className = 'wg-cell time-label'; label.textContent = slot.label; grid.appendChild(label);
      days.forEach(day => {
        const key = `${day}-${slot.id}`;
        const fixed = fixedBlocks[key];
        const cell = document.createElement('div');
        cell.dataset.key = key; cell.dataset.day = day; cell.dataset.slot = slot.id;
        if (fixed) { cell.className = 'wg-cell fixed'; cell.textContent = fixed; }
        else {
          cell.className = 'wg-cell drop-zone';
          makeSlotDroppable(cell, day, slot.id, async (taskId, d, s) => {
            await addTaskToSlot(pid, taskId, activeWeek, d, s, shared);
            toast('Task added to plan');
          });
        }
        // Place assigned tasks
        tasks.filter(t => t.status === 'active' && (t.weekSlots ?? []).some(s => s.weekId === activeWeek && s.day === day && s.slot === slot.id))
          .forEach(task => cell.appendChild(makeSlotChip(task, day, slot.id)));
        grid.appendChild(cell);
      });
    });
    return grid;
  }

  function buildHourlyGrid(tasks, fixedBlocks) {
    const wrap = document.createElement('div');
    wrap.appendChild(buildDayPicker());

    // AM / PM sections
    ['am','pm'].forEach(period => {
      const hours = HOURS.filter(h => h.period === period);
      const sectionLabel = document.createElement('div');
      sectionLabel.style.cssText = 'font-size:0.72rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin:8px 0 4px;';
      sectionLabel.textContent = period === 'am' ? 'Morning' : 'Afternoon & evening';
      wrap.appendChild(sectionLabel);

      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:44px 1fr;gap:1px;background:var(--border);border-radius:var(--radius-md);overflow:hidden;border:1px solid var(--border);';

      hours.forEach(hour => {
        const timeLabel = document.createElement('div');
        timeLabel.className = 'wg-cell time-label';
        timeLabel.style.cssText = 'font-size:0.7rem;min-height:44px;justify-content:flex-end;padding-right:6px;';
        timeLabel.textContent = hour.label;
        grid.appendChild(timeLabel);

        const key = `${activeDay}-${hour.id}`;
        const fixed = fixedBlocks[key];
        const cell = document.createElement('div');
        cell.dataset.day = activeDay; cell.dataset.slot = hour.id;
        if (fixed) { cell.className = 'wg-cell fixed'; cell.style.minHeight = '44px'; cell.textContent = fixed; }
        else {
          cell.className = 'wg-cell drop-zone'; cell.style.minHeight = '44px';
          makeSlotDroppable(cell, activeDay, hour.id, async (taskId, d, s) => {
            await addTaskToSlot(pid, taskId, activeWeek, d, s, shared);
            toast('Task added');
          });
          tasks.filter(t => t.status === 'active' && (t.weekSlots ?? []).some(s => s.weekId === activeWeek && s.day === activeDay && s.slot === hour.id))
            .forEach(task => cell.appendChild(makeSlotChip(task, activeDay, hour.id)));
        }
        grid.appendChild(cell);
      });
      wrap.appendChild(grid);
    });
    return wrap;
  }

  function makeSlotChip(task, day, slot) {
    const chip = document.createElement('div');
    chip.className = `slot-task${task.status === 'complete' ? ' completed' : ''}`;
    chip.draggable = true;
    chip.innerHTML = `<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(task.text)}</span><span class="remove-slot" title="Remove">✕</span>`;
    chip.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', task.id); e.dataTransfer.effectAllowed = 'move'; });
    chip.querySelector('.remove-slot').addEventListener('click', async e => {
      e.stopPropagation();
      await removeTaskFromSlot(pid, task.id, activeWeek, day, slot, shared);
    });
    chip.addEventListener('click', async e => {
      if (e.target.classList.contains('remove-slot')) return;
      await updateTask(pid, task.id, { status: task.status === 'complete' ? 'active' : 'complete' }, shared);
    });
    return chip;
  }

  let cachedTasks = [], cachedFixed = {};

  function rebuildGrid() {
    const wrap = container.querySelector('#planner-grid-wrap');
    if (!wrap) return;
    wrap.innerHTML = '';
    wrap.appendChild(
      viewMode === 'hourly'
        ? buildHourlyGrid(cachedTasks, cachedFixed)
        : buildSlotGrid(cachedTasks, cachedFixed)
    );
  }

  function populateUnassigned(tasks) {
    const panel = container.querySelector('#unassigned-tasks');
    const empty = container.querySelector('#unassigned-empty');
    if (!panel) return;
    panel.innerHTML = '';
    const unassigned = tasks.filter(t => t.status === 'active');
    if (unassigned.length === 0) { empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    unassigned.forEach(task => {
      const chip = document.createElement('div');
      chip.className = 'task-item'; chip.draggable = true; chip.dataset.id = task.id;
      chip.style.cssText = 'padding:7px 10px;cursor:grab;font-size:0.82rem;';
      const slotCount = (task.weekSlots ?? []).filter(s => s.weekId === activeWeek).length;
      chip.innerHTML = `
        ${task.quadrant === 'do' ? `<span style="width:6px;height:6px;background:var(--teal);border-radius:50%;flex-shrink:0;margin-top:5px;"></span>` : `<span style="width:6px;height:6px;background:var(--gray-200);border-radius:50%;flex-shrink:0;margin-top:5px;"></span>`}
        <span class="task-text" style="font-size:0.82rem;">${esc(task.text)}</span>
        ${slotCount > 0 ? `<span class="badge badge-teal" style="flex-shrink:0;">${slotCount}×</span>` : ''}
        ${task.tags?.length ? `<span class="badge badge-gray" style="flex-shrink:0;">${task.tags[0]}</span>` : ''}
      `;
      chip.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', task.id); e.dataTransfer.effectAllowed = 'move'; chip.style.opacity = '0.4'; });
      chip.addEventListener('dragend', () => { chip.style.opacity = '1'; });
      panel.appendChild(chip);
    });
  }

  async function loadWeek() {
    const label = container.querySelector('#week-label');
    const badge = container.querySelector('#week-badge');
    if (label) label.textContent = formatWeekLabel(activeWeek);
    if (badge) badge.style.display = activeWeek === currentWeek ? 'inline-flex' : 'none';

    const [plan, fixedBlocks] = await Promise.all([
      getWeekPlan(pid, activeWeek, shared),
      getFixedBlocks(pid, shared),
    ]);
    cachedFixed = fixedBlocks;
    const notesEl = container.querySelector('#week-notes');
    if (notesEl) notesEl.value = plan.notes ?? '';

    unsubscribe?.();
    unsubscribe = onTasks(pid, shared, tasks => {
      cachedTasks = tasks.filter(t => t.status !== 'deleted');
      rebuildGrid();
      populateUnassigned(cachedTasks);
    });
  }

  buildShell();
  await loadWeek();
  container._cleanup = () => unsubscribe?.();
}

function esc(str = '') { return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
