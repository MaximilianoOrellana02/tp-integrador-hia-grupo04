# MaxFlix

Aplicación web de catálogo de películas y series con cuentas y perfiles. Es un cliente genérico del
protocolo de addons de Stremio: no incluye addons de terceros ni claves.

| Servicio | Tecnología |
| --- | --- |
| `frontend` | Angular y nginx |
| `backend` | Node.js, Express y Sequelize |
| `db` | PostgreSQL 17 |

## Cómo levantarlo

1. Copiar `.env.example` a `.env` y completar los valores.
2. Ejecutar `docker compose up --build -d`.
3. Abrir http://localhost:8080.

La base de datos no publica puertos hacia afuera. El backend corre las migraciones al arrancar.

## Addons

Cada cuenta carga sus addons en Ajustes, pegando la dirección del `manifest.json`. La app trae un
addon propio de películas con licencia libre. Las URL se guardan cifradas con `ADDONS_CLAVE`, el
backend hace los pedidos y bloquea las direcciones de redes privadas. Los subtítulos salen de OpenSubtitles (incluido, sin clave) y de los addons que los ofrezcan.
Se reproducen enlaces directos
o HLS que el navegador pueda abrir; los torrents sin enlace no se ofrecen.

## Créditos

Este producto usa la API de TMDB, pero TMDB no lo avala ni lo certifica.
