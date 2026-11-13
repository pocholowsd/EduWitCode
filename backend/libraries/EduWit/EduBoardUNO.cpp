#include "EduBoardUNO.h"

// Proteccion de instanciacion: Solo se instancia si NO se compila para Nano/Profesional
#if !defined(ARDUINO_AVR_NANO) && !defined(USAR_EDUBOARD_PRO)
EduBoardUNO eduwit;
#endif

const uint8_t EduBoardUNO::PINS_LED[3] = {A0, A4, A5};

EduBoardUNO::EduBoardUNO() {
  _servoActivo = false;
  _u3Activo = false;
  COMANDO = '\0';
}

void EduBoardUNO::iniciar(unsigned long baudios) {
  pinMode(PIN_BOTON, INPUT);

  pinMode(S1, INPUT);
  pinMode(S2, INPUT);
  pinMode(S3, INPUT);

  pinMode(PIN_MA1, OUTPUT);
  pinMode(PIN_MA2, OUTPUT);
  pinMode(PIN_PWMA, OUTPUT);
  pinMode(PIN_MB1, OUTPUT);
  pinMode(PIN_MB2, OUTPUT);
  pinMode(PIN_PWMB, OUTPUT);

  // Los LEDs se dejan liberados hasta que fijarLed() los reclame. Esto evita
  // que LED1 interfiera con U3 desde el arranque.
  for (uint8_t i = 0; i < 3; i++) {
    digitalWrite(PINS_LED[i], LOW); // tambien desactiva pull-up si estaba activo
    pinMode(PINS_LED[i], INPUT);
  }

  Serial.begin(baudios);
  apagarMotor(AMBOS);
}

bool EduBoardUNO::_sensorValido(uint8_t sensor) const {
  return sensor == S1 || sensor == S2 || sensor == S3;
}

bool EduBoardUNO::_ultrasonicoValido(uint8_t sensor) const {
  return sensor == U1 || sensor == U2 || sensor == U3;
}

bool EduBoardUNO::_ledDisponible(uint8_t numeroLed) const {
  if (numeroLed < LED1 || numeroLed > LED3) {
    return false;
  }

  // U3/E3 tiene prioridad sobre LED1.
  if (numeroLed == LED1 && _u3Activo) {
    return false;
  }

  return true;
}

void EduBoardUNO::_liberarPinCompartido(uint8_t pin) {
  digitalWrite(pin, LOW);
  pinMode(pin, INPUT);
}

void EduBoardUNO::moverMotor(MotorID motor, Direccion direccion, int velocidad) {
  int velAcotada = constrain(velocidad, 0, 100);
  int pwm = map(velAcotada, 0, 100, 0, 255);

  uint8_t in1 = (direccion == ADELANTE) ? HIGH : LOW;
  uint8_t in2 = (direccion == ADELANTE) ? LOW : HIGH;

  if (motor == MA || motor == AMBOS) {
    digitalWrite(PIN_MA1, in1);
    digitalWrite(PIN_MA2, in2);
    analogWrite(PIN_PWMA, pwm);
  }
  if (motor == MB || motor == AMBOS) {
    digitalWrite(PIN_MB1, in1);
    digitalWrite(PIN_MB2, in2);
    analogWrite(PIN_PWMB, pwm);
  }
}

void EduBoardUNO::frenarMotor(MotorID motor) {
  if (motor == MA || motor == AMBOS) {
    digitalWrite(PIN_MA1, HIGH);
    digitalWrite(PIN_MA2, HIGH);
    analogWrite(PIN_PWMA, 255);
  }
  if (motor == MB || motor == AMBOS) {
    digitalWrite(PIN_MB1, HIGH);
    digitalWrite(PIN_MB2, HIGH);
    analogWrite(PIN_PWMB, 255);
  }
}

void EduBoardUNO::apagarMotor(MotorID motor) {
  if (motor == MA || motor == AMBOS) {
    digitalWrite(PIN_MA1, LOW);
    digitalWrite(PIN_MA2, LOW);
    analogWrite(PIN_PWMA, 0);
  }
  if (motor == MB || motor == AMBOS) {
    digitalWrite(PIN_MB1, LOW);
    digitalWrite(PIN_MB2, LOW);
    analogWrite(PIN_PWMB, 0);
  }
}

bool EduBoardUNO::fijarLed(uint8_t numeroLed, EstadoLED estado) {
  if (!_ledDisponible(numeroLed)) {
    return false;
  }

  uint8_t pin = PINS_LED[numeroLed - 1];
  pinMode(pin, OUTPUT);
  digitalWrite(pin, (estado == ENCENDIDO) ? HIGH : LOW);
  return true;
}

bool EduBoardUNO::botonPresionado() {
  pinMode(PIN_BOTON, INPUT);
  return digitalRead(PIN_BOTON) == HIGH;
}

