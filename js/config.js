/* =========================================================
   CONFIG.JS
   Constantes globales de la aplicación. No poner secretos acá:
   la URL de Apps Script no es secreta (el backend valida store_id/token).
   ========================================================= */
window.APP_CONFIG = {
  APP_VERSION: '1.0.0',
  DB_VERSION: 1,

  // Reemplazá esto por la URL de tu Web App de Apps Script (ver SETUP_ADMIN.md).
  // También se puede pisar en tiempo de ejecución desde Configuración > Diagnóstico.
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/TU_DEPLOYMENT_ID/exec',

  SYNC_INTERVAL_MS: 10 * 60 * 1000,        // cada 10 minutos
  SYNC_VISIBILITY_DEBOUNCE_MS: 3000,       // debounce al volver visible
  SYNC_AFTER_OP_DELAY_MS: 4000,            // intento oportunista tras operación
  SYNC_BATCH_SIZE: 80,                     // eventos por lote (entre 50 y 100)
  SYNC_BACKOFF_BASE_MS: 5000,              // backoff exponencial: base * 2^intentos
  SYNC_BACKOFF_MAX_MS: 5 * 60 * 1000,
  SYNC_HTTP_TIMEOUT_MS: 20000,

  // Umbrales visuales (minutos) para avisos de venta abierta / última venta.
  UMBRAL_INDICADOR_ALERTA_MIN: 5,
  UMBRAL_INDICADOR_URGENTE_MIN: 15,
  UMBRAL_ULTIMA_VENTA_ALERTA_MIN: 30,
  UMBRAL_ULTIMA_VENTA_URGENTE_MIN: 60,

  LS_KEYS: {
    session: 'erp_session',        // {store_id, store_name, device_id, token}
    deviceId: 'erp_device_id',
    appVersionSeen: 'erp_app_version_seen'
  }
};
