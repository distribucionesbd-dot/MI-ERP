window.UiProductos = (function(){
  let _config = null;

  function onCambiaUnidadForm(){
    const esKg = document.getElementById('prodUnidad').value === 'kg';
    document.getElementById('wrapProdMargen').style.display = esKg ? 'block' : 'none';
    document.getElementById('ayudaProdKg').style.display = esKg ? 'block' : 'none';
    document.getElementById('lblProdCosto').textContent = esKg ? 'Costo por kilo *' : 'Precio de costo *';
    document.getElementById('lblProdPrecio').textContent = esKg ? 'Precio de venta por kilo *' : 'Precio de venta *';
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
    onCambiaUnidadForm();
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

  async function eliminar(id){
    if(!confirm('¿Eliminar este producto del catálogo? Las boletas ya emitidas no se modifican.')) return;
    await BusinessService.eliminarProducto(id);
    await render();
    SyncService.scheduleOpportunistic();
  }

  async function render(){
    _config = await StorageService.getConfig();
    const filtro = (document.getElementById('prodBuscar').value||'').toLowerCase();
    const soloKg = document.getElementById('prodSoloKg').checked;
    let lista = await BusinessService.listarProductos();
    lista = lista.filter(p=>
      (p.nombre.toLowerCase().includes(filtro) || (p.codigo||'').toLowerCase().includes(filtro) || (p.categoria||'').toLowerCase().includes(filtro)) &&
      (!soloKg || p.unidad==='kg')
    );

    const tbody = document.getElementById('tablaProductos');
    tbody.innerHTML = '';
    document.getElementById('productosEmpty').style.display = lista.length ? 'none' : 'block';

    lista.forEach(p=>{
      const esKg = p.unidad==='kg';
      const margen = Utils.calcularMargenSobreVenta(p.precio, p.costo);
      const margenPctCell = esKg
        ? `<input type="number" step="1" min="0" value="${p.margenPct!=null?p.margenPct:''}" data-margen="${p.id}" style="${(p.margenPct!=null && p.margenPct<50)?'border-color:#dc2626;color:#dc2626;':''}">`
        : '<span class="muted">-</span>';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td data-label="Nombre">${Utils.escapeHtml(p.nombre)}</td>
        <td data-label="Código">${Utils.escapeHtml(p.codigo||'-')}</td>
        <td data-label="Categoría">${p.categoria?`<span class="tag">${Utils.escapeHtml(p.categoria)}</span>`:'-'}</td>
        <td data-label="Unidad">${esKg?'Kg':'Unidad'}</td>
        <td class="right" data-label="Costo"><input type="number" step="0.01" min="0" value="${p.costo}" data-costo="${p.id}"></td>
        <td class="right" data-label="Venta"><input type="number" step="0.01" min="0" value="${p.precio}" data-precio="${p.id}"></td>
        <td class="right" data-label="% s/costo">${margenPctCell}</td>
        <td class="right" data-label="Margen">${margen.toFixed(1)}%</td>
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
      if(!r.ok) UiToast.toast(r.error); else UiToast.toast('% de ganancia actualizado');
      render(); SyncService.scheduleOpportunistic();
    }));
  }

  function init(){
    document.getElementById('prodUnidad').addEventListener('change', onCambiaUnidadForm);
    document.getElementById('btnGuardarProducto').addEventListener('click', guardar);
    document.getElementById('btnCancelarProd').addEventListener('click', limpiarForm);
    document.getElementById('prodBuscar').addEventListener('input', render);
    document.getElementById('prodSoloKg').addEventListener('change', render);
    onCambiaUnidadForm();
  }

  window.ViewHandlers.productos = render;
  return { init, listarParaBuscador: ()=> BusinessService.listarProductos() };
})();
