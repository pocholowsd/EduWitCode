import React, { useEffect, useState } from 'react';
import Modal from './Modal';
import { getAccesoProyecto, listEjemplos } from './authApi';
import { AccessPicker, useAccessState } from './projects/AccessModal';

const MAX_LENGTH = 150;
const FIELD = 'rounded-lg border border-[#dde1e8] bg-white px-3 py-2 text-[13px] text-[#2c313a] outline-none transition-colors focus:border-brand-teal';

// showAccess = false para copias de la Biblioteca, que siempre son privadas.
// isAdmin: muestra además la opción "Ejemplo", que publica el programa en la pestaña Ejemplos de Abrir.
export default function SaveProjectModal({ open, initialName, remoteId, showAccess = true, isAdmin = false, board, saving, error, onClose, onSubmit }) {
  const [name, setName] = useState('');
  const [loadingAccess, setLoadingAccess] = useState(false);
  const access = useAccessState();
  const [asExample, setAsExample] = useState(false);
  const [exampleName, setExampleName] = useState('');
  const [categoria, setCategoria] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [categories, setCategories] = useState([]);
  const isUpdate = Boolean(remoteId);

  useEffect(() => {
    if (!open) return undefined;
    setAsExample(false);
    setExampleName(initialName ?? '');
    setCategoria('');
    setDescripcion('');
    if (!isAdmin) return undefined;
    let cancelled = false;
    // Categorías ya usadas, como sugerencias.
    listEjemplos()
      .then((data) => { if (!cancelled) setCategories([...new Set(data.proyectos.map((p) => p.categoria).filter(Boolean))].sort()); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, isAdmin, initialName]);

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

  const trimmed = asExample ? exampleName.trim() : name.trim();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!trimmed || saving || loadingAccess) return;
    if (asExample) {
      onSubmit(trimmed, null, { nombre: trimmed, categoria: categoria.trim() || 'General', descripcion: descripcion.trim() });
      return;
    }
    onSubmit(trimmed, showAccess ? access.collect() : null);
  };

  const exampleOption = isAdmin && (
    <div className={`rounded-xl border transition-colors ${asExample ? 'border-brand-teal bg-[#effaf7]' : 'border-[#e4e7ec] hover:border-[#c9ced9]'}`}>
      <button
        type="button"
        disabled={saving}
        onClick={() => setAsExample(true)}
        className="flex w-full items-center gap-3 p-3 text-left disabled:opacity-60"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-[14px] text-violet-700">
          <i className="bi bi-journal-code" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-[#1c1f28]">Ejemplo</span>
          <span className="block text-[11.5px] text-[#8a90a0]">Se publica en Ejemplos para todos. Solo administradores.</span>
        </span>
        <i className={`bi ${asExample ? 'bi-record-circle-fill text-brand-teal' : 'bi-circle text-[#c9ced9]'}`} />
      </button>

      {asExample && (
        <div className="flex flex-col gap-2.5 border-t border-brand-teal/20 px-3 pt-2.5 pb-3">
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-[#4a4f59]">
            Nombre
            <input className={FIELD} value={exampleName} maxLength={MAX_LENGTH} onChange={(e) => setExampleName(e.target.value)} disabled={saving} placeholder="Semáforo" />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-[#4a4f59]">
            Categoría
            <input
              className={FIELD}
              value={categoria}
              maxLength={80}
              list="save-example-categories"
              onChange={(e) => setCategoria(e.target.value)}
              disabled={saving}
              placeholder="Básicos, Sensores, Motores…"
            />
            <datalist id="save-example-categories">
              {categories.map((c) => <option key={c} value={c} />)}
            </datalist>
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-[#4a4f59]">
            <span>Descripción <span className="font-normal text-[#9aa0ad]">(opcional)</span></span>
            <textarea
              className={`${FIELD} resize-none`}
              rows={2}
              value={descripcion}
              maxLength={300}
              onChange={(e) => setDescripcion(e.target.value)}
              disabled={saving}
              placeholder="Qué hace el programa y qué se necesita conectar."
            />
          </label>
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#4a4f59]">
            <span className="font-semibold">Placa:</span>
            <span className="rounded-full bg-white px-2.5 py-0.5 font-semibold ring-1 ring-[#dde1e8]">{board}</span>
            <span className="text-[11px] text-[#9aa0ad]">la del programa abierto</span>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <Modal open={open} onClose={saving ? () => {} : onClose} maxWidth={420}>
      <form onSubmit={handleSubmit}>
        <div className="flex items-center justify-between border-b border-[#eef0f3] px-5 py-4">
          <h3 className="text-[15px] font-bold text-[#1c1f28]">{asExample ? 'Guardar como ejemplo' : isUpdate ? 'Guardar cambios' : 'Guardar proyecto'}</h3>
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
          {!asExample && (
            <>
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
            </>
          )}

          {showAccess ? (
            <>
              <label className="mt-1 text-[12.5px] font-semibold text-[#4a4f59]">Tipo de acceso</label>
              <AccessPicker state={access} disabled={saving || loadingAccess} inactive={asExample} onPick={() => setAsExample(false)} />
              {exampleOption}
            </>
          ) : (
            <>
              <p className="mt-1 rounded-lg bg-sky-50 px-3 py-2 text-[12px] text-sky-800">
                <i className="bi bi-bookmark" /> Es una copia de un programa compartido, público o de un ejemplo: se guarda en tu Biblioteca y solo tú la ves.
              </p>
              {exampleOption && (
                <>
                  {asExample && (
                    <button type="button" className="self-start text-[12px] font-bold text-brand-teal-dark hover:underline" onClick={() => setAsExample(false)}>
                      <i className="bi bi-arrow-left" /> Guardar en mi Biblioteca
                    </button>
                  )}
                  {exampleOption}
                </>
              )}
            </>
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
            {saving ? 'Guardando...' : asExample ? 'Publicar ejemplo' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
