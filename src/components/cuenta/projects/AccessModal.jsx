import React, { useEffect, useState } from 'react';
import Modal from '../Modal';
import { getAccesoProyecto, updateAccesoProyecto } from '../authApi';
import { shareUrl } from './shareLink';

export const ACCESS_OPTIONS = {
  privado: { label: 'Privado', icon: 'bi-lock-fill', description: 'Solo tú puedes verlo.', tone: 'text-[#6b7180] bg-[#eef0f3]' },
  publico: { label: 'Público', icon: 'bi-globe2', description: 'Aparece en Programas de ejemplo para todos.', tone: 'text-emerald-700 bg-emerald-50' },
  compartido: { label: 'Compartido', icon: 'bi-link-45deg', description: 'Cualquiera con el enlace obtiene una copia; solo tú editas el original.', tone: 'text-sky-700 bg-sky-50' },
};

// Estado del selector de acceso, compartido entre la ventana de acceso y la de guardar.
export function useAccessState() {
  const [acceso, setAcceso] = useState('privado');
  const [codigo, setCodigo] = useState(null);
  const [error, setError] = useState('');

  const reset = (nextAcceso = 'privado', nextCodigo = null) => {
    setAcceso(nextAcceso);
    setCodigo(nextCodigo);
    setError('');
  };

  // Devuelve { acceso } listo para enviar.
  const collect = () => ({ acceso });

  return { acceso, setAcceso, codigo, setCodigo, error, setError, reset, collect };
}

export function ShareLink({ codigo }) {
  // Qué se copió por última vez: 'url' | 'codigo' | null.
  const [copied, setCopied] = useState(null);
  const url = shareUrl(codigo);

  const copy = async (what) => {
    const text = what === 'url' ? url : codigo;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied((prev) => (prev === what ? null : prev)), 1500);
    } catch {
      window.prompt('Copia el texto:', text);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <input
          type="text"
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          className="min-w-0 flex-1 rounded-lg border border-[#dde1e8] bg-[#f8f9fb] px-3 py-1.5 text-[12.5px] text-[#2c313a] outline-none"
        />
        <button
          type="button"
          onClick={() => copy('url')}
          className="flex items-center gap-1 rounded-lg border border-[#dde1e8] px-3 text-[12.5px] font-semibold text-[#4a4f59] transition-colors hover:bg-[#f4f5f7]"
        >
          <i className={`bi ${copied === 'url' ? 'bi-check2' : 'bi-clipboard'}`} />
          {copied === 'url' ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <div className="flex items-center gap-1.5 text-[11.5px] text-[#8a90a0]">
        Código de referencia: <span className="font-mono font-semibold text-[#4a4f59]">{codigo}</span>
        <button
          type="button"
          onClick={() => copy('codigo')}
          className="flex h-6 items-center gap-1 rounded-md px-1.5 font-semibold text-[#4a4f59] transition-colors hover:bg-[#f4f5f7]"
          title="Copiar código"
        >
          <i className={`bi ${copied === 'codigo' ? 'bi-check2 text-brand-teal-dark' : 'bi-clipboard'}`} />
          {copied === 'codigo' && 'Copiado'}
        </button>
      </div>
    </div>
  );
}

export function AccessPicker({ state, disabled = false }) {
  const { acceso, setAcceso, codigo, error, setError } = state;
  return (
    <div className="flex flex-col gap-2">
      {Object.entries(ACCESS_OPTIONS).map(([key, opt]) => (
        <button
          key={key}
          type="button"
          disabled={disabled}
          onClick={() => { setAcceso(key); setError(''); }}
          className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors disabled:opacity-60 ${
            acceso === key ? 'border-brand-teal bg-[#effaf7]' : 'border-[#e4e7ec] hover:border-[#c9ced9]'
          }`}
        >
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[14px] ${opt.tone}`}>
            <i className={`bi ${opt.icon}`} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-[#1c1f28]">{opt.label}</span>
            <span className="block text-[11.5px] text-[#8a90a0]">{opt.description}</span>
          </span>
          <i className={`bi ${acceso === key ? 'bi-record-circle-fill text-brand-teal' : 'bi-circle text-[#c9ced9]'}`} />
        </button>
      ))}

      {acceso === 'compartido' && (
        <div className="mt-1 flex flex-col gap-2">
          <label className="text-[12.5px] font-semibold text-[#4a4f59]">Enlace para compartir</label>
          {codigo ? (
            <ShareLink codigo={codigo} />
          ) : (
            <p className="text-[12px] text-[#8a90a0]">El enlace se generará al guardar.</p>
          )}
        </div>
      )}

      {error && <p className="text-[12px] font-semibold text-red-500">{error}</p>}
    </div>
  );
}

export default function AccessModal({ project, onClose, onSaved }) {
  const open = project !== null;
  const access = useAccessState();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    access.reset(project.acceso || 'privado');
    setLoading(true);
    getAccesoProyecto(project.id)
      .then((data) => { if (!cancelled) access.reset(data.acceso, data.codigo); })
      .catch((err) => { if (!cancelled) access.setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, project]);

  const handleSave = async () => {
    const payload = access.collect();
    setSaving(true);
    access.setError('');
    try {
      const data = await updateAccesoProyecto(project.id, payload.acceso);
      onSaved(project.id, data.acceso, data.codigo);
      // Al compartir se queda abierta para que se pueda copiar el enlace recién generado.
      if (data.acceso === 'compartido') access.setCodigo(data.codigo);
      else onClose();
    } catch (err) {
      access.setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={saving ? () => {} : onClose} maxWidth={420}>
      <div className="flex items-center justify-between border-b border-[#eef0f3] px-5 py-4">
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold text-[#1c1f28]">Tipo de acceso</h3>
          <p className="truncate text-[12px] text-[#8a90a0]">{project?.nombre}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="flex h-7 w-7 items-center justify-center rounded-full text-[#6b7180] transition-colors hover:bg-[#f4f5f7] hover:text-[#2c313a] disabled:opacity-40"
        >
          <i className="bi bi-x-lg" />
        </button>
      </div>

      <div className="px-5 py-4">
        <AccessPicker state={access} disabled={loading || saving} />
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-[#eef0f3] px-5 py-3.5">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="rounded-lg border border-[#dde1e8] px-3.5 py-1.5 text-[12.5px] font-semibold text-[#4a4f59] transition-colors hover:bg-[#f4f5f7] disabled:opacity-50"
        >
          {access.acceso === 'compartido' && access.codigo ? 'Cerrar' : 'Cancelar'}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={loading || saving}
          className="rounded-lg bg-brand-teal-dark px-3.5 py-1.5 text-[12.5px] font-bold text-white transition-colors hover:bg-brand-teal disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </Modal>
  );
}
