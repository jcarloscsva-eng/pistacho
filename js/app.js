const state = {
  categorias: [],
  seguro: null,
  coberturas: [],
  tratamientos: [],
  usuarios: [],
  loaded: false
};

// view: 'mes' (por defecto) o 'semana'. ref: fecha ancla (YYYY-MM-DD) de la que se derivan
// el mes o la semana mostrados.
const calendarState = { view: 'mes', ref: new Date().toISOString().slice(0, 10) };

// Cuadro de referencia orientativo — no lee de la Sheet, es solo consulta.
// Periodicidades generales para perro adulto; siempre prevalece la indicación del veterinario.
const CUADRO_MAESTRO = [
  {
    grupo: 'Vacunas',
    items: [
      { nombre: 'Polivalente (moquillo, hepatitis, parvovirus, parainfluenza)', periodicidad: 'Anual', notas: 'Tras la pauta inicial de cachorro (2-3 dosis). Revacunación anual de por vida.' },
      { nombre: 'Rabia', periodicidad: 'Anual', notas: 'Obligatoria en Castilla y León. Se suele poner junto con la polivalente.' },
      { nombre: 'Leishmaniosis (vacuna)', periodicidad: 'Anual', notas: 'Pauta inicial de 3 dosis. Alternativa o complemento: collar/pipeta repelente de flebotomos.' }
    ]
  },
  {
    grupo: 'Desparasitación',
    items: [
      { nombre: 'Desparasitación interna (pastilla/pasta)', periodicidad: 'Cada 3 meses', notas: 'Cada 1 mes en cachorros y si hay riesgo alto (parques, otros perros).' },
      { nombre: 'Desparasitación externa — pipeta', periodicidad: 'Mensual', notas: 'Protege frente a pulgas, garrapatas y flebotomos (leishmaniosis).' },
      { nombre: 'Desparasitación externa — collar', periodicidad: 'Cada 6-8 meses', notas: 'Alternativa a la pipeta, no combinar ambos sin indicación veterinaria.' }
    ]
  },
  {
    grupo: 'Revisiones',
    items: [
      { nombre: 'Revisión general / chequeo', periodicidad: 'Anual', notas: 'Suele coincidir con la vacunación anual.' },
      { nombre: 'Analítica de sangre', periodicidad: 'Anual', notas: 'Recomendable con más frecuencia a partir de los 7-8 años.' },
      { nombre: 'Test leishmaniosis/filaria', periodicidad: 'Anual', notas: 'Antes de revacunar frente a leishmaniosis.' },
      { nombre: 'Limpieza dental', periodicidad: 'Según sarro', notas: 'El veterinario lo valora en cada revisión, no tiene periodicidad fija.' }
    ]
  }
];

const $app = document.getElementById('app');

// ---------- Utilidades ----------

function fmtEUR(n) {
  return (Number(n) || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}
function addMonths(dateStr, months) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + Number(months || 0));
  return d.toISOString().slice(0, 10);
}
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr); target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}
function categoriaById(id) {
  return state.categorias.find(c => c.id === id) || { nombre: 'Sin categoría', color: '#999' };
}
function coberturaByCategoria(id) {
  return state.coberturas.find(c => c.categoria_id === id);
}
function showToast(msg, variant) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.remove('show', 'error');
  el.setAttribute('aria-live', variant === 'error' ? 'assertive' : 'polite');
  if (variant === 'error') el.classList.add('error');
  void el.offsetWidth; // reinicia la animación si se pulsa varias veces seguidas
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), variant === 'error' ? 4000 : 2500);
}

// Colores de categoría: vienen de la Sheet sin garantía de contraste.
// Se usan tal cual para acentos (borde, punto, fondo tenue) pero el texto
// siempre se oscurece lo justo para pasar 4.5:1 sobre blanco.
function hexToRgb(hex) {
  const clean = (hex || '').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}
