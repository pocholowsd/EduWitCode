import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../Modal';
import {
  listProyectosPublicos,
  listBiblioteca,
  listProyectosUsuario,
  deleteProyectoUsuario,
  getProyectoPorCodigo,
  listEjemplos,
  updateEjemplo,
  deleteEjemplo,
} from '../authApi';
import AccessModal, { ACCESS_OPTIONS } from './AccessModal';
import ExampleFormModal from './ExampleFormModal';
import { extractCodigo } from './shareLink';

const TABS = [
  { key: 'usuario', label: 'Mis programas', auth: true, fetch: listProyectosUsuario, empty: 'Tu lista de programas está vacía.' },
  { key: 'biblioteca', label: 'Mi biblioteca', auth: true, fetch: listBiblioteca, empty: 'Aquí aparecerán tus copias de los programas compartidos, públicos y ejemplos que abras.' },
  { key: 'publico', label: 'Programas públicos', icon: 'bi-globe2', auth: false, fetch: listProyectosPublicos, empty: 'Aún no hay programas públicos.' },
  { key: 'ejemplos', label: 'Ejemplos', auth: false, fetch: listEjemplos, empty: 'Aún no hay ejemplos.' },
];

// Placas del editor de código: el valor es el que se guarda con cada programa (columna board).
export const PLACAS = [
  { value: 'MicroPython', label: 'MicroPython (ESP32)' },
  { value: 'Arduino C', label: 'Arduino C (Arduino Uno)' },
];

const ALL_BOARDS = 'all';

const boardLabel = (value) => PLACAS.find((p) => p.value === value)?.label ?? value;

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

const ORIGIN_BADGES = {
  compartido: { label: 'Compartido', icon: 'bi-link-45deg', tone: 'bg-sky-50 text-sky-700' },
  publico: { label: 'Público', icon: 'bi-globe2', tone: 'bg-emerald-50 text-emerald-700' },
  ejemplo: { label: 'Ejemplo', icon: 'bi-journal-code', tone: 'bg-violet-50 text-violet-700' },
};

