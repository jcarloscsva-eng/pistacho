/**
 * Backend de Pistacho — Google Apps Script vinculado a la Google Sheet.
 * Ver SETUP.md para instrucciones de despliegue.
 *
 * Antes de usar, configura en Proyecto > Configuración > Propiedades del script:
 *   GOOGLE_CLIENT_ID        -> el mismo Client ID que en js/config.js
 *   SESSION_SECRET          -> una cadena aleatoria larga, invéntatela tú
 *   FCM_SERVICE_ACCOUNT_JSON -> (opcional, solo para push) el JSON de la cuenta
 *                                de servicio de Firebase, como texto
 *   FCM_PROJECT_ID          -> (opcional) el project_id de Firebase
 *
 * Y ejecuta una vez la función initSpreadsheet() manualmente desde el editor
 * para crear las pestañas y las categorías por defecto.
 */

const SHEETS = {
  USUARIOS: 'Usuarios',
  CATEGORIAS: 'Categorias',
  SEGURO: 'Seguro',
  COBERTURAS: 'Coberturas',
  TRATAMIENTOS: 'Tratamientos',
  PUSH_TOKENS: 'PushTokens'
};

const REMINDER_THRESHOLDS_DIAS = [14, 3, 0]; // avisa 14 días antes, 3 días antes y el mismo día

// ---------- Entrada HTTP ----------

function doGet(e) {
  try {
    const action = e.parameter.action;
    if (action === 'ping') return jsonOut({ ok: true });

    const email = requireSession(e.parameter.token);
    if (action === 'bootstrap') return jsonOut(bootstrap());
    return jsonOut({ error: 'unknown_action' });
  } catch (err) {
    return jsonOut({ error: err.message });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;

    if (action === 'login') return jsonOut(login(body.idToken));

    const email = requireSession(body.token);

    switch (action) {
      case 'createTratamiento': return jsonOut(createTratamiento(body.data, email));
      case 'updateTratamiento': return jsonOut(updateTratamiento(body.data, email));
      case 'deleteTratamiento': return jsonOut(deleteTratamiento(body.id));
      case 'upsertSeguro': return jsonOut(upsertSeguro(body.data));
      case 'upsertCobertura': return jsonOut(upsertCobertura(body.data));
      case 'registerPushToken': return jsonOut(registerPushToken(body.fcmToken, email));
      default: return jsonOut({ error: 'unknown_action' });
    }
  } catch (err) {
    return jsonOut({ error: err.message });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- Autenticación ----------

function login(idToken) {
  const info = verifyGoogleIdToken(idToken);
  const usuarios = readAll(SHEETS.USUARIOS);
  const user = usuarios.find(u => (u.email || '').toLowerCase() === info.email.toLowerCase());
  if (!user) return { ok: false, error: 'not_authorized' };

  return {
    ok: true,
    email: user.email,
    nombre: user.nombre,
    sessionToken: createSessionToken(user.email)
  };
}

function verifyGoogleIdToken(idToken) {
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), {
    muteHttpExceptions: true
  });
  const data = JSON.parse(res.getContentText());
  const clientId = getProp('GOOGLE_CLIENT_ID');
  if (data.aud !== clientId) throw new Error('token_audience_mismatch');
  if (data.email_verified !== 'true' && data.email_verified !== true) throw new Error('email_not_verified');
  return { email: data.email, name: data.name };
}

function createSessionToken(email) {
  const expires = Date.now() + 12 * 60 * 60 * 1000; // 12h
  const payload = email + '|' + expires;
  const sig = signHmac(payload);
  return Utilities.base64EncodeWebSafe(payload + '|' + sig);
}

function requireSession(token) {
  try {
    const decoded = Utilities.newBlob(Utilities.base64DecodeWebSafe(token)).getDataAsString();
    const parts = decoded.split('|');
    const email = parts[0], expires = Number(parts[1]), sig = parts[2];
    const expected = signHmac(email + '|' + expires);
    if (sig !== expected) throw new Error('bad_signature');
    if (Date.now() > expires) throw new Error('session_expired');
    return email;
  } catch (e) {
    throw new Error('session_expired');
  }
}

function signHmac(payload) {
  const secret = getProp('SESSION_SECRET');
  const raw = Utilities.computeHmacSha256Signature(payload, secret);
  return Utilities.base64EncodeWebSafe(raw);
}

function getProp(key) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  if (!v) throw new Error('missing_script_property_' + key);
  return v;
}

// ---------- Lectura agregada ----------

