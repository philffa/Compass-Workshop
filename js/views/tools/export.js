// js/views/tools/export.js

import {
  getProject, onTasks, getWeekPlan, getFixedBlocks, getReview,
  weekId, prevWeekId, formatWeekLabel, weekDates
} from '../../firebase.js';

const DAYS = ['Mon','Tue','Wed','Thu','Fri'];
const SLOTS = [
  { id: 'morning',   label: 'Morning'      },
  { id: 'lunch',     label: 'Lunchtime'    },
  { id: 'afternoon', label: 'After school' },
  { id: 'evening',   label: 'Evening'      },
];

export async function renderExport(container, { pid, project, currentWeek }) {
  container.innerHTML = `
    <div style="max-width:500px;">
      <h2 style="margin-bottom:0.25rem;">Save / Print</h2>
      <p style="margin-bottom:1.25rem;">Pick what to include, then print or save as PDF.</p>

      <div class="card" style="margin-bottom:1rem;">
        <div style="font-size:0.8rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);margin-bottom:10px;">
          Include in export
        </div>
        <div class="stack" id="export-options">
          <label class="row" style="gap:10px;cursor:pointer;padding:4px 0;">
            <input type="checkbox" id="ex-tasks" checked style="accent-color:var(--teal);width:16px;height:16px;" />
            <span style="font-size:0.9rem;">Task list (all active tasks)</span>
          </label>
          <label class="row" style="gap:10px;cursor:pointer;padding:4px 0;">
            <input type="checkbox" id="ex-matrix" checked style="accent-color:var(--teal);width:16px;height:16px;" />
            <span style="font-size:0.9rem;">Priority sort (Eisenhower)</span>
          </label>
          <label class="row" style="gap:10px;cursor:pointer;padding:4px 0;">
            <input type="checkbox" id="ex-audit" style="accent-color:var(--teal);width:16px;height:16px;" />
            <span style="font-size:0.9rem;">My week (fixed blocks)</span>
          </label>
          <label class="row" style="gap:10px;cursor:pointer;padding:4px 0;">
            <input type="checkbox" id="ex-planner" checked style="accent-color:var(--teal);width:16px;height:16px;" />
            <span style="font-size:0.9rem;">Week plan (current week)</span>
          </label>
          <label class="row" style="gap:10px;cursor:pointer;padding:4px 0;">
            <input type="checkbox" id="ex-review" style="accent-color:var(--teal);width:16px;height:16px;" />
            <span style="font-size:0.9rem;">Last week's review</span>
          </label>
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:2rem;">
        <button class="btn btn-primary" id="generate-btn">Generate PDF</button>
      </div>

      <div id="preview-area" style="display:none;"></div>
    </div>
  `;

  container.querySelector('#generate-btn').addEventListener('click', async () => {
    const btn = container.querySelector('#generate-btn');
    btn.textContent = 'Building…';
    btn.disabled = true;

    try {
      const include = {
        tasks:   container.querySelector('#ex-tasks').checked,
        matrix:  container.querySelector('#ex-matrix').checked,
        audit:   container.querySelector('#ex-audit').checked,
        planner: container.querySelector('#ex-planner').checked,
        review:  container.querySelector('#ex-review').checked,
      };

      await generatePDF(pid, project, currentWeek, include);
    } finally {
      btn.textContent = 'Generate PDF';
      btn.disabled = false;
    }
  });
}

