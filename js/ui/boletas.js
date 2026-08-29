window.UiBoletas = (function(){
  // Última lista renderizada (ya filtrada), para poder reimprimir sin ir a
  // buscarla a IndexedDB: las boletas cargadas desde OTRO dispositivo no
  // están ahí, pero sí trae sus ítems el combinado del servidor.
  let _listaActual = [];

  async function reimprimir(id){
    const v = _listaActual.find(x=>x.id===id) || await BusinessService.obtenerVenta(id);
    if(v) await window.UiVenta.reimprimir(v);
  }
  function editar(id){ window.UiVenta.editarVentaHistorica(id); }
  async function eliminar(id){
    if(!confirm('¿Eliminar esta boleta del historial? Esta acción no se puede deshacer.')) return;
    await BusinessService.eliminarVenta(id);
    SyncService.scheduleOpportunistic();
    render();
    if(window.ViewHandlers.dashboard) window.ViewHandlers.dashboard();
  }
  function limpiarFiltro(){
    document.getElementById('boletasDesde').value='';
    document.getElementById('boletasHasta').value='';
    document.getElementById('boletasBuscar').value='';
    render();
  }

  async function render(){
    const config = await StorageService.getConfig();
    const desde = document.getElementById('boletasDesde').value;
    const hasta = document.getElementById('boletasHasta').value;
    const buscar = (document.getElementById('boletasBuscar').value||'').toLowerCase();
    const { ventas, combinado } = await BusinessService.listarVentasCombinado();
    let lista = ventas;
    if(desde) lista = lista.filter(v=>v.fecha>=desde);
    if(hasta) lista = lista.filter(v=>v.fecha<=hasta);
    if(buscar) lista = lista.filter(v=>(v.cliente_nombre_snapshot||'').toLowerCase().includes(buscar));
    _listaActual = lista;

    const aviso = document.getElementById('boletasCombinadoAviso');
    if(aviso){
      aviso.textContent = combinado
        ? 'Se muestran las boletas cargadas desde todos los dispositivos de este local.'
        : 'Sin conexión: mostrando solo lo cargado en este dispositivo.';
    }

    const tbody = document.getElementById('tablaBoletas');
    tbody.innerHTML = '';
    document.getElementById('boletasEmpty').style.display = lista.length ? 'none' : 'block';
    lista.forEach(v=>{
      const tr = document.createElement('tr');
      // Una boleta cargada desde OTRO dispositivo (todavía no vista acá) se
      // puede mirar y reimprimir, pero no editar/eliminar desde este
      // dispositivo (ver ARCHITECTURE.md).
      const acciones = v._local
        ? `<a class="link" data-reimprimir="${v.id}">Reimprimir</a> ·
           <a class="link" data-editar="${v.id}">Editar</a> ·
           <a class="link" data-eliminar="${v.id}">Eliminar</a>`
        : `<a class="link" data-reimprimir="${v.id}">Reimprimir</a> <span class="tag" title="Cargada en otro dispositivo: para editarla o eliminarla hacelo desde ese dispositivo.">otro dispositivo</span>`;
      tr.innerHTML = `
        <td data-label="N°">${String(v.numero).padStart(4,'0')}</td>
        <td data-label="Fecha">${Utils.fmtFecha(v.fecha)}</td>
        <td data-label="Cliente">${Utils.escapeHtml(v.cliente_nombre_snapshot||'-')}</td>
        <td class="right" data-label="Costo">${Utils.fmtMoneda(v.costo_total, config.moneda)}</td>
        <td class="right" data-label="Total">${Utils.fmtMoneda(v.total, config.moneda)}</td>
        <td class="right" data-label="Margen bruto">${Utils.fmtMoneda(v.ganancia, config.moneda)}</td>
        <td class="actions-cell">${acciones}</td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('[data-reimprimir]').forEach(a=> a.addEventListener('click', ()=> reimprimir(a.dataset.reimprimir)));
    tbody.querySelectorAll('[data-editar]').forEach(a=> a.addEventListener('click', ()=> editar(a.dataset.editar)));
    tbody.querySelectorAll('[data-eliminar]').forEach(a=> a.addEventListener('click', ()=> eliminar(a.dataset.eliminar)));
  }

  function init(){
    ['boletasDesde','boletasHasta','boletasBuscar'].forEach(id=>{
      document.getElementById(id).addEventListener('input', render);
      document.getElementById(id).addEventListener('change', render);
    });
    document.getElementById('btnLimpiarFiltroBoletas').addEventListener('click', limpiarFiltro);
    window.UiNav.autoActualizar('boletas', 15000, render);
  }

  window.ViewHandlers.boletas = render;
  return { init, reimprimir };
})();
