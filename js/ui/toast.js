window.UiToast = (function(){
  let _timer;

  function _reset(t){
    // Limpia clases de variantes anteriores (big/accion/exito) para que un
    // toast nuevo nunca herede el estilo de uno previo.
    t.className = 'toast';
  }

  function toast(msg){
    const t = document.getElementById('toast');
    _reset(t);
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(_timer);
    _timer = setTimeout(()=>t.classList.remove('show'), 2200);
  }
  function toastGrande(html){
    const t = document.getElementById('toast');
    _reset(t);
    t.innerHTML = html;
    t.classList.add('show','big');
    clearTimeout(_timer);
    _timer = setTimeout(()=>t.classList.remove('show','big'), 2200);
  }
  // Toast con un botón de acción (ej. "Deshacer", "Descartar"). Pensado para
  // reemplazar confirm()/modales en acciones reversibles: se avisa lo que
  // pasó y se da unos segundos para revertirlo, sin interrumpir el flujo.
  // Si el usuario no toca el botón, el toast se cierra solo y la acción
  // original queda firme (no hace falta "aceptar" nada).
  function toastAccion(msg, textoBoton, accion, ms){
    const t = document.getElementById('toast');
    _reset(t);
    t.innerHTML = '<span class="toast-msg"></span><button type="button" class="toast-btn"></button>';
    t.querySelector('.toast-msg').textContent = msg;
    const btn = t.querySelector('.toast-btn');
    btn.textContent = textoBoton;
    t.classList.add('show','accion');
    let ejecutado = false;
    const ocultar = ()=> t.classList.remove('show','accion');
    btn.onclick = ()=>{
      if(ejecutado) return;
      ejecutado = true;
      ocultar();
      clearTimeout(_timer);
      accion();
    };
    clearTimeout(_timer);
    _timer = setTimeout(ocultar, ms||4000);
  }
  // Confirmación de venta registrada: visual, clara, y que no bloquea nada
  // (no hay que cerrarla para seguir vendiendo). No depende solo del color:
  // usa el símbolo ✓ y texto explícito.
  // offline=true: la venta se guardó bien igual (no hay pérdida de datos),
  // sólo que todavía no se pudo mandar al servidor. Se lo decimos explícito
  // para que no dé la sensación de que "algo falló" (Fase 3, punto 9).
  function toastVenta(total, numero, moneda, offline){
    const t = document.getElementById('toast');
    _reset(t);
    const totalTxt = Utils.escapeHtml(Utils.fmtMoneda(total, moneda));
    const numTxt = numero!=null ? ('N° ' + String(numero).padStart(4,'0')) : '';
    let html = '<span class="toast-icon-ok">&#10003;</span> <span>Venta registrada — <strong>' + totalTxt + '</strong>' +
      (numTxt ? (' <span class="toast-sub">' + numTxt + '</span>') : '') + '</span>';
    if(offline) html += '<div class="toast-sub" style="margin-top:4px;">Guardada en este dispositivo. Se enviará sola cuando vuelva internet.</div>';
    t.innerHTML = html;
    t.classList.add('show','big','exito');
    clearTimeout(_timer);
    _timer = setTimeout(()=>t.classList.remove('show','big','exito'), offline ? 4500 : 3200);
  }
  return { toast, toastGrande, toastAccion, toastVenta };
})();
