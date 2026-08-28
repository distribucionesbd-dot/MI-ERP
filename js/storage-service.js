/* =========================================================
   STORAGE-SERVICE.JS
   Única puerta de entrada a IndexedDB. La UI y BusinessService
   nunca llaman a Db.js directamente.

   Contrato clave (REGLA 5 del prompt maestro): toda escritura de
   una entidad sincronizable pasa por putEntity()/removeEntity(),
   que escriben el registro Y encolan su evento en `outbox` dentro
   de LA MISMA transacción IndexedDB. Si algo falla, no queda nada
   escrito a medias.
   ========================================================= */
window.StorageService = (function(){
  const ENTITY_STORE = { product:'products', sale:'sales', client:'clients', expense:'expenses' };
  let _storeId = null;
  let _deviceId = null;

  async function init(storeId, deviceId){
    _storeId = storeId;
    _deviceId = deviceId;
    await Db.openForStore(storeId);
  }

  function _entityStoreName(entityType){
    const s = ENTITY_STORE[entityType];
    if(!s) throw new Error('Tipo de entidad desconocido: ' + entityType);
    return s;
  }

  function _buildEvent(entityType, entityId, action, payload){
    return {
      event_id: Utils.uuid(),
      store_id: _storeId,
      device_id: _deviceId,
      occurred_at: Utils.nowISO(),
      entity_type: entityType,
      entity_id: entityId,
      action,
      payload,
      app_version: window.APP_CONFIG.APP_VERSION,
      status: 'pending',
      attempts: 0,
      last_error: null,
      created_at: Utils.nowISO()
    };
  }

  // Crea o actualiza una entidad sincronizable. `action` es 'created' o 'updated'.
  async function putEntity(entityType, record, action){
    const storeName = _entityStoreName(entityType);
    const now = Utils.nowISO();
    record.store_id = _storeId;
    record.updated_at = now;
    if(!record.created_at) record.created_at = now;
    if(record.deleted_at === undefined) record.deleted_at = null;
    if(!record.schema_version) record.schema_version = 1;

    const ev = _buildEvent(entityType, record.id, action, record);
    await Db.runTx([storeName, 'outbox'], 'readwrite', (tx)=>{
      tx.objectStore(storeName).put(record);
      tx.objectStore('outbox').put(ev);
    });
    return record;
  }

  // Baja lógica (tombstone): nunca se borra físicamente para que el sync pueda propagar el delete.
  async function removeEntity(entityType, id){
    const storeName = _entityStoreName(entityType);
    const record = await Db.get(storeName, id);
    if(!record) return null;
    const now = Utils.nowISO();
    record.deleted_at = now;
    record.updated_at = now;
    const ev = _buildEvent(entityType, id, 'deleted', record);
    await Db.runTx([storeName, 'outbox'], 'readwrite', (tx)=>{
      tx.objectStore(storeName).put(record);
      tx.objectStore('outbox').put(ev);
    });
    return record;
  }

  async function getEntity(entityType, id){
    return Db.get(_entityStoreName(entityType), id);
  }

  async function listEntities(entityType, { includeDeleted=false } = {}){
    const all = await Db.getAll(_entityStoreName(entityType));
    return includeDeleted ? all : all.filter(r=>!r.deleted_at);
  }

  /* ---- meta: config del negocio, borrador de venta, marcas de sync ---- */
  async function getMeta(key, fallback){
    const row = await Db.get('meta', key);
    return row ? row.value : fallback;
  }
  async function setMeta(key, value){
    await Db.put('meta', {key, value});
  }

  const CONFIG_DEFAULT = {
    nombre:'Mi Negocio', telefono:'', direccion:'', cuit:'', pie:'¡Gracias por su compra!',
    proximoNumero:1, moneda:'$'
  };
  async function getConfig(){
    return await getMeta('config', CONFIG_DEFAULT);
  }
  // Guarda config Y genera un evento de sincronización (entity_type 'config').
  async function setConfig(config){
    const now = Utils.nowISO();
    const ev = _buildEvent('config', _storeId, 'updated', config);
    await Db.runTx(['meta','outbox'], 'readwrite', (tx)=>{
      tx.objectStore('meta').put({key:'config', value: config});
      tx.objectStore('outbox').put(ev);
    });
    return config;
  }
  // Variante interna sin evento, para cuando el propio guardado de una venta
  // incrementa proximoNumero (ese cambio ya viaja embebido en el evento de la venta).
  async function setConfigLocalOnly(config){
    await setMeta('config', config);
    return config;
  }

  async function getDraftVenta(){ return getMeta('ventaPendiente', null); }
  async function setDraftVenta(draft){ return setMeta('ventaPendiente', draft); }
  async function clearDraftVenta(){ return Db.del('meta', 'ventaPendiente'); }

  /* ---- outbox ---- */
  // Incluye 'sending' a propósito: ese estado es solo un marcador transitorio
  // mientras un request está en vuelo DENTRO de una sola llamada a syncNow().
  // Si la app se cierra o recarga justo en el medio de un envío, el evento
  // puede quedar trabado en 'sending' para siempre (nunca se resuelve a
  // 'synced' ni a 'failed'). Sin esta línea, ese evento desaparecía de
  // outboxContarPendientes() y nunca se reintentaba, aunque nunca hubiera
  // llegado al servidor. Reenviarlo es seguro: el servidor deduplica por
  // event_id (si ya se había aplicado, vuelve como duplicate_event_ids).
  async function outboxPendientes(){
    const all = await Db.getAll('outbox');
    return all.filter(e=> e.status==='pending' || e.status==='failed' || e.status==='sending')
      .sort((a,b)=> a.created_at.localeCompare(b.created_at));
  }
  async function outboxContarPendientes(){
    return (await outboxPendientes()).length;
  }
  async function outboxMarcar(eventIds, status, error){
    if(!eventIds.length) return;
    await Db.runTx(['outbox'], 'readwrite', async (tx)=>{
      const os = tx.objectStore('outbox');
      for(const id of eventIds){
        const ev = await Db.reqToPromise(os.get(id));
        if(!ev) continue;
        ev.status = status;
        if(status==='failed'){ ev.attempts = (ev.attempts||0)+1; ev.last_error = error||null; }
        if(status==='sending'){ /* no cambia attempts todavía */ }
        os.put(ev);
      }
    });
  }
  // Solo se borran eventos synced (ACK explícito del servidor), nunca antes (REGLA 5).
  async function outboxBorrarSincronizados(eventIds){
    if(!eventIds.length) return;
    await Db.runTx(['outbox'], 'readwrite', (tx)=>{
      const os = tx.objectStore('outbox');
      eventIds.forEach(id=> os.delete(id));
    });
  }

  async function borrarTodosLosDatosLocales(){
    await Db.runTx(Db.STORES, 'readwrite', (tx)=>{
      Db.STORES.forEach(s=>{
        if(s==='meta') return; // conservamos config/último sync
        tx.objectStore(s).clear();
      });
    });
  }

  return {
    init, putEntity, removeEntity, getEntity, listEntities,
    getMeta, setMeta, getConfig, setConfig, setConfigLocalOnly,
    getDraftVenta, setDraftVenta, clearDraftVenta,
    outboxPendientes, outboxContarPendientes, outboxMarcar, outboxBorrarSincronizados,
    borrarTodosLosDatosLocales
  };
})();
