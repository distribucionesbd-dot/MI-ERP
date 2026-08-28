/* =========================================================
   UI/NAV.JS
   Router simple entre vistas. Cada módulo de vista se registra
   en window.ViewHandlers[nombre] = fn (llamada al activarse la vista).
   ========================================================= */
window.ViewHandlers = {};
window.UiNav = (function(){
  let _currentView = 'nuevaBoleta';

  // Vistas que se auto-actualizan solas mientras están abiertas y visibles
  // (traen datos combinados de todos los dispositivos). Cada módulo de vista
  // que lo necesite llama a autoActualizar(view, ms, fn) una vez, típicamente
  // desde su propio init(). Solo hay un timer activo a la vez, el de la
  // vista que se está mirando ahora.
  const _autoUpdaters = {};
  let _autoTimer = null;

  function _detenerAuto(){
    if(_autoTimer){ clearInterval(_autoTimer); _autoTimer = null; }
  }
  function _iniciarAutoSiCorresponde(){
    _detenerAuto();
    const cfg = _autoUpdaters[_currentView];
    if(!cfg) return;
    _autoTimer = setInterval(()=>{
      if(document.visibilityState==='visible') cfg.fn();
    }, cfg.ms);
  }

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
    _iniciarAutoSiCorresponde();
  }

  function _activarView(view){
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    const el = document.getElementById('view-'+view);
    if(el) el.classList.add('active');
  }

  function currentView(){ return _currentView; }

  // Registra que, mientras `view` esté activa y la pestaña visible, se
  // llame a fn() cada ms milisegundos (además del render normal al entrar
  // a la vista). No hace falta llamarlo más de una vez por vista.
  function autoActualizar(view, ms, fn){
    _autoUpdaters[view] = { ms, fn };
  }

  function init(){
    document.querySelectorAll('nav button[data-view]').forEach(btn=>{
      btn.addEventListener('click', ()=> mostrarVista(btn.dataset.view));
    });
    document.querySelectorAll('[data-goto]').forEach(btn=>{
      btn.addEventListener('click', ()=> mostrarVista(btn.dataset.goto));
    });
    document.addEventListener('visibilitychange', ()=>{
      if(document.visibilityState!=='visible') return;
      const cfg = _autoUpdaters[_currentView];
      if(cfg) cfg.fn();
    });
  }

  return { mostrarVista, currentView, autoActualizar, init };
})();
