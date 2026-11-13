// Placas para el lenguaje Arduino. Solo las configuraciones distintas: las EduBoard comparten chip y se
// compilan igual que el Uno o el Nano. Lo que cambia es el fqbn que recibe arduino-cli y la velocidad del
// bootloader al subir. Las EduBoard UNO usan la librería EduWit: #include "src/EduWit.h" (o <EduWit.h>).
export const PLACAS_ARDUINO = [
    { id: 'uno', label: 'Arduino Uno / EduBoard UNO', fqbn: 'arduino:avr:uno', familia: 'avr' },
    { id: 'nano', label: 'Arduino Nano / EduBoard Profesional', fqbn: 'arduino:avr:nano', familia: 'avr' },
    { id: 'nano-old', label: 'Arduino Nano (bootloader antiguo)', fqbn: 'arduino:avr:nano:cpu=atmega328old', familia: 'avr' },
    // ESP32 en C++: se graba con esptool-js y reemplaza MicroPython (se reinstala solo al volver a MicroPython).
    { id: 'esp32', label: 'ESP32 Dev Kit', fqbn: 'esp32:esp32:esp32', familia: 'esp' },
];

export const PLACA_ARDUINO_DEFAULT = PLACAS_ARDUINO[0].id;

// Opciones que existieron antes y quedaron guardadas en algunos navegadores.
const ALIAS = { 'eduboard-uno': 'uno', 'eduboard-uno-actualizado': 'uno', 'eduboard-pro': 'nano' };

export const getPlacaArduino = (id) => {
    const real = ALIAS[id] ?? id;
    return PLACAS_ARDUINO.find((p) => p.id === real) ?? PLACAS_ARDUINO[0];
};
