/* =========================================================
   APP.JS
   Bootstrap: arranca sesión, storage, sync y todas las vistas.
   Es el único archivo que conoce el orden de arranque completo.
   ========================================================= */
(function(){

  async function actualizarHeader(){
    const session = AuthService.getSession();
    const config = await StorageService.getConfig();
    document.getElementById('headerBizName').textContent = config.nombre || session?.store_name || 'Mi ERP';
    document.getElementById('headerBizSub').textContent = session?.store_name && session.store_name!==config.nombre ? session.store_name : '';
  }
  window.actualizarHeader = actualizarHeader;

  async function recargarVistaActual(){
    const v = window.UiNav.currentView();
    if(window.ViewHandlers[v]) await window.ViewHandlers[v]();
    if(window.ViewHandlers.dashboard) await window.ViewHandlers.dashboard();
  }
  window.recargarVistaActual = recargarVistaActual;

  function actualizarIndicadorHeader(status){
    const btn = document.getElementById('syncIndicator');
    const msg = Utils.mensajeSync(status);
    btn.textContent = msg.texto;
    btn.className = msg.clase;
  }

  async function bootstrapApp(session){
    await StorageService.init(session.store_id, session.device_id);
    SyncService.init(session);

    // Migración de esquema local ya corrió dentro de Db.openForStore (REGLA 9).
    await actualizarHeader();

    [UiProductos, UiVenta, UiBoletas, UiClientes, UiGastos, UiReportes, UiConfig].forEach(m=> m.init());
    window.UiNav.init();

    document.getElementById('syncIndicator').addEventListener('click', async ()=>{
      UiToast.toast('Sincronizando...');
      await SyncService.syncNow();
    });
    SyncService.onStatusChange(actualizarIndicadorHeader);
    actualizarIndicadorHeader(SyncService.getStatus());

    await UiVenta.verificarBorradorAlIniciar();

    SyncService.syncNow();       // intento al abrir/inicializar (REGLA 7)
    SyncService.startTimers();   // cada 10 min + online + visibilitychange (REGLA 7)
  }

  async function iniciar(){
    _registrarServiceWorker();
    const session = AuthService.getSession();
    if(session){
      await bootstrapApp(session);
    } else {
      UiLogin.mostrarLogin(async (nuevaSesion)=>{ await bootstrapApp(nuevaSesion); });
    }
  }

  /* ---- Service worker + aviso de actualización (REGLA 9) ---- */
  function _registrarServiceWorker(){
    if(!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('service-worker.js').then(reg=>{
      reg.addEventListener('updatefound', ()=>{
        const nuevoWorker = reg.installing;
        if(!nuevoWorker) return;
        nuevoWorker.addEventListener('statechange', ()=>{
          if(nuevoWorker.state==='installed' && navigator.serviceWorker.controller){
            document.getElementById('updateBanner').classList.add('show');
          }
        });
      });
    }).catch(err=> console.warn('No se pudo registrar el service worker', err));

    document.getElementById('btnActualizarApp').addEventListener('click', ()=>{
      navigator.serviceWorker.getRegistration().then(reg=>{
        if(reg && reg.waiting) reg.waiting.postMessage({type:'SKIP_WAITING'});
      });
    });
    let refrescando = false;
    navigator.serviceWorker.addEventListener('controllerchange', ()=>{
      if(refrescando) return;
      refrescando = true;
      window.location.reload();
    });
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
