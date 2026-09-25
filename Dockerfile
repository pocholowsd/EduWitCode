# syntax=docker/dockerfile:1.7
#
# Imagen unica: frontend (Vite build servido por nginx) + backend FastAPI
# (uvicorn) + arduino-cli con el core AVR para /api/compile.
#
#   docker build -t componentes-ems .
#   docker run -d --name componentes-ems -p 80:80 --restart unless-stopped componentes-ems
#
# nginx escucha en el puerto 80, sirve el frontend y hace proxy de /api al
# backend (127.0.0.1:8000 dentro del contenedor). Al ser el mismo origen no
# hace falta VITE_API_BASE_URL ni configurar CORS.

# ---------- 1) Build del frontend ----------
FROM node:22-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
COPY patches ./patches
RUN npm ci
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

# ---------- 2) Runtime: nginx + FastAPI + arduino-cli ----------
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
 && apt-get install -y --no-install-recommends nginx curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# arduino-cli + core AVR (Arduino Uno)
RUN curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh \
      | BINDIR=/usr/local/bin sh \
 && arduino-cli core update-index \
 && arduino-cli core install arduino:avr

WORKDIR /srv/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY backend/firmware ./firmware

COPY --from=web /app/dist /usr/share/nginx/html

RUN rm -f /etc/nginx/sites-enabled/default
COPY <<'EOF' /etc/nginx/conf.d/app.conf
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;
    client_max_body_size 20m;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

COPY <<'EOF' /start.sh
#!/bin/sh
set -e
uvicorn app.main:app --host 127.0.0.1 --port 8000 --app-dir /srv/backend &
exec nginx -g 'daemon off;'
EOF
RUN chmod +x /start.sh

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD curl -fs http://127.0.0.1/api/health || exit 1

CMD ["/start.sh"]
