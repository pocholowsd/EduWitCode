import React, { useEffect, useRef, useState } from 'react';
import Modal from '../Modal';
import { CONTACTO_URL, GOOGLE_CLIENT_ID, entrarConCorreo, entrarConGoogle } from '../authApi';

const GSI_SCRIPT_ID = 'google-gsi';

// Botón oficial "Continuar con Google". Devuelve la credencial de Google, que se manda al backend central.
// Si el script de Google no carga (sin internet, bloqueado), el botón no aparece y queda el correo.
function GoogleButton({ onCredential, disabled }) {
  const containerRef = useRef(null);
  const callbackRef = useRef(onCredential);
  callbackRef.current = onCredential;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const render = () => {
      const el = containerRef.current;
      if (!el || !window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => callbackRef.current(response.credential),
        ux_mode: 'popup',
      });
      el.innerHTML = '';
      window.google.accounts.id.renderButton(el, {
        theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', locale: 'es',
        width: Math.min(332, el.offsetWidth || 332),
      });
    };
    if (window.google?.accounts?.id) { render(); return undefined; }
    let script = document.getElementById(GSI_SCRIPT_ID);
    if (!script) {
      script = document.createElement('script');
      script.id = GSI_SCRIPT_ID;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    const onError = () => setFailed(true);
    script.addEventListener('load', render);
    script.addEventListener('error', onError);
    return () => {
      script.removeEventListener('load', render);
      script.removeEventListener('error', onError);
    };
  }, []);

  if (failed) return null;
  return (
    <div className={`mb-4 flex min-h-[44px] justify-center ${disabled ? 'pointer-events-none opacity-60' : ''}`}>
      <div ref={containerRef} className="w-full max-w-[332px]" />
    </div>
  );
}

// Inicio de sesión de la plataforma dentro de Code: correo o Google, contra el backend central.
// onAuthenticated: se llama al entrar (el editor carga el perfil de Code); si lanza un error, se muestra aquí.
// onContinue: alternativa, ir a eduwitlabs.com.mx/login (por si algo falla aquí).
export default function LoginModal({ open, onClose, onAuthenticated, onContinue }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => { setPassword(''); setError(''); setShowPassword(false); setBusy(false); };
  const handleClose = () => { reset(); onClose(); };

  const entrar = async (accion) => {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      await accion();
      await onAuthenticated();
      reset();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    entrar(() => entrarConCorreo(email.trim(), password));
  };

  return (
    <Modal open={open} onClose={handleClose} maxWidth={380}>
      <div className="p-6">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="EduWit" className="h-8 w-8 shrink-0 object-contain" />
            <span className="text-[15px] font-bold text-[#1c1f28]">EduCode Studio</span>
          </div>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-full text-[#6b7180] transition-colors hover:bg-[#f4f5f7] hover:text-[#2c313a]"
            onClick={handleClose}
            aria-label="Cerrar"
          >
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <h3 className="mb-1 text-xl font-bold text-[#1c1f28]">Iniciar sesión</h3>
        <p className="mb-5 text-[12.5px] leading-relaxed text-[#6b7180]">
          Una sola cuenta para toda la plataforma: Escolar, Code y Blocks.
        </p>

        {open && <GoogleButton disabled={busy} onCredential={(credential) => entrar(() => entrarConGoogle(credential))} />}

        <div className="mb-4 flex items-center gap-3 text-[11px] text-[#a6acb8]">
          <span className="h-px flex-1 bg-[#e4e7ec]" />
          o con tu correo
          <span className="h-px flex-1 bg-[#e4e7ec]" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="Correo electrónico"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-full border border-[#dde1e8] bg-[#f8f9fb] px-4 py-2.5 text-[13.5px] text-[#2c313a] outline-none transition-colors focus:border-brand-teal"
          />
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-full border border-[#dde1e8] bg-[#f8f9fb] px-4 py-2.5 pr-10 text-[13.5px] text-[#2c313a] outline-none transition-colors focus:border-brand-teal"
            />
            <button
              type="button"
              className="absolute top-1/2 right-3.5 -translate-y-1/2 text-[#8a90a0] transition-colors hover:text-[#4a4f59]"
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              <i className={`bi ${showPassword ? 'bi-eye' : 'bi-eye-slash'}`} />
            </button>
          </div>

          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="mt-1 w-full rounded-full bg-brand-teal-dark py-2.5 text-[14px] font-bold text-white transition-all hover:bg-brand-teal disabled:cursor-default disabled:opacity-60"
          >
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="mt-4 text-center text-[12.5px] text-[#6b7180]">
          ¿No tienes cuenta o olvidaste tu contraseña?{' '}
          <a href={CONTACTO_URL} target="_blank" rel="noreferrer" className="font-semibold text-brand-teal-dark hover:underline">
            Escríbenos
          </a>
        </p>
        {onContinue && (
          <p className="mt-2 text-center text-[11.5px] text-[#a6acb8]">
            ¿Problemas para entrar?{' '}
            <button type="button" className="underline hover:text-[#6b7180]" onClick={onContinue}>
              Entra desde eduwitlabs.com.mx
            </button>
          </p>
        )}
      </div>
    </Modal>
  );
}