void EduBoardUNO::esperarBoton() {
  pinMode(PIN_BOTON, INPUT);
  while (digitalRead(PIN_BOTON) == LOW) {
    delay(5);
  }
  delay(20);
  while (digitalRead(PIN_BOTON) == HIGH) {
    delay(5);
  }
  delay(20);
}

bool EduBoardUNO::detectaLinea(uint8_t sensor, ColorLinea color) {
  if (!_sensorValido(sensor)) {
    return false;
  }

  pinMode(sensor, INPUT);
  int lectura = digitalRead(sensor);
  return (color == NEGRO) ? (lectura == HIGH) : (lectura == LOW);
}

bool EduBoardUNO::leerDigital(uint8_t sensor) {
  if (!_sensorValido(sensor)) {
    return false;
  }

  pinMode(sensor, INPUT);
  return digitalRead(sensor) == HIGH;
}

int EduBoardUNO::leerAnalogico(uint8_t sensor) {
  if (!_sensorValido(sensor)) {
    return 0;
  }

  pinMode(sensor, INPUT);
  return analogRead(sensor);
}

int EduBoardUNO::medirDistancia(uint8_t sensor, int rangoMaxCm) {
  if (!_ultrasonicoValido(sensor)) {
    return DISTANCIA_NO_DISPONIBLE;
  }

  rangoMaxCm = constrain(rangoMaxCm, 2, 400);

  // SERVO tiene prioridad sobre T3. Si el servo ya esta activo, U3 no puede
  // reclamar D13 y, por tanto, tampoco debe bloquear LED1/E3.
  if (sensor == U3 && _servoActivo) {
    return DISTANCIA_NO_DISPONIBLE;
  }

  uint8_t trig = (sensor == U1) ? 9 : (sensor == U2 ? 11 : 13);
  uint8_t echo = (sensor == U1) ? 10 : (sensor == U2 ? 12 : A0);

  if (sensor == U3) {
    // U3 logro reclamar sus dos recursos: desde aqui E3 tiene prioridad sobre LED1.
    _u3Activo = true;
    _liberarPinCompartido(A0);
  }

  pinMode(trig, OUTPUT);
  pinMode(echo, INPUT);

  digitalWrite(trig, LOW);
  delayMicroseconds(4);
  digitalWrite(trig, HIGH);
  delayMicroseconds(10);
  digitalWrite(trig, LOW);

  unsigned long timeoutUs = ((unsigned long)rangoMaxCm * 59UL) + 1500UL;
  unsigned long duracion = pulseIn(echo, HIGH, timeoutUs);

  // Sin eco dentro del rango no es un conflicto de hardware: se interpreta
  // como "igual o mas lejos que el rango maximo" para mantener una lectura util.
  if (duracion == 0) {
    return rangoMaxCm;
  }

  int distCalculada = (int)((duracion * 343UL) / 20000UL);

  if (distCalculada <= 0 || distCalculada > rangoMaxCm) {
    return rangoMaxCm;
  }

  return distCalculada;
}

bool EduBoardUNO::detectaObjeto(uint8_t sensor, char comparacion, int limiteCm, int rangoMaxCm) {
  rangoMaxCm = constrain(rangoMaxCm, 2, 400);
  limiteCm = constrain(limiteCm, 1, rangoMaxCm);
  int lectura = medirDistancia(sensor, rangoMaxCm);

  if (lectura == DISTANCIA_NO_DISPONIBLE) {
    return false;
  }

  if (comparacion == '<') {
    return lectura < limiteCm;
  }

  if (comparacion == '>') {
    return lectura > limiteCm;
  }

  return false;
}

bool EduBoardUNO::girarServo(int angulo) {
  // SERVO tiene prioridad sobre T3. Si U3 habia sido utilizado antes, el servo
  // lo invalida y libera E3 para que LED1 pueda volver a utilizarse.
  if (_u3Activo) {
    _u3Activo = false;
    _liberarPinCompartido(A0);
  }

  if (!_servoActivo) {
    _miServo.attach(PIN_SERVO);
    _servoActivo = true;
  }

  int a = constrain(angulo, 0, 180);
  _miServo.write(a);
  return true;
}

void EduBoardUNO::_tonoSoftware(int frecuenciaHz, unsigned long duracionMs, uint8_t pinBuzzer) {
  if (frecuenciaHz <= 0 || duracionMs == 0) {
    return;
  }

  unsigned long periodoUs = 1000000UL / (unsigned long)frecuenciaHz;
  if (periodoUs < 2) {
    periodoUs = 2;
  }
  unsigned long medioPeriodoUs = periodoUs / 2UL;
  unsigned long ciclos = ((unsigned long)frecuenciaHz * duracionMs) / 1000UL;

  pinMode(pinBuzzer, OUTPUT);
  for (unsigned long i = 0; i < ciclos; i++) {
    digitalWrite(pinBuzzer, HIGH);
    delayMicroseconds(medioPeriodoUs);
    digitalWrite(pinBuzzer, LOW);
    delayMicroseconds(medioPeriodoUs);
  }
  digitalWrite(pinBuzzer, LOW);
}

