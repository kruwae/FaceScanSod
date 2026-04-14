export function showAlert(message, type = 'info') {
  const el = document.createElement('div');
  el.textContent = message;
  el.style.cssText = [
    'position:fixed',
    'left:50%',
    'bottom:24px',
    'transform:translateX(-50%)',
    'z-index:9999',
    'padding:12px 16px',
    'border-radius:12px',
    'font-family:Sarabun,sans-serif',
    'font-size:14px',
    'font-weight:600',
    'box-shadow:0 10px 30px rgba(0,0,0,0.25)',
    'max-width:90vw',
    'text-align:center'
  ].join(';');

  const styles = {
    success: ['background:#064e3b', 'color:#d1fae5', 'border:1px solid #10b981'],
    error: ['background:#7f1d1d', 'color:#fee2e2', 'border:1px solid #ef4444'],
    warning: ['background:#78350f', 'color:#fef3c7', 'border:1px solid #f59e0b'],
    info: ['background:#1e293b', 'color:#e2e8f0', 'border:1px solid #475569']
  };

  el.style.cssText += ';' + (styles[type] || styles.info).join(';');
  document.body.appendChild(el);

  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.25s ease';
    setTimeout(() => el.remove(), 250);
  }, 2200);
}
