/* =========================================================
   MIGRATION.JS
   Importa el backup JSON del ERP viejo (el HTML de referencia,
   con Date.now()+random como id y campos de QuickBooks/B&D).

   Escribe directo en IndexedDB (sin pasar por el outbox) para no
   generar miles de eventos de golpe ni arriesgar duplicados si el
   archivo se importa dos veces. Marca `needs_full_resync` para que,
   una sola vez y a mano desde Configuración, se reenvíe todo al
   central (BusinessService.ejecutarResyncCompleto).
   ========================================================= */
window.MigrationService = (function(){

  function _esBackupViejoValido(data){
    return data && typeof data==='object' &&
      Array.isArray(data.productos) && Array.isArray(data.boletas) &&
      Array.isArray(data.gastos) && Array.isArray(data.clientes) &&
      typeof data.config==='object';
  }

  async function _hayDatosLocales(){
    const [p, v] = await Promise.all([
      StorageService.listEntities('product'),
      StorageService.listEntities('sale')
    ]);
    return p.length>0 || v.length>0;
  }

  async function importarBackupViejo(dataOld){
    if(!_esBackupViejoValido(dataOld)){
      return {ok:false, error:'Ese archivo no es un backup del ERP anterior (faltan productos, boletas, gastos o clientes).'};
    }

    let hizoBackupPrevio = false;
    if(await _hayDatosLocales()){
      const backupActual = await BusinessService.exportarBackupJSON();
      Utils.descargarJSON(backupActual, `respaldo-antes-de-migrar-${Utils.hoyISO()}.json`);
      hizoBackupPrevio = true;
    }

    const now = Utils.nowISO();
    const productoIdMap = {};   // id viejo -> uuid nuevo
    const clienteNombreMap = {}; // nombre_lower -> uuid nuevo

    // ---- productos (se descartan quickbooksItemId, kgOrigenItemId, precioSugerido,
    //      necesitaRevision, precioManual, esSuelto: son exclusivos del importador B&D) ----
    const productosNuevos = dataOld.productos.map(p=>{
      const id = Utils.uuid();
      productoIdMap[p.id] = id;
      return {
        id, nombre: p.nombre, codigo: p.codigo||'', categoria: p.categoria||'',
        unidad: p.unidad==='kg' ? 'kg' : 'unidad',
        costo: Number(p.costo)||0, precio: Number(p.precio)||0,
        margenPct: p.unidad==='kg' ? (p.margenPct!=null?p.margenPct:null) : null,
        created_at: now, updated_at: now, deleted_at: null, schema_version: 1
      };
    });

    // ---- clientes explícitos ----
    const clientesNuevos = dataOld.clientes.map(c=>{
      const id = Utils.uuid();
      clienteNombreMap[(c.nombre||'').trim().toLowerCase()] = id;
      return {
        id, nombre: c.nombre, nombre_lower: (c.nombre||'').trim().toLowerCase(),
        telefono: c.telefono||'', direccion: c.direccion||'',
        created_at: c.creado || now, updated_at: c.creado || now, deleted_at: null, schema_version: 1
      };
    });
    function idClientePorNombre(nombre){
      const clave = (nombre||'').trim().toLowerCase();
      if(!clave) return null;
      if(clienteNombreMap[clave]) return clienteNombreMap[clave];
      const id = Utils.uuid();
      clienteNombreMap[clave] = id;
      clientesNuevos.push({ id, nombre: nombre.trim(), nombre_lower: clave, telefono:'', direccion:'', created_at: now, updated_at: now, deleted_at: null, schema_version: 1 });
      return id;
    }

    // ---- gastos ----
    const gastosNuevos = dataOld.gastos.map(g=>({
      id: Utils.uuid(), fecha: g.fecha, categoria: g.categoria||'Otros', monto: Number(g.monto)||0, descripcion: g.descripcion||'',
      created_at: now, updated_at: now, deleted_at: null, schema_version: 1
    }));

    // ---- boletas -> ventas (se preservan número, fechas, ítems, costos y totales) ----
    let totalOldVerificado = 0, totalNuevoRecalculado = 0, discrepancias = 0;
    let maxNumero = 0;
    const ventasNuevas = dataOld.boletas.map(b=>{
      maxNumero = Math.max(maxNumero, Number(b.numero)||0);
      const items = (b.items||[]).map(it=>({
        producto_id: it.productoId ? (productoIdMap[it.productoId]||null) : null,
        nombre: it.nombre, costo: Number(it.costo)||0, cantidad: Number(it.cantidad)||0,
        precio: Number(it.precio)||0, unidad: it.unidad||'unidad'
      }));
      const recalc = Utils.calcularTotalesVenta(items);
      totalOldVerificado += Number(b.total)||0;
      totalNuevoRecalculado += recalc.total;
      if(Math.abs(recalc.total - (Number(b.total)||0)) > 0.5) discrepancias++;
      return {
        id: Utils.uuid(), numero: b.numero, fecha: b.fecha,
        cliente_id: idClientePorNombre(b.cliente),
        cliente_nombre_snapshot: (b.cliente||'').trim(),
        items,
        // Se preservan los totales históricos originales, no los recalculados.
        total: Number(b.total)||0, costo_total: Number(b.costoTotal)||0, ganancia: Number(b.ganancia)||0,
        hora_inicio: b.horaInicio || null,
        created_at: b.creada || now, updated_at: b.creada || now, deleted_at: null, schema_version: 1
      };
    });

    // ---- config ----
    const configNueva = {
      nombre: dataOld.config.nombre || 'Mi Negocio',
      telefono: dataOld.config.telefono || '',
      direccion: dataOld.config.direccion || '',
      cuit: dataOld.config.cuit || '',
      pie: dataOld.config.pie || '¡Gracias por su compra!',
      proximoNumero: Math.max(Number(dataOld.config.proximoNumero)||1, maxNumero+1),
      moneda: dataOld.config.moneda || '$'
    };

    // ---- escritura directa (sin outbox) ----
    await Db.runTx(['products','clients','expenses','sales','meta'], 'readwrite', (tx)=>{
      productosNuevos.forEach(p=> tx.objectStore('products').put(p));
      clientesNuevos.forEach(c=> tx.objectStore('clients').put(c));
      gastosNuevos.forEach(g=> tx.objectStore('expenses').put(g));
      ventasNuevas.forEach(v=> tx.objectStore('sales').put(v));
      tx.objectStore('meta').put({key:'config', value: configNueva});
      tx.objectStore('meta').put({key:'needs_full_resync', value: true});
    });

    // ---- borrador de venta pendiente (opcional) ----
    if(dataOld.ventaPendiente && dataOld.ventaPendiente.items && dataOld.ventaPendiente.items.length){
      const draft = {
        items: dataOld.ventaPendiente.items.map(it=>({
          producto_id: it.productoId ? (productoIdMap[it.productoId]||null) : null,
          nombre: it.nombre, costo: Number(it.costo)||0, cantidad: Number(it.cantidad)||0,
          precio: Number(it.precio)||0, unidad: it.unidad||'unidad'
        })),
        cliente: dataOld.ventaPendiente.cliente || '',
        fecha: dataOld.ventaPendiente.fecha || Utils.hoyISO(),
        horaInicio: dataOld.ventaPendiente.horaInicio || null,
        ultimaModificacion: now
      };
      await StorageService.setDraftVenta(draft);
    }

    return {
      ok: true,
      resumen: {
        productos: productosNuevos.length,
        clientes: clientesNuevos.length,
        gastos: gastosNuevos.length,
        ventas: ventasNuevas.length,
        totalOldVerificado, totalNuevoRecalculado, discrepancias,
        hizoBackupPrevio
      }
    };
  }

  return { importarBackupViejo };
})();
