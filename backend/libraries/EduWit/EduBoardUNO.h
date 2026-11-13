#ifndef EDUBOARD_UNO_H
#define EDUBOARD_UNO_H

#include <Arduino.h>
#include <Servo.h>
#include "EduWit_Constantes.h"

// Identificadores fisicos de la EduBoard UNO REV3
enum MotorID : uint8_t { MA = 0, MB = 1, AMBOS = 2 };
enum LEDID : uint8_t { LED1 = 1, LED2 = 2, LED3 = 3 };
enum SensorLineaID : uint8_t { S1 = A1, S2 = A2, S3 = A3 };
enum UltrasonicoID : uint8_t { U1 = 1, U2 = 2, U3 = 3 };

class EduBoardUNO {
  private:
    Servo _miServo;
    bool _servoActivo;
    bool _u3Activo;

    // Mapeo fisico de pines EduBoard UNO - REV3
    static const uint8_t PIN_MA1 = 2;
    static const uint8_t PIN_MA2 = 4;
    static const uint8_t PIN_PWMA = 3;
    static const uint8_t PIN_MB1 = 7;
    static const uint8_t PIN_MB2 = 8;
    static const uint8_t PIN_PWMB = 5;
    static const uint8_t PIN_BOTON = 6;
    static const uint8_t PIN_SERVO = 13;
    static const uint8_t PINS_LED[3]; // LED1=A0, LED2=A4, LED3=A5

    bool _sensorValido(uint8_t sensor) const;
    bool _ultrasonicoValido(uint8_t sensor) const;
    bool _ledDisponible(uint8_t numeroLed) const;
    void _liberarPinCompartido(uint8_t pin);
    void _tonoSoftware(int frecuenciaHz, unsigned long duracionMs, uint8_t pinBuzzer);

  public:
    // Estado anterior conservado solo por compatibilidad con sketches existentes.
    // Para codigo nuevo se recomienda leerComandoBluetooth().
    volatile char COMANDO;

    EduBoardUNO();

    void iniciar(unsigned long baudios = 9600);

    // Control de motores (0 a 100%)
    void moverMotor(MotorID motor, Direccion direccion, int velocidad);
    void frenarMotor(MotorID motor);
    void apagarMotor(MotorID motor);

    // Sensores y entradas
    bool botonPresionado();
    void esperarBoton();
    bool detectaLinea(uint8_t sensor, ColorLinea color);
    bool leerDigital(uint8_t sensor);
    int leerAnalogico(uint8_t sensor);
    int medirDistancia(uint8_t sensor = U1, int rangoMaxCm = 200);
    bool detectaObjeto(uint8_t sensor, char comparacion, int limiteCm, int rangoMaxCm = 200);

    // Movimiento y actuadores
    bool fijarLed(uint8_t numeroLed, EstadoLED estado);
    bool girarServo(int angulo);
    void tocarTono(int frecuenciaHz, int duracionMs, uint8_t pinBuzzer = S1);
    void tocarNota(NotasMusicales notaMusical, int duracionMs, uint8_t pinBuzzer = S1);
    void detenerSonido(uint8_t pinBuzzer = S1);

    // Comunicacion Bluetooth / puerto serie
    // configurarSerial() cambia solamente la velocidad del puerto serie. No
    // reinicializa motores, sensores ni otros recursos de la EduBoard.
    void configurarSerial(unsigned long baudios);

    char leerComandoBluetooth();

    // API anterior conservada para que los programas de EduWit 1.1.1 sigan compilando.
    void mover(MotorID motor, Direccion direccion, int velocidad);
    void frenar(MotorID motor);
    void apagar(MotorID motor);
    bool boton();
    bool linea(uint8_t sensor, ColorLinea color);
    int distancia(uint8_t sensor, int rangoMaxCm = 200);
    bool detectaObjeto(uint8_t sensor, Proximidad proximidad, int limiteCm, int rangoMaxCm = 200);
    bool led(uint8_t numeroLed, EstadoLED estado);
    bool servo(int angulo);
    void tono(int frecuenciaHz, int duracionMs, uint8_t pinBuzzer = S1);
    void nota(NotasMusicales notaMusical, int duracionMs, uint8_t pinBuzzer = S1);
    void detenerTono(uint8_t pinBuzzer = S1);
    bool leerBluetooth();
    char comandoBluetooth() const;
    bool comandoEs(char comando) const;
    bool comandoEs(const String &comando) const;

    template <typename T>
    void enviarSerial(const T &dato) {
      Serial.println(dato);
    }

    // Alias conservado para no romper programas creados con versiones anteriores.
    template <typename T>
    void enviarBluetooth(const T &dato) {
      enviarSerial(dato);
    }
};

// Declaracion externa de la instancia
extern EduBoardUNO eduwit;

#endif
