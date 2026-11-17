// Errores del programa del usuario con su línea: { linea, mensaje }.
// Arduino: el servidor los extrae de gcc. MicroPython: se leen del Traceback que imprime la placa.

// Traducciones de los mensajes más comunes; el resto se muestra como lo da el compilador.
const TRADUCCIONES = [
    // gcc (Arduino)
    [/^'(.+)' was not declared in this scope$/, (m) => `'${m[1]}' no está declarado (¿está mal escrito o falta declararlo?)`],
    [/^expected '(.+)' before '(.+)'$/, (m) => `falta '${m[1]}' antes de '${m[2]}' (revisa también el final de la línea anterior)`],
    [/^expected '(.+)' before (.+)$/, (m) => `falta '${m[1]}' antes de ${m[2]} (revisa también el final de la línea anterior)`],
    [/^expected '\}' at end of input$/, () => "falta cerrar una llave '}' al final del programa"],
    [/^expected (.+) before (.+)$/, (m) => `se esperaba ${m[1]} antes de ${m[2]} (revisa también el final de la línea anterior)`],
    [/^'(.+)' does not name a type(.*)$/, (m) => `'${m[1]}' no es un tipo conocido${m[2]} (¿falta un #include o está mal escrito?)`],
    [/^redefinition of '(.+)'$/, (m) => `'${m[1]}' está definido dos veces`],
    [/^stray '(.+)' in program$/, (m) => `carácter no válido '${m[1]}' (¿comillas o símbolos copiados de otro lado?)`],
    [/^(.+): No such file or directory$/, (m) => `no se encontró ${m[1]} (¿la librería está bien escrita?)`],
    [/^too few arguments to function '(.+)'$/, (m) => `faltan argumentos al llamar a '${m[1]}'`],
    [/^too many arguments to function '(.+)'$/, (m) => `sobran argumentos al llamar a '${m[1]}'`],
    // MicroPython
    [/^SyntaxError: invalid syntax$/, () => 'error de sintaxis (revisa paréntesis, comillas y los dos puntos ":")'],
    [/^IndentationError: unexpected indent$/, () => 'sangría inesperada: esta línea tiene más espacios de los que debería'],
    [/^IndentationError: unindent doesn't match any outer indent level$/, () => 'la sangría no coincide con las líneas de arriba'],
    [/^IndentationError: expected an indented block$/, () => 'falta sangría: esta línea debe ir con espacios al inicio'],
    [/^NameError: name '(.+)' isn't defined$/, (m) => `'${m[1]}' no está definido (¿está mal escrito o falta importarlo?)`],
    [/^ImportError: no module named '(.+)'$/, (m) => `no existe el módulo '${m[1]}'`],
    [/^TypeError: (.+)$/, (m) => `tipo de dato incorrecto: ${m[1]}`],
    [/^ZeroDivisionError: (.+)$/, () => 'división entre cero'],
];

export function traducirError(mensaje) {
    const texto = mensaje.trim().replace(/ token$/, '');
    for (const [patron, traducir] of TRADUCCIONES) {
        const m = texto.match(patron);
        if (m) return traducir(m);
    }
    return texto;
}

// Del Traceback de MicroPython: la última línea de main.py y el mensaje final. null si el error no es de main.py.
export function errorDeTraceback(texto) {
    const lineas = [...texto.matchAll(/File "main\.py", line (\d+)/g)];
    if (!lineas.length) return null;
    const mensaje = texto.split('\n').map((l) => l.trim()).filter(Boolean).pop() || '';
    if (/^KeyboardInterrupt/.test(mensaje)) return null;
    return { linea: Number(lineas[lineas.length - 1][1]), mensaje };
}

// Junta las líneas que llegan por el puerto y avisa cuando termina un Traceback.
// Un Traceback termina en la primera línea sin sangría después del encabezado (el mensaje del error).
export function crearDetectorTraceback(onError) {
    let pendiente = '';
    let traceback = null;
    return (texto) => {
        pendiente += texto;
        const lineas = pendiente.split('\n');
        pendiente = lineas.pop().slice(-500);
        for (const linea of lineas) {
            if (linea.startsWith('Traceback (most recent call last)')) {
                traceback = [linea];
            } else if (traceback) {
                traceback.push(linea);
                if (linea && !/^\s/.test(linea)) {
                    const error = errorDeTraceback(traceback.join('\n'));
                    traceback = null;
                    if (error) onError(error);
                } else if (traceback.length > 60) {
                    traceback = null;
                }
            }
        }
    };
}
