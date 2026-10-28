import React, { useEffect, useRef, useState } from 'react';
import Modal from '../Modal';
import { updateMe } from '../authApi';
import { AliasInput, useAliasCheck } from './AliasField';

const AVATAR_SIZE = 256;

// Recorta la imagen al cuadrado central y la reduce a AVATAR_SIZE px como JPEG (data URL).
function fileToAvatar(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = AVATAR_SIZE;
      canvas.height = AVATAR_SIZE;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen.'));
    };
    img.src = url;
  });
}

// requireAlias: la cuenta aún no tiene alias; no se puede cerrar hasta elegir uno.
export default function ProfileModal({ open, onClose, user, onUpdated, requireAlias = false, onLogout }) {
  const [nombre, setNombre] = useState(user?.nombre ?? '');
  const [avatar, setAvatar] = useState(user?.avatarUrl ?? null);
  const [alias, setAlias] = useState(user?.alias ?? '');
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) { setNombre(user?.nombre ?? ''); setAvatar(user?.avatarUrl ?? null); setAlias(user?.alias ?? ''); setError(''); setSaved(false); }
  }, [open, user]);

  const aliasState = useAliasCheck(alias, user?.alias);

  if (!user) return null;

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Selecciona un archivo de imagen.'); return; }
    try {
      setAvatar(await fileToAvatar(file));
      setError('');
      setSaved(false);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy || !nombre.trim() || aliasState.blocked) return;
    setBusy(true);
    setError('');
    try {
      const avatarChanged = avatar !== (user.avatarUrl ?? null);
      const data = await updateMe(nombre.trim(), avatarChanged ? avatar : undefined, aliasState.changed ? aliasState.trimmed : undefined);
      onUpdated(data.user);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={requireAlias ? () => {} : onClose} maxWidth={360}>
      <div className="p-6">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-bold text-[#1c1f28]">Perfil</h3>
          {!requireAlias && (
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-full text-[#6b7180] transition-colors hover:bg-[#f4f5f7] hover:text-[#2c313a]"
              onClick={onClose}
            >
              <i className="bi bi-x-lg" />
            </button>
          )}
        </div>

        {requireAlias && (
          <p className="mb-4 rounded-lg bg-sky-50 px-3 py-2 text-[12.5px] text-sky-800">
            Elige un alias para continuar. Es el nombre que verán los demás en tus programas.
          </p>
        )}

        <div className="mb-5 flex flex-col items-center gap-2">
          <button
            type="button"
            className="group relative h-20 w-20 overflow-hidden rounded-full ring-2 ring-transparent transition-all hover:ring-brand-teal"
            onClick={() => fileRef.current?.click()}
            title="Cambiar foto"
          >
            {avatar ? (
              <img src={avatar} alt={nombre} className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-brand-teal-dark text-2xl font-bold text-white">
                {(nombre || '?').trim()[0]?.toUpperCase()}
              </span>
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100">
              <i className="bi bi-camera text-xl" />
            </span>
          </button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleFile} />
          <div className="flex gap-3 text-[12px] font-semibold">
            <button type="button" className="text-brand-teal-dark hover:underline" onClick={() => fileRef.current?.click()}>
              {avatar ? 'Cambiar foto' : 'Subir foto'}
            </button>
            {avatar && (
              <button type="button" className="text-red-500 hover:underline" onClick={() => { setAvatar(null); setSaved(false); }}>
                Quitar
              </button>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="text-[11.5px] font-semibold text-[#6b7180]">Nombre</label>
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full rounded-full border border-[#dde1e8] bg-[#f8f9fb] px-4 py-2.5 text-[13.5px] text-[#2c313a] outline-none transition-colors focus:border-brand-teal"
          />

          <label className="mt-1 text-[11.5px] font-semibold text-[#6b7180]">Alias</label>
          <AliasInput value={alias} onChange={(value) => { setAlias(value); setSaved(false); }} check={aliasState.check} autoFocus={requireAlias} />

          <label className="mt-1 text-[11.5px] font-semibold text-[#6b7180]">Correo</label>
          <input
            type="email"
            value={user.email}
            disabled
            className="w-full cursor-not-allowed rounded-full border border-[#dde1e8] bg-[#f4f5f7] px-4 py-2.5 text-[13.5px] text-[#8a90a0]"
          />

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-600">{error}</p>}
          {saved && !error && <p className="text-[12.5px] text-brand-teal-dark">Guardado.</p>}

          <button
            type="submit"
            disabled={busy || aliasState.blocked}
            className="mt-1 w-full rounded-full bg-brand-teal-dark py-2.5 text-[14px] font-bold text-white transition-all hover:bg-brand-teal disabled:cursor-default disabled:opacity-60"
          >
            {busy ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </form>

        {requireAlias && onLogout && (
          <button type="button" className="mt-3 w-full text-center text-[12.5px] font-semibold text-[#6b7180] hover:underline" onClick={onLogout}>
            Cerrar sesión
          </button>
        )}
      </div>
    </Modal>
  );
}
