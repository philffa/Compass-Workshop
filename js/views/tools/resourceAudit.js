// js/views/tools/resourceAudit.js

import { getFixedBlocks, saveFixedBlocks } from '../../firebase.js';
import { toast } from '../../ui.js';

const DAYS = ['Mon','Tue','Wed','Thu','Fri'];
const SLOTS = [
  { id: 'morning',   label: 'Morning'    },
  { id: 'lunch',     label: 'Lunchtime'  },
  { id: 'afternoon', label: 'After school'},
  { id: 'evening',   label: 'Evening'    },
];

export async function renderResourceAudit(container, { pid }) {
  container.innerHTML = `
    <div class="print-section">
      <div style="margin-bottom:1rem;">
        <h2>My week</h2>
        <p>Block out everything that's already fixed — then you can see what's actually free for your project.</p>
      </div>
      <div class="card" style="margin-bottom:1rem;padding:0.75rem 1rem;">
        <p style="font-size:0.82rem;margin:0;">Double-click any cell to add or edit a fixed commitment. Leave it blank if it's free. The white cells are your project time.</p>
      </div>
      <div class="scroll-x">
        <div class="week-grid" id="audit-grid"></div>
      </div>
      <div id="free-count" style="margin-top:0.75rem;" class="text-sm text-muted"></div>
      <div style="margin-top:1rem;">
        <button class="btn btn-primary" id="save-audit">Save my week</button>
        <button class="btn btn-secondary" id="clear-audit" style="margin-left:6px;">Clear all</button>
      </div>
    </div>
  `;

  const blocks = await getFixedBlocks(pid);
  const grid = container.querySelector('#audit-grid');

  // Build grid
  // Header row
  const corner = document.createElement('div');
  corner.className = 'wg-cell header';
  grid.appendChild(corner);
  DAYS.forEach(d => {
    const h = document.createElement('div');
    h.className = 'wg-cell header';
    h.textContent = d;
    grid.appendChild(h);
  });

  // Data rows
  SLOTS.forEach(slot => {
    const label = document.createElement('div');
    label.className = 'wg-cell time-label';
    label.textContent = slot.label;
    grid.appendChild(label);

    DAYS.forEach(day => {
      const key = `${day}-${slot.id}`;
      const cell = document.createElement('div');
      cell.className = 'wg-cell';
      cell.dataset.key = key;

      const value = blocks[key] ?? '';
      if (value) {
        cell.classList.add('fixed');
        cell.textContent = value;
      }

      // Double-click to edit
      cell.addEventListener('dblclick', () => {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = cell.textContent;
        input.placeholder = 'e.g. Basketball';
        input.style.cssText = 'width:100%;border:none;background:transparent;font-size:0.8rem;font-family:inherit;outline:none;padding:0;';
        cell.innerHTML = '';
        cell.appendChild(input);
        input.focus();
        input.select();

        function commit() {
          const val = input.value.trim();
          blocks[key] = val;
          cell.innerHTML = '';
          if (val) {
            cell.classList.add('fixed');
            cell.textContent = val;
          } else {
            cell.classList.remove('fixed');
          }
          updateFreeCount();
        }
        input.addEventListener('blur', commit);
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter') input.blur();
          if (e.key === 'Escape') { input.value = ''; input.blur(); }
        });
      });

      grid.appendChild(cell);
    });
  });

  function updateFreeCount() {
    const totalCells = DAYS.length * SLOTS.length;
    const fixedCount = Object.values(blocks).filter(v => v).length;
    const freeCount = totalCells - fixedCount;
    container.querySelector('#free-count').textContent =
      `${freeCount} free slots this week — that's your project time.`;
  }
  updateFreeCount();

  container.querySelector('#save-audit').addEventListener('click', async () => {
    // Sync from grid cells
    grid.querySelectorAll('.wg-cell[data-key]').forEach(cell => {
      const key = cell.dataset.key;
      blocks[key] = cell.textContent.trim();
    });
    await saveFixedBlocks(pid, blocks);
    toast('Week saved', 'success');
  });

  container.querySelector('#clear-audit').addEventListener('click', async () => {
    grid.querySelectorAll('.wg-cell[data-key]').forEach(cell => {
      cell.classList.remove('fixed');
      cell.innerHTML = '';
      blocks[cell.dataset.key] = '';
    });
    await saveFixedBlocks(pid, {});
    updateFreeCount();
    toast('Cleared');
  });
}
