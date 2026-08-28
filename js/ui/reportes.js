window.UiReportes = (function(){
  function rangoPeriodo(){
    const p = document.getElementById('reportePeriodo').value;
    const hoy = Utils.hoyISO();
    if(p==='hoy') return {desde:hoy, hasta:hoy};
    if(p==='semana'){
      const d = new Date(); d.setDate(d.getDate()-6);
      return {desde:d.toISOString().slice(0,10), hasta:hoy};
    }
    if(p==='mes'){
      const d = new Date();
      return {desde: new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0,10), hasta:hoy};
    }
    return { desde: document.getElementById('reporteDesde').value||hoy, hasta: document.getElementById('reporteHasta').value||hoy };
  }
  function onCambiaPeriodo(){
    const custom = document.getElementById('reportePeriodo').value === 'personalizado';
    document.getElementById('reporteDesdeWrap').style.display = custom ? 'block':'none';
    document.getElementById('reporteHastaWrap').style.display = custom ? 'block':'none';
    render();
  }

  async function render(){
    const config = await StorageService.getConfig();
    const {desde, hasta} = rangoPeriodo();
    const r = await BusinessService.calcularReporteCombinado(desde, hasta);

    const aviso = document.getElementById('reportesCombinadoAviso');
    if(aviso){
      aviso.textContent = r.combinado
        ? 'Este reporte suma lo cargado en todos los dispositivos de este local.'
        : 'Sin conexión: mostrando solo lo cargado en este dispositivo.';
    }

    document.getElementById('repVentas').textContent = Utils.fmtMoneda(r.totalVentas, config.moneda);
    document.getElementById('repCosto').textContent = Utils.fmtMoneda(r.totalCosto, config.moneda);
    document.getElementById('repGananciaBruta').textContent = Utils.fmtMoneda(r.gananciaBruta, config.moneda);
    document.getElementById('repGastos').textContent = Utils.fmtMoneda(r.totalGastos, config.moneda);
    document.getElementById('repGananciaNeta').textContent = Utils.fmtMoneda(r.gananciaNeta, config.moneda);

    const tbP = document.getElementById('tablaTopProductos');
    tbP.innerHTML = '';
    document.getElementById('topProductosEmpty').style.display = r.porProducto.length ? 'none':'block';
    r.porProducto.forEach(t=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td data-label="Producto">${Utils.escapeHtml(t.nombre)}</td><td class="right" data-label="Cantidad">${Utils.fmtCantidad(t.cantidad, t.unidad)}</td><td class="right" data-label="Total vendido">${Utils.fmtMoneda(t.total, config.moneda)}</td><td class="right" data-label="Ganancia">${Utils.fmtMoneda(t.ganancia, config.moneda)}</td>`;
      tbP.appendChild(tr);
    });

    const tbC = document.getElementById('tablaTopClientes');
    tbC.innerHTML = '';
    document.getElementById('topClientesEmpty').style.display = r.porCliente.length ? 'none':'block';
    r.porCliente.forEach(c=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td data-label="Cliente">${Utils.escapeHtml(c.nombre)}</td><td class="right" data-label="Compras">${c.compras}</td><td class="right" data-label="Total vendido">${Utils.fmtMoneda(c.total, config.moneda)}</td><td class="right" data-label="Ganancia">${Utils.fmtMoneda(c.ganancia, config.moneda)}</td>`;
      tbC.appendChild(tr);
    });
  }

  function init(){
    document.getElementById('reportePeriodo').addEventListener('change', onCambiaPeriodo);
    document.getElementById('reporteDesde').addEventListener('change', render);
    document.getElementById('reporteHasta').addEventListener('change', render);
    window.UiNav.autoActualizar('reportes', 15000, render);
  }
  window.ViewHandlers.reportes = render;
  return { init };
})();
