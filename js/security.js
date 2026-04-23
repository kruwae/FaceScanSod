const Security = {
  getToken() {
    return sessionStorage.getItem('token') || localStorage.getItem('token') || '';
  },
  
  setToken(token) {
    sessionStorage.setItem('token', token);
    // Remove from localStorage to prevent XSS persistence across tabs
    localStorage.removeItem('token');
  },
  
  clearToken() {
    sessionStorage.removeItem('token');
    localStorage.removeItem('token');
  },
  
  // Sanitize inputs to prevent basic XSS when rendering
  sanitize(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .trim();
  },
  
  // Developer logging flag
  IS_DEV: false,
  
  log(...args) {
    if (this.IS_DEV) {
      console.log(...args);
    }
  }
};
