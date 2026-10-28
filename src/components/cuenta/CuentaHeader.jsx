import React from 'react';
import UserMenu from './auth/UserMenu';
import Modal from './Modal';
import { ShareLink } from './projects/AccessModal';

// Botón de iniciar sesión o menú de la cuenta, a la derecha del encabezado.
export default function CuentaHeader({ user, onLogin, onOpenProjects, onOpenProfile, onSwitchAccount, onLogout }) {
  return (
    <div className="edu-ui flex shrink-0 items-center">
      {user ? (
        <UserMenu
          user={user}
          onOpenProjects={onOpenProjects}
          onOpenProfile={onOpenProfile}
          onSwitchAccount={onSwitchAccount}
          onLogout={onLogout}
        />
      ) : (
        <button
          type="button"
          onClick={onLogin}
          className="flex h-9 items-center rounded-lg bg-brand-teal-dark px-3 text-[12px] font-bold whitespace-nowrap text-white transition-all duration-150 hover:bg-brand-teal active:scale-95 xl:h-10 xl:px-3.5 xl:text-[14px] xl:hover:scale-105"
        >
          <span className="xl:hidden">Entrar</span>
          <span className="hidden xl:inline">Iniciar sesión</span>
        </button>
      )}
    </div>
  );
}

export function EnlaceModal({ open, codigo, onClose }) {
  return (
    <Modal open={open && Boolean(codigo)} onClose={onClose} maxWidth={420}>
      <div className="flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-[#1c1f28]">Enlace para compartir</h3>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-full text-[#6b7180] transition-colors hover:bg-[#f4f5f7] hover:text-[#2c313a]"
            onClick={onClose}
          >
            <i className="bi bi-x-lg" />
          </button>
        </div>
        {codigo && <ShareLink codigo={codigo} />}
      </div>
    </Modal>
  );
}
