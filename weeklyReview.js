// js/views/tools/weeklyReview.js

import {
  onTasks, getReview, saveReview, rollWeekForward, updateTask,
  weekId, prevWeekId, formatWeekLabel
} from '../../firebase.js';
import { toast } from '../../ui.js';
import { renderCoachingCard } from '../../coaching.js';

export async function renderWeeklyReview(container, { pid, currentWeek }) {
  // Default to reviewing the previous week (most useful on Monday)
  const reviewWeek = prevWeekId(currentWeek);

  container.innerHTML = `
    <div class="print-section">
      <div style="margin-bottom:1rem;">
        <h2>Week review</h2>
        <p>How did the week go? What carries forward? Takes about 5 minutes.</p>
      </div>

      <div class="card" style="margin-bottom:1rem;background:var(--teal-light);border-color:rgba(15,110,86,0.15);">
        <div style="font-size:0.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--teal);margin-bottom:4px;">
          Reviewing week of
        </div>
        <div style="font-weight:600;color:var(--teal);">${formatWeekLabel(reviewWeek)}</div>
      </div>

      <div id="review-summary"></div>
      <div id="carry-forward-section" style="margin-top:1rem;display:none;"></div>

      <div class="field" style="margin-top:1rem;">
        <label>How did the week go? (optional)</label>
        <textarea id="review-reflection" rows="3"
          placeholder="What worked? What got in the way? Anything to remember for next week?"></textarea>
      </div>

      <div id="coaching-area" style="margin-bottom:1rem;"></div>

      <div id="existing-review-banner" style="display:none;" class="card" style="margin-bottom:1rem;background:var(--gray-50);">
        <p style="font-size:0.85rem;color:var(--text-muted);">You've already reviewed this week.</p>
      </div>

      <div style="display:flex;gap:8px;margin-top:1rem;">
        <button class="btn btn-primary" id="save-review">Save review & roll forward</button>
      </div>
    </div>
  `;

  const { completed, incomplete } = await rollWeekForward(pid, reviewWeek);
  const existing = await getReview(pid, reviewWeek);

  if (existing) {
    container.querySelector('#existing-review-banner').style.display = 'block';
    container.querySelector('#review-reflection').value = existing.reflection ?? '';
  }

  // Summary section
  const summaryEl = container.querySelector('#review-summary');
  summaryEl.innerHTML = `
    <div class="review-summary">
      <div class="review-bucket done">
        <h3>Completed ✓</h3>
        ${completed.length === 0
          ? '<p style="font-size:0.82rem;color:var(--teal);">Nothing marked done yet.</p>'
          : completed.map(t => `
              <div style="font-size:0.82rem;color:var(--teal);margin-bottom:3px;display:flex;align-items:center;gap:6px;">
                <span style="opacity:0.6;">✓</span> ${escHtml(t.text)}
              </div>`).join('')}
      </div>
      <div class="review-bucket carried">
        <h3>Not completed</h3>
        ${incomplete.length === 0
          ? '<p style="font-size:0.82rem;color:var(--amber);">Everything got done — great week.</p>'
          : incomplete.map(t => `
              <div style="font-size:0.82rem;color:var(--amber);margin-bottom:3px;">
                ${escHtml(t.text)}
              </div>`).join('')}
      </div>
    </div>
  `;

  // Carry-forward selector
  if (incomplete.length > 0) {
    const cfSection = container.querySelector('#carry-forward-section');
    cfSection.style.display = 'block';
    cfSection.innerHTML = `
      <div class="card">
        <div style="font-size:0.85rem;font-weight:600;margin-bottom:8px;">
          Which of these are moving to next week?
        </div>
        <p style="font-size:0.82rem;margin-bottom:10px;">
          Untick anything you're dropping. Carried tasks will appear in your next week plan.
        </p>
        <div id="cf-list" class="stack"></div>
        <button class="btn btn-ghost btn-sm" id="select-all" style="margin-top:8px;">Select all</button>
      </div>
    `;

    const cfList = cfSection.querySelector('#cf-list');
    const selectedIds = new Set(incomplete.map(t => t.id));

    incomplete.forEach(task => {
      const row = document.createElement('div');
      row.className = 'row';
      row.style.cssText = 'padding:6px 0;border-bottom:1px solid var(--border);';
      row.innerHTML = `
        <input type="checkbox" id="cf-${task.id}" checked style="width:16px;height:16px;accent-color:var(--teal);flex-shrink:0;" />
        <label for="cf-${task.id}" style="font-size:0.85rem;cursor:pointer;flex:1;">${escHtml(task.text)}</label>
        <span class="badge badge-amber">Carry</span>
      `;
      const cb = row.querySelector('input');
      cb.addEventListener('change', () => {
        if (cb.checked) selectedIds.add(task.id);
        else selectedIds.delete(task.id);
        // Update badges
        row.querySelector('.badge').textContent = cb.checked ? 'Carry' : 'Drop';
        row.querySelector('.badge').className = cb.checked ? 'badge badge-amber' : 'badge badge-gray';
      });
      cfList.appendChild(row);

      // Store ref for save
      row.dataset.taskId = task.id;
      row._getChecked = () => cb.checked;
    });

    cfSection.querySelector('#select-all').addEventListener('click', () => {
      cfList.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.checked = true;
        selectedIds.add(cb.id.replace('cf-', ''));
      });
      cfList.querySelectorAll('.badge').forEach(b => {
        b.textContent = 'Carry';
        b.className = 'badge badge-amber';
      });
    });

    // Store reference for save handler
    container._getCarriedIds = () => {
      return incomplete
        .filter(t => cfList.querySelector(`#cf-${t.id}`)?.checked)
        .map(t => t.id);
    };
  } else {
    container._getCarriedIds = () => [];
  }

  // Coaching question in review context
  renderCoachingCard('reviewing', container.querySelector('#coaching-area'));

  // Save
  container.querySelector('#save-review').addEventListener('click', async () => {
    const reflection = container.querySelector('#review-reflection').value.trim();
    const carriedIds = container._getCarriedIds?.() ?? [];

    const btn = container.querySelector('#save-review');
    btn.textContent = 'Saving…';
    btn.disabled = true;

    try {
      // Mark non-carried incomplete tasks as archived
      const droppedIds = incomplete.filter(t => !carriedIds.includes(t.id)).map(t => t.id);
      for (const tid of droppedIds) {
        await updateTask(pid, tid, { status: 'archived', weekSlot: null });
      }

      // Save review record
      await saveReview(pid, reviewWeek, { reflection, carriedTaskIds: carriedIds });

      toast('Week reviewed — carried tasks are back in your list', 'success');
      btn.textContent = 'Saved ✓';
      container.querySelector('#existing-review-banner').style.display = 'block';
    } catch(e) {
      toast('Something went wrong — try again', 'error');
      btn.textContent = 'Save review & roll forward';
      btn.disabled = false;
    }
  });
}

function escHtml(str = '') {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
