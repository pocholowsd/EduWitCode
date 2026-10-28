import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import CodeMirror from 'codemirror';
import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/dracula.css';
import 'codemirror/mode/python/python';
import 'codemirror/mode/clike/clike';
import './ea-editor.css';
import { API_BASE } from '../../api/client';
import { serial, isSerialSupported, usingWebUsbPolyfill, getSerialUnsupportedMessage, errorMessage, requestPortPreferringNativeOnAndroid, resetToDefaultSerialBackend, isAndroid } from '../../api/webSerial';
import { flashAvrHex, AVR_BOARD_PROFILES } from '../../api/stk500';
import { MICROPYTHON_BAUD, tieneMicroPython, subirCodigoMicroPython, flashearFirmwareMicroPython } from '../../api/esp32MicroPython';
import CuentaHeader, { EnlaceModal } from '../cuenta/CuentaHeader';
import LoginModal from '../cuenta/auth/LoginModal';
import ProfileModal from '../cuenta/auth/ProfileModal';
import ProjectsModal from '../cuenta/projects/ProjectsModal';
import SaveProjectModal from '../cuenta/SaveProjectModal';
import UnsavedChangesModal from '../cuenta/UnsavedChangesModal';
import { codigoFromLocation, shareUrl } from '../cuenta/projects/shareLink';
import {
    getToken, clearToken, fetchMe, TOKEN_STORAGE_KEY,
    getProyectoUsuario, getProyectoPublico, getProyectoPorCodigo, copiarProyectoPorCodigo,
    createProyectoUsuario, updateProyectoUsuario, updateAccesoProyecto,
} from '../cuenta/authApi';

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

function CopyIcon() {
    return (
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="6" y="5" width="12" height="16" rx="2" />
            <path d="M9 5V3.5h6V5" />
        </svg>
    );
}

