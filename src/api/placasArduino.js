// Placas para el lenguaje Arduino (las mismas del editor de bloques). Varias comparten chip y se compilan igual;
// lo que cambia es el fqbn que recibe arduino-cli y la velocidad del bootloader al subir.
// Las EduBoard UNO usan la librería EduWit: #include "src/EduWit.h" (o <EduWit.h>).
export const PLACAS_ARDUINO = [
    { id: 'uno', label: 'Arduino Uno R3', fqbn: 'arduino:avr:uno' },
    { id: 'eduboard-uno', label: 'EduBoard UNO', fqbn: 'arduino:avr:uno' },
    { id: 'eduboard-uno-actualizado', label: 'EduBoard UNO Actualizado', fqbn: 'arduino:avr:uno' },
    { id: 'eduboard-pro', label: 'EduBoard Profesional', fqbn: 'arduino:avr:nano' },
    { id: 'nano', label: 'Arduino Nano', fqbn: 'arduino:avr:nano' },
    { id: 'nano-old', label: 'Arduino Nano (bootloader antiguo)', fqbn: 'arduino:avr:nano:cpu=atmega328old' },
];

export const PLACA_ARDUINO_DEFAULT = PLACAS_ARDUINO[0].id;

export const getPlacaArduino = (id) => PLACAS_ARDUINO.find((p) => p.id === id) ?? PLACAS_ARDUINO[0];