async function generatePDF(pid, project, currentWeek, include) {
  // Load all data in parallel
  const [tasks, weekPlan, fixedBlocks, prevReview] = await Promise.all([
    new Promise(resolve => {
      const { onTasks } = await import('../../firebase.js').catch(() => ({}));
      // Use a one-shot snapshot via getDocs
      import('../../firebase.js').then(({ db, auth }) => {
        import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js').then(
          ({ getDocs, collection, query, orderBy }) => {
            getDocs(query(
              collection(db, 'users', auth.currentUser.uid, 'projects', pid, 'tasks'),
              orderBy('sortOrder')
            )).then(snap => resolve(snap.docs.map(d => d.data())));
          }
        );
      });
    }),
    import('../../firebase.js').then(m => m.getWeekPlan(pid, currentWeek)),
    import('../../firebase.js').then(m => m.getFixedBlocks(pid)),
    import('../../firebase.js').then(m => m.getReview(pid, prevWeekId(currentWeek))),
  ]);

  const activeTasks = tasks.filter(t => t.status === 'active');
  const completedTasks = tasks.filter(t => t.status === 'complete');

  const printWindow = window.open('', '_blank');
  if (!printWindow) { alert('Allow pop-ups to generate PDF'); return; }

  const html = buildPrintHTML(project, currentWeek, activeTasks, completedTasks, weekPlan, fixedBlocks, prevReview, include);
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };
}

