window.UiConfig = (function(){

  async function cargarForm(){
    const config = await StorageService.getConfig();
    document.getElementById('cfgNombre').value = config.nombre||'';
    document.getElementById('cfgTelefono').value = config.telefono||'';
    document.getElementById('cfgDireccion').value = config.direccion||'';
    document.getElementById('cfgCuit').value = config.cuit||'';
    document.getElementById('cfgPie').value = config.pie||'';
    document.getElementById('cfgProximoNumero').value = config.proximoNumero||1;
    document.getElementById('cfgMoneda').value = config.moneda||'$';
    await actualizarEstadoSync();
    await actualizarResync();
  }

  async function guardarConfig(){
    const config = await StorageService.getConfig();
    config.nombre = document.getElementById('cfgNombre').value.trim() || 'Mi Negocio';
    config.telefono = document.getElementById('cfgTelefono').value.trim();
    config.direccion = document.getElementById('cfgDireccion').value.trim();
    config.cuit = document.getElementById('cfgCuit').value.trim();
    config.pie = document.getElementById('cfgPie').value.trim();
    config.proximoNumero = parseInt(document.getElementById('cfgProximoNumero').value) || 1;
    config.moneda = document.getElementById('cfgMoneda').value.trim() || '$';
    await StorageService.setConfig(config);
    if(window.actualizarHeader) window.actualizarHeader();
    UiToast.toast('Configuración guardada');
    SyncService.scheduleOpportunistic();
  }

  async function traerCatalogo(){
    if(!confirm('Esto trae los productos y clientes que ya existen en tu copia central hacia este dispositivo. No borra ni pisa nada de lo que ya tengas cargado acá. ¿Continuar?')) return;
    UiToast.toast('Trayendo datos del servidor...');
    const res = await BusinessService.traerCatalogoDelServidor();
    if(!res.ok){ alert(res.error); return; }
    const { productos, clientes } = res.data;
    if(productos===0 && clientes===0){
      UiToast.toast('Este dispositivo ya estaba al día');
    } else {
      UiToast.toast('Se trajeron ' + productos + ' productos y ' + clientes + ' clientes');
    }
    await window.recargarVistaActual();
  }

  async function actualizarEstadoSync(){
    const status = SyncService.getStatus();
    const msg = Utils.mensajeSync(status);
    document.getElementById('cfgEstadoSync').textContent = msg.texto + '.';
    const ultima = await StorageService.getMeta('last_successful_sync_at', null);
    document.getElementById('cfgUltimaSync').textContent = ultima
      ? ('Última vez sincronizado: ' + new Date(ultima).toLocaleString('es-AR'))
      : 'Todavía no se sincronizó con el central.';
  }

  async function exportarBackup(){
    const data = await BusinessService.exportarBackupJSON();
    Utils.descargarJSON(data, `backup-mi-erp-${Utils.hoyISO()}.json`);
    UiToast.toast('Copia de seguridad descargada');
  }
  function importarBackup(event){
    const file = event.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = async (e)=>{
      try{
        const data = JSON.parse(e.target.result);
        if(!confirm('Esto reemplaza todos los datos actuales por los de la copia de seguridad. ¿Continuar?')) return;
        const res = await BusinessService.restaurarBackupJSON(data);
        if(!res.ok){ alert(res.error); return; }
        UiToast.toast('Datos restaurados');
        await window.recargarVistaActual();
        if(window.actualizarHeader) window.actualizarHeader();
      }catch(err){
        alert('El archivo no es una copia de seguridad válida.');
        console.error(err);
      }
      event.target.value = '';
    };
    reader.readAsText(file);
  }

  function importarMigracion(event){
    const file = event.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = async (e)=>{
      let data;
      try{ data = JSON.parse(e.target.result); }
      catch(err){ alert('El archivo no es un JSON válido.'); event.target.value=''; return; }
      if(!confirm('Esto importa los datos del ERP anterior a este dispositivo. Si ya tenés datos cargados acá, se descarga antes una copia de seguridad automática. ¿Continuar?')){ event.target.value=''; return; }
      const res = await MigrationService.importarBackupViejo(data);
      event.target.value = '';
      if(!res.ok){ alert(res.error); return; }
      const r = res.resumen;
      alert(
        'Migración completada.\n\n' +
        'Productos: ' + r.productos + '\nClientes: ' + r.clientes + '\nGastos: ' + r.gastos + '\nVentas: ' + r.ventas + '\n\n' +
        (r.discrepancias>0 ? ('⚠ ' + r.discrepancias + ' boletas tenían totales distintos a los recalculados; se conservó el total histórico original.\n\n') : '') +
        (r.hizoBackupPrevio ? 'Se descargó una copia de seguridad de lo que había antes de migrar.\n\n' : '') +
        'Ahora andá a "Reenviar datos migrados al servidor" para que también lleguen a tu copia central.'
      );
      await window.recargarVistaActual();
      if(window.actualizarHeader) window.actualizarHeader();
      await actualizarResync();
    };
    reader.readAsText(file);
  }

  async function actualizarResync(){
    const pendiente = await BusinessService.necesitaResyncCompleto();
    document.getElementById('cfgResyncPendiente').style.display = pendiente ? 'block' : 'none';
    document.getElementById('cfgResyncPendiente').textContent = pendiente ? 'Tenés datos migrados que todavía no se enviaron a la copia central.' : '';
    document.getElementById('btnEjecutarResync').style.display = pendiente ? 'inline-block' : 'none';
  }
  async function ejecutarResync(){
    const res = await BusinessService.ejecutarResyncCompleto();
    if(!res.ok){ UiToast.toast(res.error); return; }
    UiToast.toast('Se encolaron ' + res.total + ' cambios para enviar');
    SyncService.syncNow();
    await actualizarResync();
  }

  /* ---- diagnóstico: 5 taps en el título ---- */
  let _taps = 0, _tapsTimer = null;
  async function onTapDiagnostico(){
    _taps++;
    clearTimeout(_tapsTimer);
    _tapsTimer = setTimeout(()=>{ _taps = 0; }, 2500);
    if(_taps < 5) return;
    _taps = 0;
    const session = AuthService.getSession();
    const status = SyncService.getStatus();
    const ultima = await StorageService.getMeta('last_successful_sync_at', null);
    const pendientes = await StorageService.outboxContarPendientes();
    const texto = [
      'store_id: ' + (session?.store_id||'-'),
      'device_id: ' + (session?.device_id||'-'),
      'app_version: ' + window.APP_CONFIG.APP_VERSION,
      'eventos pendientes: ' + pendientes,
      'última sincronización: ' + (ultima||'nunca'),
      'último error: ' + (status.lastError||'ninguno'),
      'estado de conexión del navegador: ' + (navigator.onLine ? 'online' : 'offline')
    ].join('\n');
    const el = document.getElementById('diagContent');
    el.textContent = texto;
    el.style.display = el.style.display==='none' ? 'block' : 'none';
  }

  function cambiarLocal(){
    if(!confirm('¿Cerrar sesión de este local? Tus datos NO se borran, vas a poder volver a entrar cuando quieras.')) return;
    AuthService.logout();
    location.reload();
  }
  function borrarTodo(){
    if(!confirm('Esto borra TODOS los productos, boletas, clientes y gastos guardados en este dispositivo. ¿Estás seguro?')) return;
    if(!confirm('Confirmá de nuevo: esta acción no se puede deshacer. ¿Borrar todo?')) return;
    StorageService.borrarTodosLosDatosLocales().then(()=>{
      UiToast.toast('Datos borrados');
      location.reload();
    });
  }

  function init(){
    document.getElementById('btnGuardarConfig').addEventListener('click', guardarConfig);
    document.getElementById('btnSincronizarAhora').addEventListener('click', async ()=>{
      UiToast.toast('Sincronizando...');
      await SyncService.syncNow();
      await actualizarEstadoSync();
    });
    document.getElementById('btnCambiarLocal').addEventListener('click', cambiarLocal);
    document.getElementById('btnTraerCatalogo').addEventListener('click', traerCatalogo);
    document.getElementById('btnExportarBackup').addEventListener('click', exportarBackup);
    document.getElementById('btnAbrirImportarBackup').addEventListener('click', ()=> document.getElementById('inputImportarBackup').click());
    document.getElementById('inputImportarBackup').addEventListener('change', importarBackup);
    document.getElementById('btnAbrirMigracion').addEventListener('click', ()=> document.getElementById('inputMigracion').click());
    document.getElementById('inputMigracion').addEventListener('change', importarMigracion);
    document.getElementById('btnEjecutarResync').addEventListener('click', ejecutarResync);
    document.getElementById('diagTitleTap').addEventListener('click', onTapDiagnostico);
    document.getElementById('btnBorrarTodo').addEventListener('click', borrarTodo);

    SyncService.onStatusChange(()=>{ if(window.UiNav.currentView()==='config') actualizarEstadoSync(); });
  }

  window.ViewHandlers.config = cargarForm;
  return { init };
})();
