import { crearCache } from "../utils/cache.js";
import { ErrorHttp } from "../utils/ErrorHttp.js";
import { generosEnEspanol, tmdbGet } from "./tmdb.client.js";

/**
 * La ficha en español (2026-10-20, para la app del celular): Cinemeta solo tiene inglés, y
 * cuando la fila con que se abrió la ficha no trae la sinopsis (Top 10, «Seguir viendo»,
 * «Más como esta») se veía en inglés. TMDB la tiene en es-MX; si falta, en es-ES.
 */

const HORA = 60 * 60 * 1000;
const cacheTitulos = crearCache({ duracionMs: 24 * HORA, maximo: 500 });
const cacheTemporadas = crearCache({ duracionMs: 24 * HORA, maximo: 500 });
// El ID de TMDB de cada ID de IMDb no cambia: se guarda más tiempo
const cacheIds = crearCache({ duracionMs: 7 * 24 * HORA, maximo: 2000 });

/** La app usa sus propios tipos ("movie" / "series"); TMDB, "movie" / "tv". */
const TIPO_TMDB = { movie: "movie", series: "tv" };

// TMDB pone «Episodio 3» cuando no hay traducción del nombre: mejor el original (Cinemeta)
const NOMBRE_SIN_TRADUCIR = /^(episodio|episode|capítulo)\s+\d+$/i;

function validar(tipo, imdbId) {
  if (!TIPO_TMDB[tipo]) throw new ErrorHttp(400, 'El tipo debe ser "movie" o "series"');
  if (!/^tt\d{7,10}$/.test(imdbId ?? "")) throw new ErrorHttp(400, "ID de IMDb no válido");
}

/** El ID de TMDB a partir del de IMDb (null si TMDB no lo tiene). */
async function idTmdb(tipo, imdbId) {
  return cacheIds.obtenerOCalcular(`${tipo}:${imdbId}`, async () => {
    const encontrado = await tmdbGet(`/find/${imdbId}`, { external_source: "imdb_id" });
    const lista = tipo === "movie" ? encontrado?.movie_results : encontrado?.tv_results;
    return lista?.[0]?.id ?? null;
  });
}

/**
 * Nombre, sinopsis y géneros en español de una película o serie.
 * @returns `{ nombre, descripcion, generos }` (lo que no hay, null o vacío), o null si TMDB
 *   no conoce el título
 */
export async function tituloEnEspanol(tipo, imdbId) {
  validar(tipo, imdbId);
  return cacheTitulos.obtenerOCalcular(`${tipo}:${imdbId}`, async () => {
    const id = await idTmdb(tipo, imdbId);
    if (!id) return null;
    const detalle = await tmdbGet(`/${TIPO_TMDB[tipo]}/${id}`);
    if (!detalle) return null;
    let descripcion = detalle.overview?.trim() || null;
    if (!descripcion) {
      const espana = await tmdbGet(`/${TIPO_TMDB[tipo]}/${id}`, { language: "es-ES" });
      descripcion = espana?.overview?.trim() || null;
    }
    return {
      nombre: detalle.title ?? detalle.name ?? null,
      descripcion,
      generos: generosEnEspanol(detalle.genres),
    };
  });
}

/**
 * Los episodios de una temporada en español: `[{ numero, nombre, sinopsis }]`. Si un nombre
 * no está traducido (TMDB pone «Episodio 3»), va null y la app deja el de Cinemeta. Las
 * sinopsis que faltan en es-MX se completan con es-ES.
 */
export async function temporadaEnEspanol(imdbId, numero) {
  validar("series", imdbId);
  const temporada = Number(numero);
  if (!Number.isInteger(temporada) || temporada < 0 || temporada > 200) {
    throw new ErrorHttp(400, "Número de temporada no válido");
  }
  return cacheTemporadas.obtenerOCalcular(`${imdbId}:${temporada}`, async () => {
    const id = await idTmdb("series", imdbId);
    if (!id) return [];
    const latino = await tmdbGet(`/tv/${id}/season/${temporada}`);
    if (!latino?.episodes) return [];

    let espana = null;
    if (latino.episodes.some((e) => !e.overview?.trim())) {
      espana = await tmdbGet(`/tv/${id}/season/${temporada}`, { language: "es-ES" });
    }
    const sinopsisEspana = new Map((espana?.episodes ?? []).map((e) => [e.episode_number, e.overview?.trim()]));

    return latino.episodes.map((e) => {
      const nombre = e.name?.trim();
      return {
        numero: e.episode_number,
        nombre: nombre && !NOMBRE_SIN_TRADUCIR.test(nombre) ? nombre : null,
        sinopsis: e.overview?.trim() || sinopsisEspana.get(e.episode_number) || null,
      };
    });
  });
}
