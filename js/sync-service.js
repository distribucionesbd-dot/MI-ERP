/* =========================================================
   SYNC-SERVICE.JS
   Solo conoce el outbox (vía StorageService) y el transporte HTTP
   hacia Apps Script. No sabe qué es un "producto" ni una "venta".

   Estados expuestos a la UI: 'sincronizado' | 'pendiente' | 'sincronizando'
   | 'sin_conexion' | 'error'. La UI traduce esto a los mensajes de
   la REGLA 9 sin usar palabras técnicas.
   ========================================================= */
window.SyncService = (function(){
  const cfg = window.APP_CONFIG;
  let _session = null;
  let _syncing = false;
  let _backoffAttempts = 0;
  let _listeners = [];
  let _status = { state:'pendiente', pendingCount:0, lastSuccessfulSyncAt:null, lastError:null };
  let _timerInterval = null;
  let _visibilityDebounced = null;

  function init(session){
    _session = session;
  }

  function onStatusChange(cb){ _listeners.push(cb); }
  function _emit(){ _listeners.forEach(cb=>{ try{ cb({..._status}); }catch(e){} }); }

  async function _refreshPendingCount(){
    _status.pendingCount = await StorageService.outboxContarPendientes();
  }

  function getStatus(){ return {..._status}; }

  async function _fetchConTimeout(body){
    const controller = new AbortController();
    const t = setTimeout(()=>controller.abort(), cfg.SYNC_HTTP_TIMEOUT_MS);
    try{
      const resp = await fetch(cfg.APPS_SCRIPT_URL, {
        method:'POST',
        headers:{'Content-Type':'text/plain;charset=utf-8'},
        body: JSON.stringify(body),
        signal: controller.signal
      });
      return await resp.json();
    } finally {
      clearTimeout(t);
    }
  }

  function _chunk(arr, size){
    const out = [];
    for(let i=0;i<arr.length;i+=size) out.push(arr.slice(i,i+size));
    return out;
  }

  async function syncNow(){
    if(_syncing) return _status;
    if(!_session){ await _refreshPendingCount(); _status.state='pendiente'; _emit(); return _status; }
    if(navigator.onLine === false){
      await _refreshPendingCount();
      _status.state = _status.pendingCount>0 ? 'sin_conexion' : 'sincronizado';
      _emit();
      return _status;
    }

    _syncing = true;
    _status.state = 'sincronizando';
    _emit();
    try{
      const pendientes = await StorageService.outboxPendientes();
      if(!pendientes.length){
        _status.state = 'sincronizado';
        _status.pendingCount = 0;
        _status.lastError = null;
        _backoffAttempts = 0;
        await StorageService.setMeta('last_successful_sync_at', Utils.nowISO());
        _status.lastSuccessfulSyncAt = await StorageService.getMeta('last_successful_sync_at');
        _emit();
        return _status;
      }

      const lotes = _chunk(pendientes, cfg.SYNC_BATCH_SIZE);
      let huboError = false;

      for(const lote of lotes){
        const ids = lote.map(e=>e.event_id);
        await StorageService.outboxMarcar(ids, 'sending');
        let ack;
        try{
          ack = await _fetchConTimeout({
            action:'syncBatch',
            store_id: _session.store_id,
            device_id: _session.device_id,
            token: _session.token,
            events: lote.map(({status, attempts, last_error, ...ev})=>ev)
          });
        }catch(e){
          huboError = true;
          await StorageService.outboxMarcar(ids, 'failed', 'sin_conexion');
          break; // no seguir mandando lotes si ya falló la red
        }

        if(!ack || ack.ok!==true){
          huboError = true;
          await StorageService.outboxMarcar(ids, 'failed', (ack && ack.error) || 'error_servidor');
          break;
        }

        const aceptados = (ack.accepted_event_ids||[]).concat(ack.duplicate_event_ids||[]);
        if(aceptados.length){
          await StorageService.outboxMarcar(aceptados, 'synced');
          await StorageService.outboxBorrarSincronizados(aceptados);
        }
        (ack.rejected||[]).forEach(r=>{
          StorageService.outboxMarcar([r.event_id], 'failed', r.reason);
        });
      }

      await _refreshPendingCount();
      if(huboError){
        _backoffAttempts++;
        _status.state = 'error';
        _emit();
        _scheduleBackoffRetry();
      } else {
        _backoffAttempts = 0;
        _status.state = _status.pendingCount>0 ? 'pendiente' : 'sincronizado';
        _status.lastError = null;
        await StorageService.setMeta('last_successful_sync_at', Utils.nowISO());
        _status.lastSuccessfulSyncAt = await StorageService.getMeta('last_successful_sync_at');
        _emit();
      }
      return _status;
    } finally {
      _syncing = false;
    }
  }

  function _scheduleBackoffRetry(){
    const ms = Math.min(cfg.SYNC_BACKOFF_BASE_MS * Math.pow(2, _backoffAttempts-1), cfg.SYNC_BACKOFF_MAX_MS);
    setTimeout(()=> syncNow(), ms);
  }

  function scheduleOpportunistic(){
    setTimeout(()=> syncNow(), cfg.SYNC_AFTER_OP_DELAY_MS);
  }

  function startTimers(){
    if(_timerInterval) clearInterval(_timerInterval);
    _timerInterval = setInterval(()=> syncNow(), cfg.SYNC_INTERVAL_MS);

    window.addEventListener('online', ()=> syncNow());

    _visibilityDebounced = Utils.debounce(()=>{
      if(document.visibilityState === 'visible') syncNow();
    }, cfg.SYNC_VISIBILITY_DEBOUNCE_MS);
    document.addEventListener('visibilitychange', _visibilityDebounced);
  }

  return { init, syncNow, scheduleOpportunistic, startTimers, onStatusChange, getStatus };
})();
