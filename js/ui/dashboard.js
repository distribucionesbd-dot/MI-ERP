/* Mientras el usuario está mirando Inicio, volvemos a pedir los totales
   combinados cada POLL_MS: así, si otro dispositivo del mismo local carga
   una venta, este dispositivo la ve sola, sin que nadie toque nada.
   No es tiempo real "de verdad" (esta arquitectura no tiene esa vía: es
   Apps Script + Sheets, no un servidor con websockets), pero a los efectos
   prácticos se ve casi instantáneo. Se frena solo al salir de Inicio o
   cuando la pantalla/pestaña no está visible, para no gastar de más. */
const DASH_POLL_MS = 15000;
let _dashPollTimer = null;
function _detenerPollInicio(){
  if(_dashPollTimer){ clearInterval(_dashPollTimer); _dashPollTimer = null; }
}
function _iniciarPollInicio(){
  _detenerPollInicio();
  _dashPollTimer = setInterval(()=>{
    if(document.visibilityState==='visible' && window.UiNav.currentView()==='dashboard'){
      window.ViewHandlers.dashboard();
    }
  }, DASH_POLL_MS);
}
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState==='visible' && window.UiNav.currentView()==='dashboard'){
    window.ViewHandlers.dashboard();
  }
});
// nav.js llama a esto cada vez que se cambia de pestaña (con el nombre de
// la vista nueva); si nos vamos de Inicio, frenamos el sondeo.
window.ViewHandlers.__always = function(view){
  if(view !== 'dashboard') _detenerPollInicio();
};

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

  if(window.UiNav.currentView()==='dashboard') _iniciarPollInicio();
};
