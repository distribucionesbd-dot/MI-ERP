window.UiGastos = (function(){
  function limpiarForm(){
    document.getElementById('gastoId').value = '';
    document.getElementById('gastoFecha').value = Utils.hoyISO();
    document.getElementById('gastoCategoria').value = '';
    document.getElementById('gastoMonto').value = '';
    document.getElementById('gastoDescripcion').value = '';
    document.getElementById('gastoFormTitle').textContent = 'Nuevo gasto';
    document.getElementById('btnCancelarGasto').style.display = 'none';
  }
  async function editar(id){
    const g = await StorageService.getEntity('expense', id);
    if(!g) return;
    document.getElementById('gastoId').value = g.id;
    document.getElementById('gastoFecha').value = g.fecha;
    document.getElementById('gastoCategoria').value = g.categoria;
    document.getElementById('gastoMonto').value = g.monto;
    document.getElementById('gastoDescripcion').value = g.descripcion||'';
    document.getElementById('gastoFormTitle').textContent = 'Editar gasto';
    document.getElementById('btnCancelarGasto').style.display = 'inline-block';
    window.scrollTo({top:0, behavior:'smooth'});
  }
  async function guardar(){
    const datos = {
      id: document.getElementById('gastoId').value || null,
      fecha: document.getElementById('gastoFecha').value,
      categoria: document.getElementById('gastoCategoria').value,
      monto: document.getElementById('gastoMonto').value,
      descripcion: document.getElementById('gastoDescripcion').value
    };
    const res = await BusinessService.guardarGasto(datos);
    if(!res.ok){ UiToast.toast(res.error); return; }
    limpiarForm();
    render();
    UiToast.toast('Gasto guardado');
    SyncService.scheduleOpportunistic();
    if(window.ViewHandlers.dashboard) window.ViewHandlers.dashboard();
  }
  async function eliminar(id){
    if(!confirm('¿Eliminar este gasto?')) return;
    await BusinessService.eliminarGasto(id);
    SyncService.scheduleOpportunistic();
    render();
    if(window.ViewHandlers.dashboard) window.ViewHandlers.dashboard();
  }
  function limpiarFiltro(){
    document.getElementById('gastosDesde').value='';
    document.getElementById('gastosHasta').value='';
    render();
  }

  async function render(){
    if(!document.getElementById('gastoFecha').value) document.getElementById('gastoFecha').value = Utils.hoyISO();
    const config = await StorageService.getConfig();
    const desde = document.getElementById('gastosDesde').value;
    const hasta = document.getElementById('gastosHasta').value;
    const { gastos, combinado } = await BusinessService.listarGastosCombinado();
    let lista = gastos;
    if(desde) lista = lista.filter(g=>g.fecha>=desde);
    if(hasta) lista = lista.filter(g=>g.fecha<=hasta);

    const aviso = document.getElementById('gastosCombinadoAviso');
    if(aviso){
      aviso.textContent = combinado
        ? 'Se muestran los gastos cargados desde todos los dispositivos de este local.'
        : 'Sin conexión: mostrando solo lo cargado en este dispositivo.';
    }

    const tbody = document.getElementById('tablaGastos');
    tbody.innerHTML = '';
    document.getElementById('gastosEmpty').style.display = lista.length ? 'none' : 'block';
    let total = 0;
    lista.forEach(g=>{
      total += g.monto;
      const tr = document.createElement('tr');
      // Un gasto cargado desde OTRO dispositivo (todavía no visto acá) se
      // puede ver, pero no editar/eliminar desde este dispositivo.
      const acciones = g._local
        ? `<a class="link" data-editar="${g.id}">Editar</a> · <a class="link" data-eliminar="${g.id}">Eliminar</a>`
        : `<span class="tag" title="Cargado en otro dispositivo: para editarlo o eliminarlo hacelo desde ese dispositivo.">otro dispositivo</span>`;
      tr.innerHTML = `
        <td data-label="Fecha">${Utils.fmtFecha(g.fecha)}</td>
        <td data-label="Categoría"><span class="tag">${Utils.escapeHtml(g.categoria)}</span></td>
        <td data-label="Descripción">${Utils.escapeHtml(g.descripcion||'-')}</td>
        <td class="right" data-label="Monto">${Utils.fmtMoneda(g.monto, config.moneda)}</td>
        <td class="actions-cell">${acciones}</td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('[data-editar]').forEach(a=> a.addEventListener('click', ()=> editar(a.dataset.editar)));
    tbody.querySelectorAll('[data-eliminar]').forEach(a=> a.addEventListener('click', ()=> eliminar(a.dataset.eliminar)));
    document.getElementById('totalGastosFiltro').textContent = Utils.fmtMoneda(total, config.moneda);
  }

  function init(){
    document.getElementById('btnGuardarGasto').addEventListener('click', guardar);
    document.getElementById('btnCancelarGasto').addEventListener('click', limpiarForm);
    document.getElementById('btnLimpiarFiltroGastos').addEventListener('click', limpiarFiltro);
    document.getElementById('gastosDesde').addEventListener('change', render);
    document.getElementById('gastosHasta').addEventListener('change', render);
    window.UiNav.autoActualizar('gastos', 15000, render);
  }
  window.ViewHandlers.gastos = render;
  return { init };
})();
