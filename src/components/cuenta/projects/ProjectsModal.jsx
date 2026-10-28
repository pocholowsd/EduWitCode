import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../Modal';
import {
  listProyectosPublicos,
  listBiblioteca,
  listProyectosUsuario,
  deleteProyectoUsuario,
  getProyectoPorCodigo,
} from '../authApi';
import AccessModal, { ACCESS_OPTIONS } from './AccessModal';
import { extractCodigo } from './shareLink';

const TABS = [
  { key: 'usuario', label: 'Mis programas', auth: true, fetch: listProyectosUsuario, empty: 'Tu lista de programas está vacía.' },
  { key: 'biblioteca', label: 'Biblioteca', auth: true, fetch: listBiblioteca, empty: 'Aquí aparecerán tus copias de los programas que abras con un código o enlace.' },
  { key: 'publico', label: 'Programas de ejemplo', auth: false, fetch: listProyectosPublicos, empty: 'Aún no hay programas públicos.' },
];

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

function ProjectCard({ title, board, autor, updatedAt, selected, onClick, onDelete, access, onEditAccess }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all ${
        selected ? 'border-brand-teal bg-[#effaf7] shadow-sm' : 'border-[#e4e7ec] bg-white hover:border-[#c9ced9] hover:shadow-sm'
      }`}
    >
      <div className={`w-full min-w-0 ${access ? 'pr-16' : onDelete ? 'pr-7' : ''}`}>
        <p className="truncate text-[13px] font-semibold text-[#1c1f28]">{title}</p>
        <p className="truncate text-[11px] text-[#8a90a0]">{board}</p>
      </div>
      <div className="flex w-full min-w-0 flex-col gap-0.5 text-[11px] text-[#6b7180]">
        {autor && (
          <span className="flex min-w-0 items-center gap-1" title="Autor">
            <i className="bi bi-person text-[#a6acb8]" />
            <span className="truncate">{autor}</span>
          </span>
        )}
        {updatedAt && (
          <span className="flex min-w-0 items-center gap-1" title="Última modificación">
            <i className="bi bi-clock-history text-[#a6acb8]" />
            <span className="truncate">{formatDate(updatedAt)}</span>
          </span>
        )}
      </div>
      {access && (
        <span
          role="button"
          tabIndex={-1}
          onClick={(e) => { e.stopPropagation(); onEditAccess(); }}
          className={`absolute top-2 right-9 flex h-6 items-center gap-1 rounded-full px-2 text-[10.5px] font-bold transition-all hover:brightness-95 ${ACCESS_OPTIONS[access].tone}`}
          title={`${ACCESS_OPTIONS[access].label}: clic para cambiar el acceso`}
        >
          <i className={`bi ${ACCESS_OPTIONS[access].icon}`} />
        </span>
      )}
      {onDelete && (
        <span
          role="button"
          tabIndex={-1}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full text-[11px] text-[#b0b5c0] opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
          title="Eliminar"
        >
          <i className="bi bi-trash" />
        </span>
      )}
    </button>
  );
}

export default function ProjectsModal({ open, onClose, isAuthenticated, userId, onRequireLogin, onOpenProject, initialTab = 'usuario' }) {
  const [tab, setTab] = useState(initialTab);
  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [accessProject, setAccessProject] = useState(null);
  // Resultado de buscar por código de referencia: { codigo, loading, proyecto, notFound }.
  const [codeLookup, setCodeLookup] = useState(null);
  const currentTab = TABS.find((t) => t.key === tab) ?? TABS[0];
  const codigo = extractCodigo(search);
  const showingCode = Boolean(codeLookup && !codeLookup.notFound);
  const needsLogin = currentTab.auth && !isAuthenticated && !showingCode;

  useEffect(() => {
    if (open) { setTab(initialTab); setSearch(''); setSelectedId(null); }
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    if (needsLogin) { setItems([]); return undefined; }

    let cancelled = false;
    setLoading(true);
    setError('');
    currentTab.fetch()
      .then((data) => { if (!cancelled) setItems(data.proyectos); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, tab, isAuthenticated, userId]);

  useEffect(() => {
    if (!codigo) { setCodeLookup(null); return undefined; }
    let cancelled = false;
    setCodeLookup({ codigo, loading: true });
    getProyectoPorCodigo(codigo)
      .then((data) => { if (!cancelled) setCodeLookup({ codigo, proyecto: data.proyecto }); })
      // Si no existe, la búsqueda sigue funcionando como filtro por nombre.
      .catch(() => { if (!cancelled) setCodeLookup({ codigo, notFound: true }); });
    return () => { cancelled = true; };
  }, [codigo]);

  const filtered = useMemo(() => {
    if (showingCode) return codeLookup.proyecto ? [codeLookup.proyecto] : [];
    return items.filter((p) => p.nombre.toLowerCase().includes(search.toLowerCase()));
  }, [items, search, showingCode, codeLookup]);

  const selected = filtered.find((p) => p.id === selectedId) ?? null;

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este programa guardado?')) return;
    try {
      await deleteProyectoUsuario(id);
      setItems((prev) => prev.filter((p) => p.id !== id));
      if (selectedId === id) setSelectedId(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRemoveFromLibrary = async (id) => {
    if (!window.confirm('¿Eliminar esta copia de tu Biblioteca? El programa original no se modifica.')) return;
    try {
      await deleteProyectoUsuario(id);
      setItems((prev) => prev.filter((p) => p.id !== id));
      if (selectedId === id) setSelectedId(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAccessSaved = (id, acceso, codigoProyecto) => {
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, acceso, codigo: codigoProyecto } : p)));
  };

  const handleAccept = () => {
    if (!selected) return;
    if (showingCode) onOpenProject(selected.codigo, 'codigo');
    else onOpenProject(selected.id, tab === 'publico' ? 'publico' : 'usuario');
    onClose();
  };

  const ownList = tab === 'usuario' && !showingCode;

  return (
    <Modal open={open} onClose={onClose} maxWidth={720}>
      <div className="flex h-[520px] max-h-[80vh] flex-col">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#eef0f3] px-4 py-3 sm:justify-between sm:px-5 sm:py-3.5">
          <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-[#f4f5f7] p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => { setTab(t.key); setSelectedId(null); }}
                className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-bold whitespace-nowrap transition-colors ${
                  tab === t.key ? 'bg-white text-[#1c1f28] shadow-sm' : 'text-[#6b7180]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative min-w-0 flex-1 sm:max-w-52 sm:flex-none">
            <i className="bi bi-search absolute top-1/2 left-3 -translate-y-1/2 text-[12px] text-[#a6acb8]" />
            <input
              type="text"
              placeholder="Buscar o pegar código"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-full border border-[#dde1e8] bg-[#f8f9fb] py-1.5 pr-3 pl-8 text-[12.5px] text-[#2c313a] outline-none transition-colors focus:border-brand-teal"
            />
          </div>
          <button
            type="button"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#6b7180] transition-colors hover:bg-[#f4f5f7] hover:text-[#2c313a]"
            onClick={onClose}
          >
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {needsLogin ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <i className="bi bi-person-lock text-3xl text-[#c9ced9]" />
              <p className="text-[13px] text-[#6b7180]">Inicia sesión para ver {tab === 'usuario' ? 'tus programas guardados' : 'tu Biblioteca'}.</p>
              <button
                type="button"
                className="rounded-full bg-brand-teal-dark px-4 py-1.5 text-[12.5px] font-bold text-white transition-all hover:bg-brand-teal"
                onClick={() => { onClose(); onRequireLogin(); }}
              >
                Iniciar sesión
              </button>
            </div>
          ) : loading || codeLookup?.loading ? (
            <div className="flex h-full items-center justify-center text-[13px] text-[#8a90a0]">Cargando…</div>
          ) : error ? (
            <div className="flex h-full items-center justify-center text-[13px] text-red-500">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <i className="bi bi-inbox text-3xl text-[#c9ced9]" />
              <p className="text-[13px] text-[#8a90a0]">
                {currentTab.empty}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {showingCode && (
                <p className="col-span-full text-[12px] font-semibold text-[#6b7180]">
                  <i className="bi bi-link-45deg" /> Programa compartido con el código {codeLookup.codigo}
                </p>
              )}
              {filtered.map((p) => (
                <ProjectCard
                  key={p.id}
                  title={p.nombre}
                  board={p.board}
                  autor={p.autor}
                  updatedAt={p.updatedAt}
                  selected={selectedId === p.id}
                  onClick={() => setSelectedId(p.id)}
                  onDelete={ownList ? () => handleDelete(p.id) : tab === 'biblioteca' && !showingCode ? () => handleRemoveFromLibrary(p.id) : null}
                  access={ownList ? (p.acceso || 'privado') : null}
                  onEditAccess={() => setAccessProject(p)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2.5 border-t border-[#eef0f3] px-5 py-3.5">
          <button
            type="button"
            className="rounded-full border border-[#dde1e8] px-4 py-1.5 text-[12.5px] font-semibold text-[#4a4f59] transition-colors hover:bg-[#f4f5f7]"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!selected}
            className="rounded-full bg-brand-teal-dark px-4 py-1.5 text-[12.5px] font-bold text-white transition-all hover:bg-brand-teal disabled:cursor-default disabled:opacity-40 disabled:hover:bg-brand-teal-dark"
            onClick={handleAccept}
          >
            Aceptar
          </button>
        </div>
      </div>

      <AccessModal project={accessProject} onClose={() => setAccessProject(null)} onSaved={handleAccessSaved} />
    </Modal>
  );
}
