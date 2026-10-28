import React, { useEffect, useRef, useState } from 'react';

export default function UserMenu({ user, onOpenProjects, onOpenProfile, onSwitchAccount, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

  const item = (icon, label, onClick, danger = false) => (
    <button
      type="button"
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${
        danger ? 'text-red-500 hover:bg-red-50' : 'text-[#2c313a] hover:bg-[#f4f5f7]'
      }`}
      onClick={() => { setOpen(false); onClick(); }}
    >
      <i className={`bi ${icon} text-[14px] opacity-80`} />
      {label}
    </button>
  );

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full ring-2 ring-transparent transition-all hover:ring-brand-teal"
        onClick={() => setOpen((v) => !v)}
        title={user.nombre}
      >
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt={user.nombre} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-[#e3f6f3]">
            <img src="/robot.png" alt={user.nombre} className="h-[30px] w-[30px] object-contain" />
          </span>
        )}
      </button>

      {open && (
        <div className="animate-pop-in absolute right-0 z-30 mt-2 w-52 rounded-xl border border-[#e4e7ec] bg-white p-1.5 shadow-2xl">
          <div className="border-b border-[#eef0f3] px-3 py-2">
            <p className="truncate text-[13px] font-bold text-[#1c1f28]">{user.nombre}</p>
            <p className="truncate text-[11.5px] text-[#8a90a0]">{user.email}</p>
          </div>
          <div className="mt-1 flex flex-col">
            {item('bi-folder2', 'Mis programas', onOpenProjects)}
            {item('bi-person', 'Perfil', onOpenProfile)}
            {item('bi-arrow-repeat', 'Cambiar de cuenta', onSwitchAccount)}
            {item('bi-box-arrow-right', 'Cerrar sesión', onLogout, true)}
          </div>
        </div>
      )}
    </div>
  );
}
