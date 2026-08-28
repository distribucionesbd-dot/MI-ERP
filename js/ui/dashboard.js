window.ViewHandlers.dashboard = async function renderDashboardUI(){
  const config = await StorageService.getConfig();
  const d = await BusinessService.calcularDashboardCombinado();

  document.getElementById('kpiVentasHoy').textContent = Utils.fmtMoneda(d.ventasHoyTotal, config.moneda);
  document.getElementById('kpiOperacionesHoy').textContent = d.operacionesHoy;
  document.getElementById('kpiGananciaHoy').textContent = Utils.fmtMoneda(d.gananciaHoy, config.moneda);
  document.getElementById('kpiGastosMes').textContent = Utils.fmtMoneda(d.gastosMes, config.moneda);
  document.getElementById('kpiProductos').textContent = d.productosCount;
  document.getElementById('dashCombinadoAviso').textContent = d.combinado
    ? 'Estos totales suman todos los dispositivos de este local.'
    : 'Sin conexión: mostrando solo lo cargado en este dispositivo.';

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

// Mientras el usuario está mirando Inicio, se vuelve a pedir el combinado
// cada 15s: así, si otro dispositivo del mismo local carga una venta, este
// la ve solo, sin tocar nada. Ver UiNav.autoActualizar (ui/nav.js) para el
// mecanismo compartido (se frena solo al salir de la vista o si la pestaña
// no está visible).
window.UiNav.autoActualizar('dashboard', 15000, ()=> window.ViewHandlers.dashboard());
