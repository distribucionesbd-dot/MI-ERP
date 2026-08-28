/* =========================================================
   UTILS.JS
   Funciones puras, sin dependencias de storage ni UI.
   Se pueden testear directo (ver TEST_PLAN.md).
   ========================================================= */
window.Utils = (function(){

  function uuid(){
    if(window.crypto && crypto.randomUUID) return crypto.randomUUID();
    // Fallback simple para navegadores viejos sin crypto.randomUUID.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c){
      const r = Math.random()*16|0, v = c==='x' ? r : (r&0x3|0x8);
      return v.toString(16);
    });
  }

  function nowISO(){ return new Date().toISOString(); }
  function hoyISO(){ return new Date().toISOString().slice(0,10); }

  function fmtMoneda(n, simbolo){
    const num = Number(n)||0;
    return (simbolo||'$') + ' ' + num.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2});
  }
  function fmtFecha(iso){
    if(!iso) return '';
    const [y,m,d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }
  function fmtCantidad(cantidad, unidad){
    const num = Number(cantidad)||0;
    const texto = unidad==='kg' ? (Math.round(num*1000)/1000).toString() : num.toString();
    return texto + (unidad==='kg' ? ' kg' : '');
  }
  function escapeHtml(str){
    return String(str==null?'':str).replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  }
  function debounce(fn, ms){
    let t;
    return function(...args){ clearTimeout(t); t = setTimeout(()=>fn.apply(this,args), ms); };
  }
  function minutosDesde(iso){
    if(!iso) return 0;
    return Math.max(0, Math.round((Date.now() - new Date(iso).getTime())/60000));
  }

  /* ---- Cálculos de negocio puros (mismas fórmulas que el ERP base) ---- */
  function calcularMargenSobreVenta(precio, costo){
    // (precio - costo) / precio -- usado en el listado de productos.
    const p = Number(precio)||0, c = Number(costo)||0;
    return p>0 ? ((p-c)/p)*100 : 0;
  }
  function calcularPrecioDesdeMargenSobreCosto(costo, margenPct){
    // precio = costo * (1 + %/100) -- usado en productos por kilo.
    return Math.round(Number(costo) * (1 + Number(margenPct)/100));
  }
  function calcularMargenSobreCosto(precio, costo){
    const p = Number(precio)||0, c = Number(costo)||0;
    return c>0 ? Math.round(((p-c)/c)*1000)/10 : 0;
  }
  function calcularTotalesVenta(items){
    const total = items.reduce((s,it)=> s + it.cantidad*it.precio, 0);
    const costoTotal = items.reduce((s,it)=> s + it.cantidad*(it.costo||0), 0);
    return { total, costoTotal, ganancia: total - costoTotal };
  }

  function descargarJSON(obj, filename){
    const blob = new Blob([JSON.stringify(obj, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Traduce el estado técnico de SyncService a un mensaje humano (REGLA 9: sin jerga técnica).
  function mensajeSync(status){
    switch(status.state){
      case 'sincronizando': return { texto:'Enviando cambios...', clase:'' };
      case 'sincronizado': return { texto:'Sincronizado', clase:'estado-ok' };
      case 'sin_conexion': return { texto: status.pendingCount>0 ? ('Sin conexión · ' + status.pendingCount + ' cambios guardados') : 'Sin conexión', clase:'estado-offline' };
      case 'error': return { texto:'No se pudo sincronizar. Reintentando...', clase:'estado-error' };
      case 'pendiente':
      default: return { texto: status.pendingCount>0 ? (status.pendingCount + ' cambios pendientes') : 'Sincronizado', clase: status.pendingCount>0 ? '' : 'estado-ok' };
    }
  }

  return {
    uuid, nowISO, hoyISO, fmtMoneda, fmtFecha, fmtCantidad, escapeHtml, debounce, minutosDesde,
    calcularMargenSobreVenta, calcularPrecioDesdeMargenSobreCosto, calcularMargenSobreCosto, calcularTotalesVenta,
    descargarJSON, mensajeSync
  };
})();
