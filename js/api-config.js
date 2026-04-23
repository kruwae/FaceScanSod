// ============================================================
//  ตั้งค่า Google Apps Script Web App URL + Google OAuth Client ID
//  แก้ไขค่าเหล่านี้ก่อนใช้งาน หากมีการ Deploy GAS ใหม่หรือเปลี่ยน OAuth
// ============================================================
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbzccUDtobzi59Uvs4X1ZCpJ9VWVf8LaMLqrvqKDmzweudt663Ym3u7TGhc9GI2Fp9YN/exec';
const GOOGLE_OAUTH_CLIENT_ID = '938397636593-gstnelk2u35c6aa8hg0594ja0k40b5su.apps.googleusercontent.com';
const GOOGLE_CLIENT_ID = GOOGLE_OAUTH_CLIENT_ID;

if (typeof window !== 'undefined') {
  window.GAS_API_URL = GAS_API_URL;
  window.GOOGLE_OAUTH_CLIENT_ID = GOOGLE_OAUTH_CLIENT_ID;
  window.GOOGLE_CLIENT_ID = GOOGLE_OAUTH_CLIENT_ID;
}