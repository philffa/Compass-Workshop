// js/ui.js — Shared UI utilities

// ── Toast ──────────────────────────────────────────────────────────────────
export function toast(message, type = 'default', duration = 2800) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ── Modal ──────────────────────────────────────────────────────────────────
export function showModal({ title, content, footer, onClose }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      ${title ? `<h2>${title}</h2>` : ''}
      <div class="modal-content"></div>
      ${footer ? `<div class="modal-footer"></div>` : ''}
    </div>
  `;
  backdrop.querySelector('.modal-content').appendChild(
    typeof content === 'string'
      ? (() => { const d = document.createElement('div'); d.innerHTML = content; return d; })()
      : content
  );
  if (footer) {
    const f = backdrop.querySelector('.modal-footer');
    if (typeof footer === 'string') f.innerHTML = footer;
    else f.appendChild(footer);
  }
  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) { backdrop.remove(); onClose?.(); }
  });
  document.body.appendChild(backdrop);
  return {
    el: backdrop,
    close: () => { backdrop.remove(); onClose?.(); }
  };
}

export function confirmModal(message, onConfirm) {
  const content = document.createElement('p');
  content.style.cssText = 'color:var(--text-muted);font-size:0.9rem;margin-bottom:1rem;';
  content.textContent = message;
  const footer = document.createElement('div');
  footer.className = 'modal-footer';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-secondary';
  cancelBtn.textContent = 'Cancel';
  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn btn-danger';
  confirmBtn.textContent = 'Delete';
  footer.append(cancelBtn, confirmBtn);
  const m = showModal({ title: 'Are you sure?', content, footer });
  cancelBtn.addEventListener('click', () => m.close());
  confirmBtn.addEventListener('click', () => { m.close(); onConfirm(); });
}

// ── Drag-to-reorder ────────────────────────────────────────────────────────
export function makeSortable(listEl, onReorder) {
  let dragSrc = null;

  function getDraggables() {
    return [...listEl.querySelectorAll('[draggable="true"]')];
  }

  listEl.addEventListener('dragstart', e => {
    const item = e.target.closest('[draggable="true"]');
    if (!item) return;
    dragSrc = item;
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  listEl.addEventListener('dragend', e => {
    const item = e.target.closest('[draggable="true"]');
    if (!item) return;
    item.classList.remove('dragging');
    listEl.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    dragSrc = null;
    // Emit new order
    const ids = getDraggables().map(el => el.dataset.id);
    onReorder(ids);
  });

  listEl.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const target = e.target.closest('[draggable="true"]');
    if (!target || target === dragSrc) return;
    listEl.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    target.classList.add('drag-over');
    // DOM reorder
    const items = getDraggables();
    const srcIdx = items.indexOf(dragSrc);
    const tgtIdx = items.indexOf(target);
    if (srcIdx < tgtIdx) target.after(dragSrc);
    else target.before(dragSrc);
  });
}

// ── Eisenhower drag-to-quadrant ────────────────────────────────────────────
export function makeQuadrantDroppable(quadrantEl, quadrantKey, onDrop) {
  quadrantEl.addEventListener('dragover', e => {
    e.preventDefault();
    quadrantEl.classList.add('drag-target');
  });
  quadrantEl.addEventListener('dragleave', () => {
    quadrantEl.classList.remove('drag-target');
  });
  quadrantEl.addEventListener('drop', e => {
    e.preventDefault();
    quadrantEl.classList.remove('drag-target');
    const taskId = e.dataTransfer.getData('text/plain');
    if (taskId) onDrop(taskId, quadrantKey);
  });
}

// ── Week planner slot drops ────────────────────────────────────────────────
export function makeSlotDroppable(slotEl, day, slot, onDrop) {
  slotEl.addEventListener('dragover', e => {
    e.preventDefault();
    slotEl.classList.add('drag-target');
  });
  slotEl.addEventListener('dragleave', () => {
    slotEl.classList.remove('drag-target');
  });
  slotEl.addEventListener('drop', e => {
    e.preventDefault();
    slotEl.classList.remove('drag-target');
    const taskId = e.dataTransfer.getData('text/plain');
    if (taskId) onDrop(taskId, day, slot);
  });
}

// ── Inline edit ───────────────────────────────────────────────────────────
export function makeInlineEdit(el, onSave) {
  el.addEventListener('dblclick', () => {
    const original = el.textContent;
    el.contentEditable = 'true';
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);

    function done() {
      el.contentEditable = 'false';
      const val = el.textContent.trim();
      if (val && val !== original) onSave(val);
      else el.textContent = original;
    }
    el.addEventListener('blur', done, { once: true });
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
      if (e.key === 'Escape') { el.textContent = original; el.blur(); }
    });
  });
}