function ProjectCard({ title, board, autor, updatedAt, description, origin, selected, onClick, onDoubleClick, onDelete, access, onEditAccess, onReplace }) {
  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={`group relative flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all ${
        selected ? 'border-brand-teal bg-[#effaf7] shadow-sm' : 'border-[#e4e7ec] bg-white hover:border-[#c9ced9] hover:shadow-sm'
      }`}
    >
      <div className={`w-full min-w-0 ${access || onReplace ? 'pr-16' : onDelete ? 'pr-7' : ''}`}>
        <p className="truncate text-[13px] font-semibold text-[#1c1f28]">{title}</p>
        {board && <p className="truncate text-[11px] text-[#8a90a0]">{boardLabel(board)}</p>}
      </div>
      {description && <p className="line-clamp-2 text-[11.5px] leading-snug text-[#6b7180]">{description}</p>}
      {ORIGIN_BADGES[origin] && (
        <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${ORIGIN_BADGES[origin].tone}`} title="De dónde viene esta copia">
          <i className={`bi ${ORIGIN_BADGES[origin].icon}`} /> Copia de {ORIGIN_BADGES[origin].label.toLowerCase()}
        </span>
      )}
      {(autor || updatedAt) && (
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
      )}
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
      {onReplace && (
        <span
          role="button"
          tabIndex={-1}
          onClick={(e) => { e.stopPropagation(); onReplace(); }}
          className="absolute top-2 right-9 flex h-6 w-6 items-center justify-center rounded-full text-[11px] text-[#b0b5c0] opacity-0 transition-all group-hover:opacity-100 hover:bg-amber-50 hover:text-amber-600 pointer-coarse:opacity-100"
          title="Reemplazar con el programa abierto"
        >
          <i className="bi bi-arrow-repeat" />
        </span>
      )}
      {onDelete && (
        <span
          role="button"
          tabIndex={-1}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full text-[11px] text-[#b0b5c0] opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 pointer-coarse:opacity-100"
          title="Eliminar"
        >
          <i className="bi bi-trash" />
        </span>
      )}
    </button>
  );
}

// getCurrentProgram: () => { nombre, board, contenido } del programa abierto (para reemplazar un ejemplo).
export default function ProjectsModal({
  open, onClose, isAuthenticated, userId, onRequireLogin, onOpenProject, initialTab = 'usuario',
  currentBoard, isAdmin = false, getCurrentProgram,
}) {
  const [boardFilter, setBoardFilter] = useState(ALL_BOARDS);
  // Formulario de ejemplo (solo admin): { initial: ejemplo a reemplazar }.
  const [exampleForm, setExampleForm] = useState(null);
  const [exampleSaving, setExampleSaving] = useState(false);
  const [exampleError, setExampleError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
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

  // En Ejemplos se muestra primero lo de la placa elegida, como en Arduino IDE.
  const filtroInicial = (t) => (t === 'ejemplos' && currentBoard ? currentBoard : ALL_BOARDS);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setSearch('');
    setSelectedId(null);
    setBoardFilter(filtroInicial(initialTab));
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
  }, [open, tab, isAuthenticated, userId, reloadKey]);

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
    const query = search.toLowerCase();
    return items.filter((p) => (boardFilter === ALL_BOARDS || p.board === boardFilter)
      && (p.nombre.toLowerCase().includes(query) || (p.categoria || '').toLowerCase().includes(query)));
  }, [items, search, showingCode, codeLookup, boardFilter]);

  // Ejemplos agrupados por categoría, en orden alfabético.
  const exampleGroups = useMemo(() => {
    if (tab !== 'ejemplos' || showingCode) return [];
    const groups = new Map();
    filtered.forEach((p) => {
      const key = p.categoria || 'General';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    });
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'es', { numeric: true }));
  }, [filtered, tab, showingCode]);

  const exampleCategories = useMemo(
    () => (tab === 'ejemplos' ? [...new Set(items.map((p) => p.categoria).filter(Boolean))].sort() : []),
    [items, tab],
  );

  // Placas del editor más cualquier otra que tenga algo en esta pestaña.
  const boardOptions = useMemo(() => {
    const values = new Set(PLACAS.map((p) => p.value));
    items.forEach((p) => p.board && values.add(p.board));
    return [...values];
  }, [items]);

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

  const handleSaveExample = async (fields) => {
    const program = getCurrentProgram?.();
    if (!program) return;
    setExampleSaving(true);
    setExampleError('');
    try {
      await updateEjemplo(exampleForm.initial.id, { ...fields, board: program.board, contenido: program.contenido });
      setExampleForm(null);
      setBoardFilter(program.board);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setExampleError(err.message);
    } finally {
      setExampleSaving(false);
    }
  };

  const handleDeleteExample = async (example) => {
    if (!window.confirm(`¿Eliminar el ejemplo "${example.nombre}"? Nadie podrá abrirlo de nuevo.`)) return;
    try {
      await deleteEjemplo(example.id);
      setItems((prev) => prev.filter((p) => p.id !== example.id));
      if (selectedId === example.id) setSelectedId(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAccessSaved = (id, acceso, codigoProyecto) => {
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, acceso, codigo: codigoProyecto } : p)));
  };

  const abrir = (p) => {
    if (!p) return;
    if (showingCode) onOpenProject(p.codigo, 'codigo');
    else onOpenProject(p.id, tab === 'publico' ? 'publico' : tab === 'ejemplos' ? 'ejemplo' : 'usuario');
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
                onClick={() => { setTab(t.key); setSelectedId(null); setBoardFilter(filtroInicial(t.key)); }}
                title={t.label}
                aria-label={t.label}
                className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-bold whitespace-nowrap transition-colors ${
                  tab === t.key ? 'bg-white text-[#1c1f28] shadow-sm' : 'text-[#6b7180]'
                }`}
              >
                {t.icon ? <i className={`bi ${t.icon} text-[14px]`} /> : t.label}
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

        {!showingCode && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#eef0f3] px-4 py-2.5 sm:px-5">
            <label className="flex min-w-0 items-center gap-2 text-[12.5px] font-semibold text-[#4a4f59]">
              <i className="bi bi-cpu text-[#8a90a0]" />
              <span className="shrink-0">Placa:</span>
              <select
                value={boardFilter}
                onChange={(e) => { setBoardFilter(e.target.value); setSelectedId(null); }}
                className="min-w-0 cursor-pointer rounded-lg border border-[#dde1e8] bg-white px-2 py-1.5 text-[12.5px] font-semibold text-[#2c313a] outline-none transition-colors focus:border-brand-teal"
              >
                <option value={ALL_BOARDS}>Todas las placas</option>
                {boardOptions.map((value) => <option key={value} value={value}>{boardLabel(value)}</option>)}
              </select>
            </label>
          </div>
        )}

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
                {boardFilter !== ALL_BOARDS && items.length > 0
                  ? `No hay ${tab === 'ejemplos' ? 'ejemplos' : 'programas'} para ${boardLabel(boardFilter)}.`
                  : currentTab.empty}
              </p>
              {boardFilter !== ALL_BOARDS && items.length > 0 && (
                <button type="button" className="text-[12.5px] font-bold text-brand-teal-dark hover:underline" onClick={() => setBoardFilter(ALL_BOARDS)}>
                  Ver todas las placas
                </button>
              )}
            </div>
          ) : exampleGroups.length > 0 ? (
            <div className="flex flex-col gap-5">
              {exampleGroups.map(([categoria, list]) => (
                <section key={categoria}>
                  <h4 className="mb-2 flex items-center gap-2 text-[12px] font-bold tracking-wide text-[#6b7180] uppercase">
                    <i className="bi bi-folder2 text-[#a6acb8]" /> {categoria}
                    <span className="font-semibold text-[#a6acb8] normal-case">{list.length}</span>
                  </h4>
                  <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:grid-cols-3">
                    {list.map((p) => (
                      <ProjectCard
                        key={p.id}
                        title={p.nombre}
                        board={boardFilter === ALL_BOARDS ? p.board : null}
                        description={p.descripcion}
                        selected={selectedId === p.id}
                        onClick={() => setSelectedId(p.id)}
                        onDoubleClick={() => abrir(p)}
                        onDelete={isAdmin ? () => handleDeleteExample(p) : null}
                        onReplace={isAdmin ? () => { setExampleError(''); setExampleForm({ initial: p }); } : null}
                      />
                    ))}
                  </div>
                </section>
              ))}
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
                  origin={tab === 'biblioteca' && !showingCode ? p.origen : null}
                  selected={selectedId === p.id}
                  onClick={() => setSelectedId(p.id)}
                  onDoubleClick={() => abrir(p)}
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
            onClick={() => abrir(selected)}
          >
            Aceptar
          </button>
        </div>
      </div>

      <AccessModal project={accessProject} onClose={() => setAccessProject(null)} onSaved={handleAccessSaved} />
      {isAdmin && (
        <ExampleFormModal
          open={Boolean(exampleForm)}
          board={boardLabel(getCurrentProgram?.()?.board ?? currentBoard)}
          initial={exampleForm?.initial ?? null}
          defaultName={getCurrentProgram?.()?.nombre}
          categories={exampleCategories}
          saving={exampleSaving}
          error={exampleError}
          onClose={() => setExampleForm(null)}
          onSubmit={handleSaveExample}
        />
      )}
    </Modal>
  );
}
