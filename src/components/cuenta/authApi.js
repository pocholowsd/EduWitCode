import { API_BASE } from '../../api/client';

const BASE_URL = API_BASE;
const STORAGE_KEY = 'eduwit_token';

export function getToken() {
  return localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY);
}

export const TOKEN_STORAGE_KEY = STORAGE_KEY;

export function setToken(token, remember) {
  // Borrar la sesión anterior: si quedara en localStorage, getToken la seguiría usando.
  clearToken();
  if (remember) localStorage.setItem(STORAGE_KEY, token);
  else sessionStorage.setItem(STORAGE_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
}

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  // auth: true exige sesión; 'optional' manda el token solo si existe.
  if (auth) {
    const token = getToken();
    if (!token && auth !== 'optional') throw new Error('No has iniciado sesión.');
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(`No se pudo conectar con el servidor. ¿Corriste "npm run dev"?`);
  }

  const data = await res.json().catch(() => ({ ok: false, message: 'Respuesta inválida del servidor.' }));
  if (!res.ok || !data.ok) throw new Error(data.message || data.error || 'Ocurrió un error.');
  return data;
}

export const register = (nombre, alias, email, password) =>
  request('/api/auth/register', { method: 'POST', body: { nombre, alias, email, password } });

export const login = (email, password) =>
  request('/api/auth/login', { method: 'POST', body: { email, password } });

export const fetchMe = () => request('/api/auth/me', { auth: true });

export const updateMe = (nombre, avatarUrl, alias) =>
  request('/api/auth/me', { method: 'PUT', body: { nombre, avatarUrl, alias }, auth: true });

export const checkAlias = (alias) =>
  request(`/api/auth/alias-disponible?alias=${encodeURIComponent(alias)}`, { auth: 'optional' });

export const listProyectosUsuario = () => request('/api/proyectos-usuario', { auth: true });

export const getProyectoUsuario = (id) => request(`/api/proyectos-usuario/${id}`, { auth: true });

export const createProyectoUsuario = (nombre, board, contenido, origenCodigo = null) =>
  request('/api/proyectos-usuario', { method: 'POST', body: { nombre, board, contenido, origenCodigo }, auth: true });

export const updateProyectoUsuario = (id, { nombre, board, contenido }) =>
  request(`/api/proyectos-usuario/${id}`, { method: 'PUT', body: { nombre, board, contenido }, auth: true });

export const deleteProyectoUsuario = (id) =>
  request(`/api/proyectos-usuario/${id}`, { method: 'DELETE', auth: true });

export const listProyectosPublicos = () => request('/api/proyectos-publicos');

export const getProyectoPublico = (id) => request(`/api/proyectos-publicos/${id}`);

export const getProyectoPorCodigo = (codigo) =>
  request(`/api/proyectos-codigo/${encodeURIComponent(codigo)}`, { auth: 'optional' });

export const copiarProyectoPorCodigo = (codigo) =>
  request(`/api/proyectos-codigo/${encodeURIComponent(codigo)}/copia`, { method: 'POST', auth: true });

export const listBiblioteca = () => request('/api/biblioteca', { auth: true });

export const getAccesoProyecto = (id) => request(`/api/proyectos-usuario/${id}/acceso`, { auth: true });

export const updateAccesoProyecto = (id, acceso) =>
  request(`/api/proyectos-usuario/${id}/acceso`, { method: 'PUT', body: { acceso }, auth: true });
