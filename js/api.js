// Cliente para el backend en Apps Script.
// Nota: los POST se envían con Content-Type "text/plain" a propósito.
// Apps Script Web Apps no manejan bien el preflight OPTIONS de CORS con
// "application/json", así que se evita el preflight enviando texto plano
// y parseando JSON manualmente en el backend (ver Code.gs).

const Api = {
  session: null, // { token, email, nombre }

  loadSession() {
    const raw = localStorage.getItem('pistacho_session');
    if (!raw) return null;
    try {
      const s = JSON.parse(raw);
      if (s.expires && s.expires > Date.now()) {
        this.session = s;
        return s;
      }
    } catch (e) { /* sesión corrupta, se ignora */ }
    localStorage.removeItem('pistacho_session');
    return null;
  },

  saveSession(s) {
    this.session = s;
    localStorage.setItem('pistacho_session', JSON.stringify(s));
  },

  clearSession() {
    this.session = null;
    localStorage.removeItem('pistacho_session');
  },

  async login(idToken) {
    const res = await this._post({ action: 'login', idToken });
    if (!res.ok) throw new Error(res.error || 'Login rechazado');
    this.saveSession({
      token: res.sessionToken,
      email: res.email,
      nombre: res.nombre,
      expires: Date.now() + 12 * 60 * 60 * 1000 // 12h
    });
    return res;
  },

  async bootstrap() {
    return this._get({ action: 'bootstrap' });
  },

  async createTratamiento(data) {
    return this._post({ action: 'createTratamiento', data });
  },
  async updateTratamiento(data) {
    return this._post({ action: 'updateTratamiento', data });
  },
  async deleteTratamiento(id) {
    return this._post({ action: 'deleteTratamiento', id });
  },
  async upsertSeguro(data) {
    return this._post({ action: 'upsertSeguro', data });
  },
  async upsertCobertura(data) {
    return this._post({ action: 'upsertCobertura', data });
  },
  async registerPushToken(fcmToken) {
    return this._post({ action: 'registerPushToken', fcmToken });
  },

  async _get(params) {
    const token = this.session ? this.session.token : '';
    const qs = new URLSearchParams({ ...params, token }).toString();
    const res = await fetch(`${CONFIG.API_URL}?${qs}`, { method: 'GET' });
    return this._handle(res);
  },

  async _post(body) {
    const token = this.session ? this.session.token : '';
    const res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...body, token })
    });
    return this._handle(res);
  },

  async _handle(res) {
    const json = await res.json();
    if (json.error === 'session_expired') {
      Api.clearSession();
      location.hash = '#/login';
    }
    return json;
  }
};
