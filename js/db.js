/* =========================================================
   DB.JS
   Acceso crudo a IndexedDB. Nadie fuera de storage-service.js
   debería importar/usar este módulo directamente.

   Una base de datos física por store_id ("erp_<store_id>") para
   que sea imposible mezclar datos entre locales distintos
   (ver REGLAS 4 y caso borde #9 del prompt maestro).

   Migraciones: cada versión nueva de DB_VERSION agrega un caso
   en el switch de migrarEsquema(). Nunca se borra un caso viejo.
   ========================================================= */
window.Db = (function(){
  const STORES = ['products','sales','clients','expenses','outbox','meta'];
  let _db = null;
  let _storeId = null;

  function nombreBase(storeId){ return 'erp_' + storeId; }

  function migrarEsquema(db, oldVersion, tx){
    // v0 -> v1: creación inicial de todos los object stores.
    if(oldVersion < 1){
      if(!db.objectStoreNames.contains('products')){
        const s = db.createObjectStore('products', {keyPath:'id'});
        s.createIndex('deleted_at','deleted_at',{unique:false});
        s.createIndex('updated_at','updated_at',{unique:false});
      }
      if(!db.objectStoreNames.contains('sales')){
        const s = db.createObjectStore('sales', {keyPath:'id'});
        s.createIndex('fecha','fecha',{unique:false});
        s.createIndex('deleted_at','deleted_at',{unique:false});
        s.createIndex('numero','numero',{unique:false});
      }
      if(!db.objectStoreNames.contains('clients')){
        const s = db.createObjectStore('clients', {keyPath:'id'});
        s.createIndex('deleted_at','deleted_at',{unique:false});
        s.createIndex('nombre_lower','nombre_lower',{unique:false});
      }
      if(!db.objectStoreNames.contains('expenses')){
        const s = db.createObjectStore('expenses', {keyPath:'id'});
        s.createIndex('fecha','fecha',{unique:false});
        s.createIndex('deleted_at','deleted_at',{unique:false});
      }
      if(!db.objectStoreNames.contains('outbox')){
        const s = db.createObjectStore('outbox', {keyPath:'event_id'});
        s.createIndex('status','status',{unique:false});
        s.createIndex('entity_type','entity_type',{unique:false});
      }
      if(!db.objectStoreNames.contains('meta')){
        db.createObjectStore('meta', {keyPath:'key'});
      }
    }
    // v1 -> v2 (futuro): agregar acá, ejemplo:
    // if(oldVersion < 2){ ... }
  }

  function openForStore(storeId){
    return new Promise((resolve, reject)=>{
      if(_db && _storeId === storeId){ resolve(_db); return; }
      if(_db){ _db.close(); _db = null; }
      const req = indexedDB.open(nombreBase(storeId), window.APP_CONFIG.DB_VERSION);
      req.onupgradeneeded = (ev)=>{
        migrarEsquema(req.result, ev.oldVersion, req.transaction);
      };
      req.onsuccess = ()=>{ _db = req.result; _storeId = storeId; resolve(_db); };
      req.onerror = ()=> reject(req.error);
      req.onblocked = ()=> console.warn('IndexedDB bloqueada por otra pestaña abierta');
    });
  }

  function ensureOpen(){
    if(!_db) throw new Error('Db no inicializada: llamá Db.openForStore(storeId) primero');
    return _db;
  }

  function reqToPromise(req){
    return new Promise((resolve, reject)=>{
      req.onsuccess = ()=> resolve(req.result);
      req.onerror = ()=> reject(req.error);
    });
  }

  // Ejecuta fn(tx) dentro de una transacción sobre storeNames (array) en el modo dado.
  // fn recibe el objeto transaction; el caller usa tx.objectStore(name) para operar.
  // La promesa resuelve con lo que fn haya devuelto, una vez que tx.oncomplete dispara.
  function runTx(storeNames, mode, fn){
    const db = ensureOpen();
    return new Promise((resolve, reject)=>{
      const tx = db.transaction(storeNames, mode);
      let result;
      tx.oncomplete = ()=> resolve(result);
      tx.onerror = ()=> reject(tx.error);
      tx.onabort = ()=> reject(tx.error || new Error('Transacción abortada'));
      Promise.resolve(fn(tx)).then(r=>{ result = r; }).catch(err=>{
        try{ tx.abort(); }catch(e){}
        reject(err);
      });
    });
  }

  function getAll(storeName, indexName, query){
    return runTx([storeName], 'readonly', (tx)=>{
      const os = indexName ? tx.objectStore(storeName).index(indexName) : tx.objectStore(storeName);
      return reqToPromise(os.getAll(query));
    });
  }
  function get(storeName, key){
    return runTx([storeName], 'readonly', (tx)=> reqToPromise(tx.objectStore(storeName).get(key)));
  }
  function put(storeName, value){
    return runTx([storeName], 'readwrite', (tx)=> reqToPromise(tx.objectStore(storeName).put(value)));
  }
  function del(storeName, key){
    return runTx([storeName], 'readwrite', (tx)=> reqToPromise(tx.objectStore(storeName).delete(key)));
  }

  function closeAndDeleteCurrent(){
    return new Promise((resolve, reject)=>{
      if(!_storeId){ resolve(); return; }
      const name = nombreBase(_storeId);
      if(_db){ _db.close(); _db = null; }
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = ()=>{ _storeId = null; resolve(); };
      req.onerror = ()=> reject(req.error);
    });
  }

  return { STORES, openForStore, runTx, reqToPromise, getAll, get, put, del, closeAndDeleteCurrent };
})();
