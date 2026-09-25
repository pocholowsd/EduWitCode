import { errorMessage } from './webSerial';

const STK = {
    OK: 0x10,
    INSYNC: 0x14,
    CRC_EOP: 0x20,
    GET_SYNC: 0x30,
    SET_DEVICE: 0x42,
    ENTER_PROGMODE: 0x50,
    LEAVE_PROGMODE: 0x51,
    LOAD_ADDRESS: 0x55,
    PROG_PAGE: 0x64,
    READ_PAGE: 0x74,
    READ_SIGN: 0x75,
};

const MEM_FLASH = 0x46;

export const AVR_BOARD_PROFILES = {
    'arduino:avr:uno': { name: 'Arduino Uno', pageSize: 128, signature: [0x1e, 0x95, 0x0f], baudRate: 115200 },
};

function parseIntelHex(hexText) {
    const bytes = [];
    let extendedAddr = 0;
    for (const rawLine of hexText.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line[0] !== ':') continue;
        const byteCount = parseInt(line.substr(1, 2), 16);
        const address = parseInt(line.substr(3, 4), 16);
        const recordType = parseInt(line.substr(7, 2), 16);
        if (recordType === 0x00) {
            const base = extendedAddr + address;
            for (let i = 0; i < byteCount; i++) {
                bytes[base + i] = parseInt(line.substr(9 + i * 2, 2), 16);
            }
        } else if (recordType === 0x01) {
            break;
        } else if (recordType === 0x04) {
            extendedAddr = parseInt(line.substr(9, 4), 16) << 16;
        }
    }
    for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] === undefined) bytes[i] = 0xff;
    }
    return Uint8Array.from(bytes);
}

class SerialInbox {
    constructor(readable) {
        this._chunks = [];
        this._total = 0;
        this._stopped = false;
        this._error = null;
        this._reader = readable.getReader();
        this._pumpPromise = this._pump();
    }

    async _pump() {
        try {
            while (!this._stopped) {
                const { value, done } = await this._reader.read();
                if (done) break;
                if (value && value.length) {
                    this._chunks.push(value);
                    this._total += value.length;
                }
            }
        } catch (error) {
            this._error = new Error(errorMessage(error));
        }
    }

    async readExactly(n, timeoutMs) {
        const start = Date.now();
        while (this._total < n) {
            if (this._error) throw this._error;
            if (Date.now() - start > timeoutMs) {
                const seen = this._total === 0
                    ? 'no llegó ningún byte'
                    : `llegaron ${this._total} byte(s): 0x${Array.from(this._chunks.flatMap((c) => Array.from(c))).map((b) => b.toString(16).padStart(2, '0')).join(' 0x')}`;
                throw new Error(`El bootloader no respondió a tiempo (${seen}). ¿Está la placa en modo bootloader?`);
            }
            await new Promise((resolve) => setTimeout(resolve, 10));
        }
        const merged = new Uint8Array(this._total);
        let offset = 0;
        for (const chunk of this._chunks) {
            merged.set(chunk, offset);
            offset += chunk.length;
        }
        this._chunks = merged.length > n ? [merged.slice(n)] : [];
        this._total = Math.max(0, this._total - n);
        return merged.slice(0, n);
    }

    discardBuffered() {
        this._chunks = [];
        this._total = 0;
    }

    async stop() {
        this._stopped = true;
        try { await this._reader.cancel(); } catch (e) {}
        try { this._reader.releaseLock(); } catch (e) {}
    }
}

async function sendCommand(writer, inbox, commandBytes, expectedRespLen, timeoutMs) {
    await writer.write(Uint8Array.from([...commandBytes, STK.CRC_EOP]));

    const sync = await inbox.readExactly(1, timeoutMs);
    if (sync[0] !== STK.INSYNC) {
        throw new Error(`Bootloader fuera de sincronía (byte recibido: 0x${sync[0].toString(16)}).`);
    }

    const data = expectedRespLen > 0 ? await inbox.readExactly(expectedRespLen, timeoutMs) : new Uint8Array(0);

    const ok = await inbox.readExactly(1, timeoutMs);
    if (ok[0] !== STK.OK) {
        throw new Error(`El bootloader no confirmó el comando (byte recibido: 0x${ok[0].toString(16)}).`);
    }

    return data;
}

