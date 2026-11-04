/* Configuración de la cuenta MiVibra. Al compilar en GitHub se rellena con los secretos del repositorio
   (MV_FIREBASE, MV_ADMIN_EMAIL, MV_GOOGLE_WEB_CLIENT, MV_GOOGLE_TV_CLIENT, MV_GOOGLE_TV_SECRET).
   Si queda vacía, la app funciona sola, sin inicio de sesión. */
window.MV_CONFIG = { firebase: null, admin: '', webClientId: '', tvClientId: '', tvClientSecret: '' };
