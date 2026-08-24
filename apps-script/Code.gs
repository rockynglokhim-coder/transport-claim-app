const SPREADSHEET_ID = '1tIyeiM90Q6sQR7J-GOvO--pKawCXSQKrUdjCG96C5CY';
// Public OAuth Web Client ID. This is not a client secret.
const GOOGLE_CLIENT_ID = '61098226956-fa3jl6huugnbf6dlbvm52i1l8vpsa467.apps.googleusercontent.com';

function doGet() {
  return json_({ok: true, service: 'transport-claim-api'});
}

function doPost(e) {
  try {
    const action = String(e.parameter.action || '');
    const user = verifyUser_(e.parameter.idToken, e.parameter.sessionToken);
    const payload = JSON.parse(e.parameter.payload || '{}');
    if (action === 'session') return json_({ok: true, user, sessionToken: createSessionToken_(user.email)});
    if (action === 'listClaims') return json_(listClaims_(user));
    if (action === 'createClaim') return json_(createClaim_(user, payload));
    throw new Error('不支援的操作。');
  } catch (error) {
    return json_({ok: false, error: error.message});
  }
}

function verifyUser_(idToken, sessionToken) {
  let email = '';
  if (idToken) {
    const response = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), {muteHttpExceptions:true});
    if (response.getResponseCode() !== 200) throw new Error('登入已過期，請重新登入。');
    const identity = JSON.parse(response.getContentText());
    if (identity.aud !== GOOGLE_CLIENT_ID || identity.email_verified !== 'true') throw new Error('Google 身份驗證失敗。');
    email = identity.email;
  } else if (sessionToken) {
    email = verifySessionToken_(sessionToken).email;
  } else {
    throw new Error('請先使用 Google 登入。');
  }
  const rows = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Users').getDataRange().getDisplayValues();
  const match = rows.slice(1).find((row) => row[2].toLowerCase() === email.toLowerCase() && row[4] === 'Active');
  if (!match) throw new Error('此 Google 帳戶未獲授權。');
  return {employeeId:match[0], name:match[1], email:match[2], role:match[3]};
}

function createSessionToken_(email) {
  const payload = {email:String(email).toLowerCase(), exp:Date.now() + 365 * 24 * 60 * 60 * 1000};
  const encoded = Utilities.base64EncodeWebSafe(JSON.stringify(payload), Utilities.Charset.UTF_8).replace(/=+$/, '');
  return encoded + '.' + signSession_(encoded);
}

function verifySessionToken_(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2 || !safeEqual_(parts[1], signSession_(parts[0]))) throw new Error('登入記錄無效，請重新登入。');
  const payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
  if (!payload.email || Number(payload.exp) < Date.now()) throw new Error('登入記錄已過期，請重新登入。');
  return payload;
}

function signSession_(value) {
  const properties = PropertiesService.getScriptProperties();
  let secret = properties.getProperty('SESSION_SECRET');
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid();
    properties.setProperty('SESSION_SECRET', secret);
  }
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(value, secret)).replace(/=+$/, '');
}

function safeEqual_(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}

function listClaims_(user) {
  const rows = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Claims').getDataRange().getValues();
  const now = new Date();
  const claims = rows.slice(1).filter((r) => r[1] === user.employeeId && validDate_(r[2], now)).map((r) => ({id:r[0],date:formatDate_(r[2]),origin:r[3],destination:r[4],transport:r[5],direction:r[6],amount:Number(r[7]) || 0,project:r[8],notes:r[9],status:r[11]})).reverse();
  return {ok:true, claims, monthTotal:claims.reduce((sum,c) => sum + c.amount, 0)};
}

function createClaim_(user, p) {
  ['date','origin','destination','transport','direction','amount'].forEach((key) => { if (!String(p[key] || '').trim()) throw new Error('請填妥所有必填欄位。'); });
  const amount = Number(p.amount); if (!Number.isFinite(amount) || amount < 0) throw new Error('金額不正確。');
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Claims');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const next = Math.max(1, sheet.getLastRow());
    const claimId = 'C' + String(next).padStart(5, '0');
    sheet.appendRow([claimId,user.employeeId,new Date(p.date + 'T00:00:00'),clean_(p.origin),clean_(p.destination),clean_(p.transport),clean_(p.direction),amount,clean_(p.project),clean_(p.notes),new Date(),'Draft']);
    return {ok:true, claimId};
  } finally { lock.releaseLock(); }
}

function validDate_(value, now) { const d = new Date(value); return !isNaN(d) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); }
function formatDate_(value) { return Utilities.formatDate(new Date(value), 'Asia/Hong_Kong', 'yyyy-MM-dd'); }
function clean_(value) { return String(value || '').trim().slice(0, 500); }
function json_(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