function CaretIcon({ open }) {
    return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {open ? <path d="M6 9l6 6 6-6" /> : <path d="M9 6l6 6-6 6" />}
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

const MONITOR_MAX_CHARS = 40000;

const CODIGO_BASE = {
    esp32: `from machine import Pin\nimport time\n\nled = Pin(2, Pin.OUT)\n\nwhile True:\n    led.value(1)\n    print("System Ready")\n    time.sleep(1)\n    led.value(0)\n    time.sleep(1)\n`,
    arduino: `const int LED = 13;\n\nvoid setup() {\n    pinMode(LED, OUTPUT);\n    Serial.begin(115200);\n}\n\nvoid loop() {\n    digitalWrite(LED, HIGH);\n    Serial.println("System Ready");\n    delay(1000);\n    digitalWrite(LED, LOW);\n    delay(1000);\n}\n`,
};

const CODIGO_VACIO = {
    esp32: ``,
    arduino: `void setup() {\n\n}\n\nvoid loop() {\n\n}\n`,
};

const NOMBRE_DEFAULT = {
    esp32: 'main',
    arduino: 'sketch',
};

const EXTENSION = {
    esp32: '.py',
    arduino: '.ino',
};

const NOMBRE_PLACA = {
    esp32: 'MicroPython',
    arduino: 'Arduino C',
};

const MODO_EDITOR = {
    esp32: 'python',
    arduino: 'text/x-c++src',
};

// Programa guardado en la cuenta. remoteId null = aún no está guardado en la nube.
const PROYECTO_NUEVO = { remoteId: null, nombre: null, codigo: null, esCopia: false, origenCodigo: null, savedSnapshot: null };

const esCodigoInicial = (codigo, placa) => codigo.trim() === CODIGO_VACIO[placa].trim() || codigo === CODIGO_BASE[placa];

const nombreArchivo = (nombre) => nombre.trim().replace(/\.(py|ino)$/i, '').replace(/[\\/:*?"<>|]/g, '_');

export default function EaEditor() {
    const editorTextAreaRef = useRef(null);
    const cmInstanceRef = useRef(null);
    const consoleRef = useRef(null);
    const deviceConsoleRef = useRef(null);
    const monitorBufferRef = useRef('');
    const monitorFrameRef = useRef(null);

    const portRef = useRef(null);
    const readerRef = useRef(null);
    const keepReadingRef = useRef(false);

    const [isConnected, setIsConnected] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [baudRate, setBaudRate] = useState("115200");
    const [selectedBoard, setSelectedBoard] = useState("esp32");
    const [placaPendiente, setPlacaPendiente] = useState(null);
    const [nombrePrograma, setNombrePrograma] = useState(NOMBRE_DEFAULT.esp32);
    // { nombre, placaDespues }: placaDespues indica a qué placa cambiar tras guardar
    const [guardarDialogo, setGuardarDialogo] = useState(null);
    const [proyecto, setProyecto] = useState(PROYECTO_NUEVO);
    const [user, setUser] = useState(null);
    const [saving, setSaving] = useState(false);
    const [saveModalOpen, setSaveModalOpen] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [loginModalOpen, setLoginModalOpen] = useState(false);
    const [profileModalOpen, setProfileModalOpen] = useState(false);
    const [projectsModalOpen, setProjectsModalOpen] = useState(false);
    const [projectsInitialTab, setProjectsInitialTab] = useState('usuario');
    const [enlaceOpen, setEnlaceOpen] = useState(false);
    const [unsavedPromptOpen, setUnsavedPromptOpen] = useState(false);
    // Acción que espera al aviso de guardar: 'new' | 'logout' | 'switch' | { type: 'open', id, source }.
    const [pendingAction, setPendingAction] = useState(null);
    const [showMonitor, setShowMonitor] = useState(false);
    const [showCmdBar, setShowCmdBar] = useState(false);
    const [lineEnding, setLineEnding] = useState("nl");
    const [cmdInput, setCmdInput] = useState("");
    const [panelOpen, setPanelOpen] = useState(true);
    const [terminal, setTerminal] = useState([]);
    const logSeqRef = useRef(0);

    useEffect(() => {
        if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }, [terminal]);
    const [panelHeight, setPanelHeight] = useState(170);
    const ideContainerRef = useRef(null);
    const dragPanelRef = useRef(null);
    const [headerSlot, setHeaderSlot] = useState(null);
    const [showSettings, setShowSettings] = useState(false);
    const settingsRef = useRef(null);

    useEffect(() => {
        if (!showSettings) return;
        const cerrarAlTocarFuera = (e) => {
            if (settingsRef.current && !settingsRef.current.contains(e.target)) {
                setShowSettings(false);
            }
        };
        document.addEventListener('pointerdown', cerrarAlTocarFuera);
        return () => document.removeEventListener('pointerdown', cerrarAlTocarFuera);
    }, [showSettings]);

    useEffect(() => {
        setHeaderSlot(document.getElementById('app-header-actions'));
    }, []);

    useEffect(() => {
        if (!cmInstanceRef.current && editorTextAreaRef.current) {
            cmInstanceRef.current = CodeMirror.fromTextArea(editorTextAreaRef.current, {
                lineNumbers: true,
                mode: MODO_EDITOR[selectedBoard],
                theme: "dracula",
                lineWrapping: true
            });
            cmInstanceRef.current.setValue(CODIGO_BASE[selectedBoard]);
        }

        const canalSerial = new BroadcastChannel('canal_arduino');
        canalSerial.onmessage = async (mensaje) => {
            if (mensaje.data === 'suelta_el_puerto' && portRef.current) {
                logConsole('Puerto liberado para otra pestaña.');
                await desconectar();
            }
        };

        return () => {
            canalSerial.close();
            liberarPuertoPorCompleto();
        };
    }, []);

    const logConsole = (text, tone = 'info') => {
        const id = ++logSeqRef.current;
        setTerminal((prev) => [...prev.slice(-80), { id, text, tone }]);
        return id;
    };

    const updateLog = (id, text, tone = 'info', progress = null) => {
        setTerminal((prev) => (prev.some((e) => e.id === id)
            ? prev.map((e) => (e.id === id ? { ...e, text, tone, progress } : e))
            : [...prev.slice(-80), { id, text, tone, progress }]));
    };

    const handleFileUpload = (evento) => {
        const archivo = evento.target.files[0];
        if (!archivo) return; 

        const lector = new FileReader();
        lector.onload = function(e) {
            const contenido = e.target.result;
            cmInstanceRef.current.setValue(contenido);
            setNombrePrograma(archivo.name.replace(/\.[^.]+$/, ''));
            setProyecto(PROYECTO_NUEVO);
            logConsole(`Archivo "${archivo.name}" cargado.`);
        };
        lector.readAsText(archivo);
        evento.target.value = "";
    };

    const abrirGuardar = (placaDespues = null) => {
        setPlacaPendiente(null);
        setGuardarDialogo({ nombre: nombrePrograma, placaDespues });
    };

    const confirmarGuardar = (e) => {
        e.preventDefault();
        const nombre = guardarDialogo.nombre.trim().replace(/\.(py|ino)$/i, '').replace(/[\\/:*?"<>|]/g, '_');
        if (!nombre) return;
        const archivo = nombre + EXTENSION[selectedBoard];
        const blob = new Blob([cmInstanceRef.current.getValue()], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = archivo;
        enlace.click();
        URL.revokeObjectURL(url);
        logConsole(`Programa guardado como "${archivo}".`);
        setNombrePrograma(nombre);
        if (guardarDialogo.placaDespues) cambiarPlaca(guardarDialogo.placaDespues);
        setGuardarDialogo(null);
    };

    const cambiarPlaca = (nuevaPlaca) => {
        const cm = cmInstanceRef.current;
        cm.setOption('mode', MODO_EDITOR[nuevaPlaca]);
        cm.setValue(CODIGO_VACIO[nuevaPlaca]);
        setSelectedBoard(nuevaPlaca);
        setNombrePrograma(NOMBRE_DEFAULT[nuevaPlaca]);
        setPlacaPendiente(null);
        setProyecto(PROYECTO_NUEVO);
    };

    const handleBoardChange = (e) => {
        const nuevaPlaca = e.target.value;
        if (esCodigoInicial(cmInstanceRef.current.getValue(), selectedBoard)) cambiarPlaca(nuevaPlaca);
        else setPlacaPendiente(nuevaPlaca);
    };

    useEffect(() => {
        const syncUser = () => {
            if (!getToken()) { setUser(null); return; }
            fetchMe()
                .then((data) => setUser(data.user))
                .catch(() => { clearToken(); setUser(null); });
        };
        syncUser();
        // Otra pestaña inició o cerró sesión: el token es compartido, así que hay que reflejar esa cuenta aquí.
        const onStorage = (e) => { if (e.key === TOKEN_STORAGE_KEY || e.key === null) syncUser(); };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    // Al cerrar sesión o cambiar de cuenta, lo abierto pertenece a la cuenta anterior: se empieza un programa vacío.
    const lastUserId = useRef(null);
    useEffect(() => {
        const currentId = user?.id ?? null;
        if (lastUserId.current !== null && lastUserId.current !== currentId) {
            cmInstanceRef.current?.setValue(CODIGO_VACIO[selectedBoard]);
            setNombrePrograma(NOMBRE_DEFAULT[selectedBoard]);
            setProyecto(PROYECTO_NUEVO);
        }
        if (currentId !== null || lastUserId.current !== null) lastUserId.current = currentId;
    }, [user?.id]);

    const snapshotActual = () => `${selectedBoard}\n${cmInstanceRef.current.getValue()}`;

    const neverSaved = !proyecto.remoteId;
    // Cuentas creadas antes de que el alias fuera obligatorio: deben elegir uno al entrar.
    const aliasMissing = Boolean(user && !user.alias);
    // Sin guardar en la nube, solo se pregunta si el código no es la plantilla inicial (como al cambiar de placa).
    const hayCambiosSinGuardar = () => (neverSaved
        ? !esCodigoInicial(cmInstanceRef.current.getValue(), selectedBoard)
        : snapshotActual() !== proyecto.savedSnapshot);

    const handleGuardarNube = () => {
        if (!user) { setLoginModalOpen(true); return; }
        if (saving) return;
        setSaveError('');
        setSaveModalOpen(true);
    };

    const handleConfirmSave = async (nombre, access) => {
        if (saving) return;
        setSaving(true);
        setSaveError('');
        const contenido = cmInstanceRef.current.getValue();
        const board = NOMBRE_PLACA[selectedBoard];
        const savedSnapshot = snapshotActual();
        let remoteId = proyecto.remoteId;
        try {
            if (remoteId) {
                await updateProyectoUsuario(remoteId, { nombre, board, contenido });
                setProyecto((p) => ({ ...p, nombre, savedSnapshot }));
                logConsole(`Proyecto "${nombre}" actualizado en la nube.`, 'success');
            } else {
                const data = await createProyectoUsuario(nombre, board, contenido, proyecto.origenCodigo);
                remoteId = data.proyecto.id;
                const esCopia = data.proyecto.esCopia;
                setProyecto((p) => ({ ...p, nombre, remoteId, esCopia, savedSnapshot }));
                if (esCopia) logConsole('Se guardó como copia en tu Biblioteca.');
                logConsole(`Proyecto "${nombre}" guardado en la nube.`, 'success');
            }
            setNombrePrograma(nombreArchivo(nombre) || NOMBRE_DEFAULT[selectedBoard]);
        } catch (err) {
            setSaveError(`No se pudo guardar: ${err.message}`);
            setSaving(false);
            return;
        }
        try {
            if (!access) {
                setSaveModalOpen(false);
                if (pendingAction) { setPendingAction(null); runAction(pendingAction); }
                return;
            }
            const accessData = await updateAccesoProyecto(remoteId, access.acceso);
            const codigo = accessData.acceso === 'compartido' ? accessData.codigo : null;
            setProyecto((p) => ({ ...p, codigo }));
            if (codigo) logConsole(`Enlace para compartir: ${shareUrl(accessData.codigo)}`, 'success');
            setSaveModalOpen(false);
            if (pendingAction) {
                setPendingAction(null);
                runAction(pendingAction);
            }
        } catch (err) {
            setSaveError(`El programa se guardó, pero no se pudo cambiar el acceso: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    const handleAuthenticated = (nextUser) => {
        setUser(nextUser);
        setLoginModalOpen(false);
        if (pendingAction) setSaveModalOpen(true);
    };

    const logout = () => {
        clearToken();
        setUser(null);
    };

    const runAction = (action) => {
        if (action === 'new') cambiarPlaca(selectedBoard);
        if (action === 'logout') logout();
        if (action === 'switch') { logout(); setLoginModalOpen(true); }
        if (action?.type === 'open') abrirProyecto(action.id, action.source);
    };

    // Antes de Nuevo, Cerrar sesión, Cambiar de cuenta o abrir otro programa, ofrecer guardar lo que se perdería.
    const requestAction = (action) => {
        if (hayCambiosSinGuardar()) {
            setPendingAction(action);
            setUnsavedPromptOpen(true);
        } else {
            runAction(action);
        }
    };

    const handleUnsavedSave = () => {
        setUnsavedPromptOpen(false);
        setSaveError('');
        if (user) setSaveModalOpen(true);
        else setLoginModalOpen(true);
    };

    const handleUnsavedDiscard = () => {
        setUnsavedPromptOpen(false);
        setPendingAction(null);
        runAction(pendingAction);
    };

    const abrirExplorador = (tab) => {
        setProjectsInitialTab(tab ?? (user ? 'usuario' : 'publico'));
        setProjectsModalOpen(true);
    };

    // source 'codigo': id es el código de referencia. Con sesión, la dueña recibe el original y los demás
    // su copia en la Biblioteca; sin sesión se abre sin guardar y se convierte en copia al guardarlo.
    const abrirProyecto = async (id, source) => {
        try {
            const loggedIn = Boolean(getToken());
            const loaders = {
                usuario: getProyectoUsuario,
                publico: getProyectoPublico,
                codigo: loggedIn ? copiarProyectoPorCodigo : getProyectoPorCodigo,
            };
            const data = await loaders[source](id);
            const p = data.proyecto;
            const placa = Object.keys(NOMBRE_PLACA).find((k) => NOMBRE_PLACA[k] === p.board) ?? selectedBoard;
            const cm = cmInstanceRef.current;
            cm.setOption('mode', MODO_EDITOR[placa]);
            cm.setValue(p.contenido);
            setSelectedBoard(placa);
            setPlacaPendiente(null);
            setNombrePrograma(nombreArchivo(p.nombre) || NOMBRE_DEFAULT[placa]);
            setProyecto({
                remoteId: source === 'usuario' || (source === 'codigo' && loggedIn) ? p.id : null,
                nombre: p.nombre,
                codigo: p.codigo ?? null,
                esCopia: p.esCopia,
                origenCodigo: source === 'codigo' && !loggedIn ? id : null,
                savedSnapshot: `${placa}\n${cm.getValue()}`,
            });
            logConsole(`Proyecto "${p.nombre}" cargado.`);
            if (source === 'codigo') {
                if (!loggedIn) logConsole('Inicia sesión y guarda para tener tu copia en la Biblioteca.');
                else if (data.existente) logConsole(`Ya tenías una copia de este programa de ${p.autor}; se abrió tu copia de la Biblioteca.`);
                else if (!data.propio) logConsole(`Se creó una copia del programa de ${p.autor} en tu Biblioteca. Los cambios se guardan solo en tu copia.`);
            }
        } catch (err) {
            logConsole(`Error al abrir el proyecto: ${err.message}`, 'error');
        }
    };

    // Al entrar por un enlace /code/<codigo>, se abre ese programa y la URL vuelve a la raíz.
    const openedFromLink = useRef(false);
    useEffect(() => {
        const codigo = codigoFromLocation();
        if (!codigo || openedFromLink.current) return;
        openedFromLink.current = true;
        window.history.replaceState(null, '', '/');
        abrirProyecto(codigo, 'codigo');
    }, []);

    const handleBaudChange = async (e) => {
        const newBaud = e.target.value;
        setBaudRate(newBaud);
        logConsole(`Monitor Serial a ${newBaud} baudios.`);
        if (portRef.current) {
            logConsole('Reiniciando conexión...');
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

    const vaciarBufferMonitor = () => {
        monitorFrameRef.current = null;
        const el = deviceConsoleRef.current;
        const pendiente = monitorBufferRef.current;
        monitorBufferRef.current = '';
        if (!el || !pendiente) return;
        const estabaAbajo = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        el.appendChild(document.createTextNode(pendiente));
        if (el.childNodes.length > 200 || el.textContent.length > MONITOR_MAX_CHARS) {
            el.textContent = el.textContent.slice(-MONITOR_MAX_CHARS);
        }
        if (estabaAbajo) el.scrollTop = el.scrollHeight;
    };

    const escribirEnMonitor = (texto) => {
        monitorBufferRef.current = (monitorBufferRef.current + texto).slice(-MONITOR_MAX_CHARS);
        if (monitorFrameRef.current) return;
        monitorFrameRef.current = document.hidden
            ? setTimeout(vaciarBufferMonitor, 250)
            : requestAnimationFrame(vaciarBufferMonitor);
    };

    const readSerialLoop = async () => {
        const decoder = new TextDecoder();
        let ultimoDato = 0;
        let terminoEnSalto = true;
        try {
            while (portRef.current && portRef.current.readable && keepReadingRef.current) {
                readerRef.current = portRef.current.readable.getReader();
                try {
                    while (keepReadingRef.current) {
                        const { value, done } = await readerRef.current.read();
                        if (done) break;
                        if (value) {
                            const text = decoder.decode(value, { stream: true }).replace(/\r/g, '');
                            if (!text) continue;
                            const ahora = Date.now();
                            const separar = !terminoEnSalto && ultimoDato && ahora - ultimoDato > 150;
                            ultimoDato = ahora;
                            terminoEnSalto = text.endsWith('\n');
                            escribirEnMonitor((separar ? '\n' : '') + text);
                        }
                    }
                } catch (error) {
                    console.error(error);
                    if (keepReadingRef.current) {
                        logConsole(`Lectura del puerto interrumpida: ${errorMessage(error)}`, 'error');
                    }
                } finally {
                    if (readerRef.current) {
                        readerRef.current.releaseLock();
                        readerRef.current = null;
                    }
                }
            }
            if (keepReadingRef.current && portRef.current && !portRef.current.readable) {
                logConsole('Se perdió la lectura del puerto. Desconecta y vuelve a conectar la placa.', 'error');
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
                await portRef.current.open({ baudRate: selectedBaudRate, bufferSize: 8192 });
            }
            if (!silent) {
                logConsole(`Escuchando puerto serie (${selectedBaudRate} baudios)...`);
            }
            keepReadingRef.current = true;
            readSerialLoop();
        } catch (e) {
            logConsole(`Error: ${errorMessage(e)}`, 'error');
        }
    };

    const conectar = async () => {
        try {
            if (!isSerialSupported) {
                logConsole(getSerialUnsupportedMessage(), 'error');
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
                logConsole('Placa conectada (WebUSB).', 'success');
            } else {
                logConsole('Placa conectada.', 'success');
            }
            
            setIsConnected(true);
            await abrirMonitorSerial();
        } catch (error) {
            if (isAndroid && selectedBoard === 'esp32') {
                logConsole('Conexión cancelada o no se encontró la placa (se buscó por WebUSB, chip Silicon Labs CP210x). Si tu ESP32 usa otro chip (CH340, FTDI) no es compatible todavía.', 'error');
            } else if (usingWebUsbPolyfill) {
                logConsole('Conexión cancelada o dispositivo no compatible con WebUSB (el adaptador debe exponer una interfaz CDC-ACM; adaptadores CP2102/CH340/FTDI no funcionan con este polyfill).', 'error');
            } else {
                logConsole('Conexión cancelada.');
            }
            portRef.current = null;
        }
    };

    const desconectar = async () => {
        await liberarPuertoPorCompleto();
        setIsConnected(false);
        logConsole('Placa desconectada.');
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
        const statusId = logConsole(`[SISTEMA] ${selectedBoard === 'esp32' ? 'Preparando...' : 'Compilando...'}`, 'progress');

        await liberarPuertoPorCompleto();
        await new Promise(resolve => setTimeout(resolve, 1200));

        const code = cmInstanceRef.current.getValue();

        const onProgress = (percent) => {
            updateLog(statusId, '[SISTEMA] Subiendo...', 'progress', Math.max(0, Math.min(100, Math.round(percent))));
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
            updateLog(statusId, `[ERROR] ${errorMessage(err)}`, 'error');
        }

        try {
            const ports = await serial.getPorts();
            if (ports.length > 0) {
                portRef.current = ports[0];

                const waitTime = selectedBoard === 'esp32' ? 2500 : 1000;
                await new Promise(resolve => setTimeout(resolve, waitTime));

                await abrirMonitorSerial(true);
                if (uploadSucceeded) {
                    updateLog(statusId, '[ÉXITO] Subido con éxito (escuchando puerto serie)', 'success');
                }
            } else {
                setIsConnected(false);
                logConsole('Placa no detectada tras reiniciar.', 'error');
            }
        } catch (err) {
            logConsole(`Error: ${errorMessage(err)}`, 'error');
        }

        setIsUploading(false);
    };

    const clearConsole = () => {
        setTerminal([]);
    };

    const iniciarArrastrePanel = (e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        dragPanelRef.current = { startY: e.clientY, startHeight: panelOpen ? panelHeight : 0 };
    };

    const moverArrastrePanel = (e) => {
        if (!dragPanelRef.current) return;
        const { startY, startHeight } = dragPanelRef.current;
        const nuevaAltura = startHeight + (startY - e.clientY);
        const alturaMaxima = Math.max(80, (ideContainerRef.current?.clientHeight || 0) - 240);
        if (nuevaAltura < 50) {
            setPanelOpen(false);
            return;
        }
        setPanelOpen(true);
        setPanelHeight(Math.min(Math.max(nuevaAltura, 70), alturaMaxima));
    };

    const terminarArrastrePanel = (e) => {
        if (!dragPanelRef.current) return;
        dragPanelRef.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
        cmInstanceRef.current?.refresh();
    };

    const copiarCodigo = async () => {
        try {
            await navigator.clipboard.writeText(cmInstanceRef.current.getValue());
        } catch (e) {
            console.error(e);
        }
    };

    const clearDeviceConsole = () => {
        monitorBufferRef.current = '';
        if (deviceConsoleRef.current) deviceConsoleRef.current.textContent = "";
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
            logConsole(`No se pudo enviar el comando: ${errorMessage(error)}`, 'error');
        } finally {
            writer.releaseLock();
        }
    };

    const handleCmdKeyDown = (e) => {
        if (e.key === 'Enter') {
            enviarComando();
        }
    };

    // Nuevo, Abrir, Cargar y Descargar: en pantalla completa van en la barra; en pantallas chicas, dentro del panel de ajustes.
    const accionProyecto = (accion) => {
        setShowSettings(false);
        accion();
    };

    const toolbar = (
        <div className="ea-toolbar">
            <div className={`tb-settings ${showSettings ? 'is-open' : ''}`} ref={settingsRef}>
                <button type="button" className="tb-settings-toggle" title="Placa, proyecto y baudios" onClick={() => setShowSettings((v) => !v)}>
                    <i className="bi bi-sliders" />
                </button>

                <div className="tb-settings-panel">
                    <div className="tb-panel-actions">
                        <span className="tb-panel-title">Proyecto</span>
                        <button type="button" className="tb-btn tb-abrir" onClick={() => accionProyecto(() => abrirExplorador())}>
                            <i className="bi bi-folder2-open" /> Abrir
                        </button>
                        <button type="button" className="tb-btn tb-new" onClick={() => accionProyecto(() => requestAction('new'))}>
                            <i className="bi bi-plus-lg" /> Nuevo
                        </button>
                        <label htmlFor="fileInput" className="tb-btn tb-abrir" onClick={() => setShowSettings(false)}>
                            <i className="bi bi-upload" /> Cargar
                        </label>
                        <button type="button" className="tb-btn tb-save" onClick={() => accionProyecto(() => abrirGuardar())}>
                            <i className="bi bi-download" /> Descargar
                        </button>
                    </div>

                    <div className="tb-field">
                        <label htmlFor="boardSelect">Placa:</label>
                        <select id="boardSelect" value={selectedBoard} onChange={handleBoardChange}>
                            <option value="esp32">MicroPython</option>
                            <option value="arduino">Arduino C</option>
                        </select>
                    </div>

                    <div className="tb-field tb-field-baud">
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
            </div>

            <button
                id="connectBtn"
                type="button"
                onClick={toggleConnection}
                title={isConnected ? "Desconectar (USB)" : "Conectar (USB)"}
                className={`tb-btn tb-connect ${isConnected ? 'is-connected' : ''}`}
            >
                <i className="bi bi-usb-symbol" />
                <span className="tb-label">{isConnected ? "Desconectar (USB)" : "Conectar (USB)"}</span>
                <span className="tb-status">
                    <span className="tb-status-dot" />
                    <span className="tb-label">{isConnected ? "Conectado" : "Desconectado"}</span>
                </span>
            </button>

            <button
                id="uploadBtn"
                type="button"
                className={`tb-play ${isUploading ? 'is-uploading' : ''}`}
                onClick={handleUpload}
                disabled={!isConnected || isUploading}
                title={isUploading ? "Subiendo..." : "Subir"}
            >
                <i className="bi bi-play-fill" />
            </button>

            <div className="tb-group tb-group-proyecto">
                <button type="button" className="tb-btn tb-new" title="Programa nuevo" onClick={() => requestAction('new')}>
                    <i className="bi bi-plus-lg" />
                    <span className="tb-label">Nuevo</span>
                </button>
                <button type="button" className="tb-btn tb-abrir" title="Explorar programas guardados y de ejemplo" onClick={() => abrirExplorador()}>
                    <i className="bi bi-folder2-open" />
                    <span className="tb-label">Abrir</span>
                </button>
                <label htmlFor="fileInput" className="tb-btn tb-abrir tb-icon" title="Cargar archivo (.py / .ino)">
                    <i className="bi bi-upload" />
                </label>
            </div>
            <input type="file" id="fileInput" accept=".py,.ino" style={{ display: 'none' }} onChange={handleFileUpload} />

            <div className="tb-group tb-group-guardar">
                <button type="button" className="tb-btn tb-save" title="Guardar en tu cuenta" onClick={handleGuardarNube} disabled={saving}>
                    <i className={`bi ${saving ? 'bi-hourglass-split' : 'bi-cloud-arrow-up'}`} />
                    <span className="tb-label">{saving ? 'Guardando…' : 'Guardar'}</span>
                </button>
                <button type="button" className="tb-btn tb-save tb-icon tb-solo-escritorio" title="Descargar archivo" onClick={() => abrirGuardar()}>
                    <i className="bi bi-download" />
                </button>
                {proyecto.codigo && (
                    <button type="button" className="tb-btn tb-abrir" title="Ver el enlace para compartir" onClick={() => setEnlaceOpen(true)}>
                        <i className="bi bi-link-45deg" />
                        <span className="tb-label">Enlace</span>
                    </button>
                )}
            </div>
        </div>
    );

    const barraSuperior = (
        <>
            {toolbar}
            <CuentaHeader
                user={user}
                onLogin={() => setLoginModalOpen(true)}
                onOpenProjects={() => abrirExplorador('usuario')}
                onOpenProfile={() => setProfileModalOpen(true)}
                onSwitchAccount={() => requestAction('switch')}
                onLogout={() => requestAction('logout')}
            />
        </>
    );

    return (
        <div className="ea-editor-container">
            {headerSlot ? createPortal(barraSuperior, headerSlot) : barraSuperior}
            <div className="container">
                <div className="ide-container" ref={ideContainerRef}>
                    <div className="ide-titlebar">
                        <div className="ide-dots">
                            <span className="ide-dot ide-dot-red" />
                            <span className="ide-dot ide-dot-yellow" />
                            <span className="ide-dot ide-dot-green" />
                        </div>
                        <span className="ide-filename">{nombrePrograma + EXTENSION[selectedBoard]}</span>
                        <div className="ide-titlebar-actions">
                            <button type="button" className="ide-icon-btn" title="Copiar código" onClick={copiarCodigo}>
                                <CopyIcon />
                            </button>
                        </div>
                    </div>

                    <div className="editor-pane">
                        <textarea ref={editorTextAreaRef}></textarea>
                    </div>

                    <div className="bottom-panel">
                        <div
                            className="bottom-panel-resizer"
                            title="Arrastra para ajustar"
                            onPointerDown={iniciarArrastrePanel}
                            onPointerMove={moverArrastrePanel}
                            onPointerUp={terminarArrastrePanel}
                            onPointerCancel={terminarArrastrePanel}
                        />
                        <div className="bottom-panel-header">
                            <button type="button" className="bottom-panel-toggle" onClick={() => setPanelOpen((v) => !v)}>
                                <CaretIcon open={panelOpen} />
                                <span>{showMonitor ? 'Monitor Serial' : 'Terminal'}</span>
                            </button>
                            <div className="bottom-panel-actions">
                                <button type="button" className="panel-chip" title="Limpiar salida" onClick={showMonitor ? clearDeviceConsole : clearConsole}>
                                    CLR
                                </button>
                                <button type="button" className="panel-chip" title={showMonitor ? 'Ver Terminal' : 'Abrir Monitor Serial'} onClick={() => setShowMonitor((v) => !v)}>
                                    {showMonitor ? <EditorIcon /> : <MonitorIcon />}
                                    <span>{showMonitor ? 'Terminal' : 'Monitor serial'}</span>
                                </button>
                            </div>
                        </div>

                        <div className={`bottom-panel-body ${panelOpen ? '' : 'is-hidden'}`} style={{ height: panelHeight }}>
                            <div className={`panel-output-wrap ${showMonitor ? 'is-hidden' : ''}`}>
                                <div ref={consoleRef} id="console" className="panel-output terminal-log">
                                    {terminal.length === 0 ? (
                                        <div className="log-empty">Esperando conexión serial...</div>
                                    ) : (
                                        terminal.map((entry) => (
                                            <div key={entry.id} className={`log-line log-${entry.tone}`}>
                                                {entry.text}
                                                {entry.progress != null && (
                                                    <span className="log-bar">
                                                        <span className="log-progress-track">
                                                            <span className="log-progress-fill" style={{ width: `${entry.progress}%` }} />
                                                        </span>
                                                        <span className="log-progress-value">{entry.progress}%</span>
                                                    </span>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            <div className={`panel-output-wrap ${showMonitor ? '' : 'is-hidden'}`}>
                                <div ref={deviceConsoleRef} className={`panel-output monitor-output ${showCmdBar ? 'cmdbar-open' : ''}`}>{'Esperando datos del dispositivo...\n'}</div>

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

                    <div className="ide-statusbar">
                        <div className="ide-status">
                            <span className={`ide-status-dot ${isConnected ? 'is-on' : ''}`} />
                            <span>{isConnected ? 'Conectado' : 'Desconectado'}</span>
                            <span className="ide-status-sep" />
                            <span>baud: {isConnected ? baudRate : '—'}</span>
                        </div>
                    </div>
                </div>
            </div>

            {placaPendiente && (
                <div className="board-modal-backdrop" onClick={() => setPlacaPendiente(null)}>
                    <div className="board-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                        <h3>Cambiar a {NOMBRE_PLACA[placaPendiente]}</h3>
                        <p>Se creará un programa vacío. ¿Quieres guardar el programa actual ({nombrePrograma + EXTENSION[selectedBoard]}) antes de continuar?</p>
                        <div className="board-modal-actions">
                            <button type="button" className="board-modal-btn" onClick={() => setPlacaPendiente(null)}>Cancelar</button>
                            <button type="button" className="board-modal-btn" onClick={() => cambiarPlaca(placaPendiente)}>No guardar</button>
                            <button type="button" className="board-modal-btn is-primary" onClick={() => abrirGuardar(placaPendiente)}>Guardar y crear nuevo</button>
                        </div>
                    </div>
                </div>
            )}

            {guardarDialogo && (
                <div className="board-modal-backdrop" onClick={() => setGuardarDialogo(null)}>
                    <form className="board-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} onSubmit={confirmarGuardar}>
                        <h3>Guardar programa</h3>
                        <label htmlFor="nombreArchivo" className="board-modal-label">Nombre del archivo</label>
                        <div className="board-modal-filename">
                            <input
                                id="nombreArchivo"
                                type="text"
                                autoFocus
                                value={guardarDialogo.nombre}
                                onChange={(e) => setGuardarDialogo((d) => ({ ...d, nombre: e.target.value }))}
                                onFocus={(e) => e.target.select()}
                                onKeyDown={(e) => { if (e.key === 'Escape') setGuardarDialogo(null); }}
                            />
                            <span>{EXTENSION[selectedBoard]}</span>
                        </div>
                        <div className="board-modal-actions">
                            <button type="button" className="board-modal-btn" onClick={() => setGuardarDialogo(null)}>Cancelar</button>
                            <button type="submit" className="board-modal-btn is-primary" disabled={!guardarDialogo.nombre.trim()}>
                                {guardarDialogo.placaDespues ? 'Guardar y crear nuevo' : 'Descargar'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <SaveProjectModal
                open={saveModalOpen}
                initialName={proyecto.nombre ?? nombrePrograma}
                remoteId={proyecto.remoteId}
                showAccess={!proyecto.esCopia && !proyecto.origenCodigo}
                saving={saving}
                error={saveError}
                onClose={() => { setSaveModalOpen(false); setPendingAction(null); }}
                onSubmit={handleConfirmSave}
            />
            <UnsavedChangesModal
                open={unsavedPromptOpen}
                projectName={proyecto.nombre ?? nombrePrograma + EXTENSION[selectedBoard]}
                neverSaved={neverSaved}
                onSave={handleUnsavedSave}
                onDiscard={handleUnsavedDiscard}
                onClose={() => { setUnsavedPromptOpen(false); setPendingAction(null); }}
            />
            <LoginModal
                open={loginModalOpen}
                onClose={() => { setLoginModalOpen(false); setPendingAction(null); }}
                onAuthenticated={handleAuthenticated}
            />
            <ProfileModal
                open={profileModalOpen || aliasMissing}
                onClose={() => setProfileModalOpen(false)}
                requireAlias={aliasMissing}
                onLogout={logout}
                user={user}
                onUpdated={setUser}
            />
            <ProjectsModal
                open={projectsModalOpen}
                onClose={() => setProjectsModalOpen(false)}
                isAuthenticated={!!user}
                userId={user?.id}
                onRequireLogin={() => setLoginModalOpen(true)}
                onOpenProject={(id, source) => requestAction({ type: 'open', id, source })}
                initialTab={projectsInitialTab}
            />
            <EnlaceModal open={enlaceOpen} codigo={proyecto.codigo} onClose={() => setEnlaceOpen(false)} />
        </div>
    );
}