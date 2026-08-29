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
  // "Día comparable anterior" para el dashboard (Fase 4, punto 10): por
  // ahora siempre es ayer calendario. Queda como función propia para poder
  // ajustarlo más adelante (ej. saltear domingos si el local no abre) sin
  // tocar a todos los que la usan.
  function ayerISO(){
    const d = new Date();
    d.setDate(d.getDate()-1);
    return d.toISOString().slice(0,10);
  }

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
  // Subtotal "de verdad" de un ítem: si se cargó con un importe exacto en
  // pesos (ej. venta por kg donde el cliente pidió "$10.000" y se cargan
  // los kg equivalentes), it.subtotal ya viene calculado con ese importe
  // exacto y NO hay que recalcularlo desde cantidad*precio (eso podría dar
  // una diferencia de centavos por el redondeo de los kg, ej. $10.001,60
  // en vez de $10.000). Para ítems históricos sin ese campo (de antes de
  // este cambio) o cargados normalmente, se recalcula como siempre.
  function subtotalItem(it){
    return it.subtotal!=null ? Number(it.subtotal) : it.cantidad*it.precio;
  }
  function calcularTotalesVenta(items){
    const total = items.reduce((s,it)=> s + subtotalItem(it), 0);
    const costoTotal = items.reduce((s,it)=> s + it.cantidad*(it.costo||0), 0);
    return { total, costoTotal, ganancia: total - costoTotal };
  }

  // ---- Búsqueda tolerante de productos (Fase 3, punto 8) ----
  // Pensada para alguien que no recuerda el nombre exacto: tolera palabras
  // parciales, orden distinto, mayúsculas/acentos y errores de tipeo chicos.
  // Orden de prioridad (para no tapar el resultado obvio con uno "parecido"):
  //   0) coincidencia exacta del nombre completo
  //   1) el nombre empieza con lo tipeado
  //   2) todas las palabras tipeadas aparecen en el nombre (en cualquier orden)
  //   3) coincidencia aproximada palabra por palabra (typos chicos)
  function _normalizarTexto(s){
    return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
  }
  function _distanciaEdicion(a, b){
    if(a===b) return 0;
    const al = a.length, bl = b.length;
    if(al===0) return bl;
    if(bl===0) return al;
    let prev = new Array(bl+1);
    for(let j=0;j<=bl;j++) prev[j]=j;
    let curr = new Array(bl+1);
    for(let i=1;i<=al;i++){
      curr[0] = i;
      for(let j=1;j<=bl;j++){
        const costo = a[i-1]===b[j-1] ? 0 : 1;
        curr[j] = Math.min(prev[j]+1, curr[j-1]+1, prev[j-1]+costo);
      }
      const tmp = prev; prev = curr; curr = tmp;
    }
    return prev[bl];
  }
  function _palabraCoincideAprox(qWord, nWords){
    if(qWord.length < 2) return nWords.some(w=> w.startsWith(qWord));
    const maxDist = qWord.length<=4 ? 1 : (qWord.length<=8 ? 2 : 3);
    for(const w of nWords){
      if(w.length===0) continue;
      if(w.includes(qWord) || qWord.includes(w)) return true;
      if(Math.abs(w.length-qWord.length) <= maxDist && _distanciaEdicion(qWord, w) <= maxDist) return true;
    }
    return false;
  }
  function buscarProductos(productos, query){
    const qNorm = _normalizarTexto(query);
    if(!qNorm) return productos.slice();
    const qWords = qNorm.split(/\s+/).filter(Boolean);
    const candidatos = [];
    for(const p of productos){
      const nNorm = _normalizarTexto(p.nombre);
      if(!nNorm) continue;
      let rank;
      if(nNorm===qNorm){
        rank = 0;
      } else if(nNorm.startsWith(qNorm)){
        rank = 1;
      } else if(qWords.every(qw=> nNorm.includes(qw))){
        rank = 2;
      } else {
        const nWords = nNorm.split(/\s+/).filter(Boolean);
        if(qWords.every(qw=> _palabraCoincideAprox(qw, nWords))) rank = 3;
        else continue;
      }
      candidatos.push({ p, rank, len: nNorm.length });
    }
    candidatos.sort((a,b)=> a.rank-b.rank || a.len-b.len);
    return candidatos.map(c=>c.p);
  }

  function descargarJSON(obj, filename){
    const blob = new Blob([JSON.stringify(obj, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Traduce el estado técnico de SyncService a un mensaje humano (REGLA 9:
  // sin jerga técnica — nada de "sync", "servidor" ni "IndexedDB"). Cada
  // estado lleva un símbolo además del color, para que no dependa solo del
  // color (Fase 3, punto 9): ✓ tranquilidad, ⏳ espera, ⚠ atención sin
  // alarmar (no hay pérdida de datos: todo sigue guardado localmente).
  function mensajeSync(status){
    switch(status.state){
      case 'sincronizando': return { texto:'⏳ Enviando cambios...', clase:'' };
      case 'sincronizado': return { texto:'✓ Todo guardado', clase:'estado-ok' };
      case 'sin_conexion': return { texto: status.pendingCount>0 ? ('⏳ Sin conexión · ' + status.pendingCount + (status.pendingCount===1?' cambio guardado':' cambios guardados')) : '✓ Todo guardado (sin conexión)', clase:'estado-offline' };
      case 'error': return { texto:'⚠ No se pudo enviar todavía. Tus datos están a salvo, seguimos intentando.', clase:'estado-error' };
      case 'pendiente':
      default: return { texto: status.pendingCount>0 ? ('⏳ ' + status.pendingCount + (status.pendingCount===1?' cambio pendiente':' cambios pendientes')) : '✓ Todo guardado', clase: status.pendingCount>0 ? '' : 'estado-ok' };
    }
  }

  return {
    uuid, nowISO, hoyISO, ayerISO, fmtMoneda, fmtFecha, fmtCantidad, escapeHtml, debounce, minutosDesde,
    calcularMargenSobreVenta, calcularPrecioDesdeMargenSobreCosto, calcularMargenSobreCosto, calcularTotalesVenta,
    subtotalItem, buscarProductos, descargarJSON, mensajeSync
  };
})();
