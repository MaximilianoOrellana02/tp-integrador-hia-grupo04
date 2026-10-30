import { crearCache } from "../utils/cache.js";
import { armarDestacados, clasificacionSerie, itemDe, logoDe, serieConNuevaTemporada } from "./inicio.service.js";
import { diaDeHoy } from "./peliculas.service.js";
import { generosEnEspanol, tmdbGet, urlImagen } from "./tmdb.client.js";
import { conImdb } from "./tmdbIds.service.js";

/**
 * Pantalla «Series» (app de PC, 2026-10-15): las filas en el mismo formato que Inicio,
 * armadas con TMDB. Como Películas, cambian con el tiempo:
 * - Del día: destacado y Top 10 (tendencias de TMDB).
 * - Rotan por fecha: un género, un país y una tanda de «Para maratonear», «Miniseries»,
 *   «Aclamadas», «Clásicas» y «Joyas ocultas» (número de día en hora de Argentina).
 * - Al día: el banner de una serie con temporada en emisión y «Con episodios nuevos».
 *
 * Géneros y tipos de TMDB verificados el 2026-10-15 (`/genre/tv/list`).
 */

const HORA = 60 * 60 * 1000;
// Se arma una vez por día (la clave lleva la fecha); 3 h por si las tendencias cambian
const cacheSeries = crearCache({ duracionMs: 3 * HORA, maximo: 2 });

// Solo ficción: TMDB `with_type` 4 = guionadas, 2 = miniseries (deja afuera reality,
// entrevistas, noticias y documentales)
const FICCION = "4|2";
// Noticias, reality, entrevistas, infantiles y telenovelas: no son lo que se busca acá
const SIN_GENEROS = "10763,10764,10767,10762,10766";
// En las filas por puntaje, sin animación: en TMDB los animé tienen puntajes altísimos y
// llenaban «Aclamadas» y «Clásicas» (Naruto, Dragon Ball). La animación tiene su fila de género
const SIN_ANIMACION = `${SIN_GENEROS},16`;

// --- Género del día ------------------------------------------------------------------

const GENEROS = [
  [80, "Policiales y de crimen", "Detectives, mafias y casos sin resolver"],
  [35, "Comedias para reír", "Capítulos cortos para cualquier momento"],
  [10765, "Ciencia ficción y fantasía", "Otros mundos, futuros y criaturas"],
  [18, "Dramas que atrapan", "Historias intensas para seguir de cerca"],
  [9648, "Misterio", "Para engancharse y adivinar qué pasa"],
  [10759, "Acción y aventura", "Persecuciones, misiones y peligro"],
  [16, "Animadas", "Animación para grandes"],
  [10768, "Guerra y política", "Poder, conflictos y estrategia"],
];

async function generoDelDia(dia) {
  const [genero, nombre, detalle] = GENEROS[dia % GENEROS.length];
  const lista = await descubrir({
    with_genres: String(genero),
    "vote_count.gte": "300",
    sort_by: "popularity.desc",
    // Las de animación para chicos ya quedan afuera por SIN_GENEROS (10762)
  });
  return { nombre, detalle, items: await armar(lista) };
}

// --- País del día --------------------------------------------------------------------

const PAISES = [
  ["AR", "Series argentinas"], ["KR", "Series coreanas"], ["ES", "Series españolas"],
  ["GB", "Series británicas"], ["MX", "Series mexicanas"], ["JP", "Series japonesas"],
  ["DE", "Series alemanas"], ["CO", "Series colombianas"], ["FR", "Series francesas"],
  ["DK", "Series nórdicas"],
];

async function paisDelDia(dia) {
  const [pais, nombre] = PAISES[dia % PAISES.length];
  const lista = await descubrir({
    with_origin_country: pais,
    "vote_count.gte": "30",
    sort_by: "popularity.desc",
  });
  return { nombre, items: await armar(lista) };
}

// --- Filas que rotan la tanda cada día -----------------------------------------------

/** Terminadas y muy bien puntuadas: para ver de corrido. */
async function paraMaratonear(dia) {
  return armar(await descubrir({
    without_genres: SIN_ANIMACION,
    with_status: "3", // 3 = finalizada
    "vote_average.gte": "8",
    "vote_count.gte": "500",
    sort_by: "popularity.desc",
    page: String((dia % 4) + 1),
  }));
}

/** Una sola temporada que cierra la historia. */
async function miniseries(dia) {
  return armar(await descubrir({
    with_type: "2",
    "vote_count.gte": "150",
    sort_by: "popularity.desc",
    page: String((dia % 4) + 1),
  }));
}

async function aclamadas(dia) {
  return armar(await descubrir({
    without_genres: SIN_ANIMACION,
    "vote_count.gte": "2000",
    sort_by: "vote_average.desc",
    page: String((dia % 5) + 1),
  }));
}

/** Empezaron antes de 2005 y siguen siendo de las mejor puntuadas. */
async function clasicas(dia) {
  return armar(await descubrir({
    without_genres: SIN_ANIMACION,
    "first_air_date.lte": "2004-12-31",
    "vote_count.gte": "800",
    sort_by: "vote_average.desc",
    page: String((dia % 3) + 1),
  }));
}

async function joyasOcultas(dia) {
  return armar(await descubrir({
    without_genres: SIN_ANIMACION,
    "vote_average.gte": "7.8",
    "vote_count.gte": "150",
    "vote_count.lte": "1500",
    sort_by: "popularity.desc",
    page: String((dia % 5) + 1),
  }));
}