function hslToRgb(h, s, l) {
  if (s === 0) { const v = l * 255; return [v, v, v]; }
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3) * 255, hue2rgb(p, q, h) * 255, hue2rgb(p, q, h - 1 / 3) * 255];
}
function relativeLuminance({ r, g, b }) {
  const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrastRatio(hexA, hexB) {
  const lA = relativeLuminance(hexToRgb(hexA));
  const lB = relativeLuminance(hexToRgb(hexB));
  const [light, dark] = lA > lB ? [lA, lB] : [lB, lA];
  return (light + 0.05) / (dark + 0.05);
}
function readableCategoryColor(hex) {
  if (!/^#?[0-9a-f]{3,6}$/i.test(hex || '')) return '#3a3a3a';
  const normalized = hex.startsWith('#') ? hex : `#${hex}`;
  if (contrastRatio(normalized, '#ffffff') >= 4.5) return normalized;
  const { r, g, b } = hexToRgb(normalized);
  const [h, s, startL] = rgbToHsl(r, g, b);
  for (let l = startL; l >= 0; l -= 0.04) {
    const [rr, gg, bb] = hslToRgb(h, s, l);
    const candidate = rgbToHex(rr, gg, bb);
    if (contrastRatio(candidate, '#ffffff') >= 4.5) return candidate;
  }
  return '#2a2a2a';
}

// ---------- Router ----------

function route() {
  const hash = location.hash || '#/dashboard';
  const session = Api.loadSession();

  if (!session) {
    renderLogin();
    return;
  }
  if (!state.loaded) {
    renderLoading();
    loadData().then(route);
    return;
  }

  if (hash.startsWith('#/tratamientos/nuevo')) renderTratamientoForm(null);
  else if (hash.startsWith('#/tratamientos/editar/')) renderTratamientoForm(hash.split('/').pop());
  else if (hash.startsWith('#/tratamientos')) renderTratamientos();
  else if (hash.startsWith('#/calendario')) renderCalendario();
  else if (hash.startsWith('#/guia')) renderGuia();
  else if (hash.startsWith('#/seguro')) renderSeguro();
  else if (hash.startsWith('#/ajustes')) renderAjustes();
  else renderDashboard();
}
window.addEventListener('hashchange', route);

async function loadData() {
  const res = await Api.bootstrap();
  if (res.error) { Api.clearSession(); return; }
  state.categorias = res.categorias || [];
  state.seguro = res.seguro || null;
  state.coberturas = res.coberturas || [];
  state.tratamientos = res.tratamientos || [];
  state.usuarios = res.usuarios || [];
  state.loaded = true;
}

function renderLoading() {
  $app.innerHTML = `<div class="loading">Cargando datos de Pistacho…</div>`;
}

// ---------- Layout ----------

function layout(title, content) {
  const s = Api.session;
  return `
    <div class="shell">
      <header class="topbar">
        <div class="brand">🐾 Pistacho</div>
        <input type="checkbox" id="nav-toggle" class="nav-toggle">
        <label for="nav-toggle" class="hamburger" aria-label="Abrir menú">
          <span></span><span></span><span></span>
        </label>
        <nav class="tabs">
          <a href="#/dashboard" class="${navActive('dashboard')}">Resumen</a>
          <a href="#/tratamientos" class="${navActive('tratamientos')}">Tratamientos</a>
          <a href="#/calendario" class="${navActive('calendario')}">Calendario</a>
          <a href="#/guia" class="${navActive('guia')}">Guía</a>
          <a href="#/seguro" class="${navActive('seguro')}">Seguro</a>
          <a href="#/ajustes" class="${navActive('ajustes')}">Ajustes</a>
          <div class="user-chip" title="${s.email}">${s.nombre || s.email}</div>
        </nav>
      </header>
      <main class="content">
        <h1>${title}</h1>
        ${content}
      </main>
    </div>
  `;
}
function navActive(name) {
  return location.hash.startsWith(`#/${name}`) ? 'active' : '';
}

// ---------- Login ----------

function renderLogin() {
  $app.innerHTML = `
    <div class="login-screen">
      <div class="login-card">
        <div class="login-icon">🐾</div>
        <h1>Pistacho</h1>
        <p>Gestión médica y de seguro</p>
        <div id="g_id_signin"></div>
        <p id="login-error" class="error"></p>
      </div>
    </div>
  `;
  initGoogleSignIn();
}

function initGoogleSignIn() {
  if (!window.google || !google.accounts) {
    setTimeout(initGoogleSignIn, 200);
    return;
  }
  google.accounts.id.initialize({
    client_id: CONFIG.GOOGLE_CLIENT_ID,
    callback: onGoogleCredential
  });
  google.accounts.id.renderButton(
    document.getElementById('g_id_signin'),
    { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill' }
  );
}

async function onGoogleCredential(response) {
  try {
    await Api.login(response.credential);
    state.loaded = false;
    location.hash = '#/dashboard';
    route();
  } catch (e) {
    document.getElementById('login-error').textContent =
      'No se ha podido iniciar sesión: tu cuenta no está autorizada o hubo un error de red.';
  }
}

function logout() {
  Api.clearSession();
  state.loaded = false;
  location.hash = '#/login';
  route();
}

// ---------- Dashboard ----------

function renderDashboard() {
  const total = state.tratamientos.reduce((s, t) => s + (Number(t.coste) || 0), 0);
  const reembolsado = state.tratamientos.reduce((s, t) => s + (Number(t.importe_reembolsado) || 0), 0);
  const aCargo = total - reembolsado;

  const porCategoria = {};
  state.tratamientos.forEach(t => {
    const cat = categoriaById(t.categoria_id).nombre;
    porCategoria[cat] = porCategoria[cat] || { coste: 0, reembolsado: 0 };
    porCategoria[cat].coste += Number(t.coste) || 0;
    porCategoria[cat].reembolsado += Number(t.importe_reembolsado) || 0;
  });
  const maxCoste = Math.max(1, ...Object.values(porCategoria).map(c => c.coste));

  const proximos = state.tratamientos
    .filter(t => t.proxima_fecha)
    .map(t => ({ ...t, dias: daysUntil(t.proxima_fecha) }))
    .filter(t => t.dias !== null && t.dias <= 30)
    .sort((a, b) => a.dias - b.dias);

  const content = `
    <div class="cards">
      <div class="card"><div class="card-label">Gastado en total</div><div class="card-value">${fmtEUR(total)}</div></div>
      <div class="card"><div class="card-label">Reembolsado por el seguro</div><div class="card-value good">${fmtEUR(reembolsado)}</div></div>
      <div class="card"><div class="card-label">A tu cargo</div><div class="card-value">${fmtEUR(aCargo)}</div></div>
    </div>

    <section class="panel">
      <h2>Próximos tratamientos</h2>
      ${proximos.length === 0 ? '<p class="muted">No hay tratamientos previstos en los próximos 30 días.</p>' : `
        <ul class="reminder-list">
          ${proximos.map(t => `
            <li class="${t.dias < 0 ? 'overdue' : t.dias <= 7 ? 'soon' : ''}">
              <span class="dot" style="background:${categoriaById(t.categoria_id).color}" aria-hidden="true"></span>
              <div class="reminder-body">
                <strong>${categoriaById(t.categoria_id).nombre}</strong> — ${t.descripcion || ''}
                <div class="muted">${fmtDate(t.proxima_fecha)} · ${t.dias < 0 ? `${Math.abs(t.dias)} días de retraso` : t.dias === 0 ? 'hoy' : `en ${t.dias} días`}</div>
              </div>
            </li>
          `).join('')}
        </ul>
      `}
    </section>

    <section class="panel">
      <h2>Gasto por categoría</h2>
      ${Object.keys(porCategoria).length === 0 ? '<p class="muted">Aún no hay tratamientos registrados.</p>' : `
        <div class="bars">
          ${Object.entries(porCategoria).map(([nombre, v]) => `
            <div class="bar-row">
              <div class="bar-label">${nombre}</div>
              <div class="bar-track">
                <div class="bar-fill" style="width:${(v.coste / maxCoste) * 100}%"></div>
              </div>
              <div class="bar-value">${fmtEUR(v.coste)} <span class="muted">(reembolsado ${fmtEUR(v.reembolsado)})</span></div>
            </div>
          `).join('')}
        </div>
      `}
    </section>
  `;
  $app.innerHTML = layout('Resumen', content);
}

// ---------- Tratamientos ----------

function renderTratamientos() {
  const rows = [...state.tratamientos].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  const content = `
    <div class="toolbar">
      <a href="#/tratamientos/nuevo" class="btn primary">+ Nuevo tratamiento</a>
    </div>
    <div class="table-scroll">
      <table class="table table-tratamientos">
        <thead>
          <tr>
            <th>Fecha</th><th>Categoría</th><th>Descripción</th><th>Coste</th>
            <th class="col-extra">Seguro</th><th class="col-extra">Reembolsado</th><th class="col-extra">Próxima vez</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(t => `
            <tr class="tr-main" tabindex="0" onclick="openTratamientoSheet('${t.id}')" onkeydown="if(event.key==='Enter'){openTratamientoSheet('${t.id}')}">
              <td>${fmtDate(t.fecha)}</td>
              <td><span class="tag" style="color:${readableCategoryColor(categoriaById(t.categoria_id).color)};--tag-accent:${categoriaById(t.categoria_id).color}">${categoriaById(t.categoria_id).nombre}</span></td>
              <td>${t.descripcion || ''}</td>
              <td>${fmtEUR(t.coste)}</td>
              <td class="col-extra">${t.cubierto_seguro ? `Sí (${t.porcentaje_aplicado || 0}%)` : 'No'}</td>
              <td class="col-extra">${fmtEUR(t.importe_reembolsado)}</td>
              <td class="col-extra">${fmtDate(t.proxima_fecha)}</td>
              <td class="row-actions">
                <a href="#/tratamientos/editar/${t.id}" onclick="event.stopPropagation()">Editar</a>
                <a href="#" onclick="event.stopPropagation();onDeleteTratamiento('${t.id}');return false;">Borrar</a>
                <span class="chevron" aria-hidden="true">›</span>
              </td>
            </tr>
          `).join('') || `<tr><td colspan="8" class="muted">Todavía no hay tratamientos.</td></tr>`}
        </tbody>
      </table>
    </div>
    <div id="tr-sheet-backdrop" class="sheet-backdrop" onclick="closeTratamientoSheet()" hidden></div>
    <div id="tr-sheet" class="sheet" hidden></div>
  `;
  $app.innerHTML = layout('Tratamientos', content);
}

let sheetTriggerEl = null;

function openTratamientoSheet(id) {
  const t = state.tratamientos.find(x => x.id === id);
  if (!t) return;
  sheetTriggerEl = document.activeElement;
  const cat = categoriaById(t.categoria_id);
  const sheet = document.getElementById('tr-sheet');
  sheet.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-header">
      <span class="tag" style="color:${readableCategoryColor(cat.color)};--tag-accent:${cat.color}">${cat.nombre}</span>
      <strong id="tr-sheet-title">${t.descripcion || ''}</strong>
    </div>
    <div class="detail-grid">
      <div><span class="detail-label">Fecha</span>${fmtDate(t.fecha)}</div>
      <div><span class="detail-label">Coste</span>${fmtEUR(t.coste)}</div>
      <div><span class="detail-label">Seguro</span>${t.cubierto_seguro ? `Sí (${t.porcentaje_aplicado || 0}%)` : 'No'}</div>
      <div><span class="detail-label">Reembolsado</span>${fmtEUR(t.importe_reembolsado)}</div>
      <div><span class="detail-label">Próxima vez</span>${fmtDate(t.proxima_fecha)}</div>
    </div>
    <div class="sheet-actions">
      <a href="#/tratamientos/editar/${t.id}" class="btn primary">Editar</a>
      <button type="button" class="btn danger" onclick="closeTratamientoSheet();onDeleteTratamiento('${t.id}')">Borrar</button>
    </div>
  `;
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-labelledby', 'tr-sheet-title');
  sheet.setAttribute('tabindex', '-1');
  const backdrop = document.getElementById('tr-sheet-backdrop');
  backdrop.hidden = false;
  sheet.hidden = false;
  requestAnimationFrame(() => {
    backdrop.classList.add('show');
    sheet.classList.add('show');
    sheet.focus();
  });
  document.addEventListener('keydown', onSheetKeydown);
}

function onSheetKeydown(ev) {
  const sheet = document.getElementById('tr-sheet');
  if (ev.key === 'Escape') { closeTratamientoSheet(); return; }
  if (ev.key !== 'Tab') return;
  const focusables = sheet.querySelectorAll('a[href], button:not([disabled])');
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
  else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
}

function closeTratamientoSheet() {
  const backdrop = document.getElementById('tr-sheet-backdrop');
  const sheet = document.getElementById('tr-sheet');
  if (!backdrop || !sheet) return;
  backdrop.classList.remove('show');
  sheet.classList.remove('show');
  document.removeEventListener('keydown', onSheetKeydown);
  setTimeout(() => { backdrop.hidden = true; sheet.hidden = true; }, 200);
  if (sheetTriggerEl && typeof sheetTriggerEl.focus === 'function') sheetTriggerEl.focus();
  sheetTriggerEl = null;
}

function renderTratamientoForm(id) {
  const editing = id ? state.tratamientos.find(t => t.id === id) : null;
  const cobertura = editing ? coberturaByCategoria(editing.categoria_id) : null;

  const content = `
    <form id="tratamiento-form" class="form">
      <label>Fecha
        <input type="date" name="fecha" required value="${editing ? editing.fecha : new Date().toISOString().slice(0, 10)}">
      </label>
      <label>Categoría
        <select name="categoria_id" required>
          ${state.categorias.map(c => `<option value="${c.id}" ${editing && editing.categoria_id === c.id ? 'selected' : ''}>${c.nombre}</option>`).join('')}
        </select>
      </label>
      <label>Descripción
        <input type="text" name="descripcion" placeholder="Ej: Vacuna polivalente anual" value="${editing ? editing.descripcion || '' : ''}">
      </label>
      <label>Coste (€)
        <input type="number" step="0.01" min="0" name="coste" required value="${editing ? editing.coste : ''}">
      </label>
      <label class="checkbox">
        <input type="checkbox" name="cubierto_seguro" ${editing ? (editing.cubierto_seguro ? 'checked' : '') : (cobertura && cobertura.cubierta ? 'checked' : '')}>
        Cubierto por el seguro
      </label>
      <label>Periodicidad (meses) — para calcular el próximo recordatorio
        <input type="number" min="0" name="periodicidad_meses" value="${editing ? editing.periodicidad_meses || '' : ''}">
      </label>
      <label>Próxima fecha (se calcula sola si pones periodicidad, pero puedes ajustarla)
        <input type="date" name="proxima_fecha" value="${editing ? editing.proxima_fecha || '' : ''}">
      </label>
      <label>Notas
        <textarea name="notas">${editing ? editing.notas || '' : ''}</textarea>
      </label>
      <div class="form-actions">
        <a href="#/tratamientos" class="btn">Cancelar</a>
        <button type="submit" class="btn primary">Guardar</button>
      </div>
    </form>
  `;
  $app.innerHTML = layout(editing ? 'Editar tratamiento' : 'Nuevo tratamiento', content);

  const form = document.getElementById('tratamiento-form');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const categoriaId = fd.get('categoria_id');
    const cub = coberturaByCategoria(categoriaId);
    const cubiertoSeguro = fd.get('cubierto_seguro') === 'on';
    const coste = Number(fd.get('coste'));
    const porcentaje = cubiertoSeguro
      ? Number((cub && cub.porcentaje_especifico) || (state.seguro && state.seguro.porcentaje_reembolso_general) || 0)
      : 0;

    let proximaFecha = fd.get('proxima_fecha');
    const periodicidad = fd.get('periodicidad_meses');
    if (!proximaFecha && periodicidad) proximaFecha = addMonths(fd.get('fecha'), periodicidad);

    const data = {
      id: editing ? editing.id : undefined,
      fecha: fd.get('fecha'),
      categoria_id: categoriaId,
      descripcion: fd.get('descripcion'),
      coste,
      cubierto_seguro: cubiertoSeguro,
      porcentaje_aplicado: porcentaje,
      importe_reembolsado: Math.round(coste * porcentaje) / 100,
      periodicidad_meses: periodicidad,
      proxima_fecha: proximaFecha,
      notas: fd.get('notas')
    };

    const res = editing ? await Api.updateTratamiento(data) : await Api.createTratamiento(data);
    if (res.error) { showToast('No se ha podido guardar: ' + res.error, 'error'); return; }
    state.loaded = false;
    location.hash = '#/tratamientos';
    await loadData();
    route();
    showToast('Tratamiento guardado ✓');
  });
}

async function onDeleteTratamiento(id) {
  if (!confirm('¿Borrar este tratamiento? No se puede deshacer.')) return;
  const res = await Api.deleteTratamiento(id);
  if (res.error) { showToast('No se ha podido borrar: ' + res.error, 'error'); return; }
  state.loaded = false;
  await loadData();
  route();
  showToast('Tratamiento borrado');
}

// ---------- Calendario ----------

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS_CORTO = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const DIAS_LARGO = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function startOfWeekMonday(dateStr) {
  const d = new Date(dateStr);
  const offset = (d.getDay() + 6) % 7; // getDay(): 0=domingo..6=sábado -> semana empieza en lunes
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10);
}
function eventosPorDia() {
  const porDia = {};
  state.tratamientos.forEach(t => {
    if (!t.proxima_fecha) return;
    porDia[t.proxima_fecha] = porDia[t.proxima_fecha] || [];
    porDia[t.proxima_fecha].push(t);
  });
  return porDia;
}
function fmtRangoSemana(startStr, endStr) {
  const start = new Date(startStr), end = new Date(endStr);
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  if (sameMonth) return `${start.getDate()}–${end.getDate()} ${MESES_CORTO[start.getMonth()]} ${start.getFullYear()}`;
  const sameYear = start.getFullYear() === end.getFullYear();
  return `${start.getDate()} ${MESES_CORTO[start.getMonth()]}${sameYear ? '' : ' ' + start.getFullYear()} – ${end.getDate()} ${MESES_CORTO[end.getMonth()]} ${end.getFullYear()}`;
}

function setCalendarView(view) {
  if (calendarState.view === view) return;
  calendarState.view = view;
  renderCalendario();
}

function shiftCalendar(delta) {
  if (calendarState.view === 'semana') {
    calendarState.ref = addDays(calendarState.ref, delta * 7);
  } else {
    const d = new Date(calendarState.ref);
    d.setDate(1); // evita desbordes de fin de mes (p.ej. 31 ene + 1 mes)
    d.setMonth(d.getMonth() + delta);
    calendarState.ref = d.toISOString().slice(0, 10);
  }
  renderCalendario();
}

function calendarViewToggle() {
  return `
    <div class="cal-view-toggle" role="group" aria-label="Vista del calendario">
      <button type="button" class="btn small ${calendarState.view === 'mes' ? 'active' : ''}" aria-pressed="${calendarState.view === 'mes'}" onclick="setCalendarView('mes')">Mes</button>
      <button type="button" class="btn small ${calendarState.view === 'semana' ? 'active' : ''}" aria-pressed="${calendarState.view === 'semana'}" onclick="setCalendarView('semana')">Semana</button>
    </div>
  `;
}

function renderCalendario() {
  const content = calendarState.view === 'semana' ? renderCalendarioSemana() : renderCalendarioMes();
  $app.innerHTML = layout('Calendario', content);
}

function renderCalendarioMes() {
  const ref = new Date(calendarState.ref);
  const year = ref.getFullYear();
  const month = ref.getMonth();

  const firstOfMonth = new Date(year, month, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = new Date().toISOString().slice(0, 10);
  const porDia = eventosPorDia();

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push('<div class="cal-cell empty"></div>');
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const eventos = porDia[dateStr] || [];
    const isToday = dateStr === todayStr;
    cells.push(`
      <div class="cal-cell ${isToday ? 'today' : ''} ${eventos.length ? 'has-events' : ''}">
        <div class="cal-daynum">${d}</div>
        ${eventos.map(t => `
          <div class="cal-event" style="background:${categoriaById(t.categoria_id).color}22;color:${readableCategoryColor(categoriaById(t.categoria_id).color)}" title="${categoriaById(t.categoria_id).nombre} — ${t.descripcion || ''}">
            ${categoriaById(t.categoria_id).nombre}
          </div>
        `).join('')}
      </div>
    `);
  }

  return `
    <div class="cal-header">
      <button class="btn" onclick="shiftCalendar(-1)" aria-label="Mes anterior">‹ Anterior</button>
      <div class="cal-title">${MESES[month]} ${year}</div>
      <button class="btn" onclick="shiftCalendar(1)" aria-label="Mes siguiente">Siguiente ›</button>
    </div>
    ${calendarViewToggle()}
    <div class="cal-grid cal-grid-labels">
      ${DIAS_CORTO.map(d => `<div class="cal-daylabel">${d}</div>`).join('')}
    </div>
    <div class="cal-grid">
      ${cells.join('')}
    </div>
    <p class="muted" style="margin-top:14px;">Cada bloque de color es un tratamiento con recordatorio para ese día. Para cambiar la fecha, edítalo desde la pestaña Tratamientos.</p>
  `;
}

function renderCalendarioSemana() {
  const start = startOfWeekMonday(calendarState.ref);
  const end = addDays(start, 6);
  const todayStr = new Date().toISOString().slice(0, 10);
  const porDia = eventosPorDia();

  const dias = [];
  for (let i = 0; i < 7; i++) {
    const dateStr = addDays(start, i);
    const d = new Date(dateStr);
    const eventos = porDia[dateStr] || [];
    const isToday = dateStr === todayStr;
    dias.push(`
      <div class="cal-week-day ${isToday ? 'today' : ''}">
        <div class="cal-week-daylabel">${DIAS_LARGO[i]} <span class="muted">${d.getDate()} ${MESES_CORTO[d.getMonth()]}</span></div>
        ${eventos.length === 0 ? '<p class="muted">Sin tratamientos previstos.</p>' : `
          <ul class="reminder-list">
            ${eventos.map(t => `
              <li>
                <span class="dot" style="background:${categoriaById(t.categoria_id).color}" aria-hidden="true"></span>
                <div class="reminder-body">
                  <span class="tag" style="color:${readableCategoryColor(categoriaById(t.categoria_id).color)};--tag-accent:${categoriaById(t.categoria_id).color}">${categoriaById(t.categoria_id).nombre}</span>
                  ${t.descripcion || ''}
                </div>
              </li>
            `).join('')}
          </ul>
        `}
      </div>
    `);
  }

  return `
    <div class="cal-header">
      <button class="btn" onclick="shiftCalendar(-1)" aria-label="Semana anterior">‹ Anterior</button>
      <div class="cal-title">${fmtRangoSemana(start, end)}</div>
      <button class="btn" onclick="shiftCalendar(1)" aria-label="Semana siguiente">Siguiente ›</button>
    </div>
    ${calendarViewToggle()}
    <div class="cal-week">
      ${dias.join('')}
    </div>
  `;
}

// ---------- Guía ----------

function renderGuia() {
  const content = `
    <p class="muted">Cuadro orientativo de periodicidad de tratamientos habituales en perros adultos. Es solo una referencia: la pauta real siempre la marca el veterinario.</p>
    ${CUADRO_MAESTRO.map(grupo => `
      <section class="panel">
        <h2>${grupo.grupo}</h2>
        <table class="table">
          <thead><tr><th>Tratamiento</th><th>Periodicidad</th><th>Notas</th></tr></thead>
          <tbody>
            ${grupo.items.map(item => `
              <tr>
                <td>${item.nombre}</td>
                <td>${item.periodicidad}</td>
                <td class="muted">${item.notas}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </section>
    `).join('')}
  `;
  $app.innerHTML = layout('Guía', content);
}

// ---------- Seguro ----------

function renderSeguro() {
  const s = state.seguro || {};
  const content = `
    <form id="seguro-form" class="form">
      <label>Compañía
        <input type="text" name="compania" value="${s.compania || ''}" required>
      </label>
      <label>Nº de póliza
        <input type="text" name="poliza" value="${s.poliza || ''}">
      </label>
      <label>% de reembolso general
        <input type="number" min="0" max="100" name="porcentaje_reembolso_general" value="${s.porcentaje_reembolso_general || 0}" required>
      </label>
      <label>Fecha de inicio
        <input type="date" name="fecha_inicio" value="${s.fecha_inicio || ''}">
      </label>
      <label>Fecha de renovación
        <input type="date" name="fecha_renovacion" value="${s.fecha_renovacion || ''}">
      </label>
      <label>Notas
        <textarea name="notas">${s.notas || ''}</textarea>
      </label>
      <div class="form-actions">
        <button type="submit" class="btn primary">Guardar póliza</button>
      </div>
    </form>

    <section class="panel">
      <h2>Cobertura por categoría</h2>
      <p class="muted">Marca qué categorías cubre el seguro. Si dejas el % específico vacío, se usa el % general de la póliza.</p>
      <table class="table">
        <thead><tr><th>Categoría</th><th>Cubierta</th><th>% específico (opcional)</th><th></th></tr></thead>
        <tbody id="coberturas-body">
          ${state.categorias.map(c => {
            const cob = coberturaByCategoria(c.id) || {};
            return `
              <tr data-categoria="${c.id}">
                <td><span class="tag" style="color:${readableCategoryColor(c.color)};--tag-accent:${c.color}">${c.nombre}</span></td>
                <td><input type="checkbox" class="cob-cubierta" ${cob.cubierta ? 'checked' : ''}></td>
                <td><input type="number" min="0" max="100" class="cob-porcentaje" placeholder="general" value="${cob.porcentaje_especifico || ''}"></td>
                <td><button class="btn small" onclick="onSaveCobertura('${c.id}')" type="button">Guardar</button></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </section>
  `;
  $app.innerHTML = layout('Seguro', content);

  document.getElementById('seguro-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const data = { id: s.id, ...Object.fromEntries(fd.entries()) };
    const res = await Api.upsertSeguro(data);
    if (res.error) { showToast('No se ha podido guardar: ' + res.error, 'error'); return; }
    state.loaded = false;
    await loadData();
    route();
    showToast('Póliza guardada ✓');
  });
}

async function onSaveCobertura(categoriaId) {
  const row = document.querySelector(`tr[data-categoria="${categoriaId}"]`);
  const cubierta = row.querySelector('.cob-cubierta').checked;
  const porcentaje = row.querySelector('.cob-porcentaje').value;
  const res = await Api.upsertCobertura({ categoria_id: categoriaId, cubierta, porcentaje_especifico: porcentaje });
  if (res.error) { showToast('No se ha podido guardar: ' + res.error, 'error'); return; }
  state.loaded = false;
  await loadData();
  route();
  showToast('Cobertura guardada ✓');
}

// ---------- Ajustes ----------

function renderAjustes() {
  const content = `
    <section class="panel">
      <h2>Usuarios con acceso</h2>
      <ul>
        ${state.usuarios.map(u => `<li>${u.nombre} — ${u.email}</li>`).join('')}
      </ul>
      <p class="muted">Para añadir o quitar acceso, edita la pestaña "Usuarios" de la Google Sheet.</p>
    </section>
    <section class="panel">
      <h2>Notificaciones push</h2>
      <p class="muted">Actívalas para recibir avisos en el móvil además del email.</p>
      <button class="btn primary" id="enable-push">Activar notificaciones push</button>
      <p id="push-status" class="muted"></p>
    </section>
    <section class="panel">
      <button class="btn" onclick="logout()">Cerrar sesión</button>
    </section>
  `;
  $app.innerHTML = layout('Ajustes', content);
  document.getElementById('enable-push').addEventListener('click', enablePush);
}
