import { ESPLoader, Transport } from 'esptool-js';
import { errorMessage } from './webSerial';

export const MICROPYTHON_BAUD = 115200;

const CTRL_C = '\x03';
const CTRL_A = '\x01';
const CTRL_B = '\x02';
const RAW_REPL_PROMPT = 'raw REPL; CTRL-B to exit\r\n>';

class TextInbox {
    constructor(readable) {
        this._buffer = '';
        this._stopped = false;
        this._error = null;
        this._decoder = new TextDecoder();
        this._reader = readable.getReader();
        this._pumpPromise = this._pump();
    }

    async _pump() {
        try {
            while (!this._stopped) {
                const { value, done } = await this._reader.read();
                if (done) break;
                if (value && value.length) {
                    this._buffer += this._decoder.decode(value, { stream: true });
                }
            }
        } catch (error) {
            this._error = new Error(errorMessage(error));
        }
    }

    async readExactly(n, timeoutMs) {
        const start = Date.now();
        while (this._buffer.length < n) {
            if (this._error) throw this._error;
            if (Date.now() - start > timeoutMs) {
                throw new Error(`La placa no respondió a tiempo (se recibió: ${JSON.stringify(this._buffer.slice(-200))}).`);
            }
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
        const result = this._buffer.slice(0, n);
        this._buffer = this._buffer.slice(n);
        return result;
    }

    async waitFor(marker, timeoutMs) {
        const start = Date.now();
        while (true) {
            const idx = this._buffer.indexOf(marker);
            if (idx !== -1) {
                const before = this._buffer.slice(0, idx);
                this._buffer = this._buffer.slice(idx + marker.length);
                return before;
            }
            if (this._error) throw this._error;
            if (Date.now() - start > timeoutMs) {
                throw new Error(`La placa no respondió lo esperado. Datos recibidos: ${JSON.stringify(this._buffer.slice(-200))}`);
            }
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    async stop() {
        this._stopped = true;
        try { await this._reader.cancel(); } catch (e) {}
        try { this._reader.releaseLock(); } catch (e) {}
    }
}

function uint8ArrayToBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

async function writeChunked(writer, bytes, chunkSize = 256, delayMs = 10) {
    for (let i = 0; i < bytes.length; i += chunkSize) {
        await writer.write(bytes.slice(i, i + chunkSize));
        if (i + chunkSize < bytes.length) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }
}

async function enterRawRepl(writer, inbox, timeoutMs) {
    const start = Date.now();
    let lastError;
    while (Date.now() - start < timeoutMs) {
        await writer.write(new TextEncoder().encode(`\r${CTRL_C}${CTRL_C}`));
        await new Promise((resolve) => setTimeout(resolve, 100));
        await writer.write(new TextEncoder().encode(`\r${CTRL_A}`));
        const restante = timeoutMs - (Date.now() - start);
        try {
            await inbox.waitFor(RAW_REPL_PROMPT, Math.max(300, Math.min(1500, restante)));
            return;
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError || new Error('No se pudo entrar al raw REPL.');
}

async function execRaw(writer, inbox, code, timeoutMs) {
    await writeChunked(writer, new TextEncoder().encode(code));
    await writer.write(Uint8Array.from([0x04]));

    const ok = await inbox.readExactly(2, timeoutMs);
    if (ok !== 'OK') {
        throw new Error(`La placa no aceptó el código (respuesta: ${JSON.stringify(ok)}).`);
    }
    const output = await inbox.waitFor('\x04', timeoutMs);
    const errorOutput = await inbox.waitFor('\x04', timeoutMs);
    if (errorOutput.trim()) {
        throw new Error(`Error al ejecutar en la placa:\n${errorOutput.trim()}`);
    }
    return output;
}

async function exitRawReplAndSoftReset(writer) {
    await writer.write(new TextEncoder().encode(`\r${CTRL_B}`));
    await new Promise((resolve) => setTimeout(resolve, 300));
    await writer.write(Uint8Array.from([0x04]));
    await new Promise((resolve) => setTimeout(resolve, 500));
}

export async function tieneMicroPython(port, timeoutMs = 6000) {
    const writer = port.writable.getWriter();
    const inbox = new TextInbox(port.readable);
    try {
        await enterRawRepl(writer, inbox, timeoutMs);
        await writer.write(new TextEncoder().encode(`\r${CTRL_B}`));
        return true;
    } catch (error) {
        return false;
    } finally {
        await inbox.stop();
        try { writer.releaseLock(); } catch (e) {}
    }
}

export async function subirCodigoMicroPython(port, codigo, onLog = () => {}) {
    const writer = port.writable.getWriter();
    const inbox = new TextInbox(port.readable);
    const timeoutMs = 8000;
    try {
        onLog('Conectando al REPL de MicroPython...');
        await enterRawRepl(writer, inbox, timeoutMs);

        onLog('Copiando código como main.py...');
        const base64 = uint8ArrayToBase64(new TextEncoder().encode(codigo));
        const snippet = `import ubinascii\nwith open('main.py','wb') as _f:\n _f.write(ubinascii.a2b_base64('${base64}'))\n`;
        await execRaw(writer, inbox, snippet, timeoutMs);

        onLog('Reiniciando la placa para ejecutar el programa...');
        await exitRawReplAndSoftReset(writer);
    } finally {
        await inbox.stop();
        try { writer.releaseLock(); } catch (e) {}
    }
}

export async function flashearFirmwareMicroPython(port, apiBase, firmwareMap, onLog = () => {}, onProgress = () => {}) {
    const transport = new Transport(port, false);
    const esploader = new ESPLoader({
        transport,
        baudrate: MICROPYTHON_BAUD,
        terminal: {
            clean: () => {},
            writeLine: (msg) => onLog(msg),
            write: (msg) => onLog(msg),
        },
    });

    await esploader.main();
    const chipName = esploader.chip.CHIP_NAME;

    const entry = firmwareMap[chipName];
    if (!entry) {
        await transport.disconnect();
        throw new Error(`No hay firmware de MicroPython preparado para el chip detectado (${chipName}).`);
    }

    onLog(`Chip detectado: ${chipName}. Descargando firmware...`);
    const response = await fetch(`${apiBase}${entry.url}`);
    if (!response.ok) {
        await transport.disconnect();
        throw new Error('No se pudo descargar el firmware de MicroPython del servidor.');
    }
    const firmwareBytes = new Uint8Array(await response.arrayBuffer());

    onLog('Borrando memoria flash...');
    onProgress(0);
    await esploader.eraseFlash();

    onLog('Grabando firmware de MicroPython (puede tardar un minuto)...');
    await esploader.writeFlash({
        fileArray: [{ data: firmwareBytes, address: entry.offset }],
        flashMode: 'keep',
        flashFreq: 'keep',
        flashSize: 'detect',
        eraseAll: false,
        compress: true,
        reportProgress: (_fileIndex, written, total) => {
            const percent = Math.round((written / total) * 100);
            onLog(`Grabando firmware... ${percent}%`);
            onProgress(percent);
        },
    });

    await esploader.after('hard_reset');
    await transport.disconnect();
    onProgress(100);

    await new Promise((resolve) => setTimeout(resolve, 2500));
}
