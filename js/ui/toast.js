window.UiToast = (function(){
  let _timer;
  function toast(msg){
    const t = document.getElementById('toast');
    t.classList.remove('big');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(_timer);
    _timer = setTimeout(()=>t.classList.remove('show'), 2200);
  }
  function toastGrande(html){
    const t = document.getElementById('toast');
    t.innerHTML = html;
    t.classList.add('show','big');
    clearTimeout(_timer);
    _timer = setTimeout(()=>t.classList.remove('show','big'), 2200);
  }
  return { toast, toastGrande };
})();