void EduBoardUNO::tocarTono(int frecuenciaHz, int duracionMs, uint8_t pinBuzzer) {
  if (!_sensorValido(pinBuzzer)) {
    return;
  }

  int duracion = max(duracionMs, 0);
  _tonoSoftware(frecuenciaHz, (unsigned long)duracion, pinBuzzer);

  // Los conectores S1-S3 vuelven a quedar listos como entradas al terminar.
  _liberarPinCompartido(pinBuzzer);
}

void EduBoardUNO::tocarNota(NotasMusicales notaMusical, int duracionMs, uint8_t pinBuzzer) {
  tocarTono((int)notaMusical, duracionMs, pinBuzzer);
}

void EduBoardUNO::detenerSonido(uint8_t pinBuzzer) {
  if (!_sensorValido(pinBuzzer)) {
    return;
  }

  // Compatibilidad defensiva: si otro codigo uso tone(), tambien lo detenemos.
  noTone(pinBuzzer);
  _liberarPinCompartido(pinBuzzer);
}

void EduBoardUNO::configurarSerial(unsigned long baudios) {
  if (baudios == 0) {
    return;
  }

  // Esperamos a que termine cualquier envio pendiente antes de cambiar la
  // velocidad. Solo se reinicia Serial; el estado del resto de la EduBoard se
  // conserva sin cambios.
  Serial.flush();
  Serial.end();
  Serial.begin(baudios);
}

char EduBoardUNO::leerComandoBluetooth() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c > 32 && c <= 126) {
      COMANDO = c;
      return c;
    }
  }

  return '\0';
}

bool EduBoardUNO::leerBluetooth() {
  bool recibido = false;

  while (Serial.available() > 0) {
    char c = leerComandoBluetooth();
    if (c != '\0') {
      recibido = true;
    }
  }

  return recibido;
}

char EduBoardUNO::comandoBluetooth() const {
  return COMANDO;
}

bool EduBoardUNO::comandoEs(char comando) const {
  return COMANDO == comando;
}

bool EduBoardUNO::comandoEs(const String &comando) const {
  // mBlock puede entregar el argumento como texto. Buscamos el primer caracter
  // visible para aceptar valores como "F" sin perder la API original de char.
  for (unsigned int i = 0; i < comando.length(); i++) {
    char c = comando.charAt(i);
    if (c > 32 && c <= 126) {
      return COMANDO == c;
    }
  }

  return false;
}

// Compatibilidad con los nombres publicos de EduWit 1.1.1.
void EduBoardUNO::mover(MotorID motor, Direccion direccion, int velocidad) {
  moverMotor(motor, direccion, velocidad);
}

void EduBoardUNO::frenar(MotorID motor) {
  frenarMotor(motor);
}

void EduBoardUNO::apagar(MotorID motor) {
  apagarMotor(motor);
}

bool EduBoardUNO::boton() {
  return botonPresionado();
}

bool EduBoardUNO::linea(uint8_t sensor, ColorLinea color) {
  return detectaLinea(sensor, color);
}

int EduBoardUNO::distancia(uint8_t sensor, int rangoMaxCm) {
  return medirDistancia(sensor, rangoMaxCm);
}

bool EduBoardUNO::detectaObjeto(uint8_t sensor, Proximidad proximidad, int limiteCm, int rangoMaxCm) {
  rangoMaxCm = constrain(rangoMaxCm, 2, 400);
  limiteCm = constrain(limiteCm, 1, rangoMaxCm);
  int lectura = medirDistancia(sensor, rangoMaxCm);

  if (lectura == DISTANCIA_NO_DISPONIBLE) {
    return false;
  }

  return (proximidad == CERCA) ? (lectura <= limiteCm) : (lectura > limiteCm);
}

bool EduBoardUNO::led(uint8_t numeroLed, EstadoLED estado) {
  return fijarLed(numeroLed, estado);
}

bool EduBoardUNO::servo(int angulo) {
  return girarServo(angulo);
}

void EduBoardUNO::tono(int frecuenciaHz, int duracionMs, uint8_t pinBuzzer) {
  tocarTono(frecuenciaHz, duracionMs, pinBuzzer);
}

void EduBoardUNO::nota(NotasMusicales notaMusical, int duracionMs, uint8_t pinBuzzer) {
  tocarNota(notaMusical, duracionMs, pinBuzzer);
}

void EduBoardUNO::detenerTono(uint8_t pinBuzzer) {
  detenerSonido(pinBuzzer);
}
