import { IdImdb } from "../models/IdImdb.js";
import { crearCache } from "../utils/cache.js";
import { tmdbGet } from "./tmdb.client.js";

// En memoria, para no ir a la base en cada pedido. Una semana: los que no tienen ID de
// IMDb (que no van a la base) se vuelven a preguntar a TMDB después de ese tiempo
const cacheImdb = crearCache({ duracionMs: 7 * 24 * 60 * 60 * 1000, maximo: 5000 });

/**
 * IDs de IMDb ya guardados en la base para estos títulos (una sola consulta). Si la base
 * falla, devuelve un Map vacío: se le pregunta a TMDB como antes.
 */
async function deLaBase(tipoTmdb, ids) {
  if (ids.length === 0) return new Map();
  try {
    const filas = await IdImdb.findAll({ where: { tipoTmdb, tmdbId: ids }, raw: true });
    return new Map(filas.map((f) => [f.tmdbId, f.imdbId]));
  } catch (error) {
    console.warn("IDs de IMDb: falló la base:", error.message);
    return new Map();
  }
}

/** Guarda en la base un ID nuevo. No se espera: si falla, el próximo arranque lo pide a TMDB. */
function guardarEnLaBase(tipoTmdb, tmdbId, imdbId) {
  IdImdb.bulkCreate([{ tipoTmdb, tmdbId, imdbId }], { ignoreDuplicates: true }).catch((error) =>
    console.warn("IDs de IMDb: no se pudo guardar:", error.message),
  );
}

/**
 * ID de IMDb de un título de TMDB: memoria → base → TMDB (un pedido por título).
 * La app abre todo por ID de IMDb, y TMDB no lo trae en listados ni créditos.
 * Si TMDB falla no se guarda nada: así un error pasajero no esconde el título por días.
 *
 * @param tipoTmdb "movie" o "tv"
 * @param mirarBase false si quien llama ya buscó en la base ([conImdb])
 */
export async function imdbDe(tipoTmdb, id, { mirarBase = true } = {}) {
  const clave = `${tipoTmdb}:${id}`;
  const guardado = cacheImdb.obtener(clave);
  if (guardado !== undefined) return guardado;

  if (mirarBase) {
    const enLaBase = (await deLaBase(tipoTmdb, [id])).get(id);
    if (enLaBase) {
      cacheImdb.guardar(clave, enLaBase);
      return enLaBase;
    }
  }

  try {
    const ids = await tmdbGet(`/${tipoTmdb}/${id}/external_ids`);
    const imdbId = ids?.imdb_id || null;
    cacheImdb.guardar(clave, imdbId);
    if (imdbId) guardarEnLaBase(tipoTmdb, id, imdbId);
    return imdbId;
  } catch {
    return null;
  }
}

/**
 * Le agrega el `imdbId` a cada resultado de TMDB y descarta los que no lo tienen.
 * Los que no están en memoria se buscan juntos en la base (una consulta por tipo) y solo
 * los que faltan van a TMDB.
 */
export async function conImdb(resultados, tipoTmdb) {
  const tipoDe = (r) => r.media_type ?? tipoTmdb;

  const faltantes = new Map(); // tipo → ids que no están en memoria
  for (const r of resultados) {
    if (cacheImdb.obtener(`${tipoDe(r)}:${r.id}`) !== undefined) continue;
    if (!faltantes.has(tipoDe(r))) faltantes.set(tipoDe(r), new Set());
    faltantes.get(tipoDe(r)).add(r.id);
  }
  await Promise.all(
    [...faltantes].map(async ([tipo, ids]) => {
      for (const [tmdbId, imdbId] of await deLaBase(tipo, [...ids])) {
        cacheImdb.guardar(`${tipo}:${tmdbId}`, imdbId);
      }
    }),
  );

  const conIds = await Promise.all(
    resultados.map(async (r) => ({ r, imdbId: await imdbDe(tipoDe(r), r.id, { mirarBase: false }) })),
  );
  return conIds.filter(({ imdbId }) => imdbId);
}