function buildPrintHTML(project, currentWeek, activeTasks, completedTasks, weekPlan, fixedBlocks, review, include) {
  const sections = [];

  const header = `
    <div class="print-header">
      <div class="print-title">${escHtml(project.name)}</div>
      <div class="print-meta">Planwise · ${formatWeekLabel(currentWeek)}</div>
    </div>
  `;

  if (include.tasks) {
    const byQuadrant = (q) => activeTasks.filter(t => t.quadrant === q);
    const unassigned = activeTasks.filter(t => !t.quadrant);
    sections.push(`
      <div class="section">
        <h2>Task list</h2>
        <table>
          <thead><tr><th>Task</th><th>Priority</th><th>Tags</th></tr></thead>
          <tbody>
            ${activeTasks.map(t => `
              <tr>
                <td>${escHtml(t.text)}</td>
                <td>${quadrantLabel(t.quadrant)}</td>
                <td>${(t.tags ?? []).join(', ')}</td>
              </tr>`).join('')}
          </tbody>
        </table>
        ${completedTasks.length > 0 ? `
          <p style="margin-top:12px;font-size:11px;color:#888;">Completed (${completedTasks.length}): ${completedTasks.map(t => escHtml(t.text)).join(' · ')}</p>
        ` : ''}
      </div>
    `);
  }

  if (include.matrix) {
    const quadrants = [
      { id: 'do',       label: 'Do it now'  },
      { id: 'plan',     label: 'Plan it'    },
      { id: 'delegate', label: 'Pass it on' },
      { id: 'drop',     label: 'Let it go'  },
    ];
    sections.push(`
      <div class="section">
        <h2>Priority sort</h2>
        <div class="matrix-grid">
          ${quadrants.map(q => {
            const qTasks = activeTasks.filter(t => t.quadrant === q.id);
            return `
              <div class="matrix-cell">
                <div class="matrix-label">${q.label}</div>
                ${qTasks.length === 0
                  ? '<div class="empty-q">—</div>'
                  : qTasks.map(t => `<div class="task-row">${escHtml(t.text)}</div>`).join('')}
              </div>`;
          }).join('')}
        </div>
      </div>
    `);
  }

  if (include.audit) {
    sections.push(`
      <div class="section">
        <h2>My week — fixed commitments</h2>
        <table class="grid-table">
          <thead>
            <tr><th></th>${DAYS.map(d => `<th>${d}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${SLOTS.map(slot => `
              <tr>
                <td class="time-cell">${slot.label}</td>
                ${DAYS.map(day => {
                  const key = `${day}-${slot.id}`;
                  const val = fixedBlocks[key] ?? '';
                  return `<td class="${val ? 'fixed-cell' : ''}">${escHtml(val)}</td>`;
                }).join('')}
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `);
  }

  if (include.planner) {
    sections.push(`
      <div class="section">
        <h2>Week plan — ${formatWeekLabel(currentWeek)}</h2>
        <table class="grid-table">
          <thead>
            <tr><th></th>${DAYS.map(d => `<th>${d}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${SLOTS.map(slot => `
              <tr>
                <td class="time-cell">${slot.label}</td>
                ${DAYS.map(day => {
                  const key = `${day}-${slot.id}`;
                  const fixed = fixedBlocks[key];
                  if (fixed) return `<td class="fixed-cell">${escHtml(fixed)}</td>`;
                  // Find tasks assigned to this slot
                  const slotTasks = activeTasks.filter(t =>
                    t.weekSlot?.weekId === currentWeek &&
                    t.weekSlot?.day === day &&
                    t.weekSlot?.slot === slot.id
                  );
                  return `<td>${slotTasks.map(t => `<div class="slot-item">${escHtml(t.text)}</div>`).join('')}</td>`;
                }).join('')}
              </tr>`).join('')}
          </tbody>
        </table>
        ${weekPlan.notes ? `<p style="margin-top:8px;font-size:11px;color:#555;"><em>Notes: ${escHtml(weekPlan.notes)}</em></p>` : ''}
      </div>
    `);
  }

  if (include.review && review) {
    const prevWeek = prevWeekId(currentWeek);
    sections.push(`
      <div class="section">
        <h2>Week review — ${formatWeekLabel(prevWeek)}</h2>
        ${review.reflection ? `<p style="margin-bottom:10px;">${escHtml(review.reflection)}</p>` : ''}
        ${review.carriedTaskIds?.length > 0
          ? `<p style="font-size:11px;color:#666;">Carried forward: ${review.carriedTaskIds.length} task${review.carriedTaskIds.length !== 1 ? 's' : ''}</p>`
          : ''}
      </div>
    `);
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escHtml(project.name)} — Planwise</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #1a1917; padding: 24px 32px; }
    .print-header { margin-bottom: 20px; padding-bottom: 12px; border-bottom: 2px solid #0F6E56; }
    .print-title { font-size: 20px; font-weight: 700; color: #0F6E56; }
    .print-meta { font-size: 11px; color: #888; margin-top: 2px; }
    .section { margin-bottom: 24px; page-break-inside: avoid; }
    .section h2 { font-size: 14px; font-weight: 700; margin-bottom: 10px; color: #1a1917; border-bottom: 1px solid #eee; padding-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ddd; padding: 5px 8px; text-align: left; font-size: 11px; }
    th { background: #f5f5f3; font-weight: 600; }
    .time-cell { background: #f5f5f3; font-weight: 500; white-space: nowrap; width: 90px; }
    .fixed-cell { background: #f0ede7; color: #5c5a55; font-style: italic; }
    .slot-item { background: #e1f5ee; color: #0F6E56; border-radius: 3px; padding: 2px 5px; margin-bottom: 2px; font-size: 10px; }
    .matrix-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .matrix-cell { border: 1px solid #ddd; border-radius: 6px; padding: 8px 10px; }
    .matrix-label { font-weight: 700; font-size: 11px; margin-bottom: 6px; color: #0F6E56; text-transform: uppercase; letter-spacing: .04em; }
    .task-row { font-size: 11px; padding: 3px 0; border-bottom: 1px solid #f0f0ee; }
    .task-row:last-child { border-bottom: none; }
    .empty-q { color: #aaa; font-size: 11px; }
    @page { margin: 20mm; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  ${header}
  ${sections.join('\n')}
</body>
</html>`;
}

function quadrantLabel(q) {
  const map = { do: 'Do it now', plan: 'Plan it', delegate: 'Pass it on', drop: 'Let it go' };
  return map[q] ?? '—';
}

function escHtml(str = '') {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Re-export formatWeekLabel locally since it's used in buildPrintHTML
async function formatWeekLabel(wid) {
  const m = await import('../../firebase.js');
  return m.formatWeekLabel(wid);
}

// Fix: make formatWeekLabel sync for the HTML builder
function formatWeekLabel(wid) {
  const d = new Date(wid);
  const end = new Date(d); end.setDate(d.getDate() + 4);
  const opts = { day: 'numeric', month: 'short' };
  return `${d.toLocaleDateString('en-AU', opts)} – ${end.toLocaleDateString('en-AU', opts)}`;
}

function prevWeekId(wid) {
  const d = new Date(wid);
  d.setDate(d.getDate() - 7);
  const iso = d.toISOString().split('T')[0];
  return iso;
}
