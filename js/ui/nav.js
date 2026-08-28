/* =========================================================
   UI/NAV.JS
   Router simple entre vistas. Cada módulo de vista se registra
   en window.ViewHandlers[nombre] = fn (llamada al activarse la vista).
   ========================================================= */
window.ViewHandlers = {};
window.UiNav = (function(){
  let _currentView = 'nuevaBoleta';

  function mostrarVista(view){
    if(view === 'mas'){
      _activarView('mas');
      return;
    }
    _currentView = view;
    _activarView(view);
    document.querySelectorAll('nav button[data-view]').forEach(b=>{
      b.classList.toggle('active', b.dataset.view===view);
    });
    if(window.ViewHandlers[view]) window.ViewHandlers[view]();
    if(window.ViewHandlers.__always) window.ViewHandlers.__always(view);
  }

  function _activarView(view){
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    const el = document.getElementById('view-'+view);
    if(el) el.classList.add('active');
  }

  function currentView(){ return _currentView; }

  function init(){
    document.querySelectorAll('nav button[data-view]').forEach(btn=>{
      btn.addEventListener('click', ()=> mostrarVista(btn.dataset.view));
    });
    document.querySelectorAll('[data-goto]').forEach(btn=>{
      btn.addEventListener('click', ()=> mostrarVista(btn.dataset.goto));
    });
  }

  return { mostrarVista, currentView, init };
})();
