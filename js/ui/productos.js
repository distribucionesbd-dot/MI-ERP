window.UiProductos = (function(){
  let _config = null;

  function _faltaPrecio(p){ return !!p.desde_catalogo && !p.costo && !p.precio; }

  function onCambiaUnidadForm(){
    const esKg = document.getElementById('prodUnidad').value === 'kg';
    document.getElementById('wrapProdMargen').style.display = esKg ? 'block' : 'none';
    document.getElementById('ayudaProdKg').style.display = esKg ? 'block' : 'none';
    document.getElementById('lblProdCosto').textContent = esKg ? 'Costo por kilo *' : 'Precio de costo *';
    document.getElementById('lblProdPrecio').textContent = esKg ? 'Precio de venta por kilo *' : 'Precio de venta *';
    _actualizarPreviewMargen();
  }

  // Vista previa en vivo de Costo/Venta/Margen bruto al cargar o editar un
  // producto (Fase 4, punto 10): mismo % que se ve después en el listado
  // (Utils.calcularMargenSobreVenta = margen sobre el precio de venta), para
  // no mezclar fórmulas distintas bajo la misma palabra "margen". Si el
  // precio de venta queda por debajo del costo, se avisa claro (sin bloquear
  // el guardado: puede ser una promoción intencional).
  function _actualizarPreviewMargen(){
    const el = document.getElementById('prodMargenPreview');
    if(!el) return;
    const costo = parseFloat(document.getElementById('prodCosto').value);
    let precio = parseFloat(document.getElementById('prodPrecio').value);
    const esKg = document.getElementById('prodUnidad').value === 'kg';
    const margenInput = document.getElementById('prodMargenPct').value;
    if(esKg && margenInput!=='' && !isNaN(parseFloat(margenInput)) && !isNaN(costo)){
      precio = Utils.calcularPrecioDesdeMargenSobreCosto(costo, parseFloat(margenInput));
    }
    if(isNaN(costo) || isNaN(precio)){ el.textContent=''; el.className='muted'; return; }
    const moneda = (_config && _config.moneda) || '$';
    if(precio < costo){
      el.className = 'margen-preview-warn';
      el.textContent = '⚠ El precio de venta (' + Utils.fmtMoneda(precio,moneda) + ') es menor al costo (' + Utils.fmtMoneda(costo,moneda) + '). Vas a perder dinero en cada venta de este producto.';
      return;
    }
    const margenBruto = precio - costo;
    const margenPctVenta = Utils.calcularMargenSobreVenta(precio, costo);
    el.className = 'margen-preview-ok';
    el.textContent = 'Costo ' + Utils.fmtMoneda(costo,moneda) + ' · Venta ' + Utils.fmtMoneda(precio,moneda) +
      ' · Margen bruto ' + Utils.fmtMoneda(margenBruto,moneda) + ' (' + margenPctVenta.toFixed(1).replace('.',',') + '%)';
  }

  function limpiarForm(){
    document.getElementById('prodId').value = '';
    document.getElementById('prodNombre').value = '';
    document.getElementById('prodCodigo').value = '';
    document.getElementById('prodUnidad').value = 'unidad';
    document.getElementById('prodCosto').value = '';
    document.getElementById('prodPrecio').value = '';
    document.getElementById('prodCategoria').value = '';
    document.getElementById('prodMargenPct').value = '';
    onCambiaUnidadForm(); // ya actualiza la vista previa de margen
    document.getElementById('prodFormTitle').textContent = 'Nuevo producto';
    document.getElementById('btnCancelarProd').style.display = 'none';
  }

  async function editar(id){
    const p = await StorageService.getEntity('product', id);
    if(!p) return;
    document.getElementById('prodId').value = p.id;
    document.getElementById('prodNombre').value = p.nombre;
    document.getElementById('prodCodigo').value = p.codigo||'';
    document.getElementById('prodUnidad').value = p.unidad==='kg' ? 'kg' : 'unidad';
    document.getElementById('prodCosto').value = p.costo;
    document.getElementById('prodPrecio').value = p.precio;
    document.getElementById('prodCategoria').value = p.categoria||'';
    document.getElementById('prodMargenPct').value = p.margenPct!=null ? p.margenPct : '';
    onCambiaUnidadForm();
    document.getElementById('prodFormTitle').textContent = 'Editar producto';
    document.getElementById('btnCancelarProd').style.display = 'inline-block';
    window.scrollTo({top:0, behavior:'smooth'});
  }

  async function guardar(){
    const datos = {
      id: document.getElementById('prodId').value || null,
      nombre: document.getElementById('prodNombre').value,
      codigo: document.getElementById('prodCodigo').value,
      unidad: document.getElementById('prodUnidad').value,
      costo: document.getElementById('prodCosto').value,
      precio: document.getElementById('prodPrecio').value,
      categoria: document.getElementById('prodCategoria').value,
      margenPct: document.getElementById('prodMargenPct').value
    };
    const res = await BusinessService.guardarProducto(datos);
    if(!res.ok){ UiToast.toast(res.error); return; }
    limpiarForm();
    await render();
    UiToast.toast('Producto guardado');
    SyncService.scheduleOpportunistic();
  }

  // Reversible sin fricción: las boletas ya emitidas no se tocan igual, así
  // que en vez de un confirm() se avisa con un toast y "Deshacer" unos
  // segundos (Fase 3, punto 7).
  async function eliminar(id){
    await BusinessService.eliminarProducto(id);
    await render();
    SyncService.scheduleOpportunistic();
    UiToast.toastAccion('Producto eliminado del catálogo', 'Deshacer', async ()=>{
      await BusinessService.restaurarEliminado('product', id);
      await render();
      SyncService.scheduleOpportunistic();
    });
  }

  async function render(){
    _config = await StorageService.getConfig();
    const filtro = (document.getElementById('prodBuscar').value||'').toLowerCase();
    const soloKg = document.getElementById('prodSoloKg').checked;
    let lista = await BusinessService.listarProductos();
    lista = lista.filter(p=>
      (String(p.nombre||'').toLowerCase().includes(filtro) || String(p.codigo||'').toLowerCase().includes(filtro) || String(p.categoria||'').toLowerCase().includes(filtro)) &&
      (!soloKg || p.unidad==='kg')
    );

    const tbody = document.getElementById('tablaProductos');
    tbody.innerHTML = '';
    document.getElementById('productosEmpty').style.display = lista.length ? 'none' : 'block';

    // Los productos que llegaron del catálogo del administrador y todavía
    // no tienen precio cargado se muestran primero, para que sea fácil
    // encontrarlos y completarlos.
    lista.sort((a,b)=> (_faltaPrecio(b)?1:0) - (_faltaPrecio(a)?1:0));

    lista.forEach(p=>{
      const esKg = p.unidad==='kg';
      const margen = Utils.calcularMargenSobreVenta(p.precio, p.costo);
      const margenPctCell = esKg
        ? `<input type="number" step="1" min="0" value="${p.margenPct!=null?p.margenPct:''}" data-margen="${p.id}" style="${(p.margenPct!=null && p.margenPct<50)?'border-color:var(--danger);color:var(--danger);':''}">`
        : '<span class="muted">-</span>';
      const tr = document.createElement('tr');
      if(_faltaPrecio(p)) tr.style.background = 'var(--tint-warning-bg)';
      tr.innerHTML = `
        <td data-label="Nombre">${Utils.escapeHtml(p.nombre)}${_faltaPrecio(p)?' <span class="tag" style="background:var(--tint-warning-bg);color:var(--tint-warning-text);">Cargado por admin · falta precio</span>':''}</td>
        <td data-label="Código">${Utils.escapeHtml(p.codigo||'-')}</td>
        <td data-label="Categoría">${p.categoria?`<span class="tag">${Utils.escapeHtml(p.categoria)}</span>`:'-'}</td>
        <td data-label="Unidad">${esKg?'Kg':'Unidad'}</td>
        <td class="right" data-label="Costo"><input type="number" step="0.01" min="0" value="${p.costo}" data-costo="${p.id}"></td>
        <td class="right" data-label="Venta"><input type="number" step="0.01" min="0" value="${p.precio}" data-precio="${p.id}"></td>
        <td class="right" data-label="% s/costo">${margenPctCell}</td>
        <td class="right" data-label="Margen bruto">${margen<0?`<span class="margen-negativo">⚠ ${margen.toFixed(1)}%</span>`:margen.toFixed(1)+'%'}</td>
        <td class="actions-cell">
          <a class="link" data-editar="${p.id}">Editar</a> ·
          <a class="link" data-eliminar="${p.id}">Eliminar</a>
        </td>`;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('[data-editar]').forEach(a=> a.addEventListener('click', ()=> editar(a.dataset.editar)));
    tbody.querySelectorAll('[data-eliminar]').forEach(a=> a.addEventListener('click', ()=> eliminar(a.dataset.eliminar)));
    tbody.querySelectorAll('[data-costo]').forEach(inp=> inp.addEventListener('change', async ()=>{
      const r = await BusinessService.actualizarCostoInline(inp.dataset.costo, inp.value);
      if(!r.ok) UiToast.toast(r.error); else UiToast.toast('Costo actualizado');
      render(); SyncService.scheduleOpportunistic();
    }));
    tbody.querySelectorAll('[data-precio]').forEach(inp=> inp.addEventListener('change', async ()=>{
      const r = await BusinessService.actualizarPrecioInline(inp.dataset.precio, inp.value);
      if(!r.ok) UiToast.toast(r.error); else UiToast.toast('Precio actualizado');
      render(); SyncService.scheduleOpportunistic();
    }));
    tbody.querySelectorAll('[data-margen]').forEach(inp=> inp.addEventListener('change', async ()=>{
      const r = await BusinessService.actualizarMargenInline(inp.dataset.margen, inp.value);
      if(!r.ok) UiToast.toast(r.error); else UiToast.toast('% de margen actualizado');
      render(); SyncService.scheduleOpportunistic();
    }));
  }

  function init(){
    document.getElementById('prodUnidad').addEventListener('change', onCambiaUnidadForm);
    document.getElementById('prodCosto').addEventListener('input', _actualizarPreviewMargen);
    document.getElementById('prodPrecio').addEventListener('input', _actualizarPreviewMargen);
    document.getElementById('prodMargenPct').addEventListener('input', _actualizarPreviewMargen);
    document.getElementById('btnGuardarProducto').addEventListener('click', guardar);
    document.getElementById('btnCancelarProd').addEventListener('click', limpiarForm);
    document.getElementById('prodBuscar').addEventListener('input', render);
    document.getElementById('prodSoloKg').addEventListener('change', render);
    onCambiaUnidadForm();
  }

  window.ViewHandlers.productos = render;
  return { init, listarParaBuscador: ()=> BusinessService.listarProductos() };
})();
