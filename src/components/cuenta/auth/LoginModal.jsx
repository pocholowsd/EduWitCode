import React, { useState } from 'react';
import Modal from '../Modal';
import { login, register, setToken } from '../authApi';
import { AliasInput, useAliasCheck } from './AliasField';

export default function LoginModal({ open, onClose, onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [nombre, setNombre] = useState('');
  const [alias, setAlias] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const isRegister = mode === 'register';
  const aliasState = useAliasCheck(alias);

  const reset = () => {
    setNombre(''); setAlias(''); setEmail(''); setPassword(''); setError(''); setShowPassword(false);
  };

  const handleClose = () => { reset(); setMode('login'); onClose(); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy || (isRegister && aliasState.blocked)) return;
    setError('');
    setBusy(true);
    try {
      const data = isRegister
        ? await register(nombre.trim(), aliasState.trimmed, email.trim(), password)
        : await login(email.trim(), password);
      setToken(data.token, remember);
      onAuthenticated(data.user);
      reset();
      setMode('login');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
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
          >
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <h3 className="mb-5 text-xl font-bold text-[#1c1f28]">{isRegister ? 'Crear cuenta' : 'Iniciar sesión'}</h3>

        <div className="mb-4 flex gap-2.5">
          <button
            type="button"
            disabled
            title="Próximamente"
            className="flex flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-full border border-[#dde1e8] py-2 text-[13px] font-semibold text-[#b0b5c0]"
          >
            <i className="bi bi-google" /> Google
          </button>
          <button
            type="button"
            disabled
            title="Próximamente"
            className="flex flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-full border border-[#dde1e8] py-2 text-[13px] font-semibold text-[#b0b5c0]"
          >
            <i className="bi bi-apple" /> Apple
          </button>
        </div>

        <div className="mb-4 flex items-center gap-3 text-[11px] text-[#a6acb8]">
          <span className="h-px flex-1 bg-[#e4e7ec]" />
          o
          <span className="h-px flex-1 bg-[#e4e7ec]" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {isRegister && (
            <input
              type="text"
              required
              placeholder="Nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full rounded-full border border-[#dde1e8] bg-[#f8f9fb] px-4 py-2.5 text-[13.5px] text-[#2c313a] outline-none transition-colors focus:border-brand-teal"
            />
          )}
          {isRegister && <AliasInput value={alias} onChange={setAlias} check={aliasState.check} />}
          <input
            type="email"
            required
            placeholder="Correo electrónico"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-full border border-[#dde1e8] bg-[#f8f9fb] px-4 py-2.5 text-[13.5px] text-[#2c313a] outline-none transition-colors focus:border-brand-teal"
          />
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              required
              minLength={6}
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
            >
              <i className={`bi ${showPassword ? 'bi-eye' : 'bi-eye-slash'}`} />
            </button>
          </div>

          {!isRegister && (
            <label className="flex items-center gap-2 pl-1 text-[12.5px] text-[#4a4f59]">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Recordarme
            </label>
          )}

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={busy || (isRegister && aliasState.blocked)}
            className="mt-1 w-full rounded-full bg-brand-teal-dark py-2.5 text-[14px] font-bold text-white transition-all hover:bg-brand-teal disabled:cursor-default disabled:opacity-60"
          >
            {busy ? 'Espera…' : isRegister ? 'Crear cuenta' : 'Iniciar sesión'}
          </button>
        </form>

        <p className="mt-4 text-center text-[12.5px] text-[#6b7180]">
          {isRegister ? (
            <>¿Ya tienes cuenta?{' '}
              <button type="button" className="font-semibold text-brand-teal-dark hover:underline" onClick={() => { reset(); setMode('login'); }}>
                Inicia sesión
              </button>
            </>
          ) : (
            <>¿No tienes cuenta?{' '}
              <button type="button" className="font-semibold text-brand-teal-dark hover:underline" onClick={() => { reset(); setMode('register'); }}>
                Regístrate
              </button>
            </>
          )}
        </p>
      </div>
    </Modal>
  );
}
