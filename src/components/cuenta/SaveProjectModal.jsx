import React, { useEffect, useState } from 'react';
import Modal from './Modal';
import { getAccesoProyecto } from './authApi';
import { AccessPicker, useAccessState } from './projects/AccessModal';

const MAX_LENGTH = 150;

// showAccess = false para copias de la Biblioteca, que siempre son privadas.
export default function SaveProjectModal({ open, initialName, remoteId, showAccess = true, saving, error, onClose, onSubmit }) {
  const [name, setName] = useState('');
  const [loadingAccess, setLoadingAccess] = useState(false);
  const access = useAccessState();
  const isUpdate = Boolean(remoteId);

  useEffect(() => {
    if (!open) return undefined;
    setName(initialName ?? '');
    access.reset();
    if (!remoteId || !showAccess) return undefined;
    let cancelled = false;
    setLoadingAccess(true);
    getAccesoProyecto(remoteId)
      .then((data) => { if (!cancelled) access.reset(data.acceso, data.codigo); })
      .catch((err) => { if (!cancelled) access.setError(err.message); })
      .finally(() => { if (!cancelled) setLoadingAccess(false); });
    return () => { cancelled = true; };
  }, [open, initialName, remoteId, showAccess]);

  const trimmed = name.trim();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!trimmed || saving || loadingAccess) return;
    onSubmit(trimmed, showAccess ? access.collect() : null);
  };

  return (
    <Modal open={open} onClose={saving ? () => {} : onClose} maxWidth={420}>
      <form onSubmit={handleSubmit}>
        <div className="flex items-center justify-between border-b border-[#eef0f3] px-5 py-4">
          <h3 className="text-[15px] font-bold text-[#1c1f28]">{isUpdate ? 'Guardar cambios' : 'Guardar proyecto'}</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex h-7 w-7 items-center justify-center rounded-full text-[#6b7180] transition-colors hover:bg-[#f4f5f7] hover:text-[#2c313a] disabled:opacity-40"
          >
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <div className="flex max-h-[65vh] flex-col gap-1.5 overflow-y-auto px-5 py-4">
          <label className="text-[12.5px] font-semibold text-[#4a4f59]">Nombre del proyecto</label>
          <input
            autoFocus
            type="text"
            value={name}
            maxLength={MAX_LENGTH}
            onChange={(e) => setName(e.target.value)}
            onFocus={(e) => e.target.select()}
            className="rounded-lg border border-[#dde1e8] px-3 py-2 text-[13px] text-[#2c313a] outline-none transition-colors focus:border-brand-teal"
            placeholder="Mi proyecto"
            disabled={saving}
          />
          <span className="self-end text-[11px] text-[#9aa0ad]">{name.length}/{MAX_LENGTH}</span>

          {showAccess ? (
            <>
              <label className="mt-1 text-[12.5px] font-semibold text-[#4a4f59]">Tipo de acceso</label>
              <AccessPicker state={access} disabled={saving || loadingAccess} />
            </>
          ) : (
            <p className="mt-1 rounded-lg bg-sky-50 px-3 py-2 text-[12px] text-sky-800">
              <i className="bi bi-bookmark" /> Es una copia de un programa compartido: se guarda en tu Biblioteca y solo tú la ves.
            </p>
          )}
          {error && <p className="text-[12px] font-semibold text-red-500">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#eef0f3] px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-[#dde1e8] px-3.5 py-1.5 text-[12.5px] font-semibold text-[#4a4f59] transition-colors hover:bg-[#f4f5f7] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!trimmed || saving || loadingAccess}
            className="rounded-lg bg-brand-teal-dark px-3.5 py-1.5 text-[12.5px] font-bold text-white transition-colors hover:bg-brand-teal disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
