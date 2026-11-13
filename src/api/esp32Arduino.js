import { ESPLoader, Transport } from 'esptool-js';

function bytesFromBase64(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

// Graba un programa de Arduino (C++) compilado para ESP32. files: [{ name, offset, dataBase64 }] del servidor.
// El puerto debe estar cerrado: esptool-js lo abre y lo cierra.
export async function flashearProgramaEsp32(port, files, onLog = () => {}, onProgress = () => {}) {
    const transport = new Transport(port, false);
    const esploader = new ESPLoader({
        transport,
        baudrate: 115200,
        terminal: { clean: () => {}, writeLine: (msg) => onLog(msg), write: (msg) => onLog(msg) },
    });

    try {
        onLog('Conectando con el ESP32...');
        await esploader.main();
        const chip = esploader.chip.CHIP_NAME;
        // Las posiciones de los archivos (bootloader en 0x1000) son las del ESP32 clásico; en un C3/S3 no arrancaría.
        if (chip !== 'ESP32') {
            throw new Error(`Se detectó un ${chip}. Por ahora solo se puede programar en Arduino el ESP32 clásico (ESP32 Dev Kit); usa MicroPython para esta placa.`);
        }

        const fileArray = files.map((f) => ({ data: bytesFromBase64(f.dataBase64), address: f.offset }));
        const sizes = fileArray.map((f) => f.data.length);
        const total = sizes.reduce((a, b) => a + b, 0);
        const antes = sizes.map((_, i) => sizes.slice(0, i).reduce((a, b) => a + b, 0));

        onLog('Grabando el programa...');
        onProgress(0);
        await esploader.writeFlash({
            fileArray,
            flashMode: 'keep',
            flashFreq: 'keep',
            flashSize: 'keep',
            eraseAll: false,
            compress: true,
            reportProgress: (fileIndex, written, fileTotal) => {
                const hecho = fileTotal > 0 ? (written / fileTotal) * sizes[fileIndex] : 0;
                onProgress(((antes[fileIndex] + hecho) / total) * 100);
            },
        });

        await esploader.after('hard_reset');
        onProgress(100);
    } finally {
        try { await transport.disconnect(); } catch (e) {}
    }
}
