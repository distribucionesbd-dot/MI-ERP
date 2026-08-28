/* Modal de "venta sin finalizar" al reabrir la app. El resto de las
   confirmaciones destructivas usan window.confirm() nativo: es simple,
   robusto y funciona offline sin código extra (REGLA 9: confirmar
   solo en acciones destructivas). */
window.UiModal = (function(){
  let _draftCache = null;

  function mostrarRecuperarVenta(draft, onContinuar, onDescartar){
    _draftCache = draft;
    const cantidad = draft.items.length;
    const total = draft.items.reduce((s,it)=> s + it.cantidad*it.precio, 0);
    const horaTxt = draft.horaInicio ? new Date(draft.horaInicio).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}) : '';
    document.getElementById('modalRecuperarVentaInfo').textContent =
      (horaTxt ? ('Venta iniciada ' + horaTxt + ' · ') : '') +
      cantidad + (cantidad===1 ? ' producto' : ' productos') +
      ' · Total: ' + Utils.fmtMoneda(total);
    document.getElementById('modalRecuperarVenta').classList.add('show');

    const btnContinuar = document.getElementById('btnContinuarVentaPendiente');
    const btnDescartar = document.getElementById('btnDescartarVentaPendiente');
    btnContinuar.onclick = ()=>{ ocultar(); onContinuar(_draftCache); };
    btnDescartar.onclick = ()=>{
      if(!confirm('¿Seguro que querés descartar esta venta? Solo hacelo si la operación no se realizó.')) return;
      ocultar(); onDescartar();
    };
  }
  function ocultar(){ document.getElementById('modalRecuperarVenta').classList.remove('show'); }

  return { mostrarRecuperarVenta, ocultar };
})();
