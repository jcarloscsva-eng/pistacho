const state = {
  categorias: [],
  seguro: null,
  coberturas: [],
  tratamientos: [],
  usuarios: [],
  loaded: false
};

const calendarState = { year: new Date().getFullYear(), month: new Date().getMonth() }; // month: 0-11

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
function showToast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.remove('show');
  void el.offsetWidth; // reinicia la animación si se pulsa varias veces seguidas
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 2500);
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
    { theme: 'filled_black', size: 'large', text: 'signin_with', shape: 'pill' }
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
              <span class="dot" style="background:${categoriaById(t.categoria_id).color}"></span>
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
          <tr class="tr-main" onclick="openTratamientoSheet('${t.id}')">
            <td>${fmtDate(t.fecha)}</td>
            <td><span class="tag" style="color:${categoriaById(t.categoria_id).color}">${categoriaById(t.categoria_id).nombre}</span></td>
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
    <div id="tr-sheet-backdrop" class="sheet-backdrop" onclick="closeTratamientoSheet()" hidden></div>
    <div id="tr-sheet" class="sheet" hidden></div>
  `;
  $app.innerHTML = layout('Tratamientos', content);
}

function openTratamientoSheet(id) {
  const t = state.tratamientos.find(x => x.id === id);
  if (!t) return;
  const cat = categoriaById(t.categoria_id);
  document.getElementById('tr-sheet').innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-header">
      <span class="tag" style="color:${cat.color}">${cat.nombre}</span>
      <strong>${t.descripcion || ''}</strong>
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
  const backdrop = document.getElementById('tr-sheet-backdrop');
  const sheet = document.getElementById('tr-sheet');
  backdrop.hidden = false;
  sheet.hidden = false;
  requestAnimationFrame(() => {
    backdrop.classList.add('show');
    sheet.classList.add('show');
  });
}

function closeTratamientoSheet() {
  const backdrop = document.getElementById('tr-sheet-backdrop');
  const sheet = document.getElementById('tr-sheet');
  if (!backdrop || !sheet) return;
  backdrop.classList.remove('show');
  sheet.classList.remove('show');
  setTimeout(() => { backdrop.hidden = true; sheet.hidden = true; }, 200);
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
    if (res.error) { alert('No se ha podido guardar: ' + res.error); return; }
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
  if (res.error) { alert('No se ha podido borrar: ' + res.error); return; }
  state.loaded = false;
  await loadData();
  route();
  showToast('Tratamiento borrado');
}

// ---------- Calendario ----------

function shiftCalendar(delta) {
  let m = calendarState.month + delta;
  let y = calendarState.year;
  if (m < 0) { m = 11; y--; }
  if (m > 11) { m = 0; y++; }
  calendarState.month = m;
  calendarState.year = y;
  renderCalendario();
}

function renderCalendario() {
  const { year, month } = calendarState;
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  const firstOfMonth = new Date(year, month, 1);
  // getDay(): 0=domingo..6=sábado; lo convertimos a que la semana empiece en lunes
  const startOffset = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const todayStr = new Date().toISOString().slice(0, 10);

  // Agrupa tratamientos con próxima fecha por día (YYYY-MM-DD)
  const porDia = {};
  state.tratamientos.forEach(t => {
    if (!t.proxima_fecha) return;
    porDia[t.proxima_fecha] = porDia[t.proxima_fecha] || [];
    porDia[t.proxima_fecha].push(t);
  });

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
          <div class="cal-event" style="background:${categoriaById(t.categoria_id).color}22;color:${categoriaById(t.categoria_id).color}" title="${categoriaById(t.categoria_id).nombre} — ${t.descripcion || ''}">
            ${categoriaById(t.categoria_id).nombre}
          </div>
        `).join('')}
      </div>
    `);
  }

  const content = `
    <div class="cal-header">
      <button class="btn" onclick="shiftCalendar(-1)">‹ Anterior</button>
      <div class="cal-title">${MESES[month]} ${year}</div>
      <button class="btn" onclick="shiftCalendar(1)">Siguiente ›</button>
    </div>
    <div class="cal-grid cal-grid-labels">
      ${DIAS.map(d => `<div class="cal-daylabel">${d}</div>`).join('')}
    </div>
    <div class="cal-grid">
      ${cells.join('')}
    </div>
    <p class="muted" style="margin-top:14px;">Cada bloque de color es un tratamiento con recordatorio para ese día. Para cambiar la fecha, edítalo desde la pestaña Tratamientos.</p>
  `;
  $app.innerHTML = layout('Calendario', content);
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
                <td><span class="tag" style="color:${c.color}">${c.nombre}</span></td>
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
    if (res.error) { alert('No se ha podido guardar: ' + res.error); return; }
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
  if (res.error) { alert('No se ha podido guardar: ' + res.error); return; }
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
