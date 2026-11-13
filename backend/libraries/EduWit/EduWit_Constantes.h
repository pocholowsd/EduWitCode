#ifndef EDUWIT_CONSTANTES_H
#define EDUWIT_CONSTANTES_H

#include <Arduino.h>

// Sentidos de giro y estados logicos comunes
enum Direccion : uint8_t { ADELANTE = 0, ATRAS = 1 };
enum EstadoLED : uint8_t { APAGADO = 0, ENCENDIDO = 1 };
enum ColorLinea : uint8_t { BLANCO = 0, NEGRO = 1 };

// Comparacion pedagogica para sensores de distancia.
// CERCA incluye exactamente el limite indicado; LEJOS significa mayor al limite.
enum Proximidad : uint8_t { CERCA = 0, LEJOS = 1 };

// La medicion ultrasonica devuelve este valor cuando el recurso no esta disponible
// (por ejemplo, U3 bloqueado porque el servomotor tiene prioridad sobre D13/T3).
static const int DISTANCIA_NO_DISPONIBLE = -1;

// Frecuencias exactas en Hz para notas musicales (Octavas 3 y 4)
enum NotasMusicales : uint16_t {
  SILENCIO = 0,
  DO3 = 131, RE3 = 147, MI3 = 165, FA3 = 175, SOL3 = 196, LA3 = 220, SI3 = 247,
  DO4 = 262, RE4 = 294, MI4 = 330, FA4 = 349, SOL4 = 392, LA4 = 440, SI4 = 494
};

#endif
