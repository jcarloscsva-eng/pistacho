// Service worker requerido por Firebase Cloud Messaging para recibir
// notificaciones push en segundo plano (app cerrada o en background).
// Debe vivir en la raíz del sitio. Rellena los mismos valores que en
// js/config.js (CONFIG.FIREBASE).

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCTD5NQ-A_g9DIP4T6NQoYLoy9nB6OgN_k',
  authDomain: 'pistacho-4e804.firebaseapp.com',
  projectId: 'pistacho-4e804',
  storageBucket: 'pistacho-4e804.firebasestorage.app',
  messagingSenderId: '697796550736',
  appId: '1:697796550736:web:84ef745c55a9fd4c6fb155'
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || 'Pistacho';
  const body = (payload.notification && payload.notification.body) || 'Tienes un recordatorio pendiente.';
  self.registration.showNotification(title, {
    body,
    icon: '/icons/icon.svg'
  });
});
