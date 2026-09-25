# componentesEMS

Editor de código web + monitor serie para programar placas Arduino Uno
(C++) y ESP32 (MicroPython) desde el navegador, con un backend FastAPI
reducido que solo compila y sirve archivos — nunca toca el puerto USB.

## Estructura

```
componentesEMS/
├── src/                          # Frontend (Vite + React)
│   ├── components/ea-editor/     # Editor + monitor serie (un solo componente)
│   └── api/
│       ├── client.js             # API_BASE
│       ├── webSerial.js          # navigator.serial con fallback a WebUSB (polyfill)
│       ├── cp210xWebUsb.js       # Driver WebUSB para chips USB-serie CP210x (Silicon Labs)
│       ├── stk500.js             # Flasheo STK500v1 (Arduino Uno) vía Web Serial
│       └── esp32MicroPython.js   # Flasheo de firmware (esptool-js) + raw REPL (ESP32)
├── patches/                      # Parche de web-serial-polyfill (se aplica solo en npm install)
├── Dockerfile                    # Imagen de producción (frontend + backend + arduino-cli)
└── backend/                      # Backend FastAPI reducido
    ├── firmware/                 # .bin de MicroPython (ESP32/S3/C3), servidos como estáticos
    └── app/
        ├── main.py               # /api/health, /api/firmware/*
        └── routers/
            ├── compiler.py       # /api/compile — compila un sketch Arduino, devuelve el .hex
            └── esp32.py          # /api/esp32-firmware — mapa chip → firmware
```

**El backend nunca toca el puerto USB de la placa.** Está pensado para
desplegarse en un servidor remoto, separado de la PC del usuario donde
está conectada la placa. Todo lo que necesita acceso físico al puerto
serie se hace en el navegador vía Web Serial:

- **Arduino Uno**: el backend solo compila (`/api/compile`) y devuelve un
  `.hex`; el navegador lo flashea con el protocolo STK500v1 (`stk500.js`).
- **ESP32**: el backend solo expone `/api/esp32-firmware` (mapa chip →
  URL del `.bin` de MicroPython) y sirve esos `.bin` como archivos
  estáticos. El navegador detecta el chip, graba el firmware si hace
  falta (con `esptool-js`) y copia el código como `main.py` por el
  protocolo raw REPL de MicroPython (`esp32MicroPython.js`). Si la placa
  nunca tuvo MicroPython (de fábrica), se prepara sola en el primer
  "Subir", sin pasos manuales.

## Requisitos

- Node.js (para el frontend).
- Python 3.10+ (para el backend).
- [`arduino-cli`](https://arduino.github.io/arduino-cli/) instalado y en el
  PATH del sistema, con el core de Arduino AVR instalado. Solo lo usa el
  flujo de **Arduino Uno** (compilar); el ESP32 no depende de ninguna
  herramienta de sistema en el backend.
- Placa Arduino/ESP32 conectada por USB, y un navegador con Web Serial API
  (Chrome/Edge) o WebUSB en Android.

## Cómo correrlo

```bash
npm install
./backend/.venv/Scripts/pip install -r backend/requirements.txt   # una sola vez (crea antes el venv: python -m venv backend/.venv)
npm run dev
```

`npm run dev` levanta frontend y backend juntos en una sola terminal (con
[`concurrently`](https://www.npmjs.com/package/concurrently)). Si preferís
verlos por separado, `npm run dev:web` y `npm run dev:api` corren cada uno
solo.

Abre la URL que imprime Vite (por defecto `http://localhost:5173`). El
proxy de `/api` hacia `http://127.0.0.1:8000` ya está configurado en
`vite.config.js`.

La carpeta `patches/` contiene un parche para `web-serial-polyfill` que
[`patch-package`](https://www.npmjs.com/package/patch-package) aplica
automáticamente al hacer `npm install` (script `postinstall`). No hay que
borrarla.

## Despliegue con Docker

El `Dockerfile` genera una sola imagen con todo lo necesario:

- el frontend compilado con Vite, servido por nginx en el puerto 80;
- el backend FastAPI (uvicorn), al que nginx redirige todo `/api`;
- `arduino-cli` con el core `arduino:avr` ya instalado (para `/api/compile`);
- los `.bin` de MicroPython de `backend/firmware/`.

Como frontend y API salen del mismo origen, no hace falta definir
`VITE_API_BASE_URL` ni configurar CORS.

```bash
docker build -t componentes-ems .
docker run -d --name componentes-ems -p 80:80 --restart unless-stopped componentes-ems
```

Si el puerto 80 ya está ocupado en el servidor (o hay otro proxy delante),
mapear a otro puerto, por ejemplo `-p 8080:80`. La salud del contenedor se
puede comprobar en `/api/health`.

**Importante:** Web Serial solo funciona en contextos seguros, así que en
producción la app debe servirse por **HTTPS** (por ejemplo con un proxy
inverso o balanceador delante del contenedor); por HTTP plano el navegador
no dejará conectar la placa (salvo en `localhost`).
