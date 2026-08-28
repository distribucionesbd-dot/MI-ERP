/* =========================================================
   UI/VENTA.JS
   Pantalla "Nueva venta": la más rápida y la más usada.
   boletaActual/boletaEditandoId son dos estados explícitos y
   mutuamente excluyentes (nunca se mezclan borrador con edición
   de una boleta histórica).
   ========================================================= */
window.UiVenta = (function(){
  let boletaActual = { items: [], horaInicio: null };
  let boletaEditandoId = null;
  let _bloqueadoGuardado = false;
  let _productosCache = [];
  let _resultados = [];
  let _indiceActivo = -1;
  let _guardarBorradorDebounced = Utils.debounce((d)=> BusinessService.guardarBorrador(d), 400);

  function enfocarBuscador(){
    const el = document.getElementById('buscadorProducto');
    if(el){ try{ el.focus(); }catch(e){} }
  }

  async function prepararNuevaBoleta(){
    _productosCache = await BusinessService.listarProductos();
    const config = await StorageService.getConfig();

    if(boletaEditandoId){
      const v = await BusinessService.obtenerVenta(boletaEditandoId);
      if(v){
        document.getElementById('boletaFecha').value = v.fecha;
        document.getElementById('boletaCliente').value = v.cliente_nombre_snapshot||'';
        document.getElementById('boletaNumeroPreview').value = String(v.numero).padStart(4,'0') + ' (editando)';
        boletaActual = { items: v.items.map(it=>({...it})) };
      } else {
        boletaEditandoId = null;
      }
    }
    let draftRecuperado = null;
    if(!boletaEditandoId){
      if(!boletaActual.items.length){
        const draft = await BusinessService.obtenerBorrador();
        if(draft && draft.items && draft.items.length){
          boletaActual = { items: draft.items.map(it=>({...it})), horaInicio: draft.horaInicio||null };
          draftRecuperado = draft;
        }
      }
      document.getElementById('boletaFecha').value = draftRecuperado ? (draftRecuperado.fecha||Utils.hoyISO()) : Utils.hoyISO();
      document.getElementById('boletaNumeroPreview').value = String(config.proximoNumero).padStart(4,'0');
      if(draftRecuperado) document.getElementById('boletaCliente').value = draftRecuperado.cliente||'';
    }

    document.getElementById('nuevaBoletaTitulo').textContent = boletaEditandoId
      ? ('Editar boleta N° ' + document.getElementById('boletaNumeroPreview').value.replace(' (editando)',''))
      : 'Nueva venta';
    document.getElementById('btnGuardarBoleta').textContent = boletaEditandoId ? 'Guardar cambios' : 'FINALIZAR VENTA';
    document.getElementById('btnGuardarImprimirBoleta').textContent = boletaEditandoId ? 'Guardar cambios e imprimir / PDF' : 'FINALIZAR E IMPRIMIR / PDF';
    document.getElementById('btnVaciarBoleta').textContent = boletaEditandoId ? 'Cancelar edición' : 'DESCARTAR VENTA';
    document.getElementById('buscadorProducto').value = '';
    document.getElementById('selectorProductoId').value = '';
    document.getElementById('resultadosProductoBoleta').classList.remove('show');

    await actualizarDatalistClientes();
    renderItems();
  }

  async function actualizarDatalistClientes(){
    const clientes = await BusinessService.listarClientes();
    document.getElementById('clientesDatalist').innerHTML =
      clientes.map(c=>`<option value="${Utils.escapeHtml(c.nombre)}">`).join('');
  }

  /* ---- buscador autocomplete ---- */
  function filtrarProductos(){
    const q = document.getElementById('buscadorProducto').value.trim().toLowerCase();
    document.getElementById('selectorProductoId').value = '';
    if(!q){
      _resultados = _productosCache.slice(0,20);
    } else {
      _resultados = _productosCache.filter(p=>
        p.nombre.toLowerCase().includes(q) || (p.codigo||'').toLowerCase().includes(q) || (p.categoria||'').toLowerCase().includes(q)
      ).slice(0,30);
    }
    _indiceActivo = -1;
    renderResultados();
  }
  function renderResultados(){
    const cont = document.getElementById('resultadosProductoBoleta');
    const q = document.getElementById('buscadorProducto').value.trim();
    if(!_resultados.length){
      cont.innerHTML = q ? '<div class="autocomplete-empty">No se encontraron productos</div>' : '';
      cont.classList.toggle('show', !!q);
      return;
    }
    cont.innerHTML = _resultados.map((p,i)=>`
      <div class="autocomplete-item${i===_indiceActivo?' active':''}" data-idx="${i}">
        ${Utils.escapeHtml(p.nombre)} <span class="ac-precio">${Utils.fmtMoneda(p.precio)}${p.unidad==='kg'?'/kg':''}</span>
      </div>`).join('');
    cont.classList.add('show');
    cont.querySelectorAll('.autocomplete-item').forEach(el=>{
      el.addEventListener('mousedown', (e)=>{ e.preventDefault(); seleccionarResultado(Number(el.dataset.idx)); });
    });
  }
  function seleccionarResultado(i){
    const p = _resultados[i];
    if(!p) return;
    document.getElementById('selectorProductoId').value = p.id;
    document.getElementById('buscadorProducto').value = p.nombre;
    document.getElementById('resultadosProductoBoleta').classList.remove('show');
    document.getElementById('itemPrecio').value = p.precio;
    document.getElementById('itemCantidad').value = 1;
    const esKg = p.unidad === 'kg';
    document.getElementById('lblItemCantidad').textContent = esKg ? 'Kilos' : 'Cant.';
    document.getElementById('itemCantidad').placeholder = esKg ? 'Ej: 0.5' : 'Cant.';
    document.getElementById('lblItemPrecio').textContent = esKg ? 'Precio por kg' : 'Precio unit.';
    const campoCantidad = document.getElementById('itemCantidad');
    campoCantidad.focus(); campoCantidad.select();
  }
  function onKeyDownBuscador(e){
    if(e.key==='Escape'){ document.getElementById('resultadosProductoBoleta').classList.remove('show'); return; }
    if(!_resultados.length) return;
    if(e.key==='ArrowDown'){ e.preventDefault(); _indiceActivo = Math.min(_indiceActivo+1, _resultados.length-1); renderResultados(); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); _indiceActivo = Math.max(_indiceActivo-1, 0); renderResultados(); }
    else if(e.key==='Enter'){ e.preventDefault(); seleccionarResultado(_indiceActivo>=0?_indiceActivo:0); }
  }

  function agregarItem(){
    const id = document.getElementById('selectorProductoId').value;
    const p = _productosCache.find(x=>x.id===id);
    if(!p){ UiToast.toast('Elegí un producto de la lista de búsqueda'); return; }
    const cantidad = parseFloat(document.getElementById('itemCantidad').value) || 1;
    const precio = parseFloat(document.getElementById('itemPrecio').value);
    if(isNaN(precio)){ UiToast.toast('Cargá el precio unitario'); return; }
    if(!boletaEditandoId && !boletaActual.items.length && !boletaActual.horaInicio) boletaActual.horaInicio = Utils.nowISO();
    boletaActual.items.push({ producto_id: p.id, nombre: p.nombre, costo: p.costo, cantidad, precio, unidad: p.unidad||'unidad' });
    document.getElementById('buscadorProducto').value = '';
    document.getElementById('selectorProductoId').value = '';
    document.getElementById('resultadosProductoBoleta').classList.remove('show');
    document.getElementById('itemPrecio').value = '';
    document.getElementById('itemCantidad').value = 1;
    document.getElementById('lblItemCantidad').textContent = 'Cant.';
    document.getElementById('lblItemPrecio').textContent = 'Precio unit.';
    renderItems();
    enfocarBuscador();
  }
  function agregarItemLibre(){
    const nombre = document.getElementById('itemLibreNombre').value.trim();
    const cantidad = parseFloat(document.getElementById('itemLibreCantidad').value) || 1;
    const precio = parseFloat(document.getElementById('itemLibrePrecio').value);
    if(!nombre){ UiToast.toast('Escribí una descripción'); return; }
    if(isNaN(precio)){ UiToast.toast('Cargá el precio unitario'); return; }
    if(!boletaEditandoId && !boletaActual.items.length && !boletaActual.horaInicio) boletaActual.horaInicio = Utils.nowISO();
    boletaActual.items.push({ producto_id:null, nombre, costo:0, cantidad, precio, unidad:'unidad' });
    document.getElementById('itemLibreNombre').value=''; document.getElementById('itemLibreCantidad').value=1; document.getElementById('itemLibrePrecio').value='';
    renderItems();
    enfocarBuscador();
  }
  function quitarItem(idx){
    boletaActual.items.splice(idx,1);
    if(!boletaActual.items.length) boletaActual.horaInicio = null;
    renderItems();
  }

  async function renderItems(){
    const config = await StorageService.getConfig();
    const tbody = document.getElementById('tablaItemsBoleta');
    tbody.innerHTML = '';
    let total = 0;
    boletaActual.items.forEach((it, idx)=>{
      const subtotal = it.cantidad * it.precio;
      total += subtotal;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${Utils.escapeHtml(it.nombre)}${it.producto_id?'':' <span class="tag">libre</span>'}</td>
        <td class="right">${Utils.fmtCantidad(it.cantidad, it.unidad)}</td>
        <td class="right">${Utils.fmtMoneda(it.precio, config.moneda)}${it.unidad==='kg'?'/kg':''}</td>
        <td class="right">${Utils.fmtMoneda(subtotal, config.moneda)}</td>
        <td class="actions-cell"><a class="link" data-quitar="${idx}">Quitar</a></td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('[data-quitar]').forEach(a=> a.addEventListener('click', ()=> quitarItem(Number(a.dataset.quitar))));
    document.getElementById('itemsEmpty').style.display = boletaActual.items.length ? 'none' : 'block';
    document.getElementById('totalBoleta').textContent = Utils.fmtMoneda(total, config.moneda);
    _guardarLocal();
    actualizarIndicador();
    actualizarResumenHoy();
  }

  function _guardarLocal(){
    if(boletaEditandoId) return; // nunca mezclar con edición de boleta histórica
    const cliente = (document.getElementById('boletaCliente')?.value||'').trim();
    const fecha = document.getElementById('boletaFecha')?.value || Utils.hoyISO();
    _guardarBorradorDebounced({ items: boletaActual.items, cliente, fecha, horaInicio: boletaActual.horaInicio });
  }

  async function cancelarBoletaActual(){
    if(boletaEditandoId){
      if(!confirm('¿Cancelar la edición? Los cambios que no guardaste se van a perder.')) return;
      boletaEditandoId = null;
      boletaActual = { items: [] };
      window.UiNav.mostrarVista('boletas');
      return;
    }
    if(boletaActual.items.length){
      if(!confirm('¿Descartar esta venta? Solo hacelo si esta operación NO se realizó. Si el cliente ya pagó o se llevó la mercadería, la venta debería registrarse.')) return;
    }
    boletaActual = { items: [], horaInicio: null };
    await BusinessService.borrarBorrador();
    renderItems();
    enfocarBuscador();
  }

  async function guardarBoleta(){
    if(_bloqueadoGuardado) return null;
    if(!boletaActual.items.length){ UiToast.toast('Agregá al menos un ítem'); return null; }
    _bloqueadoGuardado = true;
    const btnG = document.getElementById('btnGuardarBoleta');
    const btnGI = document.getElementById('btnGuardarImprimirBoleta');
    btnG.disabled = true; btnGI.disabled = true;
    try{
      const fecha = document.getElementById('boletaFecha').value || Utils.hoyISO();
      const cliente = document.getElementById('boletaCliente').value.trim();
      const datos = { fecha, cliente, items: boletaActual.items, horaInicio: boletaActual.horaInicio };
      const res = boletaEditandoId
        ? await BusinessService.editarVenta(boletaEditandoId, datos)
        : await BusinessService.crearVenta(datos);
      if(!res.ok){ UiToast.toast(res.error); return null; }
      const venta = res.data;
      const editando = !!boletaEditandoId;

      await actualizarDatalistClientes();
      boletaActual = { items: [] };
      boletaEditandoId = null;
      document.getElementById('boletaCliente').value = '';

      SyncService.scheduleOpportunistic();
      if(window.ViewHandlers.dashboard) window.ViewHandlers.dashboard();

      if(editando){
        UiToast.toast('Boleta N° ' + String(venta.numero).padStart(4,'0') + ' actualizada');
        window.UiNav.mostrarVista('boletas');
      } else {
        await BusinessService.borrarBorrador();
        await prepararNuevaBoleta();
        const config = await StorageService.getConfig();
        UiToast.toastGrande('✓ VENTA REGISTRADA<br>' + Utils.fmtMoneda(venta.total, config.moneda) + ' · Boleta N° ' + String(venta.numero).padStart(4,'0'));
        enfocarBuscador();
      }
      return venta;
    } finally {
      _bloqueadoGuardado = false;
      btnG.disabled = false; btnGI.disabled = false;
    }
  }
  async function guardarEImprimir(){
    const v = await guardarBoleta();
    if(v) await imprimirVenta(v);
  }
  async function imprimirVenta(v){
    const config = await StorageService.getConfig();
    const doc = document.getElementById('boletaDocContent');
    const itemsHtml = v.items.map(it=>`
      <tr>
        <td>${Utils.escapeHtml(it.nombre)}</td>
        <td style="text-align:center;">${Utils.fmtCantidad(it.cantidad, it.unidad)}</td>
        <td style="text-align:right;">${Utils.fmtMoneda(it.precio, config.moneda)}${it.unidad==='kg'?'/kg':''}</td>
        <td style="text-align:right;">${Utils.fmtMoneda(it.cantidad*it.precio, config.moneda)}</td>
      </tr>`).join('');
    doc.innerHTML = `
      <div class="biz-header">
        <div>
          <h2>${Utils.escapeHtml(config.nombre||'Mi Negocio')}</h2>
          <div class="biz-details">
            ${config.direccion?Utils.escapeHtml(config.direccion)+'<br>':''}
            ${config.telefono?'Tel: '+Utils.escapeHtml(config.telefono)+'<br>':''}
            ${config.cuit?Utils.escapeHtml(config.cuit):''}
          </div>
        </div>
        <div class="boleta-meta">
          <div class="muted">BOLETA</div>
          <div class="num">N° ${String(v.numero).padStart(4,'0')}</div>
          <div>${Utils.fmtFecha(v.fecha)}</div>
          ${v.cliente_nombre_snapshot?`<div>Cliente: ${Utils.escapeHtml(v.cliente_nombre_snapshot)}</div>`:''}
        </div>
      </div>
      <table><thead><tr><th>Producto</th><th style="text-align:center;">Cant.</th><th style="text-align:right;">Precio</th><th style="text-align:right;">Subtotal</th></tr></thead>
      <tbody>${itemsHtml}</tbody></table>
      <table class="totales"><tr class="final"><td>TOTAL</td><td style="text-align:right;">${Utils.fmtMoneda(v.total, config.moneda)}</td></tr></table>
      <div class="footer-note">${Utils.escapeHtml(config.pie||'')}</div>`;
    setTimeout(()=>window.print(), 100);
  }

  function editarVentaHistorica(id){
    boletaEditandoId = id;
    window.UiNav.mostrarVista('nuevaBoleta');
  }

  async function actualizarIndicador(){
    const ind = document.getElementById('ventaAbiertaIndicator');
    const draft = await BusinessService.obtenerBorrador();
    if(!draft || !draft.items || !draft.items.length){ ind.style.display='none'; return; }
    const config = await StorageService.getConfig();
    const total = draft.items.reduce((s,it)=>s+it.cantidad*it.precio,0);
    const mins = Utils.minutosDesde(draft.horaInicio || draft.ultimaModificacion);
    let estado = 'estado-normal';
    if(mins >= window.APP_CONFIG.UMBRAL_INDICADOR_URGENTE_MIN) estado = 'estado-urgente';
    else if(mins >= window.APP_CONFIG.UMBRAL_INDICADOR_ALERTA_MIN) estado = 'estado-alerta';
    const haceTxt = mins<=0 ? 'recién empezada' : ('hace ' + mins + ' min');
    ind.className = 'venta-indicator ' + estado;
    ind.textContent = '🔴 VENTA ABIERTA · ' + draft.items.length + (draft.items.length===1?' producto':' productos') + ' · ' + Utils.fmtMoneda(total, config.moneda) + ' · ' + haceTxt;
    ind.style.display = 'block';
  }
  async function irAVentaAbierta(){
    if(boletaEditandoId){
      if(!confirm('Estás editando otra boleta. Si vas a la venta pendiente, se descartan los cambios no guardados de esa edición. ¿Continuar?')) return;
      boletaEditandoId = null;
    }
    const draft = await BusinessService.obtenerBorrador();
    if(draft && draft.items && draft.items.length) boletaActual = { items: draft.items.map(it=>({...it})), horaInicio: draft.horaInicio||null };
    window.UiNav.mostrarVista('nuevaBoleta');
  }

  async function actualizarResumenHoy(){
    const elResumen = document.getElementById('resumenVentaHoy');
    const elUltima = document.getElementById('infoUltimaVenta');
    if(!elResumen || !elUltima) return;
    const config = await StorageService.getConfig();
    const hoy = Utils.hoyISO();
    const ventas = await BusinessService.listarVentas();
    const vHoy = ventas.filter(v=>v.fecha===hoy);
    const totalHoy = vHoy.reduce((s,v)=>s+v.total,0);
    elResumen.textContent = 'Hoy: ' + vHoy.length + (vHoy.length===1?' venta':' ventas') + ' · ' + Utils.fmtMoneda(totalHoy, config.moneda);

    if(!vHoy.length){ elUltima.textContent = 'Todavía no registraste ventas hoy'; elUltima.style.color=''; return; }
    const ultima = vHoy.slice().sort((a,b)=>b.created_at.localeCompare(a.created_at))[0];
    const horaTxt = new Date(ultima.created_at).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
    const mins = Utils.minutosDesde(ultima.created_at);
    elUltima.textContent = 'Última venta: ' + horaTxt + ' · hace ' + mins + ' min · ' + Utils.fmtMoneda(ultima.total, config.moneda);
    if(mins >= window.APP_CONFIG.UMBRAL_ULTIMA_VENTA_URGENTE_MIN) elUltima.style.color = 'var(--danger)';
    else if(mins >= window.APP_CONFIG.UMBRAL_ULTIMA_VENTA_ALERTA_MIN) elUltima.style.color = '#b45309';
    else elUltima.style.color = '';
  }

  // Se ejecuta una sola vez al iniciar la app: si hay borrador, muestra el modal
  // ANTES de que prepararNuevaBoleta() (con boletaActual vacío) lo pise.
  async function verificarBorradorAlIniciar(){
    const draft = await BusinessService.obtenerBorrador();
    if(draft && draft.items && draft.items.length){
      UiModal.mostrarRecuperarVenta(draft,
        async (d)=>{
          boletaActual = { items: d.items.map(it=>({...it})), horaInicio: d.horaInicio||null };
          await prepararNuevaBoleta();
          document.getElementById('boletaFecha').value = d.fecha || Utils.hoyISO();
          document.getElementById('boletaCliente').value = d.cliente || '';
          _guardarLocal();
          enfocarBuscador();
        },
        async ()=>{
          await BusinessService.borrarBorrador();
          boletaActual = { items: [], horaInicio: null };
          await prepararNuevaBoleta();
          enfocarBuscador();
        }
      );
    } else {
      await prepararNuevaBoleta();
      enfocarBuscador();
    }
    actualizarIndicador();
    actualizarResumenHoy();
    setInterval(actualizarIndicador, 15000);
    setInterval(actualizarResumenHoy, 60000);
  }

  function init(){
    document.getElementById('buscadorProducto').addEventListener('input', filtrarProductos);
    document.getElementById('buscadorProducto').addEventListener('focus', filtrarProductos);
    document.getElementById('buscadorProducto').addEventListener('keydown', onKeyDownBuscador);
    document.addEventListener('click', (e)=>{
      const campo = document.getElementById('buscadorProducto');
      const lista = document.getElementById('resultadosProductoBoleta');
      if(campo && lista && e.target!==campo && !lista.contains(e.target)) lista.classList.remove('show');
    });
    document.getElementById('itemCantidad').addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); agregarItem(); } });
    document.getElementById('itemPrecio').addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); agregarItem(); } });
    document.getElementById('btnAgregarItem').addEventListener('click', agregarItem);
    document.getElementById('btnAgregarItemLibre').addEventListener('click', agregarItemLibre);
    document.getElementById('btnGuardarBoleta').addEventListener('click', guardarBoleta);
    document.getElementById('btnGuardarImprimirBoleta').addEventListener('click', guardarEImprimir);
    document.getElementById('btnVaciarBoleta').addEventListener('click', cancelarBoletaActual);
    document.getElementById('boletaFecha').addEventListener('change', _guardarLocal);
    document.getElementById('boletaCliente').addEventListener('input', _guardarLocal);
    document.getElementById('ventaAbiertaIndicator').addEventListener('click', irAVentaAbierta);

    document.addEventListener('keydown', (e)=>{
      if(e.key==='F2'){ e.preventDefault(); window.UiNav.mostrarVista('nuevaBoleta'); return; }
      if(e.key==='F4'){
        const activa = document.getElementById('view-nuevaBoleta').classList.contains('active');
        if(!activa || boletaEditandoId || !boletaActual.items.length) return;
        e.preventDefault();
        guardarBoleta();
      }
    });
    window.addEventListener('beforeunload', (e)=>{
      if(!boletaEditandoId && boletaActual.items.length){ e.preventDefault(); e.returnValue=''; }
    });
  }

  window.ViewHandlers.nuevaBoleta = async ()=>{ await prepararNuevaBoleta(); enfocarBuscador(); };

  return { init, editarVentaHistorica, verificarBorradorAlIniciar, reimprimir: imprimirVenta };
})();
