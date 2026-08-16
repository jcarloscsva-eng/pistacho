// Rellena estos valores siguiendo SETUP.md antes de usar la app.
const CONFIG = {
  // Google Cloud Console > Credenciales > ID de cliente de OAuth 2.0 (tipo "Aplicación web")
  GOOGLE_CLIENT_ID: '726662767018-eh76hipq9mej13jv6tm2en2jm5ompaf6.apps.googleusercontent.com',

  // URL de despliegue del Apps Script (Implementar > Nueva implementación > Aplicación web)
  API_URL: 'https://script.google.com/macros/s/AKfycbxVWDda80JrnqTkrlfsdgWeMvEPZ0GX1hss1EV-eEovT0HLV9GeyOvJMNhGDI9ihWddqg/exec',

  // Opcional: solo necesario si activas notificaciones push (ver SETUP.md, paso Firebase)
  FIREBASE: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    messagingSenderId: '',
    appId: ''
  },
  VAPID_KEY: '',

  // Nombres a mostrar para cada email autorizado (solo cosmético; la autorización real
  // vive en la pestaña "Usuarios" de la Google Sheet, no aquí).
  DISPLAY_NAMES: {}
};
