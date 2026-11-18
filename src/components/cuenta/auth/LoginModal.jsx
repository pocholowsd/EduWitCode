import React from 'react';
import Modal from '../Modal';

// El inicio de sesión es el de toda la plataforma (eduwitlabs.com.mx/login, con correo o con Google).
// onContinue: guarda lo que hay en pantalla y lleva a iniciar sesión; al terminar se regresa aquí.
export default function LoginModal({ open, onClose, onContinue }) {
  return (
    <Modal open={open} onClose={onClose} maxWidth={380}>
      <div className="p-6">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="EduWit" className="h-8 w-8 shrink-0 object-contain" />
            <span className="text-[15px] font-bold text-[#1c1f28]">EduCode Studio</span>
          </div>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-full text-[#6b7180] transition-colors hover:bg-[#f4f5f7] hover:text-[#2c313a]"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <h3 className="mb-2 text-xl font-bold text-[#1c1f28]">Iniciar sesión</h3>
        <p className="mb-5 text-[13px] leading-relaxed text-[#4a4f59]">
          Entra con tu cuenta de EduWitLabs, con tu correo o con Google. Si ya tenías cuenta en Code, usa el
          mismo correo y encontrarás tus programas. El programa que tienes abierto se conserva.
        </p>

        <button
          type="button"
          onClick={onContinue}
          className="w-full rounded-full bg-brand-teal-dark py-2.5 text-[14px] font-bold text-white transition-all hover:bg-brand-teal"
        >
          Iniciar sesión con tu cuenta EduWitLabs
        </button>
      </div>
    </Modal>
  );
}
