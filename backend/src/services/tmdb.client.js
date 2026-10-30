import { ErrorHttp } from "../utils/ErrorHttp.js";

const URL_API = "https://api.themoviedb.org/3";
const URL_IMAGENES = "https://image.tmdb.org/t/p";
const ESPERA_MS = 8000;

// TMDB limita «alrededor de 40 pedidos por segundo» (su documentación, sin cifra exacta)
// y pide respetar el 429. Armar Series dispara ~200 pedidos juntos y recibía 429: como
// mucho 20 a la vez, y ante un 429 se espera y se reintenta
const MAXIMO_SIMULTANEOS = 20;
const REINTENTOS_429 = 2;

let enCurso = 0;
const enEspera = [];

/** Espera un lugar libre entre los pedidos simultáneos. */
async function turno() {
  if (enCurso >= MAXIMO_SIMULTANEOS) await new Promise((seguir) => enEspera.push(seguir));
  enCurso++;
}

function liberar() {
  enCurso--;
  enEspera.shift()?.();
}

/**
 * GET a la API de TMDB. El token queda en el backend: la app nunca lo ve.
 * Por defecto pide los textos en español latino (títulos como se conocen acá).
 *
 * @returns el JSON de la respuesta, o null si TMDB responde 404.
 */
export async function tmdbGet(ruta, parametros = {}) {
  const url = new URL(URL_API + ruta);
  url.search = new URLSearchParams({ language: "es-MX", ...parametros });

  for (let intento = 0; ; intento++) {
    let respuesta;
    await turno();
    try {
      respuesta = await fetch(url, {
        headers: {
          Authorization: `Bearer ${process.env.TMDB_TOKEN}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(ESPERA_MS),
      });
    } catch {
      throw new ErrorHttp(502, "No se pudo consultar TMDB");
    } finally {
      liberar();
    }

    if (respuesta.status === 429 && intento < REINTENTOS_429) {
      // Retry-After en segundos; si no viene, 1 s (y 2 s la segunda vez)
      const segundos = Number(respuesta.headers.get("retry-after")) || intento + 1;
      await new Promise((seguir) => setTimeout(seguir, segundos * 1000));
      continue;
    }
    if (respuesta.status === 404) return null;
    if (!respuesta.ok) {
      console.error(`TMDB respondió ${respuesta.status} en ${ruta}`);
      throw new ErrorHttp(502, "TMDB no respondió correctamente");
    }
    return respuesta.json();
  }
}

/**
 * URL completa de una imagen de TMDB, o null si no tiene.
 * Tamaños chicos a propósito: en la app se muestran en tarjetas, y así cargan rápido.
 */
export function urlImagen(ruta, tamanio = "w185") {
  return ruta ? `${URL_IMAGENES}/${tamanio}${ruta}` : null;
}

/**
 * Géneros de TMDB por número, en español. Hace falta porque en `es-MX` TMDB deja en inglés
 * los propios de series («Sci-Fi & Fantasy», «War & Politics», «Action & Adventure»…; leído
 * de `/genre/tv/list` el 2026-10-20). Los que comparten número se llaman igual en películas y
 * series, así alcanza con una sola tabla.
 */
const NOMBRES_GENEROS = {
  28: "Acción", 12: "Aventura", 16: "Animación", 35: "Comedia", 80: "Crimen", 99: "Documental",
  18: "Drama", 10751: "Familia", 14: "Fantasía", 36: "Historia", 27: "Terror", 10402: "Música",
  9648: "Misterio", 10749: "Romance", 878: "Ciencia ficción", 10770: "Película de TV",
  53: "Suspenso", 10752: "Bélica", 37: "Western", 10759: "Acción y aventura", 10762: "Infantil",
  10763: "Noticias", 10764: "Reality", 10765: "Ciencia ficción y fantasía", 10766: "Telenovela",
  10767: "Entrevistas", 10768: "Guerra y política",
};

/**
 * Nombres en español de una lista de géneros: los `genres` de una ficha (`{ id, name }`) o los
 * `genre_ids` de una búsqueda. Uno que no está en la tabla queda con el nombre de TMDB (o se
 * saltea, si solo vino el número).
 */
export function generosEnEspanol(lista, cuantos = 3) {
  return (lista ?? [])
    .map((g) => (typeof g === "number" ? NOMBRES_GENEROS[g] : NOMBRES_GENEROS[g.id] ?? g.name))
    .filter(Boolean)
    .slice(0, cuantos);
}