function bootstrap() {
  const tratamientos = readAll(SHEETS.TRATAMIENTOS);
  const seguroRows = readAll(SHEETS.SEGURO);
  return {
    categorias: readAll(SHEETS.CATEGORIAS),
    seguro: seguroRows[0] || null,
    coberturas: readAll(SHEETS.COBERTURAS),
    tratamientos: tratamientos,
    usuarios: readAll(SHEETS.USUARIOS)
  };
}

// ---------- Tratamientos ----------

function createTratamiento(data, email) {
  data.id = Utilities.getUuid();
  data.registrado_por = email;
  data.timestamp = new Date().toISOString();
  appendObject(SHEETS.TRATAMIENTOS, data);
  return { ok: true, id: data.id };
}

function updateTratamiento(data, email) {
  data.registrado_por = email;
  updateById(SHEETS.TRATAMIENTOS, data.id, data);
  return { ok: true };
}

function deleteTratamiento(id) {
  deleteById(SHEETS.TRATAMIENTOS, id);
  return { ok: true };
}

// ---------- Seguro ----------

function upsertSeguro(data) {
  const rows = readAll(SHEETS.SEGURO);
  if (rows.length === 0 || !data.id) {
    data.id = data.id || Utilities.getUuid();
    if (rows.length === 0) appendObject(SHEETS.SEGURO, data);
    else updateById(SHEETS.SEGURO, rows[0].id, data);
  } else {
    updateById(SHEETS.SEGURO, data.id, data);
  }
  return { ok: true };
}

function upsertCobertura(data) {
  const rows = readAll(SHEETS.COBERTURAS);
  const exists = rows.find(r => r.categoria_id === data.categoria_id);
  if (exists) {
    updateByColumn(SHEETS.COBERTURAS, 'categoria_id', data.categoria_id, data);
  } else {
    appendObject(SHEETS.COBERTURAS, data);
  }
  return { ok: true };
}

// ---------- Push tokens ----------

function registerPushToken(token, email) {
  const rows = readAll(SHEETS.PUSH_TOKENS);
  const exists = rows.find(r => r.token === token);
  const data = { email: email, token: token, updated_at: new Date().toISOString() };
  if (exists) updateByColumn(SHEETS.PUSH_TOKENS, 'token', token, data);
  else appendObject(SHEETS.PUSH_TOKENS, data);
  return { ok: true };
}

// ---------- Helpers genéricos de hoja ----------

function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('sheet_not_found_' + name);
  return sheet;
}

function readAll(name) {
  const sheet = getSheet(name);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1)
    .filter(row => row.some(cell => cell !== '' && cell !== null))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        let v = row[i];
        if (v instanceof Date) v = v.toISOString().slice(0, 10);
        obj[h] = v;
      });
      return obj;
    });
}

function appendObject(name, obj) {
  const sheet = getSheet(name);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map(h => obj[h] !== undefined ? obj[h] : '');
  sheet.appendRow(row);
}

function updateById(name, id, obj) {
  updateByColumn(name, 'id', id, obj);
}

function updateByColumn(name, keyCol, keyVal, obj) {
  const sheet = getSheet(name);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const keyIdx = headers.indexOf(keyCol);
  for (let r = 1; r < values.length; r++) {
    if (values[r][keyIdx] === keyVal) {
      headers.forEach((h, i) => {
        if (obj[h] !== undefined) sheet.getRange(r + 1, i + 1).setValue(obj[h]);
      });
      return true;
    }
  }
  return false;
}

function deleteById(name, id) {
  const sheet = getSheet(name);
  const values = sheet.getDataRange().getValues();
  const idIdx = values[0].indexOf('id');
  for (let r = 1; r < values.length; r++) {
    if (values[r][idIdx] === id) {
      sheet.deleteRow(r + 1);
      return true;
    }
  }
  return false;
}

// ---------- Inicialización (ejecutar una sola vez a mano) ----------

function initSpreadsheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  ensureSheet(ss, SHEETS.USUARIOS, ['email', 'nombre']);
  ensureSheet(ss, SHEETS.CATEGORIAS, ['id', 'nombre', 'color']);
  ensureSheet(ss, SHEETS.SEGURO, ['id', 'compania', 'poliza', 'porcentaje_reembolso_general', 'fecha_inicio', 'fecha_renovacion', 'notas']);
  ensureSheet(ss, SHEETS.COBERTURAS, ['categoria_id', 'cubierta', 'porcentaje_especifico']);
  ensureSheet(ss, SHEETS.TRATAMIENTOS, ['id', 'fecha', 'categoria_id', 'descripcion', 'coste', 'cubierto_seguro', 'porcentaje_aplicado', 'importe_reembolsado', 'periodicidad_meses', 'proxima_fecha', 'notas', 'registrado_por', 'timestamp', 'ultimo_aviso']);
  ensureSheet(ss, SHEETS.PUSH_TOKENS, ['email', 'token', 'updated_at']);

  const categorias = readAll(SHEETS.CATEGORIAS);
  if (categorias.length === 0) {
    const defaults = [
      ['Vacunas', '#2e7d5e'],
      ['Desparasitación interna', '#3f7cac'],
      ['Desparasitación externa', '#7c5cbf'],
      ['Prevención leishmaniosis', '#c94f4f'],
      ['Revisión general', '#c98a1f'],
      ['Analítica', '#4a9d8f'],
      ['Limpieza dental', '#8a6d3b'],
      ['Cirugía', '#b3432b'],
      ['Urgencias', '#d1495b'],
      ['Medicación', '#5b7f9e'],
      ['Otros', '#75806e']
    ];
    defaults.forEach(([nombre, color]) => {
      appendObject(SHEETS.CATEGORIAS, { id: Utilities.getUuid(), nombre: nombre, color: color });
    });
  }

  Logger.log('Spreadsheet inicializada. Añade tus 3 emails en la pestaña "Usuarios".');
}

function ensureSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
}

// ---------- Recordatorios (trigger diario) ----------

function dailyReminderCheck() {
  const tratamientos = readAll(SHEETS.TRATAMIENTOS);
  const usuarios = readAll(SHEETS.USUARIOS);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);

  tratamientos.forEach(t => {
    if (!t.proxima_fecha) return;
    const target = new Date(t.proxima_fecha); target.setHours(0, 0, 0, 0);
    const dias = Math.round((target - today) / 86400000);

    const shouldNotify = REMINDER_THRESHOLDS_DIAS.includes(dias) || dias < 0;
    if (!shouldNotify) return;
    if (t.ultimo_aviso === todayStr) return; // ya avisado hoy

    const titulo = 'Recordatorio: ' + (t.descripcion || 'tratamiento de Pistacho');
    const cuerpo = dias < 0
      ? `El tratamiento "${t.descripcion || ''}" lleva ${Math.abs(dias)} día(s) de retraso (previsto para ${t.proxima_fecha}).`
      : dias === 0
        ? `Hoy toca: "${t.descripcion || ''}".`
        : `En ${dias} día(s) toca: "${t.descripcion || ''}" (${t.proxima_fecha}).`;

    usuarios.forEach(u => {
      MailApp.sendEmail(u.email, '🐾 Pistacho — ' + titulo, cuerpo);
    });

    sendPushToAll(titulo, cuerpo);

    updateById(SHEETS.TRATAMIENTOS, t.id, { ultimo_aviso: todayStr });
  });
}

/**
 * Crea el trigger diario. Ejecuta esta función una sola vez a mano
 * desde el editor de Apps Script.
 */
function crearTriggerDiario() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'dailyReminderCheck') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyReminderCheck').timeBased().everyDays(1).atHour(9).create();
}

// ---------- Push (Firebase Cloud Messaging, opcional) ----------

function sendPushToAll(title, body) {
  let serviceAccountJson, projectId;
  try {
    serviceAccountJson = getProp('FCM_SERVICE_ACCOUNT_JSON');
    projectId = getProp('FCM_PROJECT_ID');
  } catch (e) {
    return; // push no configurado: se omite silenciosamente, el email ya se envió
  }

  const tokens = readAll(SHEETS.PUSH_TOKENS).map(r => r.token).filter(Boolean);
  if (tokens.length === 0) return;

  const accessToken = getFcmAccessToken(JSON.parse(serviceAccountJson));
  tokens.forEach(token => {
    UrlFetchApp.fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + accessToken },
      muteHttpExceptions: true,
      payload: JSON.stringify({
        message: { token: token, notification: { title: title, body: body } }
      })
    });
  });
}

function getFcmAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claimSet = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };
  const toSign = base64url(JSON.stringify(header)) + '.' + base64url(JSON.stringify(claimSet));
  const signature = Utilities.computeRsaSha256Signature(toSign, serviceAccount.private_key);
  const jwt = toSign + '.' + Utilities.base64EncodeWebSafe(signature).replace(/=+$/, '');

  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    },
    muteHttpExceptions: true
  });
  return JSON.parse(res.getContentText()).access_token;
}

function base64url(str) {
  return Utilities.base64EncodeWebSafe(str).replace(/=+$/, '');
}
