/* =========================================================
   BUSINESS-SERVICE.JS
   Reglas de negocio. La UI SOLO llama funciones de acá para leer
   o mutar datos; nunca a StorageService directo. Devuelve
   {ok:true, data} o {ok:false, error:'mensaje en español simple'}
   para que la UI no tenga que traducir códigos técnicos.
   ========================================================= */
window.BusinessService = (function(){

  /* =================== PRODUCTOS =================== */
  async function listarProductos(){
    const lista = await StorageService.listEntities('product');
    // String(...) por las dudas: un producto adoptado del catálogo
    // compartido puede traer el nombre como Number si Google Sheets lo
    // interpretó como un valor numérico al guardarlo (mismo problema que
    // ya pasó con fechas/IDs). Sin esto, un solo producto así rompe el
    // ordenamiento (y con eso, cualquier pantalla que liste productos).
    return lista.sort((a,b)=> String(a.nombre||'').localeCompare(String(b.nombre||'')));
  }

  async function guardarProducto(datos){
    const nombre = (datos.nombre||'').trim();
    const codigo = (datos.codigo||'').trim();
    const categoria = (datos.categoria||'').trim();
    const unidad = datos.unidad==='kg' ? 'kg' : 'unidad';
    const costo = parseFloat(datos.costo);
    let precio = parseFloat(datos.precio);
    const margenInput = datos.margenPct;

    if(!nombre) return {ok:false, error:'Falta el nombre del producto'};
    if(isNaN(costo) || costo<0) return {ok:false, error:'Cargá el precio de costo'};

    let margenPct = null;
    if(unidad==='kg'){
      if(margenInput!=='' && margenInput!=null && !isNaN(parseFloat(margenInput))){
        margenPct = parseFloat(margenInput);
        precio = Utils.calcularPrecioDesdeMargenSobreCosto(costo, margenPct);
      } else if(!isNaN(precio)){
        margenPct = Utils.calcularMargenSobreCosto(precio, costo);
      } else {
        return {ok:false, error:'Cargá el % de ganancia o el precio de venta por kilo'};
      }
    } else if(isNaN(precio) || precio<0){
      return {ok:false, error:'Cargá el precio de venta'};
    }

    let record, action;
    if(datos.id){
      record = await StorageService.getEntity('product', datos.id);
      if(!record) return {ok:false, error:'Ese producto ya no existe'};
      Object.assign(record, {nombre, codigo, categoria, unidad, costo, precio, margenPct: unidad==='kg'?margenPct:(record.margenPct??null)});
      action = 'updated';
    } else {
      record = { id: Utils.uuid(), nombre, codigo, categoria, unidad, costo, precio, margenPct };
      action = 'created';
    }
    await StorageService.putEntity('product', record, action);
    return {ok:true, data: record};
  }

  async function actualizarCostoInline(id, value){
    const record = await StorageService.getEntity('product', id);
    if(!record) return {ok:false, error:'Producto no encontrado'};
    const costo = parseFloat(value);
    if(isNaN(costo) || costo<0) return {ok:false, error:'Costo inválido'};
    record.costo = costo;
    if(record.unidad==='kg' && record.margenPct!=null){
      record.precio = Utils.calcularPrecioDesdeMargenSobreCosto(costo, record.margenPct);
    }
    await StorageService.putEntity('product', record, 'updated');
    return {ok:true, data: record};
  }
  async function actualizarPrecioInline(id, value){
    const record = await StorageService.getEntity('product', id);
    if(!record) return {ok:false, error:'Producto no encontrado'};
    const precio = parseFloat(value);
    if(isNaN(precio) || precio<0) return {ok:false, error:'Precio inválido'};
    record.precio = precio;
    if(record.unidad==='kg'){
      record.margenPct = Utils.calcularMargenSobreCosto(precio, record.costo);
    }
    await StorageService.putEntity('product', record, 'updated');
    return {ok:true, data: record};
  }
  async function actualizarMargenInline(id, value){
    const record = await StorageService.getEntity('product', id);
    if(!record) return {ok:false, error:'Producto no encontrado'};
    const margenPct = parseFloat(value);
    if(isNaN(margenPct)) return {ok:false, error:'% inválido'};
    record.margenPct = margenPct;
    record.precio = Utils.calcularPrecioDesdeMargenSobreCosto(record.costo, margenPct);
    await StorageService.putEntity('product', record, 'updated');
    return {ok:true, data: record};
  }
  async function eliminarProducto(id){
    await StorageService.removeEntity('product', id);
    return {ok:true};
  }

  // Deshacer una eliminación reciente (Fase 3, punto 7: menos confirm(),
  // más "Deshacer"). removeEntity nunca borra el registro físicamente —
  // solo le pone una marca de borrado (deleted_at) — así que deshacer es
  // sacarle esa marca y volver a mandarlo a sincronizar. Sirve igual para
  // productos, clientes y gastos (mismo mecanismo de tombstone en los tres).
  async function restaurarEliminado(entityType, id){
    const record = await StorageService.getEntity(entityType, id);
    if(!record) return {ok:false, error:'No se pudo deshacer: el registro ya no está'};
    record.deleted_at = null;
    await StorageService.putEntity(entityType, record, 'updated');
    return {ok:true, data: record};
  }

  /* =================== CLIENTES =================== */
  function _nombreLower(n){ return (n||'').trim().toLowerCase(); }

  async function listarClientes(){
    const lista = await StorageService.listEntities('client');
    return lista.sort((a,b)=> String(a.nombre||'').localeCompare(String(b.nombre||'')));
  }
  async function buscarClientePorNombre(nombre){
    const clave = _nombreLower(nombre);
    if(!clave) return null;
    const lista = await StorageService.listEntities('client');
    return lista.find(c=> _nombreLower(c.nombre)===clave) || null;
  }
  // Crea el cliente si no existe y devuelve su id (o null si no se pasó nombre).
  async function registrarClienteSiNoExiste(nombre, fecha){
    const limpio = (nombre||'').trim();
    if(!limpio) return null;
    const existente = await buscarClientePorNombre(limpio);
    if(existente) return existente.id;
    const record = { id: Utils.uuid(), nombre: limpio, nombre_lower: _nombreLower(limpio), telefono:'', direccion:'' };
    await StorageService.putEntity('client', record, 'created');
    return record.id;
  }
  async function actualizarClienteInline(id, campo, value){
    const record = await StorageService.getEntity('client', id);
    if(!record) return {ok:false, error:'Cliente no encontrado'};
    if(campo==='telefono') record.telefono = value.trim();
    if(campo==='direccion') record.direccion = value.trim();
    await StorageService.putEntity('client', record, 'updated');
    return {ok:true, data: record};
  }
  async function eliminarCliente(id){
    await StorageService.removeEntity('client', id);
    return {ok:true};
  }
  // Estadísticas por cliente (compras, total, última compra), calculadas contra las ventas vivas.
  async function estadisticasCliente(nombre){
    const ventas = await StorageService.listEntities('sale');
    const clave = _nombreLower(nombre);
    const susVentas = ventas.filter(v=> _nombreLower(v.cliente_nombre_snapshot)===clave);
    const cantidadCompras = susVentas.length;
    const totalComprado = susVentas.reduce((s,v)=>s+v.total,0);
    const ultimaCompra = susVentas.reduce((max,v)=> (!max || v.fecha>max) ? v.fecha : max, null);
    return { cantidadCompras, totalComprado, ultimaCompra };
  }

  /* =================== VENTAS =================== */
  async function listarVentas(){
    const lista = await StorageService.listEntities('sale');
    return lista.sort((a,b)=> b.created_at.localeCompare(a.created_at));
  }
  async function obtenerVenta(id){ return StorageService.getEntity('sale', id); }

  function _validarItems(items){
    return Array.isArray(items) && items.length>0;
  }

  async function crearVenta({ fecha, cliente, items, horaInicio }){
    if(!_validarItems(items)) return {ok:false, error:'Agregá al menos un ítem'};
    const { total, costoTotal, ganancia } = Utils.calcularTotalesVenta(items);
    const config = await StorageService.getConfig();
    const clienteId = await registrarClienteSiNoExiste(cliente, fecha);
    const record = {
      id: Utils.uuid(),
      numero: config.proximoNumero || 1,
      fecha: fecha || Utils.hoyISO(),
      cliente_id: clienteId,
      cliente_nombre_snapshot: (cliente||'').trim(),
      items: items.map(it=>({...it})),
      total, costo_total: costoTotal, ganancia,
      hora_inicio: horaInicio || null
    };
    await StorageService.putEntity('sale', record, 'created');
    config.proximoNumero = (config.proximoNumero||1) + 1;
    await StorageService.setConfigLocalOnly(config);
    return {ok:true, data: record};
  }

  async function editarVenta(id, { fecha, cliente, items }){
    if(!_validarItems(items)) return {ok:false, error:'Agregá al menos un ítem'};
    const original = await StorageService.getEntity('sale', id);
    if(!original) return {ok:false, error:'Esa boleta ya no existe'};
    const { total, costoTotal, ganancia } = Utils.calcularTotalesVenta(items);
    const clienteId = await registrarClienteSiNoExiste(cliente, fecha);
    const record = {
      ...original,
      fecha: fecha || original.fecha,
      cliente_id: clienteId,
      cliente_nombre_snapshot: (cliente||'').trim(),
      items: items.map(it=>({...it})),
      total, costo_total: costoTotal, ganancia
    };
    await StorageService.putEntity('sale', record, 'updated');
    return {ok:true, data: record};
  }

  async function eliminarVenta(id){
    await StorageService.removeEntity('sale', id);
    return {ok:true};
  }

  /* =================== BORRADOR DE VENTA EN CURSO =================== */
  // Distinto y mutuamente excluyente de "editar boleta histórica": el borrador
  // sólo existe para una venta NUEVA todavía no finalizada.
  async function guardarBorrador(draft){
    // Nada que guardar: ni ítems confirmados ni un renglón a medio escribir
    // (producto/cantidad/precio todavía sin "+ Agregar producto"). Si hay
    // AL MENOS uno de los dos, el borrador se guarda igual, para no perder
    // ni siquiera una línea que se estaba tipeando.
    const tieneItems = draft.items && draft.items.length;
    if(!tieneItems && !draft.itemEnProgreso){ await StorageService.clearDraftVenta(); return; }
    await StorageService.setDraftVenta({
      items: tieneItems ? draft.items.map(it=>({...it})) : [],
      cliente: draft.cliente||'',
      fecha: draft.fecha || Utils.hoyISO(),
      horaInicio: draft.horaInicio || null,
      itemEnProgreso: draft.itemEnProgreso || null,
      ultimaModificacion: Utils.nowISO()
    });
  }
  async function obtenerBorrador(){ return StorageService.getDraftVenta(); }
  async function borrarBorrador(){ return StorageService.clearDraftVenta(); }

  /* =================== GASTOS =================== */
  async function listarGastos(){
    const lista = await StorageService.listEntities('expense');
    return lista.sort((a,b)=> b.fecha.localeCompare(a.fecha));
  }
  async function guardarGasto(datos){
    const fecha = datos.fecha || Utils.hoyISO();
    const categoria = (datos.categoria||'').trim() || 'Otros';
    const monto = parseFloat(datos.monto);
    const descripcion = (datos.descripcion||'').trim();
    if(isNaN(monto) || monto<=0) return {ok:false, error:'Cargá un monto válido'};

    let record, action;
    if(datos.id){
      record = await StorageService.getEntity('expense', datos.id);
      if(!record) return {ok:false, error:'Ese gasto ya no existe'};
      Object.assign(record, {fecha, categoria, monto, descripcion});
      action = 'updated';
    } else {
      record = { id: Utils.uuid(), fecha, categoria, monto, descripcion };
      action = 'created';
    }
    await StorageService.putEntity('expense', record, action);
    return {ok:true, data: record};
  }
  async function eliminarGasto(id){
    await StorageService.removeEntity('expense', id);
    return {ok:true};
  }

  /* =================== DASHBOARD Y REPORTES =================== */
  // Compara dos totales y devuelve el % de variación en un formato ya listo
  // para mostrar (Fase 4, punto 10: "preparar el dashboard para comparar
  // con el período anterior"). null cuando no hay con qué comparar (ej. no
  // hubo ventas ayer) para no mostrar un "+Infinity%" sin sentido.
  function _compararTotales(actual, anterior){
    if(!anterior){
      if(!actual) return null;
      return { pct:null, texto:'sin ventas el día anterior para comparar' };
    }
    const pct = ((actual-anterior)/anterior)*100;
    const signo = pct>=0 ? '+' : '';
    return { pct, texto: signo + pct.toFixed(0) + '% vs. el día anterior' };
  }

  async function calcularDashboard(){
    const hoy = Utils.hoyISO();
    const ayer = Utils.ayerISO();
    const ventas = await StorageService.listEntities('sale');
    const gastos = await StorageService.listEntities('expense');
    const productos = await StorageService.listEntities('product');

    const ventasHoy = ventas.filter(v=>v.fecha===hoy);
    const ventasAyer = ventas.filter(v=>v.fecha===ayer);
    const inicioMesISO = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10);
    const gastosMes = gastos.filter(g=>g.fecha>=inicioMesISO).reduce((s,g)=>s+g.monto,0);
    const ventasHoyTotal = ventasHoy.reduce((s,v)=>s+v.total,0);
    const ventasAyerTotal = ventasAyer.reduce((s,v)=>s+v.total,0);

    return {
      ventasHoyTotal,
      operacionesHoy: ventasHoy.length,
      ticketPromedioHoy: ventasHoy.length ? ventasHoyTotal/ventasHoy.length : 0,
      gananciaHoy: ventasHoy.reduce((s,v)=>s+v.ganancia,0),
      gastosMes,
      productosCount: productos.length,
      comparacionVsAyer: _compararTotales(ventasHoyTotal, ventasAyerTotal),
      ultimasVentas: ventas.slice().sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,5)
    };
  }

  // Igual que calcularDashboard, pero si hay conexión reemplaza los números
  // principales (ventas/operaciones/margen de hoy, gastos del mes, cantidad
  // de productos, comparación con el día anterior) por los totales
  // agregados del servidor, que incluyen lo cargado desde CUALQUIER
  // dispositivo de este local (no solo este). "Últimas boletas" queda
  // siempre local (para poder reimprimir), porque el detalle completo de
  // una venta hecha en otro dispositivo no está en este — ver ARCHITECTURE.md.
  async function calcularDashboardCombinado(){
    const local = await calcularDashboard();
    const resp = await SyncService.dashboardResumen();
    if(!resp || resp.ok!==true) return { ...local, combinado:false };
    return {
      ventasHoyTotal: resp.ventasHoyTotal, operacionesHoy: resp.operacionesHoy,
      ticketPromedioHoy: resp.operacionesHoy ? resp.ventasHoyTotal/resp.operacionesHoy : 0,
      gananciaHoy: resp.gananciaHoy, gastosMes: resp.gastosMes, productosCount: resp.productosCount,
      comparacionVsAyer: _compararTotales(resp.ventasHoyTotal, resp.ventasAyerTotal||0),
      ultimasVentas: local.ultimasVentas, combinado:true
    };
  }

  // Cálculo puro a partir de listas ya filtradas por período: lo comparten
  // calcularReporte (datos locales) y calcularReporteCombinado (datos de
  // todos los dispositivos), para no duplicar las fórmulas.
  function _agregarReporte(ventas, gastos){
    const totalVentas = ventas.reduce((s,v)=>s+v.total,0);
    const totalCosto = ventas.reduce((s,v)=>s+v.costo_total,0);
    const gananciaBruta = totalVentas - totalCosto;
    const totalGastos = gastos.reduce((s,g)=>s+g.monto,0);
    const gananciaNeta = gananciaBruta - totalGastos;

    const aggProd = {};
    ventas.forEach(v=>{
      (v.items||[]).forEach(it=>{
        const key = it.producto_id || ('libre:'+it.nombre);
        if(!aggProd[key]) aggProd[key] = {nombre:it.nombre, cantidad:0, unidad:it.unidad||'unidad', total:0, ganancia:0};
        const subtotal = Utils.subtotalItem(it);
        aggProd[key].cantidad += it.cantidad;
        aggProd[key].total += subtotal;
        aggProd[key].ganancia += subtotal - it.cantidad*(it.costo||0);
      });
    });
    const porProducto = Object.values(aggProd).sort((a,b)=>b.total-a.total);

    const aggCli = {};
    ventas.forEach(v=>{
      const clave = (v.cliente_nombre_snapshot||'').trim() || '(Sin cliente registrado)';
      if(!aggCli[clave]) aggCli[clave] = {nombre:clave, compras:0, total:0, ganancia:0};
      aggCli[clave].compras += 1;
      aggCli[clave].total += v.total;
      aggCli[clave].ganancia += v.ganancia;
    });
    const porCliente = Object.values(aggCli).sort((a,b)=>b.total-a.total);

    return { totalVentas, totalCosto, gananciaBruta, totalGastos, gananciaNeta, porProducto, porCliente };
  }

  async function calcularReporte(desde, hasta){
    const ventas = (await StorageService.listEntities('sale')).filter(v=> v.fecha>=desde && v.fecha<=hasta);
    const gastos = (await StorageService.listEntities('expense')).filter(g=> g.fecha>=desde && g.fecha<=hasta);
    return _agregarReporte(ventas, gastos);
  }

  // Igual que calcularReporte, pero si hay conexión usa las ventas/gastos
  // de TODOS los dispositivos del local (vía SyncService.historialCombinado),
  // no solo lo cargado en este. Si no hay conexión, cae a los datos locales.
  async function calcularReporteCombinado(desde, hasta){
    const resp = await SyncService.historialCombinado();
    if(!resp || resp.ok!==true){
      const r = await calcularReporte(desde, hasta);
      return { ...r, combinado:false };
    }
    const ventas = resp.ventas.filter(v=> v.fecha>=desde && v.fecha<=hasta);
    const gastos = resp.gastos.filter(g=> g.fecha>=desde && g.fecha<=hasta);
    return { ..._agregarReporte(ventas, gastos), combinado:true };
  }

  // Historial de boletas de TODOS los dispositivos del local (para Historial
  // de boletas). Cada venta lleva _local:true si además existe en este
  // dispositivo (o sea, se puede editar/eliminar desde acá); las que
  // llegaron solo desde otro dispositivo se pueden ver y reimprimir, pero
  // no editar/eliminar desde este dispositivo (ver ARCHITECTURE.md).
  async function listarVentasCombinado(){
    const local = await listarVentas();
    const localIds = new Set(local.map(v=>v.id));
    const resp = await SyncService.historialCombinado();
    if(!resp || resp.ok!==true){
      return { ventas: local.map(v=>({...v, _local:true})), combinado:false };
    }
    const ventas = resp.ventas
      .map(v=> ({...v, _local: localIds.has(v.id)}))
      .sort((a,b)=> (b.created_at||'').localeCompare(a.created_at||''));
    return { ventas, combinado:true };
  }

  // Igual que arriba, pero para gastos.
  async function listarGastosCombinado(){
    const local = await listarGastos();
    const localIds = new Set(local.map(g=>g.id));
    const resp = await SyncService.historialCombinado();
    if(!resp || resp.ok!==true){
      return { gastos: local.map(g=>({...g, _local:true})), combinado:false };
    }
    const gastos = resp.gastos
      .map(g=> ({...g, _local: localIds.has(g.id)}))
      .sort((a,b)=> b.fecha.localeCompare(a.fecha));
    return { gastos, combinado:true };
  }

  /* =================== BACKUP LOCAL (formato nuevo) =================== */
  // Exporta todo lo local, incluido el outbox pendiente, para no perder
  // cambios sin sincronizar si hay que restaurar en otro dispositivo.
  async function exportarBackupJSON(){
    const [productos, ventas, gastos, clientes, config, ventaPendiente, outboxPendiente] = await Promise.all([
      StorageService.listEntities('product'),
      StorageService.listEntities('sale'),
      StorageService.listEntities('expense'),
      StorageService.listEntities('client'),
      StorageService.getConfig(),
      StorageService.getDraftVenta(),
      StorageService.outboxPendientes()
    ]);
    return {
      formato: 'erp-v1-backup', app_version: window.APP_CONFIG.APP_VERSION,
      exportado_en: Utils.nowISO(),
      productos, ventas, gastos, clientes, config, ventaPendiente, outboxPendiente
    };
  }

  async function restaurarBackupJSON(data){
    if(!data || data.formato!=='erp-v1-backup' || !Array.isArray(data.productos)){
      return {ok:false, error:'El archivo no es una copia de seguridad válida de este sistema'};
    }
    const escribir = async (entity, storeName, lista)=>{
      await Db.runTx([storeName], 'readwrite', (tx)=>{
        (lista||[]).forEach(r=> tx.objectStore(storeName).put(r));
      });
    };
    await escribir('product','products', data.productos);
    await escribir('sale','sales', data.ventas);
    await escribir('expense','expenses', data.gastos);
    await escribir('client','clients', data.clientes);
    if(data.config) await StorageService.setConfigLocalOnly(data.config);
    if(data.ventaPendiente) await StorageService.setDraftVenta(data.ventaPendiente);
    if(Array.isArray(data.outboxPendiente) && data.outboxPendiente.length){
      await Db.runTx(['outbox'], 'readwrite', (tx)=>{
        data.outboxPendiente.forEach(ev=> tx.objectStore('outbox').put(ev));
      });
    }
    return {ok:true};
  }

  /* =================== RESYNC COMPLETO (post-migración) =================== */
  // Después de importar un backup del ERP viejo, los datos entran directo a
  // IndexedDB sin pasar por el outbox (para no generar miles de eventos de golpe
  // ni arriesgar duplicados si la importación se reintenta). Esta función,
  // disparada a mano una sola vez desde Configuración, encola un evento por
  // cada entidad viva para que el central termine de recibir todo.
  async function necesitaResyncCompleto(){
    return !!(await StorageService.getMeta('needs_full_resync', false));
  }
  async function ejecutarResyncCompleto(){
    const pendiente = await necesitaResyncCompleto();
    if(!pendiente) return {ok:false, error:'No hay una migración pendiente de reenviar'};
    const [productos, ventas, gastos, clientes, config] = await Promise.all([
      StorageService.listEntities('product', {includeDeleted:true}),
      StorageService.listEntities('sale', {includeDeleted:true}),
      StorageService.listEntities('expense', {includeDeleted:true}),
      StorageService.listEntities('client', {includeDeleted:true}),
      StorageService.getConfig()
    ]);
    for(const p of productos) await StorageService.putEntity('product', p, p.deleted_at ? 'deleted' : 'created');
    for(const c of clientes) await StorageService.putEntity('client', c, c.deleted_at ? 'deleted' : 'created');
    for(const g of gastos) await StorageService.putEntity('expense', g, g.deleted_at ? 'deleted' : 'created');
    for(const v of ventas) await StorageService.putEntity('sale', v, v.deleted_at ? 'deleted' : 'created');
    await StorageService.setConfig(config);
    await StorageService.setMeta('needs_full_resync', false);
    return {ok:true, total: productos.length+clientes.length+gastos.length+ventas.length};
  }

  /* =================== MULTI-DISPOSITIVO Y CATÁLOGO COMPARTIDO =================== */

  // Trae a ESTE dispositivo el catálogo que ya existe en el servidor para el
  // local (productos, clientes, config). Pensado para un dispositivo nuevo
  // o vacío que se loguea por segunda vez con el mismo local: sin esto,
  // arrancaría con todo vacío aunque el central ya tenga datos (la sync
  // solo empuja hacia arriba, nunca bajaba nada — ver ARCHITECTURE.md).
  // Nunca pisa un registro que ya exista localmente con ese mismo id, para
  // no perder una edición que este dispositivo ya tenga sin sincronizar.
  async function traerCatalogoDelServidor(){
    const resp = await SyncService.pullState();
    if(!resp || resp.ok!==true){
      return {ok:false, error: (resp && resp.error==='INVALID_TOKEN') ? 'Sesión inválida' : 'No se pudo conectar con el servidor'};
    }

    let productosNuevos = 0, clientesNuevos = 0;
    for(const p of (resp.productos||[])){
      const existente = await StorageService.getEntity('product', p.product_id);
      if(existente) continue;
      await StorageService.putEntityLocalOnly('product', {
        id: p.product_id, nombre: p.name||'', codigo: p.sku||'', categoria: p.category||'',
        unidad: p.unit==='kg' ? 'kg' : 'unidad', costo: Number(p.cost)||0, precio: Number(p.price)||0,
        margenPct: p.unit==='kg' ? Utils.calcularMargenSobreCosto(Number(p.price)||0, Number(p.cost)||0) : null,
        updated_at: p.updated_at, created_at: p.updated_at
      });
      productosNuevos++;
    }
    for(const c of (resp.clientes||[])){
      const existente = await StorageService.getEntity('client', c.client_id);
      if(existente) continue;
      await StorageService.putEntityLocalOnly('client', {
        id: c.client_id, nombre: c.name||'', nombre_lower: _nombreLower(c.name||''),
        telefono: c.phone||'', direccion: c.address||'', updated_at: c.updated_at, created_at: c.updated_at
      });
      clientesNuevos++;
    }
    if(resp.config){
      await StorageService.setConfigLocalOnly({
        nombre: resp.config.name || 'Mi Negocio', telefono: resp.config.phone||'',
        direccion: resp.config.address||'', cuit: resp.config.cuit||'',
        pie: resp.config.footer_text||'¡Gracias por su compra!',
        proximoNumero: Number(resp.config.next_number)||1, moneda: resp.config.currency||'$'
      });
    }
    return {ok:true, data:{ productos: productosNuevos, clientes: clientesNuevos }};
  }

  // Productos que el administrador cargó en el catálogo compartido (sin
  // costo/precio) y que este local todavía no tiene. Se reciben en cada
  // sincronización (ver SyncService/status.catalogoNuevo) y se crean acá
  // como productos locales NORMALES (con costo:0/precio:0, a completar por
  // el local) para que sigan el camino normal de sincronización de ahí en
  // más. Si el producto ya existe localmente (aunque sea por una adopción
  // anterior que todavía no confirmó el servidor) no se toca, para no
  // pisar un precio/costo que el local ya haya cargado.
  async function adoptarCatalogoNuevo(items){
    let adoptados = 0;
    for(const it of (items||[])){
      const existente = await StorageService.getEntity('product', it.catalog_id);
      if(existente) continue;
      // String(...) explícito: si el nombre/código cargado en el catálogo
      // compartido es "todo números" (ej. un código de barras usado como
      // nombre), Google Sheets lo devuelve como Number, no como texto —
      // eso rompía la búsqueda y el orden de la lista de productos en
      // cuanto se adoptaba un producto así (ver Utils.buscarProductos,
      // que ya era tolerante a esto, y listarProductos, que ahora también).
      const record = {
        id: it.catalog_id, nombre: String(it.name||''), codigo: String(it.sku||''), categoria: String(it.category||''),
        unidad: it.unit==='kg' ? 'kg' : 'unidad', costo:0, precio:0, margenPct: it.unit==='kg' ? 0 : null,
        desde_catalogo: true
      };
      await StorageService.putEntity('product', record, 'created');
      adoptados++;
    }
    return adoptados;
  }

  // Productos que el administrador borró del catálogo compartido con la
  // opción "quitar también de los locales que ya lo tienen" (ver
  // SyncService/status.catalogoEliminado). Se borran acá con el mismo
  // mecanismo que un borrado manual (tombstone + evento 'deleted' por
  // outbox), así que el borrado también sincroniza normalmente. Si ya no
  // existe localmente (por ejemplo, ya se había borrado a mano antes) no
  // pasa nada: eliminarProducto/removeEntity no hace nada en ese caso.
  async function eliminarCatalogoBorrado(catalogIds){
    let eliminados = 0;
    for(const catalogId of (catalogIds||[])){
      const existente = await StorageService.getEntity('product', catalogId);
      if(!existente) continue;
      await eliminarProducto(catalogId);
      eliminados++;
    }
    return eliminados;
  }

  return {
    listarProductos, guardarProducto, actualizarCostoInline, actualizarPrecioInline, actualizarMargenInline, eliminarProducto, restaurarEliminado,
    listarClientes, buscarClientePorNombre, registrarClienteSiNoExiste, actualizarClienteInline, eliminarCliente, estadisticasCliente,
    listarVentas, obtenerVenta, crearVenta, editarVenta, eliminarVenta,
    guardarBorrador, obtenerBorrador, borrarBorrador,
    listarGastos, guardarGasto, eliminarGasto,
    calcularDashboard, calcularDashboardCombinado, calcularReporte, calcularReporteCombinado,
    listarVentasCombinado, listarGastosCombinado,
    exportarBackupJSON, restaurarBackupJSON,
    necesitaResyncCompleto, ejecutarResyncCompleto,
    traerCatalogoDelServidor, adoptarCatalogoNuevo, eliminarCatalogoBorrado
  };
})();
