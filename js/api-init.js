(async function() {
  // 1. ตรวจสอบว่ามี API URL ใน localStorage หรือยัง
  let apiUrl = localStorage.getItem('gasApiUrl') || localStorage.getItem('GAS_API_URL');
  
  if (!apiUrl) {
    console.log('[API-INIT] No API URL found in localStorage, fetching from Vercel Serverless...');
    try {
      const res = await fetch('/api/get-config');
      if (res.ok) {
        const data = await res.json();
        if (data.apiUrl) {
          localStorage.setItem('gasApiUrl', data.apiUrl);
          localStorage.setItem('GAS_API_URL', data.apiUrl);
          console.log('[API-INIT] API URL updated from Vercel:', data.apiUrl);
          // หลังจากโหลดเสร็จ ให้รีเฟรช 1 ครั้งเพื่อให้หน้าเว็บเริ่มทำงานใหม่ด้วย URL ใหม่
          window.location.reload();
        }
      }
    } catch (e) {
      console.error('[API-INIT] Failed to fetch config from Vercel:', e);
    }
  }
})();
