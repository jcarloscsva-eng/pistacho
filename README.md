# Pistacho — Salud y Seguro 🐾

PWA para llevar la gestión médica y del seguro de Pistacho (Jack Russell): alta de tratamientos por categoría con su coste, cobertura del seguro, recordatorios automáticos de próxima aplicación, y reporte de gasto real vs. reembolsado.

- **Frontend**: HTML/CSS/JS sin frameworks, instalable como PWA, alojado en GitHub Pages.
- **Backend**: Google Apps Script, actuando como API sobre una Google Sheet (que hace de base de datos).
- **Login**: Google Sign-In, restringido a los 3 emails que añadas en la pestaña `Usuarios` de la hoja.
- **Recordatorios**: email diario automático + notificación push opcional (Firebase Cloud Messaging).

Instrucciones completas de despliegue en [SETUP.md](./SETUP.md).
