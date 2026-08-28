window.UiLogin = (function(){
  function mostrarLogin(onSuccess){
    document.getElementById('viewLogin').classList.remove('hidden');
    document.getElementById('appRoot').classList.add('hidden');
    const hint = document.getElementById('loginOfflineHint');
    hint.textContent = navigator.onLine ? '' : 'Sin conexión: necesitás internet para ingresar la primera vez.';

    const form = document.getElementById('formLogin');
    const errEl = document.getElementById('loginError');
    const btn = document.getElementById('btnLogin');

    form.onsubmit = async (e)=>{
      e.preventDefault();
      errEl.textContent = '';
      const usuario = document.getElementById('loginUsuario').value.trim();
      const pass = document.getElementById('loginPassword').value;
      if(!usuario || !pass){ errEl.textContent = 'Completá usuario y contraseña'; return; }
      btn.disabled = true; btn.textContent = 'Ingresando...';
      try{
        const session = await AuthService.login(usuario, pass);
        ocultarLogin();
        onSuccess(session);
      }catch(err){
        if(err.message==='SIN_CONEXION') errEl.textContent = 'Sin conexión. Probá de nuevo cuando tengas internet.';
        else if(err.message==='LOGIN_INVALIDO') errEl.textContent = 'Usuario o contraseña incorrectos.';
        else errEl.textContent = 'No se pudo iniciar sesión. Probá de nuevo.';
      } finally {
        btn.disabled = false; btn.textContent = 'Ingresar';
      }
    };
  }
  function ocultarLogin(){
    document.getElementById('viewLogin').classList.add('hidden');
    document.getElementById('appRoot').classList.remove('hidden');
  }
  return { mostrarLogin, ocultarLogin };
})();
