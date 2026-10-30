import { Op } from "sequelize";
import { PeliculaTmdb } from "../models/PeliculaTmdb.js";
import { crearCache } from "../utils/cache.js";
import { tmdbGet } from "./tmdb.client.js";

const DIA = 24 * 60 * 60 * 1000;
// Pasado este tiempo se vuelve a pedir a TMDB (el póster o el título pueden cambiar)
const VIGENCIA_MS = 30 * DIA;
const cacheFichas = crearCache({ duracionMs: DIA, maximo: 500 });

/** Con la forma de un resultado de TMDB, así sirve igual que uno de un listado (`itemDe`). */
function comoResultado({ tmdbId, imdbId, titulo, poster, estreno }) {
  return { id: tmdbId, imdbId, title: titulo, poster_path: poster, release_date: estreno };
}

async function deLaBase(ids) {
  if (ids.length === 0) return [];
  try {
    return await PeliculaTmdb.findAll({
      where: { tmdbId: ids, updatedAt: { [Op.gt]: new Date(Date.now() - VIGENCIA_MS) } },
      raw: true,
    });
  } catch (error) {
    console.warn("Películas de TMDB: falló la base:", error.message);
    return [];
  }
}

/** Ficha de TMDB (con el ID de IMDb) reducida a lo del póster; null si no existe o falla. */
async function deTmdb(id) {
  try {
    const m = await tmdbGet(`/movie/${id}`, { append_to_response: "external_ids" });
    if (!m) return null;
    return {
      tmdbId: m.id,
      imdbId: m.external_ids?.imdb_id || null,
      titulo: m.title,
      poster: m.poster_path || null,
      estreno: m.release_date || null,
    };
  } catch {
    return null;
  }
}

/**
 * Datos del póster de estas películas de TMDB: memoria → base (una consulta) → TMDB.
 * Lo que llega de TMDB se guarda en la base sin esperar. Las que fallan no aparecen.
 *
 * @returns Map de id de TMDB → resultado con `id`, `imdbId`, `title`, `poster_path`, `release_date`
 */
export async function peliculasDeTmdb(ids) {
  const encontradas = new Map();
  for (const id of ids) {
    const guardada = cacheFichas.obtener(id);
    if (guardada) encontradas.set(id, guardada);
  }

  for (const fila of await deLaBase(ids.filter((id) => !encontradas.has(id)))) {
    encontradas.set(fila.tmdbId, comoResultado(fila));
  }

  const nuevas = (await Promise.all(ids.filter((id) => !encontradas.has(id)).map(deTmdb))).filter(Boolean);
  for (const fila of nuevas) encontradas.set(fila.tmdbId, comoResultado(fila));
  if (nuevas.length) {
    PeliculaTmdb.bulkCreate(nuevas, { updateOnDuplicate: ["imdbId", "titulo", "poster", "estreno", "updatedAt"] })
      .catch((error) => console.warn("Películas de TMDB: no se pudo guardar:", error.message));
  }

  for (const [id, resultado] of encontradas) cacheFichas.guardar(id, resultado);
  return encontradas;
}
