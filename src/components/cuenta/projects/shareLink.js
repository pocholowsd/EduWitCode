// Enlace para compartir un programa: https://<host>/code/<codigo>.
export const SHARE_PATH = '/code/';

export function shareUrl(codigo) {
  return `${window.location.origin}${SHARE_PATH}${codigo}`;
}

// Extrae el código de referencia de un texto: el código solo o un enlace completo.
export function extractCodigo(text) {
  const match = text.trim().match(/(?:\/code\/)?([a-z0-9]{14})\/?$/i);
  if (!match) return null;
  const isLink = /\/code\//i.test(text);
  // Sin enlace, solo se acepta si el texto completo es el código.
  if (!isLink && text.trim().length !== match[1].length) return null;
  return match[1].toLowerCase();
}

// Código del enlace con el que se abrió la página, o null.
export function codigoFromLocation() {
  const match = window.location.pathname.match(/^\/code\/([a-z0-9]+)\/?$/i);
  return match ? match[1].toLowerCase() : null;
}
