import CodeMirror from 'codemirror';
import 'codemirror/mode/clike/clike';

// Modo C++ con las mismas categorías de color que Arduino IDE (y que el panel de código de EduBlocks):
// control, tipos, constantes, funciones, números, textos y comentarios.
const palabras = (texto) => Object.fromEntries(texto.split(/\s+/).map((w) => [w, true]));

const CONTROL = palabras(
    'if else for while do switch case default break continue return goto ' +
    'new delete sizeof this namespace using template typename try catch throw operator ' +
    'public private protected virtual friend explicit constexpr'
);

const TIPOS = palabras(
    'void int long short float double bool boolean char byte word unsigned signed ' +
    'const static volatile extern inline register typedef String size_t struct class enum union auto ' +
    'int8_t int16_t int32_t int64_t uint8_t uint16_t uint32_t uint64_t'
);

const CONSTANTES = palabras(
    'HIGH LOW INPUT OUTPUT INPUT_PULLUP LED_BUILTIN true false NULL nullptr ' +
    'A0 A1 A2 A3 A4 A5 A6 A7 DEC HEX BIN OCT CHANGE RISING FALLING LSBFIRST MSBFIRST'
);

// Objetos y funciones propias de Arduino que el IDE colorea aunque no lleven paréntesis.
const INTEGRADOS = palabras('Serial Serial1 Serial2 Serial3 Wire SPI Servo setup loop');

const base = CodeMirror.resolveMode('text/x-c++src');

CodeMirror.defineMIME('text/x-arduino', {
    ...base,
    keywords: CONTROL,
    types: (palabra) => Object.prototype.hasOwnProperty.call(TIPOS, palabra) || /.+_t$/.test(palabra),
    atoms: CONSTANTES,
    builtin: INTEGRADOS,
    hooks: {
        ...base.hooks,
        // Cualquier identificador seguido de "(" es una llamada o definición de función.
        token(stream, state, style) {
            const propio = base.hooks.token?.(stream, state, style);
            if (propio !== undefined) return propio;
            if (style === 'variable' && stream.match(/^\s*\(/, false)) return 'def';
            return undefined;
        },
    },
});
