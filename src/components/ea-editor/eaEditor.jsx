import { useEffect, useRef, useState } from 'react';
import CodeMirror from 'codemirror';
import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/dracula.css';
import 'codemirror/mode/python/python';
import './ea-editor.css';
import { API_BASE } from '../../api/client';
import { serial, isSerialSupported, usingWebUsbPolyfill, getSerialUnsupportedMessage, errorMessage, requestPortPreferringNativeOnAndroid, resetToDefaultSerialBackend, isAndroid } from '../../api/webSerial';
import { flashAvrHex, AVR_BOARD_PROFILES } from '../../api/stk500';
import { MICROPYTHON_BAUD, tieneMicroPython, subirCodigoMicroPython, flashearFirmwareMicroPython } from '../../api/esp32MicroPython';

function MonitorIcon() {
    return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M6 9l3 3-3 3M13 15h5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function EditorIcon() {
    return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 4L2 10l6 6M16 4l6 6-6 6M13 3l-2 18" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function ClearIcon() {
    return (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function ChevronIcon({ open }) {
    return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4">
            {open
                ? <path d="M6 15l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
                : <path d="M7 8h10M7 12h10M7 16h6" strokeLinecap="round" strokeLinejoin="round" />}
        </svg>
    );
}

export default function EaEditor() {
    const editorTextAreaRef = useRef(null);
    const cmInstanceRef = useRef(null);
    const consoleRef = useRef(null);
    const deviceConsoleRef = useRef(null);

    const portRef = useRef(null);
    const readerRef = useRef(null);
    const keepReadingRef = useRef(false);

    const [isConnected, setIsConnected] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [baudRate, setBaudRate] = useState("115200");
    const [selectedBoard, setSelectedBoard] = useState("esp32");
    const [showMonitor, setShowMonitor] = useState(false);
    const [showCmdBar, setShowCmdBar] = useState(false);
    const [lineEnding, setLineEnding] = useState("nl");
    const [cmdInput, setCmdInput] = useState("");

    useEffect(() => {
        if (!cmInstanceRef.current && editorTextAreaRef.current) {
            cmInstanceRef.current = CodeMirror.fromTextArea(editorTextAreaRef.current, {
                lineNumbers: true,
                mode: "python",
                theme: "dracula",
                lineWrapping: true
            });
            cmInstanceRef.current.setValue(`from machine import Pin\nimport time\n\nled = Pin(2, Pin.OUT)\n\nwhile True:\n    led.value(1)\n    print("System Ready")\n    time.sleep(1)\n    led.value(0)\n    time.sleep(1)\n`);
        }

        const canalSerial = new BroadcastChannel('canal_arduino');
        canalSerial.onmessage = async (mensaje) => {
            if (mensaje.data === 'suelta_el_puerto' && portRef.current) {
                logConsole("<span style='color: #ff9aa2;'>[INFO] Puerto liberado para otra pestaña.</span>");
                await desconectar();
            }
        };

        return () => {
            canalSerial.close();
            liberarPuertoPorCompleto();
        };
    }, []);

    const logConsole = (msg) => {
        if (consoleRef.current) {
            consoleRef.current.innerHTML += `${msg}<br>`;
            consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
        }
    };

    const logConsoleLive = (id, html) => {
        if (!consoleRef.current) return;
        const el = consoleRef.current.querySelector(`#${id}`);
        if (el) {
            el.innerHTML = html;
        } else {
            consoleRef.current.innerHTML += `<span id="${id}">${html}</span><br>`;
        }
        consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    };

    const renderProgressBar = (percent) => {
        const clamped = Math.max(0, Math.min(100, Math.round(percent)));
        const totalSlots = 10;
        const filled = Math.round((clamped / 100) * totalSlots);
        return `[${'█'.repeat(filled)}${'░'.repeat(totalSlots - filled)}] ${clamped}%`;
    };

    const handleFileUpload = (evento) => {
        const archivo = evento.target.files[0];
        if (!archivo) return; 

        const lector = new FileReader();
        lector.onload = function(e) {
            const contenido = e.target.result;
            cmInstanceRef.current.setValue(contenido); 
            logConsole(`<span style="color: #a8e6cf;">[INFO] Archivo <b>${archivo.name}</b> cargado.</span>`);
        };
        lector.readAsText(archivo);
        evento.target.value = "";
    };

    const handleBaudChange = async (e) => {
        const newBaud = e.target.value;
        setBaudRate(newBaud);
        logConsole(`<span style="color: #ffd3b6;">[INFO] Baudios modificados a ${newBaud}.</span>`);
        if (portRef.current) {
            logConsole(`<span style="color: #ff9aa2;">[INFO] Reiniciando conexión...</span>`);
            await desconectar();
        }
    };

    const liberarPuertoPorCompleto = async () => {
        keepReadingRef.current = false;
        if (readerRef.current) {
            try { await readerRef.current.cancel(); } catch (e) { console.error(e); } 
        }
        if (portRef.current) {
            try { await portRef.current.close(); } catch (e) { console.error(e); }
            portRef.current = null;
        }
    };

    const readSerialLoop = async () => {
        const decoder = new TextDecoder();
        try {
            while (portRef.current && portRef.current.readable && keepReadingRef.current) {
                readerRef.current = portRef.current.readable.getReader();
                try {
                    while (keepReadingRef.current) {
                        const { value, done } = await readerRef.current.read();
                        if (done) break;
                        if (value && deviceConsoleRef.current) {
                            const text = decoder.decode(value);
                            deviceConsoleRef.current.innerHTML += text.replace(/\r/g, '').replace(/\n/g, '<br>');
                            deviceConsoleRef.current.scrollTop = deviceConsoleRef.current.scrollHeight;
                        }
                    }
                } catch (error) {
                    console.error(error);
                } finally {
                    if (readerRef.current) {
                        readerRef.current.releaseLock();
                        readerRef.current = null;
                    }
                }
            }
        } catch (err) {
            console.error(err);
        }
    };

    const abrirMonitorSerial = async (silent = false) => {
        try {
            if (!portRef.current) return;
            const selectedBaudRate = parseInt(baudRate, 10);

            if (!portRef.current.readable) {
                await portRef.current.open({ baudRate: selectedBaudRate });
            }
            if (!silent) {
                logConsole(`<span style="color: #a8e6cf;">[INFO] Escuchando COM (${selectedBaudRate} bps)...</span>`);
            }
            keepReadingRef.current = true;
            readSerialLoop();
        } catch (e) {
            logConsole(`<span style="color: #ffaaa5;">[ERROR]: ${errorMessage(e)}</span>`);
        }
    };

    const conectar = async () => {
        try {
            if (!isSerialSupported) {
                logConsole(`<span style='color: #ffaaa5;'>[ERROR] ${getSerialUnsupportedMessage()}</span>`);
                return;
            }

            const canalSerial = new BroadcastChannel('canal_arduino');
            canalSerial.postMessage('suelta_el_puerto');
            await new Promise(resolve => setTimeout(resolve, 1000));

            if (selectedBoard === 'esp32') {
                portRef.current = await requestPortPreferringNativeOnAndroid();
            } else {
                resetToDefaultSerialBackend();
                portRef.current = await serial.requestPort();
            }
            if (usingWebUsbPolyfill) {
                logConsole(`<span style="color: #dcedc1;">[INFO] Dispositivo vinculado vía WebUSB (polyfill).</span>`);
            } else {
                logConsole(`<span style="color: #dcedc1;">[INFO] Dispositivo vinculado.</span>`);
            }
            
            setIsConnected(true);
            await abrirMonitorSerial();
        } catch (error) {
            if (isAndroid && selectedBoard === 'esp32') {
                logConsole(`<span style='color: #ffaaa5;'>[INFO] Conexión cancelada o no se encontró la placa (se buscó por WebUSB, chip Silicon Labs CP210x). Si tu ESP32 usa otro chip (CH340, FTDI) no es compatible todavía.</span>`);
            } else if (usingWebUsbPolyfill) {
                logConsole(`<span style='color: #ffaaa5;'>[INFO] Conexión cancelada o dispositivo no compatible con WebUSB (el adaptador debe exponer una interfaz CDC-ACM; adaptadores CP2102/CH340/FTDI no funcionan con este polyfill).</span>`);
            } else {
                logConsole(`<span style='color: #ffaaa5;'>[INFO] Conexión cancelada.</span>`);
            }
            portRef.current = null;
        }
    };

    const desconectar = async () => {
        await liberarPuertoPorCompleto();
        setIsConnected(false);
        logConsole("<span style='color: #ff9aa2;'>[INFO] Dispositivo desconectado.</span>");
    };

    const toggleConnection = async () => {
        if (portRef.current) {
            await desconectar();
        } else {
            await conectar();
        }
    };

    const postJson = async (url, payload) => {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const rawBody = await response.text();
        const contentType = response.headers.get('content-type') || '';
        let data = null;
        if (contentType.includes('application/json')) {
            try {
                data = JSON.parse(rawBody);
            } catch (parseErr) {
                data = null;
            }
        }

        if (!response.ok) {
            throw new Error(data?.error || rawBody || `Error HTTP ${response.status}`);
        }
        return data;
    };

    const subirEsp32DesdeNavegador = async (code, onProgress = () => {}) => {
        const ports = await serial.getPorts();
        if (ports.length === 0) {
            throw new Error('No hay ningún dispositivo vinculado. Reconecta la placa.');
        }
        const port = ports[0];
        const onLog = (msg) => console.log('[ESP32]', msg);

        onLog('Comprobando si la placa ya tiene MicroPython...');
        await port.open({ baudRate: MICROPYTHON_BAUD });
        const yaTiene = await tieneMicroPython(port);
        await port.close();

        if (!yaTiene) {
            onLog('No se detectó MicroPython. Preparando la placa por primera vez...');
            const firmwareMap = await (await fetch(`${API_BASE}/api/esp32-firmware`)).json();
            await flashearFirmwareMicroPython(port, API_BASE, firmwareMap, onLog, onProgress);
        } else {
            onProgress(100);
        }

        await port.open({ baudRate: MICROPYTHON_BAUD });
        try {
            await subirCodigoMicroPython(port, code, onLog);
        } finally {
            try { await port.close(); } catch (e) {}
        }
    };

    const subirArduinoDesdeNavegador = async (code, onProgress = () => {}) => {
        const data = await postJson(`${API_BASE}/api/compile`, { code, board: 'arduino:avr:uno' });
        if (!data?.hex) {
            throw new Error('El servidor no devolvió el firmware compilado.');
        }

        const ports = await serial.getPorts();
        if (ports.length === 0) {
            throw new Error('No hay ningún dispositivo vinculado. Reconecta la placa.');
        }

        const port = ports[0];
        await port.open({ baudRate: AVR_BOARD_PROFILES['arduino:avr:uno'].baudRate });
        try {
            await flashAvrHex(port, data.hex, 'arduino:avr:uno', (msg) => {
                console.log('[FLASH]', msg);
            }, onProgress);
        } finally {
            try { await port.close(); } catch (e) {}
        }
    };

    const handleUpload = async () => {
        if (!portRef.current) return;

        setIsUploading(true);
        const statusId = `upload-status-${Date.now()}`;
        const updateStatus = (html) => logConsoleLive(statusId, html);
        updateStatus(`<span style='color: #ffd3b6;'>[SISTEMA] ${selectedBoard === 'esp32' ? 'Preparando...' : 'Compilando...'}</span>`);

        await liberarPuertoPorCompleto();
        await new Promise(resolve => setTimeout(resolve, 1200));

        const code = cmInstanceRef.current.getValue();

        const onProgress = (percent) => {
            updateStatus(`<span style='color: #ffd3b6;'>[SISTEMA] Subiendo... ${renderProgressBar(percent)}</span>`);
        };

        let uploadSucceeded = true;
        try {
            if (selectedBoard === 'esp32') {
                await subirEsp32DesdeNavegador(code, onProgress);
            } else {
                await subirArduinoDesdeNavegador(code, onProgress);
            }
        } catch (err) {
            uploadSucceeded = false;
            updateStatus(`<span style='color: #ffaaa5;'>[ERROR]:</span><br><pre style="color: #ffaaa5; margin: 0;">${errorMessage(err)}</pre>`);
        }

        try {
            const ports = await serial.getPorts();
            if (ports.length > 0) {
                portRef.current = ports[0];

                const waitTime = selectedBoard === 'esp32' ? 2500 : 1000;
                await new Promise(resolve => setTimeout(resolve, waitTime));

                await abrirMonitorSerial(true);
                if (uploadSucceeded) {
                    updateStatus("<span style='color: #a8e6cf;'>[ÉXITO] Subido con éxito (Escuchando puerto serie)</span>");
                }
            } else {
                setIsConnected(false);
                logConsole("<span style='color: #ffaaa5;'>[ERROR] Dispositivo no detectado tras reiniciar.</span>");
            }
        } catch (err) {
            logConsole(`<span style='color: #ffaaa5;'>[ERROR]: ${errorMessage(err)}</span>`);
        }

        setIsUploading(false);
    };

    const clearConsole = () => {
        if (consoleRef.current) consoleRef.current.innerHTML = "";
    };

    const clearDeviceConsole = () => {
        if (deviceConsoleRef.current) deviceConsoleRef.current.innerHTML = "";
    };

    const enviarComando = async () => {
        if (!portRef.current || !portRef.current.writable) return;

        let data = cmdInput;
        if (lineEnding === 'nl') data += '\n';
        else if (lineEnding === 'cr') data += '\r';
        else if (lineEnding === 'both') data += '\r\n';

        const encoder = new TextEncoder();
        const writer = portRef.current.writable.getWriter();
        try {
            await writer.write(encoder.encode(data));
            setCmdInput('');
        } catch (error) {
            logConsole(`<span style="color: #ffaaa5;">[ERROR]: ${errorMessage(error)}</span>`);
        } finally {
            writer.releaseLock();
        }
    };

    const handleCmdKeyDown = (e) => {
        if (e.key === 'Enter') {
            enviarComando();
        }
    };

    return (
        <div className="ea-editor-container">
            <div className="container">
                <h2 className="main-title">Mini Editor Web</h2>
                <div className="toolbar">
                    <button 
                        id="connectBtn"
                        onClick={toggleConnection} 
                        className={isConnected ? "btn-disconnect" : "btn-connect"}
                    >
                        {isConnected ? "Desconectar" : "Conectar Placa"}
                    </button>
                    <button id="uploadBtn" onClick={handleUpload} disabled={!isConnected || isUploading}>
                        {isUploading ? "Subiendo..." : "Subir"}
                    </button>
                    <button id="clearBtn" onClick={clearConsole}>Limpiar Terminal</button>
                    <label htmlFor="fileInput" className="btn-file">Cargar</label>
                    <input type="file" id="fileInput" accept=".py" style={{ display: 'none' }} onChange={handleFileUpload} />
                    
                    <div className="baud-container">
                        <label htmlFor="boardSelect">Placa:</label>
                        <select id="boardSelect" value={selectedBoard} onChange={(e) => setSelectedBoard(e.target.value)}>
                            <option value="esp32">ESP32 (MicroPython)</option>
                            <option value="arduino">Arduino Uno</option>
                        </select>
                    </div>

                    <div className="baud-container">
                        <label htmlFor="baudRate">Baudios:</label>
                        <select id="baudRate" value={baudRate} onChange={handleBaudChange}>
                            <option value="9600">9600</option>
                            <option value="19200">19200</option>
                            <option value="38400">38400</option>
                            <option value="57600">57600</option>
                            <option value="115200">115200</option>
                        </select>
                    </div>
                </div>
                <div className="ide-container">
                    <div className={`editor-pane ${showMonitor ? 'is-hidden' : ''}`}>
                        <textarea ref={editorTextAreaRef}></textarea>
                    </div>

                    <div className={`terminal-panel ${showMonitor ? 'is-hidden' : ''}`}>
                        <div className="terminal-panel-header">
                            <span className="terminal-panel-title">Terminal</span>
                            <button type="button" className="btn-icon" title="Abrir Monitor Serial" onClick={() => setShowMonitor(true)}>
                                <MonitorIcon />
                            </button>
                        </div>
                        <div ref={consoleRef} id="console">Esperando conexión serial...<br/></div>
                    </div>

                    <div className={`monitor-panel ${showMonitor ? '' : 'is-hidden'}`}>
                        <div className="terminal-panel-header">
                            <span className="terminal-panel-title">Monitor Serial</span>
                            <div className="terminal-panel-actions">
                                <button type="button" className="btn-icon" title="Limpiar salida" onClick={clearDeviceConsole}>
                                    <ClearIcon />
                                </button>
                                <button type="button" className="btn-icon" title="Volver al editor" onClick={() => setShowMonitor(false)}>
                                    <EditorIcon />
                                </button>
                            </div>
                        </div>

                        <div ref={deviceConsoleRef} className={`monitor-output ${showCmdBar ? 'cmdbar-open' : ''}`}>Esperando datos del dispositivo...<br/></div>

                        <div className="monitor-cmdbar">
                            {showCmdBar && (
                                <div className="monitor-cmdbar-controls">
                                    <select value={lineEnding} onChange={(e) => setLineEnding(e.target.value)}>
                                        <option value="none">Sin ajuste de línea</option>
                                        <option value="nl">Nueva línea (NL)</option>
                                        <option value="cr">Retorno de carro (CR)</option>
                                        <option value="both">Ambos (NL &amp; CR)</option>
                                    </select>
                                    <input
                                        type="text"
                                        value={cmdInput}
                                        onChange={(e) => setCmdInput(e.target.value)}
                                        onKeyDown={handleCmdKeyDown}
                                        placeholder="Escribe un comando y presiona Enter..."
                                        disabled={!isConnected}
                                    />
                                    <button type="button" onClick={enviarComando} disabled={!isConnected}>Enviar ➔</button>
                                </div>
                            )}
                            <button
                                type="button"
                                className="btn-fab"
                                title={showCmdBar ? 'Ocultar comandos' : 'Enviar comando'}
                                onClick={() => setShowCmdBar((v) => !v)}
                            >
                                <ChevronIcon open={showCmdBar} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}