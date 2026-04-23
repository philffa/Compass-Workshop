// js/views/tools/eisenhower.js

import { onTasks, updateTask } from '../../firebase.js';
import { makeQuadrantDroppable, toast } from '../../ui.js';

const QUADRANTS = [
  { id: 'do',       label: 'Do it now',   sub: 'Important + needs doing this week', cls: 'q-do'       },
  { id: 'plan',     label: 'Plan it',     sub: 'Important but not urgent yet',       cls: 'q-plan'     },
  { id: 'delegate', label: 'Pass it on',  sub: "Someone else's job, or not yours",   cls: 'q-delegate' },
  { id: 'drop',     label: "Let it go",   sub: "Not important, not urgent — ditch",  cls: 'q-drop'     },
];

export function renderEisenhower(container, { pid }) {
  container.innerHTML = `
    <div class="print-section">
      <div style="margin-bottom:1rem;">
        <h2>Priority sort</h2>
        <p>Drag tasks into the right box. Tasks in <strong>Do it now</strong> show up in your to-do list.</p>
      </div>

      <div id="unsorted-bar" class="card" style="margin-bottom:1rem;">
        <div class="text-xs text-muted fw-500" style="margin-bottom:8px;text-transform:uppercase;letter-spacing:.04em;">Not sorted yet</div>
        <div id="unsorted-tasks" class="row" style="flex-wrap:wrap;gap:6px;min-height:32px;"></div>
        <div id="unsorted-empty" class="text-xs text-muted" style="display:none;">All tasks sorted — nice.</div>
      </div>

      <div class="eisenhower-grid" id="matrix"></div>
    </div>
  `;

  const matrixEl = container.querySelector('#matrix');

  // Build quadrant elements
  const quadrantEls = {};
  QUADRANTS.forEach(q => {
    const el = document.createElement('div');
    el.className = `quadrant ${q.cls}`;
    el.innerHTML = `
      <div class="quadrant-label">${q.label}</div>
      <div class="text-xs text-muted" style="margin-bottom:8px;">${q.sub}</div>
      <div class="quadrant-drop-zone" data-q="${q.id}"></div>
    `;
    matrixEl.appendChild(el);
    quadrantEls[q.id] = el.querySelector('.quadrant-drop-zone');

    makeQuadrantDroppable(el, q.id, async (taskId, quadrant) => {
      await updateTask(pid, taskId, { quadrant });
      toast(`Moved to "${q.label}"`, 'default');
    });
  });

  // Unsorted drop zone — drop back to null
  const unsortedEl = container.querySelector('#unsorted-tasks');
  makeQuadrantDroppable(
    container.querySelector('#unsorted-bar'),
    null,
    async (taskId) => {
      await updateTask(pid, taskId, { quadrant: null });
    }
  );

  let unsubscribe = onTasks(pid, tasks => {
    const active = tasks.filter(t => t.status !== 'complete' && t.status !== 'archived');

    // Unsorted
    const unsorted = active.filter(t => !t.quadrant);
    unsortedEl.innerHTML = '';
    const emptyMsg = container.querySelector('#unsorted-empty');
    if (unsorted.length === 0) {
      emptyMsg.style.display = 'block';
    } else {
      emptyMsg.style.display = 'none';
      unsorted.forEach(t => {
        unsortedEl.appendChild(makeChip(t));
      });
    }

    // Quadrants
    QUADRANTS.forEach(q => {
      const zone = quadrantEls[q.id];
      zone.innerHTML = '';
      const inQ = active.filter(t => t.quadrant === q.id);
      if (inQ.length === 0) {
        zone.innerHTML = `<div class="text-xs text-muted" style="padding:8px 0;">Drop tasks here</div>`;
      } else {
        inQ.forEach(t => zone.appendChild(makeChip(t)));
      }
    });
  });

  container._cleanup = () => unsubscribe?.();
}

function makeChip(task) {
  const chip = document.createElement('div');
  chip.className = 'task-item';
  chip.draggable = true;
  chip.dataset.id = task.id;
  chip.style.cssText = 'padding:6px 10px;margin-bottom:4px;cursor:grab;';
  chip.innerHTML = `<div class="task-text" style="font-size:0.85rem;">${escHtml(task.text)}</div>`;
  chip.addEventListener('dragstart', e => {
    e.dataTransfer.setData('text/plain', task.id);
    e.dataTransfer.effectAllowed = 'move';
    chip.style.opacity = '0.4';
  });
  chip.addEventListener('dragend', () => {
    chip.style.opacity = '1';
  });
  return chip;
}

function escHtml(str = '') {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
