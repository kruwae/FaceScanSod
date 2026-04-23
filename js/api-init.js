(async function() {
  // 1. ตรวจสอบว่ามี API URL ใน localStorage หรือยัง
  let apiUrl = localStorage.getItem('gasApiUrl') || localStorage.getItem('GAS_API_URL');
  
  if (!apiUrl) {
    console.log('[API-INIT] No API URL found in localStorage, fetching from Vercel Serverless...');
    try {
      const res = await fetch('/api/get-config');
      if (res.ok) {
        const data = await res.json();
        let updated = false;
        if (data.apiUrl) {
          localStorage.setItem('gasApiUrl', data.apiUrl);
          localStorage.setItem('GAS_API_URL', data.apiUrl);
          updated = true;
        }
        if (data.googleClientId) {
          localStorage.setItem('googleClientId', data.googleClientId);
          updated = true;
        }
        if (updated) {
          console.log('[API-INIT] Config updated from Vercel');
          window.location.reload();
        }
      }
    } catch (e) {
      console.error('[API-INIT] Failed to fetch config from Vercel:', e);
    }
  }
})();
