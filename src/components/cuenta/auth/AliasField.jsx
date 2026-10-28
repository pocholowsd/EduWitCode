import React, { useEffect, useState } from 'react';
import { checkAlias } from '../authApi';

const ALIAS_PATTERN = /^[a-zA-Z0-9_.-]{3,30}$/;
const FORMAT_MESSAGE = 'Usa de 3 a 30 letras, números, punto, guion o guion bajo.';

// Valida el alias mientras se escribe, con una pausa para no consultar en cada tecla.
// `currentAlias` es el alias que ya tiene la cuenta: si no cambia, no se consulta.
export function useAliasCheck(alias, currentAlias = '') {
  const trimmed = alias.trim();
  const changed = trimmed.toLowerCase() !== (currentAlias ?? '').toLowerCase();
  // { status: 'checking' | 'ok' | 'error', message } o null.
  const [check, setCheck] = useState(null);

  useEffect(() => {
    if (!trimmed || !changed) { setCheck(null); return undefined; }
    if (!ALIAS_PATTERN.test(trimmed)) { setCheck({ status: 'error', message: FORMAT_MESSAGE }); return undefined; }
    let cancelled = false;
    setCheck({ status: 'checking', message: 'Comprobando…' });
    const timer = setTimeout(() => {
      checkAlias(trimmed)
        .then((data) => {
          if (!cancelled) setCheck(data.disponible ? { status: 'ok', message: 'Alias disponible.' } : { status: 'error', message: data.message });
        })
        .catch((err) => { if (!cancelled) setCheck({ status: 'error', message: err.message }); });
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [trimmed, changed]);

  // El alias es obligatorio: vacío también bloquea el envío.
  const blocked = !trimmed || check?.status === 'error' || check?.status === 'checking';
  return { trimmed, changed, check, blocked };
}

export function AliasInput({ value, onChange, check, autoFocus = false }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        <span className="absolute top-1/2 left-4 -translate-y-1/2 text-[13.5px] text-[#a6acb8]">@</span>
        <input
          type="text"
          required
          autoFocus={autoFocus}
          value={value}
          maxLength={30}
          onChange={(e) => onChange(e.target.value.replace(/\s/g, ''))}
          placeholder="alias"
          className={`w-full rounded-full border bg-[#f8f9fb] py-2.5 pr-9 pl-8 text-[13.5px] text-[#2c313a] outline-none transition-colors ${
            check?.status === 'error' ? 'border-red-300 focus:border-red-400'
              : check?.status === 'ok' ? 'border-emerald-300 focus:border-emerald-400'
                : 'border-[#dde1e8] focus:border-brand-teal'
          }`}
        />
        {check && (
          <i className={`bi absolute top-1/2 right-4 -translate-y-1/2 text-[13px] ${
            check.status === 'ok' ? 'bi-check-circle-fill text-emerald-500'
              : check.status === 'error' ? 'bi-x-circle-fill text-red-400'
                : 'bi-hourglass-split animate-spin text-[#a6acb8]'
          }`} />
        )}
      </div>
      {check && check.status !== 'checking' && (
        <p className={`px-2 text-[11.5px] ${check.status === 'ok' ? 'text-emerald-600' : 'text-red-500'}`}>{check.message}</p>
      )}
    </div>
  );
}
