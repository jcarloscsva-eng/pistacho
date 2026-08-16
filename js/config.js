// Rellena estos valores siguiendo SETUP.md antes de usar la app.
const CONFIG = {
  // Google Cloud Console > Credenciales > ID de cliente de OAuth 2.0 (tipo "Aplicación web")
  GOOGLE_CLIENT_ID: 'TU_CLIENT_ID.apps.googleusercontent.com',

  // URL de despliegue del Apps Script (Implementar > Nueva implementación > Aplicación web)
  API_URL: 'https://script.google.com/macros/s/TU_DEPLOYMENT_ID/exec',

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