async function syncWithBootloader(writer, inbox, attempts, timeoutMs) {
    let lastError;
    for (let i = 0; i < attempts; i++) {
        inbox.discardBuffered();
        try {
            await sendCommand(writer, inbox, [STK.GET_SYNC], 0, timeoutMs);
            return;
        } catch (error) {
            lastError = error;
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
    }
    throw lastError || new Error('No se pudo sincronizar con el bootloader.');
}

async function resetIntoBootloader(port) {
    await port.setSignals({ dataTerminalReady: false, requestToSend: false });
    await new Promise((resolve) => setTimeout(resolve, 250));
    await port.setSignals({ dataTerminalReady: true, requestToSend: true });
    await new Promise((resolve) => setTimeout(resolve, 50));
}

export async function flashAvrHex(port, hexText, boardKey, onLog = () => {}, onProgress = () => {}) {
    const profile = AVR_BOARD_PROFILES[boardKey];
    if (!profile) {
        throw new Error(`Placa AVR no soportada por el flasher del navegador: ${boardKey}`);
    }

    const image = parseIntelHex(hexText);
    if (image.length === 0) {
        throw new Error('El .hex compilado está vacío.');
    }

    const writer = port.writable.getWriter();
    const inbox = new SerialInbox(port.readable);
    const timeoutMs = 2000;
    const syncTimeoutMs = 300;
    const syncAttempts = 20;

    try {
        const maxResetAttempts = 3;
        let synced = false;
        let syncError;
        for (let attempt = 1; attempt <= maxResetAttempts && !synced; attempt++) {
            onLog(attempt === 1
                ? 'Reiniciando la placa hacia el bootloader...'
                : `Reiniciando la placa (reintento ${attempt}/${maxResetAttempts})...`);
            await resetIntoBootloader(port);

            onLog('Sincronizando con el bootloader...');
            try {
                await syncWithBootloader(writer, inbox, syncAttempts, syncTimeoutMs);
                synced = true;
            } catch (error) {
                syncError = error;
            }
        }
        if (!synced) throw syncError;

        onLog('Verificando identidad del chip...');
        const signature = await sendCommand(writer, inbox, [STK.READ_SIGN], 3, timeoutMs);
        if (!profile.signature.every((byte, i) => byte === signature[i])) {
            const got = Array.from(signature).map((b) => b.toString(16).padStart(2, '0')).join(' ');
            throw new Error(`Firma del chip inesperada (0x${got}). ¿Seguro que es un ${profile.name}?`);
        }

        await sendCommand(writer, inbox, [
            STK.SET_DEVICE,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            (profile.pageSize >> 8) & 0xff, profile.pageSize & 0xff,
            0, 0, 0, 0, 0, 0,
        ], 0, timeoutMs);

        onLog('Entrando en modo de programación...');
        await sendCommand(writer, inbox, [STK.ENTER_PROGMODE], 0, timeoutMs);

        const totalPages = Math.ceil(image.length / profile.pageSize);
        onLog(`Escribiendo ${image.length} bytes en ${totalPages} páginas...`);
        onProgress(0);

        let pageIndex = 0;
        for (let pageAddr = 0; pageAddr < image.length; pageAddr += profile.pageSize) {
            const pageBytes = image.slice(pageAddr, pageAddr + profile.pageSize);
            const wordAddr = pageAddr >> 1;

            await sendCommand(writer, inbox, [
                STK.LOAD_ADDRESS, wordAddr & 0xff, (wordAddr >> 8) & 0xff,
            ], 0, timeoutMs);

            await sendCommand(writer, inbox, [
                STK.PROG_PAGE,
                (pageBytes.length >> 8) & 0xff, pageBytes.length & 0xff,
                MEM_FLASH,
                ...pageBytes,
            ], 0, timeoutMs);

            pageIndex++;
            onProgress((pageIndex / totalPages) * 50);
        }
        onLog(`${totalPages} páginas escritas.`);

        onLog('Verificando escritura...');
        pageIndex = 0;
        for (let pageAddr = 0; pageAddr < image.length; pageAddr += profile.pageSize) {
            const expectedBytes = image.slice(pageAddr, pageAddr + profile.pageSize);
            const wordAddr = pageAddr >> 1;

            await sendCommand(writer, inbox, [
                STK.LOAD_ADDRESS, wordAddr & 0xff, (wordAddr >> 8) & 0xff,
            ], 0, timeoutMs);

            const readBack = await sendCommand(writer, inbox, [
                STK.READ_PAGE,
                (expectedBytes.length >> 8) & 0xff, expectedBytes.length & 0xff,
                MEM_FLASH,
            ], expectedBytes.length, timeoutMs);

            for (let i = 0; i < expectedBytes.length; i++) {
                if (readBack[i] !== expectedBytes[i]) {
                    throw new Error(`Verificación falló en la dirección 0x${(pageAddr + i).toString(16)}.`);
                }
            }

            pageIndex++;
            onProgress(50 + (pageIndex / totalPages) * 50);
        }

        await sendCommand(writer, inbox, [STK.LEAVE_PROGMODE], 0, timeoutMs);
        onLog('Firmware verificado y subido correctamente.');
        onProgress(100);
    } finally {
        await inbox.stop();
        try { writer.releaseLock(); } catch (e) {}
    }
}
