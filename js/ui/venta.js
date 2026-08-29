/* =========================================================
   UI/VENTA.JS
   Pantalla "Nueva venta": la más rápida y la más usada.
   boletaActual/boletaEditandoId son dos estados explícitos y
   mutuamente excluyentes (nunca se mezclan borrador con edición
   de una boleta histórica).

   Flujo de carga de un ítem, en un solo campo de producto:
   PRODUCTO -> CANTIDAD -> PRECIO -> "+ Agregar producto".
   Si lo que se escribe no matchea ningún producto del catálogo,
   ese mismo texto pasa a ser el nombre de un ítem no registrado
   (sin pedirlo en otro campo ni exigir un botón aparte).
   ========================================================= */
window.UiVenta = (function(){
  let boletaActual = { items: [], horaInicio: null };
  let boletaEditandoId = null;
  let _bloqueadoGuardado = false;
  let _productosCache = [];
  let _resultados = [];
  let _indiceActivo = -1;
  let _guardarBorradorDebounced = Utils.debounce((d)=> BusinessService.guardarBorrador(d), 400);

  // Estado del selector kg <-> $ (solo aplica cuando el producto elegido se
  // vende por kilo). _modoKg es null si no hay un producto por kg activo en
  // el renglón de carga. _kgValor y _montoValor se mantienen SIEMPRE
  // equivalentes entre sí (uno se recalcula del otro cada vez que se toca
  // cantidad o precio), así alternar de kg a $ y volver nunca pierde
  // precisión ni "resetea" lo cargado.
  let _modoKg = null;       // 'kg' | 'monto' | null
  let _kgValor = null;      // cantidad en kilos, con toda la precisión posible
  let _montoValor = null;   // importe en $ equivalente

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
        // Se considera "hay borrador para recuperar" tanto si quedaron ítems
        // ya cargados como si sólo quedó el renglón que se estaba tipeando
        // (producto/cantidad/precio sin confirmar todavía).
        if(draft && ((draft.items && draft.items.length) || draft.itemEnProgreso)){
          boletaActual = { items: (draft.items||[]).map(it=>({...it})), horaInicio: draft.horaInicio||null };
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
    _resetCampoProducto();

    await actualizarDatalistClientes();
    renderItems();

    // Repone el renglón que se estaba escribiendo (producto/cantidad/precio
    // todavía sin confirmar con "+ Agregar producto") si había uno guardado
    // en el borrador — para no perder ni siquiera esa línea a medio cargar.
    if(draftRecuperado && draftRecuperado.itemEnProgreso){
      _restaurarItemEnProgreso(draftRecuperado.itemEnProgreso);
      // renderItems() (arriba) ya había programado un guardado del borrador
      // con los campos todavía vacíos (antes de restaurar este renglón);
      // se vuelve a programar ahora para que la última escritura (la que
      // realmente se ejecuta, por el debounce) refleje el renglón repuesto
      // y no lo pise con un itemEnProgreso vacío.
      _guardarLocal();
    }
    return !!draftRecuperado;
  }

  async function actualizarDatalistClientes(){
    const clientes = await BusinessService.listarClientes();
    document.getElementById('clientesDatalist').innerHTML =
      clientes.map(c=>`<option value="${Utils.escapeHtml(c.nombre)}">`).join('');
  }

  /* ---- buscador autocomplete ---- */
  function filtrarProductos(){
    document.getElementById('selectorProductoId').value = '';
    _ocultarTagLibre();
    _resetModoKg();
    const q = document.getElementById('buscadorProducto').value.trim().toLowerCase();
    if(!q){
      _resultados = _productosCache.slice(0,20);
    } else {
      _resultados = Utils.buscarProductos(_productosCache, q).slice(0,30);
    }
    _indiceActivo = -1;
    renderResultados();
    _guardarLocal();
  }
  function renderResultados(){
    const cont = document.getElementById('resultadosProductoBoleta');
    const q = document.getElementById('buscadorProducto').value.trim();
    if(!_resultados.length){
      cont.innerHTML = q ? '<div class="autocomplete-empty">No se encontraron productos — Enter para cargarlo como no registrado</div>' : '';
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
    _ocultarTagLibre();
    document.getElementById('itemPrecio').value = p.precio;
    document.getElementById('itemCantidad').value = 1;
    const esKg = p.unidad === 'kg';
    if(esKg){
      _modoKg = 'kg'; _kgValor = 1; _montoValor = 1 * (parseFloat(p.precio)||0);
    } else {
      _resetModoKg();
    }
    _actualizarUiModoKg();
    const campoCantidad = document.getElementById('itemCantidad');
    campoCantidad.focus(); campoCantidad.select();
    _guardarLocal();
  }
  function onKeyDownBuscador(e){
    if(e.key==='Escape'){ document.getElementById('resultadosProductoBoleta').classList.remove('show'); return; }
    if(e.key==='ArrowDown' && _resultados.length){ e.preventDefault(); _indiceActivo = Math.min(_indiceActivo+1, _resultados.length-1); renderResultados(); return; }
    if(e.key==='ArrowUp' && _resultados.length){ e.preventDefault(); _indiceActivo = Math.max(_indiceActivo-1, 0); renderResultados(); return; }
    if(e.key==='Enter'){
      if(_resultados.length){ e.preventDefault(); seleccionarResultado(_indiceActivo>=0?_indiceActivo:0); return; }
      const texto = document.getElementById('buscadorProducto').value.trim();
      if(texto){ e.preventDefault(); _confirmarComoLibre(); }
    }
  }
  // Se llama cuando el usuario deja de escribir en el buscador (Tab, click
  // afuera, o Enter sin resultados) con un texto que no matchea ningún
  // producto: ese texto pasa a ser, sin pedir nada más, el nombre del ítem
  // no registrado. Se avisa discretamente con un cartel chico (no un popup).
  function _confirmarComoLibre(){
    const texto = document.getElementById('buscadorProducto').value.trim();
    document.getElementById('resultadosProductoBoleta').classList.remove('show');
    if(!texto || document.getElementById('selectorProductoId').value){ _ocultarTagLibre(); return; }
    document.getElementById('tagProductoLibre').style.display = 'block';
    const campoCantidad = document.getElementById('itemCantidad');
    campoCantidad.focus(); campoCantidad.select();
  }
  function _ocultarTagLibre(){
    document.getElementById('tagProductoLibre').style.display = 'none';
  }
  function onBlurBuscador(){
    // Pequeño delay: si el blur es porque se hizo click en un resultado de
    // la lista, ese click ya disparó seleccionarResultado (mousedown) antes
    // de que este blur se procese; si no hay nada seleccionado, es un
    // producto no registrado.
    setTimeout(()=>{
      const id = document.getElementById('selectorProductoId').value;
      const texto = document.getElementById('buscadorProducto').value.trim();
      if(!id && texto) document.getElementById('tagProductoLibre').style.display = 'block';
    }, 120);
  }

  /* ---- selector kg <-> $ ---- */
  function _resetModoKg(){
    _modoKg = null; _kgValor = null; _montoValor = null;
  }
  function _redondearMonto(n){ return Math.round(n*100)/100; }
  function _redondearKg(n){ return Math.round(n*1000)/1000; }
  function _precioActivo(){ return parseFloat(document.getElementById('itemPrecio').value)||0; }

  function _actualizarUiModoKg(){
    const btn = document.getElementById('btnModoKg');
    const lblCant = document.getElementById('lblItemCantidad');
    const lblPrecio = document.getElementById('lblItemPrecio');
    const campoCantidad = document.getElementById('itemCantidad');
    const equiv = document.getElementById('equivalenciaKg');
    if(_modoKg==null){
      btn.style.display = 'none';
      lblCant.textContent = 'Cant.';
      lblPrecio.textContent = 'Precio unit.';
      campoCantidad.step = '0.001'; campoCantidad.min = '0.001'; campoCantidad.placeholder = 'Cant.';
      equiv.textContent = '';
      return;
    }
    lblPrecio.textContent = 'Precio por kg';
    btn.style.display = 'inline-block';
    if(_modoKg==='kg'){
      btn.textContent = 'kg';
      lblCant.textContent = 'Kilos';
      campoCantidad.step = '0.001'; campoCantidad.min = '0.001'; campoCantidad.placeholder = 'Ej: 0.5';
      campoCantidad.value = _kgValor!=null ? _redondearKg(_kgValor) : '';
      equiv.textContent = _montoValor!=null ? ('≈ ' + Utils.fmtMoneda(_montoValor)) : '';
    } else {
      btn.textContent = '$';
      lblCant.textContent = 'Importe';
      campoCantidad.step = '1'; campoCantidad.min = '0.01'; campoCantidad.placeholder = 'Ej: 10000';
      campoCantidad.value = _montoValor!=null ? _redondearMonto(_montoValor) : '';
      equiv.textContent = _kgValor!=null ? ('≈ ' + Utils.fmtCantidad(_kgValor,'kg')) : '';
    }
  }
  // El usuario tipeó en el campo de cantidad mientras hay un producto por
  // kg activo: el valor tipeado es la fuente de verdad del modo actual, y
  // el otro valor (kg o $) se recalcula a partir de ÉL, con precisión
  // completa — nunca al revés, para no perder exactitud al ir y volver.
  function _onInputCantidadKg(){
    if(_modoKg==null) return;
    const val = parseFloat(document.getElementById('itemCantidad').value);
    const precio = _precioActivo();
    if(_modoKg==='kg'){
      _kgValor = isNaN(val) ? null : val;
      _montoValor = (_kgValor!=null && precio>0) ? _kgValor*precio : null;
    } else {
      _montoValor = isNaN(val) ? null : val;
      _kgValor = (_montoValor!=null && precio>0) ? _montoValor/precio : null;
    }
    document.getElementById('equivalenciaKg').textContent = _modoKg==='kg'
      ? (_montoValor!=null ? ('≈ ' + Utils.fmtMoneda(_montoValor)) : '')
      : (_kgValor!=null ? ('≈ ' + Utils.fmtCantidad(_kgValor,'kg')) : '');
    _guardarLocal();
  }
  // Si se cambia el precio por kg con cantidad ya cargada, se recalcula el
  // valor que NO es la fuente de verdad actual (si se estaba escribiendo en
  // $, el importe se respeta y se recalculan los kg; si se estaba en kg, se
  // recalcula el importe).
  function _onInputPrecioKg(){
    if(_modoKg==null) return;
    const precio = _precioActivo();
    if(_modoKg==='kg'){
      _montoValor = (_kgValor!=null && precio>0) ? _kgValor*precio : null;
    } else {
      _kgValor = (_montoValor!=null && precio>0) ? _montoValor/precio : null;
    }
    const equiv = document.getElementById('equivalenciaKg');
    equiv.textContent = _modoKg==='kg'
      ? (_montoValor!=null ? ('≈ ' + Utils.fmtMoneda(_montoValor)) : '')
      : (_kgValor!=null ? ('≈ ' + Utils.fmtCantidad(_kgValor,'kg')) : '');
    _guardarLocal();
  }
  function toggleModoKg(){
    if(_modoKg==null) return;
    _modoKg = _modoKg==='kg' ? 'monto' : 'kg';
    _actualizarUiModoKg();
    document.getElementById('itemCantidad').focus();
    document.getElementById('itemCantidad').select();
    _guardarLocal();
  }

  function _resetCampoProducto(){
    document.getElementById('buscadorProducto').value = '';
    document.getElementById('selectorProductoId').value = '';
    document.getElementById('resultadosProductoBoleta').classList.remove('show');
    document.getElementById('itemPrecio').value = '';
    document.getElementById('itemCantidad').value = 1;
    _ocultarTagLibre();
    _resetModoKg();
    _actualizarUiModoKg();
    document.getElementById('btnAgregarItem').textContent = boletaActual.items.length ? '+ Agregar otro producto' : '+ Agregar producto';
  }

  function agregarItem(){
    const id = document.getElementById('selectorProductoId').value;
    const nombreLibre = document.getElementById('buscadorProducto').value.trim();
    const p = id ? _productosCache.find(x=>x.id===id) : null;
    if(!p && !nombreLibre){ UiToast.toast('Escribí o elegí un producto'); return; }

    const precio = parseFloat(document.getElementById('itemPrecio').value);
    if(isNaN(precio)){ UiToast.toast('Cargá el precio'); return; }

    let cantidad, subtotal;
    if(p && p.unidad==='kg' && _modoKg){
      cantidad = _kgValor;
      if(!(cantidad>0)){ UiToast.toast('Cargá una cantidad o un importe válido'); return; }
      if(_modoKg==='monto') subtotal = _montoValor;
    } else {
      cantidad = parseFloat(document.getElementById('itemCantidad').value) || 1;
    }

    if(!boletaEditandoId && !boletaActual.items.length && !boletaActual.horaInicio) boletaActual.horaInicio = Utils.nowISO();
    const item = {
      producto_id: p ? p.id : null,
      nombre: p ? p.nombre : nombreLibre,
      costo: p ? p.costo : 0,
      cantidad, precio,
      unidad: p ? (p.unidad||'unidad') : 'unidad'
    };
    if(subtotal!=null) item.subtotal = subtotal;
    boletaActual.items.push(item);

    _resetCampoProducto();
    renderItems();
    enfocarBuscador();
  }
  function quitarItem(idx){
    const quitado = boletaActual.items[idx];
    if(!quitado) return;
    boletaActual.items.splice(idx,1);
    if(!boletaActual.items.length) boletaActual.horaInicio = null;
    renderItems();
    // Reversible sin fricción: nada de "¿Confirmar?" para algo tan chico y
    // fácil de deshacer.
    UiToast.toastAccion('Producto eliminado', 'Deshacer', ()=>{
      boletaActual.items.splice(idx, 0, quitado);
      if(boletaActual.items.length===1 && !boletaActual.horaInicio) boletaActual.horaInicio = Utils.nowISO();
      renderItems();
    });
  }

  async function renderItems(){
    const config = await StorageService.getConfig();
    const tbody = document.getElementById('tablaItemsBoleta');
    tbody.innerHTML = '';
    let total = 0;
    boletaActual.items.forEach((it, idx)=>{
      const subtotal = Utils.subtotalItem(it);
      total += subtotal;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${Utils.escapeHtml(it.nombre)}${it.producto_id?'':' <span class="tag">no registrado</span>'}</td>
        <td class="right">${Utils.fmtCantidad(it.cantidad, it.unidad)}</td>
        <td class="right">${Utils.fmtMoneda(it.precio, config.moneda)}${it.unidad==='kg'?'/kg':''}</td>
        <td class="right">${Utils.fmtMoneda(subtotal, config.moneda)}</td>
        <td class="actions-cell"><a class="link" data-quitar="${idx}">Quitar</a></td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('[data-quitar]').forEach(a=> a.addEventListener('click', ()=> quitarItem(Number(a.dataset.quitar))));
    document.getElementById('itemsEmpty').style.display = boletaActual.items.length ? 'none' : 'block';
    document.getElementById('totalBoleta').textContent = Utils.fmtMoneda(total, config.moneda);
    document.getElementById('btnAgregarItem').textContent = boletaActual.items.length ? '+ Agregar otro producto' : '+ Agregar producto';
    _guardarLocal();
    actualizarIndicador();
    actualizarResumenHoy();
  }

  // Lo que se esté escribiendo en el renglón de carga (todavía sin
  // confirmar con "+ Agregar producto") también se guarda en el borrador,
  // así ni una línea a medio cargar se pierde si se cierra la app.
  function _capturarItemEnProgreso(){
    const nombre = document.getElementById('buscadorProducto').value.trim();
    const cantidadTxt = document.getElementById('itemCantidad').value;
    const precioTxt = document.getElementById('itemPrecio').value;
    if(!nombre && cantidadTxt==='1' && !precioTxt) return null; // estado inicial, nada que guardar
    if(!nombre && !precioTxt) return null;
    return {
      productoId: document.getElementById('selectorProductoId').value || null,
      nombre, cantidadTxt, precioTxt, modoKg: _modoKg
    };
  }
  function _restaurarItemEnProgreso(ip){
    if(!ip) return;
    document.getElementById('buscadorProducto').value = ip.nombre||'';
    if(ip.productoId){
      const p = _productosCache.find(x=>x.id===ip.productoId);
      if(p){
        document.getElementById('selectorProductoId').value = p.id;
        if(p.unidad==='kg'){ _modoKg = ip.modoKg||'kg'; }
      }
    }
    if(ip.precioTxt) document.getElementById('itemPrecio').value = ip.precioTxt;
    if(ip.cantidadTxt) document.getElementById('itemCantidad').value = ip.cantidadTxt;
    if(_modoKg){
      const precio = _precioActivo();
      const val = parseFloat(ip.cantidadTxt);
      if(!isNaN(val)){
        if(_modoKg==='kg'){ _kgValor = val; _montoValor = precio>0 ? val*precio : null; }
        else { _montoValor = val; _kgValor = precio>0 ? val/precio : null; }
      }
    }
    _actualizarUiModoKg();
    if(!document.getElementById('selectorProductoId').value && ip.nombre) document.getElementById('tagProductoLibre').style.display = 'block';
  }

  function _guardarLocal(){
    if(boletaEditandoId) return; // nunca mezclar con edición de boleta histórica
    const cliente = (document.getElementById('boletaCliente')?.value||'').trim();
    const fecha = document.getElementById('boletaFecha')?.value || Utils.hoyISO();
    const itemEnProgreso = _capturarItemEnProgreso();
    _guardarBorradorDebounced({ items: boletaActual.items, cliente, fecha, horaInicio: boletaActual.horaInicio, itemEnProgreso });
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
    // Limpia también el renglón que se estuviera escribiendo: si no,
    // renderItems() (más abajo) lo vuelve a guardar como borrador y la
    // venta "descartada" reaparecería sola al volver a esta pantalla.
    _resetCampoProducto();
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
        UiToast.toastVenta(venta.total, venta.numero, config.moneda, navigator.onLine===false);
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
        <td style="text-align:right;">${Utils.fmtMoneda(Utils.subtotalItem(it), config.moneda)}</td>
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
    const total = draft.items.reduce((s,it)=>s+Utils.subtotalItem(it),0);
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
    else if(mins >= window.APP_CONFIG.UMBRAL_ULTIMA_VENTA_ALERTA_MIN) elUltima.style.color = 'var(--tint-warning-text)';
    else elUltima.style.color = '';
  }

  // Se ejecuta una sola vez al iniciar la app. Si hay un borrador, la venta
  // ya queda restaurada y visible de entrada (prepararNuevaBoleta la carga
  // sola) — acá solo se avisa con un toast, sin ningún popup que haya que
  // cerrar para poder seguir usando la pantalla.
  async function verificarBorradorAlIniciar(){
    const habiaBorrador = await prepararNuevaBoleta();
    enfocarBuscador();
    if(habiaBorrador){
      UiToast.toastAccion('Recuperamos la venta que estabas cargando.', 'Descartar', async ()=>{
        boletaActual = { items: [], horaInicio: null };
        await BusinessService.borrarBorrador();
        _resetCampoProducto();
        renderItems();
      }, 6000);
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
    document.getElementById('buscadorProducto').addEventListener('blur', onBlurBuscador);
    document.addEventListener('click', (e)=>{
      const campo = document.getElementById('buscadorProducto');
      const lista = document.getElementById('resultadosProductoBoleta');
      if(campo && lista && e.target!==campo && !lista.contains(e.target)) lista.classList.remove('show');
    });
    document.getElementById('itemCantidad').addEventListener('input', _onInputCantidadKg);
    document.getElementById('itemPrecio').addEventListener('input', _onInputPrecioKg);
    document.getElementById('itemCantidad').addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); agregarItem(); } });
    document.getElementById('itemPrecio').addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); agregarItem(); } });
    document.getElementById('btnModoKg').addEventListener('click', toggleModoKg);
    document.getElementById('btnAgregarItem').addEventListener('click', agregarItem);
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
