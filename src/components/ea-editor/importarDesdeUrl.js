// Código enviado desde otro estudio (p. ej. el de bloques) en la URL: #importar=<base64url de JSON>.
// El JSON trae { lenguaje, nombre, codigo }. El hash no se envía al servidor; solo lo lee esta página.

const PLACA_POR_LENGUAJE = {
    arduino: 'arduino',
    micropython: 'esp32',
    python: 'esp32',
    esp32: 'esp32',
};

// Devuelve { placa, nombre, codigo } o null si la URL no trae una importación válida.
export function importacionDesdeUrl() {
    const match = window.location.hash.match(/^#importar=(.+)$/);
    if (!match) return null;
    try {
        const b64 = match[1].replace(/-/g, '+').replace(/_/g, '/');
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const datos = JSON.parse(new TextDecoder().decode(bytes));
        const placa = PLACA_POR_LENGUAJE[String(datos.lenguaje ?? '').toLowerCase()];
        if (!placa || typeof datos.codigo !== 'string') return null;
        return { placa, nombre: typeof datos.nombre === 'string' ? datos.nombre : '', codigo: datos.codigo };
    } catch {
        return null;
    }
}
