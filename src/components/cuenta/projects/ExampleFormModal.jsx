import React, { useEffect, useState } from 'react';
import Modal from '../Modal';

const FIELD = 'rounded-lg border border-[#dde1e8] px-3 py-2 text-[13px] text-[#2c313a] outline-none transition-colors focus:border-brand-teal disabled:bg-[#f8f9fb]';

// Formulario (solo administradores) para publicar el programa abierto como ejemplo, o para
// reemplazar un ejemplo existente con él. `initial` trae los datos del ejemplo al reemplazar.
export default function ExampleFormModal({ open, board, initial, defaultName, categories = [], saving, error, onClose, onSubmit }) {
  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState('');
  const [descripcion, setDescripcion] = useState('');

  useEffect(() => {
    if (!open) return;
    setNombre(initial?.nombre ?? defaultName ?? '');
    setCategoria(initial?.categoria ?? '');
    setDescripcion(initial?.descripcion ?? '');
  }, [open, initial, defaultName]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!nombre.trim() || saving) return;
    onSubmit({ nombre: nombre.trim(), categoria: categoria.trim() || 'General', descripcion: descripcion.trim() });
  };

  return (
    <Modal open={open} onClose={saving ? () => {} : onClose} maxWidth={440}>
      <form onSubmit={handleSubmit}>
        <div className="flex items-center justify-between border-b border-[#eef0f3] px-5 py-4">
          <h3 className="text-[15px] font-bold text-[#1c1f28]">{initial ? 'Reemplazar ejemplo' : 'Agregar a Ejemplos'}</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex h-7 w-7 items-center justify-center rounded-full text-[#6b7180] transition-colors hover:bg-[#f4f5f7] hover:text-[#2c313a] disabled:opacity-40"
          >
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <div className="flex max-h-[65vh] flex-col gap-3 overflow-y-auto px-5 py-4">
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            <i className="bi bi-shield-lock" /> {initial
              ? 'El ejemplo se reemplaza con el programa que tienes abierto. Todos verán la nueva versión.'
              : 'Se publica una copia del programa que tienes abierto. Todos podrán abrirlo desde Ejemplos.'}
          </p>

          <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold text-[#4a4f59]">
            Nombre
            <input autoFocus className={FIELD} value={nombre} maxLength={150} onChange={(e) => setNombre(e.target.value)} disabled={saving} placeholder="Semáforo" />
          </label>

          <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold text-[#4a4f59]">
            Categoría
            <input
              className={FIELD}
              value={categoria}
              maxLength={80}
              list="example-categories"
              onChange={(e) => setCategoria(e.target.value)}
              disabled={saving}
              placeholder="Básicos, Sensores, Motores…"
            />
            <datalist id="example-categories">
              {categories.map((c) => <option key={c} value={c} />)}
            </datalist>
          </label>

          <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold text-[#4a4f59]">
            Descripción <span className="font-normal text-[#9aa0ad]">(opcional)</span>
            <textarea
              className={`${FIELD} resize-none`}
              rows={3}
              value={descripcion}
              maxLength={300}
              onChange={(e) => setDescripcion(e.target.value)}
              disabled={saving}
              placeholder="Qué hace el programa y qué se necesita conectar."
            />
          </label>

          <div className="flex items-center gap-2 text-[12.5px] text-[#4a4f59]">
            <span className="font-semibold">Placa:</span>
            <span className="rounded-full bg-[#f4f5f7] px-2.5 py-0.5 font-semibold">{board}</span>
            <span className="text-[11px] text-[#9aa0ad]">(la del programa abierto)</span>
          </div>

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
            disabled={!nombre.trim() || saving}
            className="rounded-lg bg-brand-teal-dark px-3.5 py-1.5 text-[12.5px] font-bold text-white transition-colors hover:bg-brand-teal disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Guardando...' : initial ? 'Reemplazar' : 'Publicar ejemplo'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
