import { API_BASE } from '../../api/client';

const BASE_URL = API_BASE;
// La sesión es la de la plataforma: llega en la cookie HttpOnly `eduwit_sesion`, que el navegador manda
// solo a la API de Code (mismo dominio). El JavaScript no la puede leer: para saber si hay sesión se usa fetchMe().

// Login central de la plataforma. En local se apuntan a la landing y al backend locales.
const LOGIN_URL = import.meta.env.VITE_LOGIN_URL || 'https://eduwitlabs.com.mx/login';
const AUTH_URL = import.meta.env.VITE_AUTH_URL || 'https://eduwitlabs.com.mx/api/auth';

// Manda a iniciar sesión y regresa a esta misma página al terminar.
export function irALogin() {
  window.location.assign(`${LOGIN_URL}?volver=${encodeURIComponent(window.location.href)}`);
}

// Cierra la sesión en toda la plataforma (también en la landing, Escolar y Blocks).
export async function cerrarSesion() {
  await fetch(`${AUTH_URL}/sesion`, { method: 'DELETE', credentials: 'include' }).catch(() => {});
}

// ID de cliente de Google de la plataforma (es público; el secreto nunca está en el navegador).
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
  || '406534985758-7ou1r91ofoeelqqigdatovibr7fhmp3o.apps.googleusercontent.com';
export const CONTACTO_URL = 'https://eduwitlabs.com.mx/#contacto';

// Iniciar sesión sin salir de Code: el backend central valida y deja la misma cookie de sesión
// para todo eduwitlabs.com.mx. Code no guarda la contraseña: va directo al backend central.
async function entrarEnPlataforma(ruta, body) {
  let res;
  try {
    res = await fetch(`${AUTH_URL}/${ruta}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('No se pudo conectar con EduWitLabs. Revisa tu conexión e intenta de nuevo.');
  }
  if (res.ok) return res.json().catch(() => ({}));
  if (res.status === 503) throw new Error('El inicio de sesión no está disponible en este momento. Intenta más tarde.');
  const data = await res.json().catch(() => ({}));
  if (typeof data.detail === 'string') throw new Error(data.detail);
  throw new Error(res.status === 429
    ? 'Demasiados intentos. Espera unos minutos e intenta de nuevo.'
    : 'No se pudo iniciar sesión. Intenta de nuevo.');
}

export const entrarConCorreo = (email, password) => entrarEnPlataforma('sesion', { email, password });
export const entrarConGoogle = (credential) => entrarEnPlataforma('google', { credential });

// auth: se conserva por compatibilidad con las llamadas; la cookie viaja sola en cada petición.
async function request(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(`No se pudo conectar con el servidor. ¿Corriste "npm run dev"?`);
  }

  const data = await res.json().catch(() => ({ ok: false, message: 'Respuesta inválida del servidor.' }));
  if (!res.ok || !data.ok) {
    const error = new Error(data.message || data.error || 'Ocurrió un error.');
    error.status = res.status;
    throw error;
  }
  return data;
}

export const fetchMe = () => request('/api/auth/me', { auth: true });

export const updateMe = (nombre, avatarUrl, alias) =>
  request('/api/auth/me', { method: 'PUT', body: { nombre, avatarUrl, alias }, auth: true });

export const checkAlias = (alias) =>
  request(`/api/auth/alias-disponible?alias=${encodeURIComponent(alias)}`, { auth: 'optional' });

export const listProyectosUsuario = () => request('/api/proyectos-usuario', { auth: true });

export const getProyectoUsuario = (id) => request(`/api/proyectos-usuario/${id}`, { auth: true });

// origen: { codigo } | { publicoId } | { ejemploId } cuando el programa se abrió sin sesión (se guarda como copia en la Biblioteca).
export const createProyectoUsuario = (nombre, board, contenido, origen = null) =>
  request('/api/proyectos-usuario', {
    method: 'POST',
    body: { nombre, board, contenido, origenCodigo: origen?.codigo ?? null, origenPublicoId: origen?.publicoId ?? null, origenEjemploId: origen?.ejemploId ?? null },
    auth: true,
  });

export const updateProyectoUsuario = (id, { nombre, board, contenido }) =>
  request(`/api/proyectos-usuario/${id}`, { method: 'PUT', body: { nombre, board, contenido }, auth: true });

export const deleteProyectoUsuario = (id) =>
  request(`/api/proyectos-usuario/${id}`, { method: 'DELETE', auth: true });

export const listProyectosPublicos = () => request('/api/proyectos-publicos');

// Solo administradores: insignia de profesor verificado para un autor.
export const setAutorVerificado = (usuarioId, verificado) =>
  request(`/api/usuarios/${usuarioId}/verificado`, { method: 'PUT', body: { verificado }, auth: true });

export const getProyectoPublico = (id) => request(`/api/proyectos-publicos/${id}`);

export const copiarProyectoPublico = (id) =>
  request(`/api/proyectos-publicos/${id}/copia`, { method: 'POST', auth: true });

export const getProyectoPorCodigo = (codigo) =>
  request(`/api/proyectos-codigo/${encodeURIComponent(codigo)}`, { auth: 'optional' });

export const copiarProyectoPorCodigo = (codigo) =>
  request(`/api/proyectos-codigo/${encodeURIComponent(codigo)}/copia`, { method: 'POST', auth: true });

export const listBiblioteca = () => request('/api/biblioteca', { auth: true });

export const getAccesoProyecto = (id) => request(`/api/proyectos-usuario/${id}/acceso`, { auth: true });

export const updateAccesoProyecto = (id, acceso) =>
  request(`/api/proyectos-usuario/${id}/acceso`, { method: 'PUT', body: { acceso }, auth: true });

// Ejemplos: cualquiera los ve; solo un administrador los publica, reemplaza o elimina.
export const listEjemplos = () => request('/api/ejemplos');

export const getEjemplo = (id) => request(`/api/ejemplos/${id}`);

export const copiarEjemplo = (id) => request(`/api/ejemplos/${id}/copia`, { method: 'POST', auth: true });

export const createEjemplo = (ejemplo) =>
  request('/api/ejemplos', { method: 'POST', body: ejemplo, auth: true });

export const updateEjemplo = (id, ejemplo) =>
  request(`/api/ejemplos/${id}`, { method: 'PUT', body: ejemplo, auth: true });

export const deleteEjemplo = (id) =>
  request(`/api/ejemplos/${id}`, { method: 'DELETE', auth: true });
