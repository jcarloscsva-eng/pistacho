// Notificaciones push vía Firebase Cloud Messaging.
// Requiere haber configurado CONFIG.FIREBASE y CONFIG.VAPID_KEY (ver SETUP.md).
// Si no están configurados, el botón avisa y no hace nada: el resto de la
// app (email + dashboard) funciona igualmente sin esto.

async function enablePush() {
  const statusEl = document.getElementById('push-status');
  if (!CONFIG.FIREBASE.apiKey || !CONFIG.VAPID_KEY) {
    statusEl.textContent = 'Push no configurado todavía (ver SETUP.md, paso Firebase).';
    return;
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    statusEl.textContent = 'Este navegador no soporta notificaciones push.';
    return;
  }

  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      statusEl.textContent = 'Permiso de notificaciones denegado.';
      return;
    }

    await loadFirebaseSdk();
    const app = firebase.initializeApp(CONFIG.FIREBASE);
    const messaging = firebase.messaging(app);
    const swReg = await navigator.serviceWorker.getRegistration('/');

    const token = await messaging.getToken({
      vapidKey: CONFIG.VAPID_KEY,
      serviceWorkerRegistration: swReg
    });

    if (!token) {
      statusEl.textContent = 'No se pudo obtener el token de notificaciones.';
      return;
    }

    const res = await Api.registerPushToken(token);
    statusEl.textContent = res.error
      ? 'Error registrando el token en el servidor.'
      : 'Notificaciones push activadas en este dispositivo.';
  } catch (e) {
    statusEl.textContent = 'Error activando push: ' + e.message;
  }
}

function loadFirebaseSdk() {
  if (window.firebase) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s1 = document.createElement('script');
    s1.src = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js';
    s1.onload = () => {
      const s2 = document.createElement('script');
      s2.src = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js';
      s2.onload = resolve;
      s2.onerror = reject;
      document.head.appendChild(s2);
    };
    s1.onerror = reject;
    document.head.appendChild(s1);
  });
}
