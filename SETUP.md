# Puesta en marcha de Pistacho

Sigue estos pasos en orden. Los pasos 1-4 son obligatorios; el paso 5 (push) es opcional.

## 1. Crear la Google Sheet

1. Ve a [sheets.google.com](https://sheets.google.com) y crea una hoja nueva, por ejemplo "Pistacho — Salud y Seguro".
2. Extensiones > Apps Script.
3. Borra el contenido de `Code.gs` que aparece por defecto y pega el contenido del archivo `apps-script/Code.gs` de este repo.
4. En el editor de Apps Script, ve a **Configuración del proyecto** (icono de engranaje) y en "Propiedades del script" añade:
   - `GOOGLE_CLIENT_ID` → lo obtienes en el paso 2.
   - `SESSION_SECRET` → cualquier cadena larga aleatoria (invéntatela, por ejemplo generada con `openssl rand -hex 32`).
5. Vuelve al editor, selecciona la función `initSpreadsheet` en el desplegable de funciones y pulsa **Ejecutar**. Te pedirá autorizar permisos la primera vez — acéptalos (es tu propio script accediendo a tu propia hoja).
6. Esto crea las pestañas `Usuarios`, `Categorias`, `Seguro`, `Coberturas`, `Tratamientos`, `PushTokens` y rellena las categorías por defecto.
7. Abre la pestaña `Usuarios` y añade tres filas, una por cada persona con acceso (columna `email` con la cuenta de Gmail de cada uno, columna `nombre` con el nombre a mostrar). Estas tres personas son las únicas que podrán entrar en la app.
8. Selecciona la función `crearTriggerDiario` y ejecútala una vez: crea el aviso automático diario a las 9:00 que revisa qué tratamientos vencen pronto.

## 2. Crear el ID de cliente de Google (para el botón "Iniciar sesión con Google")

1. Ve a [Google Cloud Console](https://console.cloud.google.com/) y crea un proyecto nuevo (o usa uno existente).
2. APIs y servicios > Pantalla de consentimiento OAuth: tipo "Externo", rellena nombre de la app ("Pistacho") y tu email de soporte. En "Usuarios de prueba" añade los 3 emails autorizados (mientras la app esté en modo prueba, solo estos podrán iniciar sesión, lo cual es justo lo que quieres).
3. APIs y servicios > Credenciales > Crear credenciales > ID de cliente de OAuth. Tipo: **Aplicación web**.
4. En "Orígenes de JavaScript autorizados" añade: `https://pistacho.jcastillo.es`
5. Copia el Client ID generado (termina en `.apps.googleusercontent.com`).
6. Pégalo en `js/config.js` (`GOOGLE_CLIENT_ID`) y también en la propiedad de script `GOOGLE_CLIENT_ID` del paso 1.4.

## 3. Desplegar el Apps Script como API

1. En el editor de Apps Script: **Implementar > Nueva implementación**.
2. Tipo: **Aplicación web**.
3. "Ejecutar como": tu cuenta (la propietaria de la hoja).
4. "Quién tiene acceso": **Cualquier usuario**. (No te preocupes: la app igualmente exige login de Google y comprueba el email contra la pestaña `Usuarios` en cada petición; esta opción solo controla si Google exige sesión previa para *llamar* a la URL, y con "Cualquier usuario" el flujo de login por token funciona correctamente.)
5. Copia la URL de la implementación (`.../exec`) y pégala en `js/config.js` (`API_URL`).
6. Cada vez que cambies `Code.gs`, tendrás que hacer **Implementar > Gestionar implementaciones > Editar > Nueva versión** para que los cambios se apliquen a esa misma URL.

## 4. Publicar la PWA en GitHub Pages

1. En este repositorio: **Settings > Pages**.
2. Source: "Deploy from a branch", branch `main`, carpeta `/ (root)`.
3. En tu proveedor de DNS, crea un registro CNAME para `pistacho.jcastillo.es` apuntando a `<tu-usuario>.github.io` (el archivo `CNAME` de este repo ya deja configurado el dominio personalizado en GitHub Pages, solo falta el DNS).
4. Espera a que se propague el DNS y a que GitHub emita el certificado HTTPS (unos minutos).
5. Abre `https://pistacho.jcastillo.es`, entra con tu Google, y desde el móvil usa "Añadir a pantalla de inicio" para instalarla como app.

## 5. (Opcional) Notificaciones push en el móvil

Sin este paso, los recordatorios te llegan igualmente por **email** todos los días a las 9:00. Este paso añade además notificación push en el navegador/móvil.

1. Ve a [Firebase Console](https://console.firebase.google.com/) y crea un proyecto (puedes vincularlo al mismo proyecto de Google Cloud del paso 2).
2. Añade una app web dentro del proyecto Firebase. Copia el objeto de configuración (`apiKey`, `authDomain`, `projectId`, `messagingSenderId`, `appId`) a `js/config.js` (`CONFIG.FIREBASE`) y a `firebase-messaging-sw.js`.
3. En Firebase Console > Configuración del proyecto > Cloud Messaging > "Certificados push web", genera un par de claves y copia la "Clave del par de claves" (VAPID key) a `js/config.js` (`CONFIG.VAPID_KEY`).
4. En Firebase Console > Configuración del proyecto > Cuentas de servicio, genera una nueva clave privada (se descarga un JSON). Copia el contenido completo de ese JSON como valor de la propiedad de script `FCM_SERVICE_ACCOUNT_JSON` (paso 1.4), y el `project_id` que aparece dentro del JSON como `FCM_PROJECT_ID`.
5. Vuelve a desplegar (nueva versión del Web App, paso 3.6) y vuelve a subir los archivos del frontend con los valores rellenados.
6. En la app, ve a Ajustes > "Activar notificaciones push" en cada dispositivo desde el que quieras recibir avisos.

## Categorías y periodicidades sugeridas

Ya vienen precargadas al ejecutar `initSpreadsheet`. Puedes editarlas o añadir más directamente en la pestaña `Categorias` de la hoja.

| Categoría | Periodicidad orientativa |
|---|---|
| Vacunas | 12 meses |
| Desparasitación interna | 3 meses |
| Desparasitación externa | 1-8 meses según producto |
| Prevención leishmaniosis | 12 meses (collar) o 1 mes (pipeta) |
| Revisión general | 12 meses |
| Analítica | 12 meses |
| Limpieza dental | según valoración veterinaria |
