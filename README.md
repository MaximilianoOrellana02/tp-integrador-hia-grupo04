# MaxFlix

Aplicación web de catálogo de películas y series con cuentas y perfiles. Es un cliente genérico del
protocolo de addons de Stremio: no incluye addons de terceros ni claves.

| Parte | Tecnología |
| --- | --- |
| `frontend` | Angular (y nginx en Docker) |
| `backend` | Node.js, Express y Sequelize |
| Base de datos | PostgreSQL |

## Requisitos

- [Node.js](https://nodejs.org) 24
- [PostgreSQL](https://www.postgresql.org/download/) (probado con la 17)
- Un token de lectura de la API de [TMDB](https://www.themoviedb.org/settings/api) (gratis, con cuenta)

## Cómo levantarlo (sin Docker)

1. **Base de datos.** Crear una base vacía, por ejemplo `maxflix`:

   ```bash
   createdb -U postgres maxflix
   ```

   (o desde pgAdmin: *Create → Database*).

2. **Variables del backend.** Copiar `backend/.env.example` a `backend/.env` y completarlo:

   ```env
   PORT=3000
   DATABASE_URL=postgres://postgres:TU_CONTRASEÑA@localhost:5432/maxflix
   JWT_SECRETO=<cadena larga al azar>
   JWT_EXPIRACION=1d
   REGISTRO_HABILITADO=true
   ADDONS_CLAVE=<64 caracteres hexadecimales>
   TMDB_TOKEN=<token de lectura de TMDB>
   PROXIES_CONFIABLES=0
   ```

   `JWT_SECRETO` y `ADDONS_CLAVE` se pueden generar con:

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

   El archivo `.env` no se sube a Git.

3. **Backend.** En una terminal:

   ```bash
   cd backend
   npm install
   npm start
   ```

   `npm start` corre las migraciones (crea las tablas) y deja el servidor en
   http://localhost:3000. Para ver que anda: http://localhost:3000/api/health.

4. **Frontend.** En otra terminal:

   ```bash
   cd frontend
   npm install
   npm start
   ```

   Abre http://localhost:4200. El servidor de desarrollo manda lo que empieza con `/api` al backend
   (`frontend/proxy.conf.json`).

5. **Primera cuenta.** Con `REGISTRO_HABILITADO=true`, se crea desde la pantalla de bienvenida
   («Crear cuenta»). También se puede crear por terminal (pide la contraseña sin mostrarla):

   ```bash
   cd backend
   npm run crear-cuenta -- correo@ejemplo.com "Nombre"
   ```

   Para darle permisos de administración (pantallas *Usuarios* y *Avatares*):

   ```bash
   npm run hacer-admin -- correo@ejemplo.com
   ```

## Cómo levantarlo con Docker

1. Copiar `.env.example` a `.env` y completar los valores.
2. Ejecutar `docker compose up --build -d`.
3. Abrir http://localhost:8080.

La base de datos no publica puertos hacia afuera. El backend corre las migraciones al arrancar.

## Addons

Cada cuenta carga sus addons en Ajustes, pegando la dirección del `manifest.json`. La app trae un
addon propio de películas con licencia libre. Las URL se guardan cifradas con `ADDONS_CLAVE`, el
backend hace los pedidos y bloquea las direcciones de redes privadas. Los subtítulos salen de
OpenSubtitles (incluido, sin clave) y de los addons que los ofrezcan. Se reproducen enlaces directos
o HLS que el navegador pueda abrir; los torrents sin enlace no se ofrecen.

## Problemas frecuentes

- **«Faltan variables de entorno» al arrancar el backend:** falta alguna de `backend/.env`
  (`DATABASE_URL`, `JWT_SECRETO`, `TMDB_TOKEN` o `ADDONS_CLAVE`).
- **No conecta con la base:** revisar que PostgreSQL esté corriendo y que el usuario, la contraseña
  y el nombre de la base de `DATABASE_URL` sean los correctos.
- **El frontend no carga datos:** el backend tiene que estar corriendo en el puerto 3000 antes de
  abrir http://localhost:4200.
- **Una animación «no se mueve»:** si el sistema tiene activada la opción de reducir movimiento, se
  respeta. Se cambia en Ajustes → Apariencia → Animaciones.

## Créditos

Este producto usa la API de TMDB, pero TMDB no lo avala ni lo certifica.
