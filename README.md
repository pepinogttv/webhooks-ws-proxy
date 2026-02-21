# Webhooks WS Proxy

Proxy bidireccional de webhooks a traves de WebSockets. Recibe webhooks HTTP en un servidor remoto y los reenvia en tiempo real a servicios locales mediante Socket.IO, preservando headers, body y query params de la solicitud original.

```
Servicio externo (ej. MercadoPago, Stripe)
        |
        | POST /webhooks/mercadopago/notifications
        v
 +-----------------+         Socket.IO          +------------------+
 |     Server      | =========================> |     Client       |
 |  (Dokploy/VPS)  |    raw body + headers      |  (tu maquina)    |
 |   puerto 3000   |                            |   puerto 3001    |
 +-----------------+                            +------------------+
                                                        |
                                                        | POST (solicitud replicada)
                                                        v
                                                 Servicio local
                                              (localhost:8080/api/...)
```

## Caracteristicas

- **Forwarding fiel** - Preserva el body crudo (JSON, XML, binario, form-data), headers originales, query params y metodo HTTP
- **CRUD de endpoints** - Crea, edita y elimina webhooks desde el dashboard del server
- **Mapeo por endpoint** - Cada webhook se reenvia a una URL local diferente, configurable desde la UI del client
- **Autenticacion** - API Secret compartido para Socket.IO, dashboards y API REST
- **Dashboards** - UI con Tailwind CSS para server (sky blue) y client (emerald green)
- **Dockerizado** - Docker Compose para deploy en Dokploy (server) y Docker Desktop (client)
- **Reconexion automatica** - El client se reconecta al server si pierde la conexion
- **Actualizacion en vivo** - Los endpoints creados en el server se propagan automaticamente al client

## Requisitos

- Node.js 18+
- Docker (opcional, para produccion)

## Inicio rapido

### 1. Clonar y configurar

```bash
git clone https://github.com/tu-usuario/webhooks-ws-proxy.git
cd webhooks-ws-proxy
```

Crear `.env` en cada subproyecto:

**`socket-proxy-server/.env`**
```env
API_SECRET=un-secreto-seguro-compartido
PORT=3000
```

**`socket-proxy-client/.env`**
```env
API_SECRET=un-secreto-seguro-compartido
SERVER_URL=http://localhost:3000
CLIENT_PORT=3001
```

### 2. Instalar dependencias

```bash
cd socket-proxy-server && npm install
cd ../socket-proxy-client && npm install
```

### 3. Ejecutar en desarrollo

En dos terminales:

```bash
# Terminal 1 - Server
cd socket-proxy-server
npm run dev
```

```bash
# Terminal 2 - Client
cd socket-proxy-client
npm run dev
```

### 4. Configurar

1. Abrir el dashboard del **server** en `http://localhost:3000` e ingresar el API Secret
2. Crear un endpoint (ej. path: `/mercadopago/notifications`, method: `POST`, key: `mp-notif`)
3. Abrir la UI del **client** en `http://localhost:3001` e ingresar el API Secret
4. Configurar la URL local de destino para el endpoint (ej. `http://localhost:8080/api/webhooks/mp`)
5. Los webhooks enviados a `http://localhost:3000/webhooks/mercadopago/notifications` se reenviaran a `http://localhost:8080/api/webhooks/mp`

### 5. Probar

```bash
curl -X POST http://localhost:3000/webhooks/mercadopago/notifications \
  -H "Content-Type: application/json" \
  -d '{"type":"payment","data":{"id":"12345"}}'
```

## Deploy con Docker

### Server (Dokploy / VPS)

```bash
docker compose up -d
```

Usa `docker-compose.yml`. El server corre en el puerto 3000. Los endpoints se persisten en un Docker volume.

### Client (Docker Desktop local)

Crear `.env` en la raiz con:

```env
SERVER_URL=https://tu-servidor.com
API_SECRET=el-mismo-secreto-del-server
```

```bash
docker compose -f docker-compose.local.yml up -d
```

El container `webhook-proxy-client` aparece en Docker Desktop para encenderlo/apagarlo. Usa `host.docker.internal` para acceder a servicios del host.

## Variables de entorno

| Variable | Donde | Requerida | Descripcion |
|---|---|---|---|
| `API_SECRET` | Server y Client | Si | Secret compartido para autenticacion |
| `PORT` | Server | No | Puerto del server (default: `3000`) |
| `SERVER_URL` | Client | Si | URL del server remoto |
| `CLIENT_PORT` | Client | No | Puerto de la UI del client (default: `3001`) |

## Estructura del proyecto

```
webhooks-ws-proxy/
├── docker-compose.yml            # Deploy server (Dokploy)
├── docker-compose.local.yml      # Deploy client (Docker Desktop)
├── .env.example
│
├── socket-proxy-server/
│   ├── Dockerfile
│   ├── index.js                  # Express + Socket.IO server
│   ├── auth.js                   # Middleware de autenticacion
│   ├── endpoints.js              # CRUD de endpoints (JSON file)
│   ├── views/
│   │   ├── dashboard.ejs         # Dashboard de administracion
│   │   └── login.ejs
│   └── data/
│       └── endpoints.json        # Endpoints registrados (runtime)
│
└── socket-proxy-client/
    ├── Dockerfile
    ├── index.js                  # Socket.IO client + forwarder
    ├── endpointsMap.js           # Mapeo webhook -> URL local
    ├── views/
    │   ├── index.ejs             # UI de configuracion
    │   └── login.ejs
    └── data/
        └── endpointsMap.json     # Mapeos guardados (runtime)
```

## API del Server

Todas las rutas `/api/*` requieren autenticacion via session o header `x-api-secret`.

| Metodo | Ruta | Descripcion |
|---|---|---|
| `GET` | `/api/endpoints` | Listar endpoints |
| `POST` | `/api/endpoints` | Crear endpoint (`{ path, method, key }`) |
| `PUT` | `/api/endpoints/:key` | Editar endpoint |
| `DELETE` | `/api/endpoints/:key` | Eliminar endpoint |
| `GET` | `/api/status` | Estado del server (clientes, actividad) |
| `GET` | `/endpoints` | Listar endpoints (publico, usado por clients) |

Los webhooks se reciben en `/webhooks{path}` segun los endpoints configurados.

## Como funciona el forwarding

1. Un servicio externo envia un HTTP request a `/webhooks/...` en el server
2. El server captura el **body crudo como bytes** (via `express.raw`), headers, query params y metodo HTTP
3. El body se codifica en **base64** y se emite via Socket.IO junto con todos los metadatos
4. El client decodifica el base64 de vuelta a bytes exactos
5. El client reenvia el request al servicio local usando **axios** con `transformRequest` para evitar cualquier modificacion del body
6. Headers hop-by-hop (`host`, `connection`, `content-length`, `transfer-encoding`) se remueven automaticamente

Esto garantiza que el servicio local recibe una solicitud practicamente identica a la original, sin importar el content-type (JSON, XML, form-data, binario, etc.).

## Tech Stack

- **Backend**: Node.js, Express.js
- **WebSockets**: Socket.IO v4
- **Templates**: EJS
- **Styling**: Tailwind CSS (CDN)
- **HTTP Client**: Axios
- **Containers**: Docker, Docker Compose

## Licencia

ISC
