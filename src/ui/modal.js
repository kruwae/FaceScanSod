export function showModal({ modalId = 'confirmModal', name = '', time = '', location = '', score = '', onConfirm, onCancel } = {}) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  const nameEl = document.getElementById('modalName');
  const timeEl = document.getElementById('modalTime');
  const locationEl = document.getElementById('modalLocation');
  const scoreEl = document.getElementById('modalScore');
  const confirmBtn = document.getElementById('btnConfirm');

  if (nameEl) nameEl.innerText = name;
  if (timeEl) timeEl.innerText = time;
  if (locationEl) {
    if (location) {
      locationEl.innerText = location;
      locationEl.style.display = 'block';
    } else {
      locationEl.style.display = 'none';
    }
  }
  if (scoreEl) scoreEl.innerText = score;

  if (confirmBtn && typeof onConfirm === 'function') {
    confirmBtn.onclick = onConfirm;
  }

  const cancelBtn = modal.querySelector('.btn-cancel');
  if (cancelBtn && typeof onCancel === 'function') {
    cancelBtn.onclick = onCancel;
  }

  modal.style.display = 'flex';
}

export function hideModal(modalId = 'confirmModal') {
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = 'none';
}
