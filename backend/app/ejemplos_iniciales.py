# Ejemplos precargados (como los de Arduino IDE). Se insertan solo cuando la tabla de ejemplos está vacía;
# después los administradores los agregan, reemplazan o eliminan desde el editor.
# board: "MicroPython" (ESP32) o "Arduino C" (Arduino Uno), igual que los programas guardados.

MP = "MicroPython"
AC = "Arduino C"

EJEMPLOS_INICIALES = [
    # ---------------------------------------------------------------- Arduino C
    {
        "board": AC, "categoria": "01. Básicos", "nombre": "Blink",
        "descripcion": "Enciende y apaga el LED integrado (pin 13) cada segundo.",
        "contenido": """// Blink: enciende y apaga el LED integrado cada segundo.

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);  // el pin del LED es una salida
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);  // enciende el LED
  delay(1000);                      // espera 1 segundo
  digitalWrite(LED_BUILTIN, LOW);   // apaga el LED
  delay(1000);
}
""",
    },
    {
        "board": AC, "categoria": "01. Básicos", "nombre": "Hola Monitor Serial",
        "descripcion": "Envía un mensaje y un contador al Monitor Serial a 115200 baudios.",
        "contenido": """// Envía un contador al Monitor Serial (115200 baudios).

int contador = 0;

void setup() {
  Serial.begin(115200);
  Serial.println("Hola desde Arduino");
}

void loop() {
  Serial.print("Contador: ");
  Serial.println(contador);
  contador++;
  delay(1000);
}
""",
    },
    {
        "board": AC, "categoria": "02. Digital", "nombre": "Botón y LED",
        "descripcion": "Enciende el LED integrado mientras se presiona un botón en el pin 2 (a GND).",
        "contenido": """// Botón en el pin 2 conectado a GND. Usa la resistencia interna (INPUT_PULLUP).

const int BOTON = 2;

void setup() {
  pinMode(BOTON, INPUT_PULLUP);
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  // Con INPUT_PULLUP el botón presionado se lee como LOW.
  if (digitalRead(BOTON) == LOW) {
    digitalWrite(LED_BUILTIN, HIGH);
  } else {
    digitalWrite(LED_BUILTIN, LOW);
  }
}
""",
    },
    {
        "board": AC, "categoria": "02. Digital", "nombre": "Semáforo",
        "descripcion": "LEDs rojo, amarillo y verde en los pines 10, 9 y 8.",
        "contenido": """// Semáforo con tres LEDs (con su resistencia) en los pines 10, 9 y 8.

const int ROJO = 10;
const int AMARILLO = 9;
const int VERDE = 8;

void setup() {
  pinMode(ROJO, OUTPUT);
  pinMode(AMARILLO, OUTPUT);
  pinMode(VERDE, OUTPUT);
}

void encender(int pin, int tiempo) {
  digitalWrite(pin, HIGH);
  delay(tiempo);
  digitalWrite(pin, LOW);
}

void loop() {
  encender(VERDE, 3000);
  encender(AMARILLO, 1000);
  encender(ROJO, 3000);
}
""",
    },
    {
        "board": AC, "categoria": "03. Analógico", "nombre": "Leer potenciómetro",
        "descripcion": "Lee un potenciómetro en A0 y muestra el valor (0 a 1023) en el Monitor Serial.",
        "contenido": """// Potenciómetro: extremos a 5V y GND, pin central a A0.

void setup() {
  Serial.begin(115200);
}

void loop() {
  int valor = analogRead(A0);                    // 0 a 1023
  float voltaje = valor * (5.0 / 1023.0);        // convierte a volts
  Serial.print("Valor: ");
  Serial.print(valor);
  Serial.print("  Voltaje: ");
  Serial.println(voltaje);
  delay(200);
}
""",
    },
    {
        "board": AC, "categoria": "03. Analógico", "nombre": "Fade (PWM)",
        "descripcion": "Aumenta y disminuye el brillo de un LED en el pin 9 con analogWrite.",
        "contenido": """// Fade: el LED del pin 9 (PWM) sube y baja de brillo.

const int LED = 9;
int brillo = 0;
int paso = 5;

void setup() {
  pinMode(LED, OUTPUT);
}

void loop() {
  analogWrite(LED, brillo);  // 0 a 255
  brillo = brillo + paso;
  if (brillo <= 0 || brillo >= 255) {
    paso = -paso;            // cambia de dirección en los extremos
  }
  delay(30);
}
""",
    },
    {
        "board": AC, "categoria": "04. Sensores", "nombre": "Sensor ultrasónico HC-SR04",
        "descripcion": "Mide la distancia en centímetros. TRIG en el pin 9 y ECHO en el pin 10.",
        "contenido": """// Sensor ultrasónico HC-SR04: VCC a 5V, GND a GND, TRIG al pin 9, ECHO al pin 10.

const int TRIG = 9;
const int ECHO = 10;

void setup() {
  Serial.begin(115200);
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
}

void loop() {
  // Pulso de 10 microsegundos para iniciar la medición.
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);

  long duracion = pulseIn(ECHO, HIGH);   // tiempo de ida y vuelta en microsegundos
  float distancia = duracion * 0.0343 / 2;

  Serial.print("Distancia: ");
  Serial.print(distancia);
  Serial.println(" cm");
  delay(300);
}
""",
    },
    {
        "board": AC, "categoria": "05. Motores", "nombre": "Motor DC con puente H",
        "descripcion": "Controla dirección y velocidad de un motor con un driver tipo L298N o TB6612.",
        "contenido": """// Motor DC con puente H: IN1 al pin 7, IN2 al pin 8, ENA (velocidad) al pin 5 (PWM).

const int IN1 = 7;
const int IN2 = 8;
const int ENA = 5;

void setup() {
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(ENA, OUTPUT);
}

// -- CONTROL DEL MOTOR -- //
void motor(int a, int b, int velocidad) {
  digitalWrite(IN1, a);
  digitalWrite(IN2, b);
  analogWrite(ENA, velocidad);  // 0 a 255
}

void loop() {
  motor(HIGH, LOW, 200);  // adelante
  delay(2000);
  motor(LOW, LOW, 0);     // alto
  delay(1000);
  motor(LOW, HIGH, 200);  // atrás
  delay(2000);
  motor(LOW, LOW, 0);
  delay(1000);
}
""",
    },
    # ---------------------------------------------------------------- MicroPython (ESP32)
    {
        "board": MP, "categoria": "01. Básicos", "nombre": "Blink",
        "descripcion": "Enciende y apaga el LED integrado del ESP32 (pin 2) cada segundo.",
        "contenido": """# Blink: enciende y apaga el LED integrado (pin 2) cada segundo.
from machine import Pin
import time

led = Pin(2, Pin.OUT)

while True:
    led.value(1)   # enciende
    time.sleep(1)
    led.value(0)   # apaga
    time.sleep(1)
""",
    },
    {
        "board": MP, "categoria": "01. Básicos", "nombre": "Hola Monitor Serial",
        "descripcion": "Imprime un contador en el Monitor Serial cada segundo.",
        "contenido": """# Imprime un contador en el Monitor Serial.
import time

contador = 0
print("Hola desde MicroPython")

while True:
    print("Contador:", contador)
    contador += 1
    time.sleep(1)
""",
    },
    {
        "board": MP, "categoria": "02. Digital", "nombre": "Botón y LED",
        "descripcion": "Enciende el LED integrado mientras se presiona un botón en el pin 4 (a GND).",
        "contenido": """# Botón en el pin 4 conectado a GND, con la resistencia interna (PULL_UP).
from machine import Pin
import time

boton = Pin(4, Pin.IN, Pin.PULL_UP)
led = Pin(2, Pin.OUT)

while True:
    # Con PULL_UP el botón presionado se lee como 0.
    if boton.value() == 0:
        led.value(1)
    else:
        led.value(0)
    time.sleep_ms(20)
""",
    },
    {
        "board": MP, "categoria": "02. Digital", "nombre": "Semáforo",
        "descripcion": "LEDs rojo, amarillo y verde en los pines 25, 26 y 27.",
        "contenido": """# Semáforo con tres LEDs (con su resistencia) en los pines 25, 26 y 27.
from machine import Pin
import time

rojo = Pin(25, Pin.OUT)
amarillo = Pin(26, Pin.OUT)
verde = Pin(27, Pin.OUT)

def encender(led, segundos):
    led.value(1)
    time.sleep(segundos)
    led.value(0)

while True:
    encender(verde, 3)
    encender(amarillo, 1)
    encender(rojo, 3)
""",
    },
    {
        "board": MP, "categoria": "03. Analógico", "nombre": "Leer potenciómetro",
        "descripcion": "Lee un potenciómetro en el pin 34 (ADC) y muestra el valor de 0 a 4095.",
        "contenido": """# Potenciómetro: extremos a 3.3V y GND, pin central al pin 34.
from machine import Pin, ADC
import time

pot = ADC(Pin(34))
pot.atten(ADC.ATTN_11DB)   # rango completo de 0 a 3.3V

while True:
    valor = pot.read()      # 0 a 4095
    voltaje = valor * 3.3 / 4095
    print("Valor:", valor, " Voltaje:", round(voltaje, 2))
    time.sleep_ms(200)
""",
    },
    {
        "board": MP, "categoria": "03. Analógico", "nombre": "Fade (PWM)",
        "descripcion": "Aumenta y disminuye el brillo del LED integrado con PWM.",
        "contenido": """# Fade: el LED integrado sube y baja de brillo con PWM.
from machine import Pin, PWM
import time

led = PWM(Pin(2), freq=1000)

while True:
    for brillo in range(0, 1024, 8):        # sube
        led.duty(brillo)
        time.sleep_ms(10)
    for brillo in range(1023, -1, -8):      # baja
        led.duty(brillo)
        time.sleep_ms(10)
""",
    },
    {
        "board": MP, "categoria": "04. Sensores", "nombre": "Sensor ultrasónico HC-SR04",
        "descripcion": "Mide la distancia en centímetros. TRIG en el pin 5 y ECHO en el pin 18.",
        "contenido": """# Sensor ultrasónico HC-SR04: TRIG al pin 5, ECHO al pin 18.
# El ECHO entrega 5V: usa un divisor de voltaje para bajarlo a 3.3V.
from machine import Pin, time_pulse_us
import time

trig = Pin(5, Pin.OUT)
echo = Pin(18, Pin.IN)

def distancia_cm():
    trig.value(0)
    time.sleep_us(2)
    trig.value(1)
    time.sleep_us(10)     # pulso de 10 microsegundos
    trig.value(0)
    duracion = time_pulse_us(echo, 1, 30000)
    if duracion < 0:
        return None       # sin eco (fuera de rango)
    return duracion * 0.0343 / 2

while True:
    d = distancia_cm()
    print("Distancia:", "fuera de rango" if d is None else "%.1f cm" % d)
    time.sleep_ms(300)
""",
    },
    {
        "board": MP, "categoria": "05. Motores", "nombre": "Servomotor",
        "descripcion": "Mueve un servo en el pin 13 de 0 a 180 grados y de regreso.",
        "contenido": """# Servomotor: señal al pin 13, alimentación a 5V y GND.
from machine import Pin, PWM
import time

servo = PWM(Pin(13), freq=50)

def angulo(grados):
    # 0 grados = pulso de 0.5 ms, 180 grados = 2.5 ms (periodo de 20 ms).
    pulso_us = 500 + grados * 2000 // 180
    servo.duty(pulso_us * 1023 // 20000)

while True:
    for g in range(0, 181, 5):
        angulo(g)
        time.sleep_ms(30)
    for g in range(180, -1, -5):
        angulo(g)
        time.sleep_ms(30)
""",
    },
]
