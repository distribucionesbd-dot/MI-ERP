/* =========================================================
   AUTH-SERVICE.JS
   Solo se ocupa de autenticación y sesión. No sabe nada de
   productos/ventas ni de IndexedDB de datos operativos.

   Sesión persistente en localStorage (REGLA 4): {store_id,
   store_name, device_id, token, username}. device_id es estable
   por instalación/navegador y sobrevive a logout/login.
   ========================================================= */
window.AuthService = (function(){
  const LS = window.APP_CONFIG.LS_KEYS;

  function deviceId(){
    let id = localStorage.getItem(LS.deviceId);
    if(!id){
      id = Utils.uuid();
      localStorage.setItem(LS.deviceId, id);
    }
    return id;
  }

  function getSession(){
    try{
      const raw = localStorage.getItem(LS.session);
      return raw ? JSON.parse(raw) : null;
    }catch(e){ return null; }
  }
  function _saveSession(session){
    localStorage.setItem(LS.session, JSON.stringify(session));
  }

  function isLoggedIn(){ return !!getSession(); }

  // Login online contra Apps Script. Si no hay conexión pero ya existe
  // sesión válida guardada, el caller debe usar getSession() para entrar offline
  // en vez de llamar a login() (ver app.js: flujo de arranque).
  async function login(username, password){
    const url = window.APP_CONFIG.APPS_SCRIPT_URL;
    const body = { action:'login', username, password, device_id: deviceId(), app_version: window.APP_CONFIG.APP_VERSION };
    let resp;
    try{
      resp = await fetch(url, {
        method:'POST',
        headers:{'Content-Type':'text/plain;charset=utf-8'}, // evita preflight CORS en Apps Script
        body: JSON.stringify(body)
      });
    }catch(e){
      throw new Error('SIN_CONEXION');
    }
    let data;
    try{ data = await resp.json(); } catch(e){ throw new Error('RESPUESTA_INVALIDA'); }
    if(!data.ok) throw new Error(data.error || 'LOGIN_INVALIDO');

    const session = {
      store_id: data.store_id,
      store_name: data.store_name,
      username,
      device_id: deviceId(),
      token: data.token
    };
    _saveSession(session);
    return session;
  }

  // Cierra sesión SIN borrar los datos locales del store_id (REGLA 3, sección "Login y locales").
  function logout(){
    localStorage.removeItem(LS.session);
  }

  return { deviceId, getSession, isLoggedIn, login, logout };
})();
