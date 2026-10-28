import React from 'react';
import Modal from './Modal';

export default function UnsavedChangesModal({ open, projectName, neverSaved, onSave, onDiscard, onClose }) {
  return (
    <Modal open={open} onClose={onClose} maxWidth={400}>
      <div className="flex items-center justify-between border-b border-[#eef0f3] px-5 py-4">
        <h3 className="text-[15px] font-bold text-[#1c1f28]">{neverSaved ? '¿Guardar el proyecto?' : '¿Guardar los cambios?'}</h3>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-full text-[#6b7180] transition-colors hover:bg-[#f4f5f7] hover:text-[#2c313a]"
        >
          <i className="bi bi-x-lg" />
        </button>
      </div>

      <p className="px-5 py-4 text-[13px] leading-relaxed text-[#4a4f59]">
        {neverSaved
          ? `"${projectName}" aún no está guardado. Si continúas sin guardar, se perderá.`
          : `"${projectName}" tiene cambios sin guardar. Si continúas sin guardar, se perderán.`}
      </p>

      <div className="flex items-center justify-end gap-2 border-t border-[#eef0f3] px-5 py-3.5">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-[#dde1e8] px-3.5 py-1.5 text-[12.5px] font-semibold text-[#4a4f59] transition-colors hover:bg-[#f4f5f7]"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="rounded-lg border border-red-200 px-3.5 py-1.5 text-[12.5px] font-semibold text-red-600 transition-colors hover:bg-red-50"
        >
          No guardar
        </button>
        <button
          type="button"
          autoFocus
          onClick={onSave}
          className="rounded-lg bg-brand-teal-dark px-3.5 py-1.5 text-[12.5px] font-bold text-white transition-colors hover:bg-brand-teal"
        >
          Guardar
        </button>
      </div>
    </Modal>
  );
}
