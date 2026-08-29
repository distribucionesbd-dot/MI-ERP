window.UiClientes = (function(){
  async function actualizarInline(id, campo, value){
    const r = await BusinessService.actualizarClienteInline(id, campo, value);
    if(!r.ok){ UiToast.toast(r.error); return; }
    UiToast.toast(campo==='telefono' ? 'Teléfono actualizado' : 'Dirección actualizada');
    SyncService.scheduleOpportunistic();
  }
  // Reversible: no afecta boletas ya hechas, así que alcanza con un toast
  // con "Deshacer" en vez de interrumpir con un confirm() (Fase 3, punto 7).
  async function eliminar(id){
    await BusinessService.eliminarCliente(id);
    SyncService.scheduleOpportunistic();
    render();
    UiToast.toastAccion('Cliente eliminado', 'Deshacer', async ()=>{
      await BusinessService.restaurarEliminado('client', id);
      SyncService.scheduleOpportunistic();
      render();
    });
  }

  async function render(){
    const config = await StorageService.getConfig();
    const filtro = (document.getElementById('clienteBuscar').value||'').toLowerCase();
    let lista = await BusinessService.listarClientes();
    lista = lista.filter(c=> String(c.nombre||'').toLowerCase().includes(filtro));

    const tbody = document.getElementById('tablaClientes');
    tbody.innerHTML = '';
    document.getElementById('clientesEmpty').style.display = lista.length ? 'none' : 'block';

    for(const c of lista){
      const stats = await BusinessService.estadisticasCliente(c.nombre);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td data-label="Nombre">${Utils.escapeHtml(c.nombre)}</td>
        <td data-label="Teléfono"><input type="text" value="${Utils.escapeHtml(c.telefono||'')}" placeholder="Agregar teléfono" data-tel="${c.id}"></td>
        <td data-label="Dirección"><input type="text" value="${Utils.escapeHtml(c.direccion||'')}" placeholder="Agregar dirección" data-dir="${c.id}"></td>
        <td class="right" data-label="Compras">${stats.cantidadCompras}</td>
        <td class="right" data-label="Total comprado">${Utils.fmtMoneda(stats.totalComprado, config.moneda)}</td>
        <td data-label="Última compra">${stats.ultimaCompra ? Utils.fmtFecha(stats.ultimaCompra) : '-'}</td>
        <td class="actions-cell"><a class="link" data-eliminar="${c.id}">Eliminar</a></td>`;
      tbody.appendChild(tr);
    }
    tbody.querySelectorAll('[data-tel]').forEach(inp=> inp.addEventListener('change', ()=> actualizarInline(inp.dataset.tel, 'telefono', inp.value)));
    tbody.querySelectorAll('[data-dir]').forEach(inp=> inp.addEventListener('change', ()=> actualizarInline(inp.dataset.dir, 'direccion', inp.value)));
    tbody.querySelectorAll('[data-eliminar]').forEach(a=> a.addEventListener('click', ()=> eliminar(a.dataset.eliminar)));
  }

  function init(){
    document.getElementById('clienteBuscar').addEventListener('input', render);
  }
  window.ViewHandlers.clientes = render;
  return { init };
})();
