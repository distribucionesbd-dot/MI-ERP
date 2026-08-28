window.ViewHandlers.dashboard = async function renderDashboardUI(){
  const config = await StorageService.getConfig();
  const d = await BusinessService.calcularDashboard();

  document.getElementById('kpiVentasHoy').textContent = Utils.fmtMoneda(d.ventasHoyTotal, config.moneda);
  document.getElementById('kpiOperacionesHoy').textContent = d.operacionesHoy;
  document.getElementById('kpiGananciaHoy').textContent = Utils.fmtMoneda(d.gananciaHoy, config.moneda);
  document.getElementById('kpiGastosMes').textContent = Utils.fmtMoneda(d.gastosMes, config.moneda);
  document.getElementById('kpiProductos').textContent = d.productosCount;

  const tbody = document.getElementById('dashUltimasBoletas');
  tbody.innerHTML = '';
  document.getElementById('dashBoletasEmpty').style.display = d.ultimasVentas.length ? 'none' : 'block';
  d.ultimasVentas.forEach(v=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="N°">${String(v.numero).padStart(4,'0')}</td>
      <td data-label="Fecha">${Utils.fmtFecha(v.fecha)}</td>
      <td data-label="Cliente">${Utils.escapeHtml(v.cliente_nombre_snapshot||'-')}</td>
      <td class="right" data-label="Total">${Utils.fmtMoneda(v.total, config.moneda)}</td>
      <td class="actions-cell"><a class="link" data-reimprimir="${v.id}">Reimprimir</a></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('[data-reimprimir]').forEach(a=>{
    a.addEventListener('click', ()=> window.UiBoletas.reimprimir(a.dataset.reimprimir));
  });
};