/** Con capítulos que salen esta semana (TMDB «en emisión»), solo ficción. */
async function conEpisodiosNuevos() {
  const lista = await tmdbGet("/tv/on_the_air");
  const excluidos = new Set(SIN_GENEROS.split(",").map(Number));
  const filtrada = {
    results: (lista?.results ?? []).filter(
      (r) => (r.vote_count ?? 0) >= 100 && !(r.genre_ids ?? []).some((g) => excluidos.has(g)),
    ),
  };
  return armar(filtrada);
}

// --- Destacado y Top 10 de series ----------------------------------------------------

async function topSeriesDelDia() {
  const tendencias = await tmdbGet("/trending/tv/day");
  const excluidos = new Set(SIN_GENEROS.split(",").map(Number));
  const candidatos = (tendencias?.results ?? [])
    .filter((r) => r.poster_path && !(r.genre_ids ?? []).some((g) => excluidos.has(g)))
    .slice(0, 15);
  const items = (await conImdb(candidatos, "tv")).slice(0, 10);
  const destacado = await armarDestacados(items, ({ r }) => r.backdrop_path && r.overview, destacadoDeSerie);
  return { items: items.map((x) => ({ ...itemDe(x), tipo: "series" })), destacado };
}

/** Como `armarDestacado` de Inicio, pero de una serie: «Serie · 3 temporadas». */
export async function destacadoDeSerie({ r, imdbId }, puesto) {
  const detalle = await tmdbGet(`/tv/${r.id}`, {
    append_to_response: "content_ratings,images",
    include_image_language: "es,en,null",
  });
  const temporadas = detalle?.number_of_seasons;
  const estreno = detalle?.first_air_date ? new Date(detalle.first_air_date) : null;
  const esEstreno = estreno && Date.now() - estreno.getTime() < 60 * 24 * HORA;
  return {
    tipo: "destacado",
    etiqueta: esEstreno
      ? "Serie · Estreno"
      : temporadas
        ? `Serie · ${temporadas} ${temporadas === 1 ? "temporada" : "temporadas"}`
        : "Serie · En tendencia",
    puesto,
    titulo: {
      ...itemDe({ r, imdbId }),
      tipo: "series",
      fondo: urlImagen(r.backdrop_path, "w1280"),
      logo: logoDe(detalle?.images),
      descripcion: detalle?.overview || r.overview,
      generos: generosEnEspanol(detalle?.genres),
      clasificacion: clasificacionSerie(detalle?.content_ratings?.results ?? []),
    },
  };
}

// --- Ayudas --------------------------------------------------------------------------

/** `/discover/tv` con lo de siempre: solo ficción, sin adultos ni los géneros excluidos. */
function descubrir(filtros) {
  return tmdbGet("/discover/tv", {
    include_adult: "false",
    with_type: FICCION,
    without_genres: SIN_GENEROS,
    ...filtros,
  });
}

async function armar(lista) {
  const candidatos = (lista?.results ?? []).filter((r) => r.poster_path).slice(0, 20);
  return (await conImdb(candidatos, "tv")).map((x) => ({ ...itemDe(x), tipo: "series" }));
}

// --- Todas las filas -----------------------------------------------------------------

/**
 * Las filas de Series, en orden. Cada sección se arma por separado: si una falla, las
 * demás se muestran igual (y esa vez no se guarda, así se reintenta).
 */
export async function obtenerSeries() {
  const dia = diaDeHoy();
  const clave = `series:${dia}`;
  const guardado = cacheSeries.obtener(clave);
  if (guardado) return guardado;

  const secciones = await Promise.allSettled([
    topSeriesDelDia(),
    conEpisodiosNuevos(),
    generoDelDia(dia),
    paraMaratonear(dia),
    serieConNuevaTemporada(),
    miniseries(dia),
    paisDelDia(dia),
    aclamadas(dia),
    clasicas(dia),
    joyasOcultas(dia),
  ]);
  const [top, nuevos, genero, maratonear, banner, mini, pais, criticas, viejas, joyas] = secciones.map((s) =>
    s.status === "fulfilled" ? s.value : null,
  );
  secciones.forEach((s) => {
    if (s.status === "rejected") console.error("Series: falló una sección:", s.reason?.message);
  });

  const filas = [];
  const posters = (nombre, detalle, items) => {
    if (items?.length) filas.push({ tipo: "posters", nombre, detalle, items });
  };
  if (top?.destacado) filas.push(top.destacado);
  if (top?.items.length) filas.push({ tipo: "top10", nombre: "Top 10 series hoy", items: top.items });
  posters("Con episodios nuevos", "Salen capítulos esta semana", nuevos);
  posters(genero?.nombre, genero?.detalle, genero?.items);
  posters("Para maratonear", "Terminadas y muy bien puntuadas", maratonear);
  if (banner) filas.push(banner);
  posters("Miniseries", "Una temporada, una historia completa", mini);
  posters(pais?.nombre, null, pais?.items);
  posters("Aclamadas por la crítica", "Puntaje alto con miles de votos", criticas);
  posters("Clásicas de la TV", "Empezaron antes de 2005", viejas);
  posters("Joyas ocultas", "Muy bien puntuadas y poco conocidas", joyas);

  const resultado = { filas };
  if (secciones.every((s) => s.status === "fulfilled")) cacheSeries.guardar(clave, resultado);
  return resultado;
}
