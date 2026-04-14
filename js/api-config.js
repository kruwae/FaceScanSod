// ============================================================
//  ตั้งค่า Google Apps Script Web App URL + Google OAuth Client ID
//  แก้ไขค่าเหล่านี้ก่อนใช้งาน หากมีการ Deploy GAS ใหม่หรือเปลี่ยน OAuth
// ============================================================
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbwVK8I_N3UNb_etBPgT9PKfcmSN9NYR2Mu64fq-dR62sdlxaBnSfmaZFy44W9Ao4mYE/exec';
const GOOGLE_OAUTH_CLIENT_ID = '938397636593-gstnelk2u35c6aa8hg0594ja0k40b5su.apps.googleusercontent.com';
const GOOGLE_CLIENT_ID = GOOGLE_OAUTH_CLIENT_ID;

if (typeof window !== 'undefined') {
  window.GAS_API_URL = GAS_API_URL;
  window.GOOGLE_OAUTH_CLIENT_ID = GOOGLE_OAUTH_CLIENT_ID;
  window.GOOGLE_CLIENT_ID = GOOGLE_OAUTH_CLIENT_ID;
}
