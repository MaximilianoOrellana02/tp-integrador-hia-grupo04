import { crearCache } from "../utils/cache.js";
import { ErrorHttp } from "../utils/ErrorHttp.js";
import { armarDestacado, armarDestacados, itemDe } from "./inicio.service.js";
import { destacadoDeSerie } from "./series.service.js";
import { generosEnEspanol, tmdbGet, urlImagen } from "./tmdb.client.js";
import { conImdb } from "./tmdbIds.service.js";

/**
 * Originales de cada plataforma (2026-10-17): las filas de Inicio y la pantalla
 * «Originales de» de la app (`/api/originales/:id`).
 *
 * Qué es «original» según TMDB:
 * - Series: la cadena que las estrena (`with_networks`), no todo lo que tiene en catálogo.
 * - Películas: la productora (`with_companies`). TMDB las marca bien para Prime Video y
 *   HBO, pero pocas de Netflix (muchas figuran solo con la productora real): Netflix
 *   tiene menos películas de las que de verdad produjo.
 *
 * IDs verificados contra `/network/{id}` y `/search/company` el 2026-10-17. HBO suma HBO
 * (49) y HBO Max (3186): las nuevas salen por las dos. Para sumar una plataforma alcanza
 * con agregarla acá (la app arma sus pestañas con esta lista).
 */
export const PLATAFORMAS = [
  {
    id: "netflix",
    nombre: "Netflix",
    color: "#E50914",
    redes: "213",
    companias: "178464|145174|198834",
    descripcion: "Series y películas producidas por Netflix: thrillers, dramas y comedias para maratonear.",
  },
  {
    id: "prime",
    nombre: "Prime Video",
    color: "#1A98FF",
    redes: "1024",
    companias: "20580|210099",
    descripcion: "Lo producido por Amazon: superhéroes sin filtro, acción y fantasía épica.",
  },
  {
    id: "hbo",
    nombre: "HBO",
    color: "#7A5CFA",
    redes: "49|3186",
    companias: "7429|158691",
    descripcion: "Las series de HBO y HBO Max: dramas de prestigio, fantasía y comedia ácida.",
  },
  {
    // Series: la cadena Disney+ (2739). Películas: TMDB no tiene una productora «Disney+»
    // (las originales figuran con el estudio), así que van las de sus estudios: Walt Disney
    // Pictures (2), Walt Disney Animation (6125), Pixar (3), Marvel Studios (420) y
    // Lucasfilm (1). Verificado el 2026-10-20
    id: "disney",
    nombre: "Disney+",
    color: "#113CCF",
    redes: "2739",
    companias: "2|6125|3|420|1",
    descripcion: "Lo de Disney, Pixar, Marvel y Star Wars: clásicos animados, superhéroes y la galaxia muy, muy lejana.",
  },
];

const HORA = 60 * 60 * 1000;
// Las filas cambian despacio (popularidad y estrenos): 6 h alcanza
const cachePantalla = crearCache({ duracionMs: 6 * HORA, maximo: 10 });
const cacheConteos = crearCache({ duracionMs: 6 * HORA, maximo: 10 });

// Como Series: solo ficción (4 = guionadas, 2 = miniseries) y sin noticias, reality,
// entrevistas, infantiles ni telenovelas
const FICCION = "4|2";
const SIN_GENEROS_SERIES = "10763,10764,10767,10762,10766";
// Películas: sin documentales ni recitales
const SIN_GENEROS_PELICULAS = "99,10402";
const ANIMACION = 16;
// Menos votos que esto suele ser algo casi desconocido o un especial
const VOTOS_MINIMOS = "50";
const POR_FILA = 20;

/** Filas de Inicio: las series de cada plataforma, con `plataforma` para «Ver todo». */
export async function filasOriginales() {
  const resultados = await Promise.allSettled(PLATAFORMAS.map(seriesParaInicio));
  return resultados.flatMap((r, i) => {
    const p = PLATAFORMAS[i];
    if (r.status === "rejected") {
      console.error(`Inicio: falló «Originales de ${p.nombre}»:`, r.reason?.message);
      return [];
    }
    return r.value.length
      ? [{ tipo: "posters", nombre: `Originales de ${p.nombre}`, plataforma: p.id, items: r.value }]
      : [];
  });
}

async function seriesParaInicio(p) {
  const lista = await descubrir("tv", p, { "vote_count.gte": "100", sort_by: "popularity.desc" });
  return (await conImdb(candidatos(lista), "tv")).map((x) => ({ ...itemDe(x), tipo: "series" }));
}

/**
 * La pantalla de una plataforma: las pestañas de todas (con su cantidad), los datos de la
 * elegida, 3 destacados y las filas (películas y series mezcladas; la app filtra).
 */
export async function pantallaOriginales(id) {
  const p = PLATAFORMAS.find((x) => x.id === id);
  if (!p) throw new ErrorHttp(404, "No existe esa plataforma");
  return cachePantalla.obtenerOCalcular(id, () => armarPantalla(p));
}

async function armarPantalla(p) {
  const hoy = new Date().toISOString().slice(0, 10);
  const anio = Number(hoy.slice(0, 4));
  const [popS, popM, recS, recM, mejS, mejM, estS, estM, conteos] = await Promise.all([
    descubrir("tv", p, { sort_by: "popularity.desc" }),
    descubrir("movie", p, { sort_by: "popularity.desc" }),
    descubrir("tv", p, { sort_by: "first_air_date.desc", "first_air_date.lte": hoy }),
    descubrir("movie", p, { sort_by: "primary_release_date.desc", "primary_release_date.lte": hoy }),
    descubrir("tv", p, { sort_by: "vote_average.desc", "vote_count.gte": "300" }),
    descubrir("movie", p, { sort_by: "vote_average.desc", "vote_count.gte": "300" }),
    descubrir("tv", p, { "first_air_date.gte": `${anio}-01-01`, "first_air_date.lte": hoy }),
    descubrir("movie", p, { "primary_release_date.gte": `${anio}-01-01`, "primary_release_date.lte": hoy }),
    Promise.all(PLATAFORMAS.map(conteosDe)),
  ]);

  const fecha = ({ r }) => r.first_air_date || r.release_date || "";
  const populares = await mezclar(popS, popM, (a, b) => (b.r.popularity ?? 0) - (a.r.popularity ?? 0));
  const recientes = await mezclar(recS, recM, (a, b) => fecha(b).localeCompare(fecha(a)));
  const mejores = await mezclar(mejS, mejM, (a, b) => (b.r.vote_average ?? 0) - (a.r.vote_average ?? 0));

  // Los 3 más populares con fondo y sinopsis, como el destacado de Inicio (sin «#N hoy»)
  const destacado = await armarDestacados(
    populares,
    ({ r }) => r.backdrop_path && r.overview,
    (x, puesto) => (x.r.media_type === "movie" ? armarDestacado(x, puesto) : destacadoDeSerie(x, puesto)),
  );
  const sinPuesto = (d) => ({ ...d, puesto: null });

  const propios = conteos[PLATAFORMAS.indexOf(p)];
  return {
    plataformas: PLATAFORMAS.map((x, i) => ({
      id: x.id,
      nombre: x.nombre,
      color: x.color,
      cantidad: conteos[i].peliculas + conteos[i].series,
    })),
    plataforma: {
      id: p.id,
      nombre: p.nombre,
      color: p.color,
      descripcion: p.descripcion,
      peliculas: propios.peliculas,
      series: propios.series,
      estrenos: (estS?.total_results ?? 0) + (estM?.total_results ?? 0),
      anio,
    },
    destacado: destacado ? { ...sinPuesto(destacado), mas: destacado.mas.map(sinPuesto) } : null,
    filas: [
      { nombre: "Estrenos recientes", items: recientes.map(itemOriginal) },
      { nombre: "Las más populares", items: populares.map(itemOriginal) },
      { nombre: "Mejor puntuadas", items: mejores.map(itemOriginal) },
    ].filter((f) => f.items.length),
  };
}

// --- Más filas al bajar (2026-10-17, como el Inicio) ----------------------------------

const cacheTandas = crearCache({ duracionMs: 6 * HORA, maximo: 40 });
/** Filas por tanda (cada una es una página: `/api/originales/netflix?pagina=2`, 3…). */
const POR_TANDA = 5;
/** Con menos títulos que esto (después de sacar los repetidos), la fila no se muestra. */
const MINIMO_POR_FILA = 6;

/**
 * Recetas de filas de una plataforma: cada una es un filtro de `/discover` para series
 * (`tv`) y/o películas (`movie`), sumado a los de la plataforma. Los géneros de series y
 * de películas tienen otros IDs (verificados con `/genre/tv/list` y `/genre/movie/list`):
 * por eso van aparte. Series no tiene terror ni romance. [orden]: cómo se mezclan las dos
 * listas (por defecto, popularidad). Sumar una = sumar un elemento.
 */
const RECETAS_ORIGINALES = [
  { nombre: "Dramas", tv: { with_genres: "18" }, movie: { with_genres: "18" } },
  { nombre: "Comedias", tv: { with_genres: "35" }, movie: { with_genres: "35" } },
  { nombre: "Policiales y crimen", tv: { with_genres: "80" }, movie: { with_genres: "80" } },
  { nombre: "Ciencia ficción y fantasía", tv: { with_genres: "10765" }, movie: { with_genres: "878|14" } },
  { nombre: "Misterio y suspenso", tv: { with_genres: "9648" }, movie: { with_genres: "9648|53" } },
  { nombre: "Acción y aventura", tv: { with_genres: "10759" }, movie: { with_genres: "28|12" } },
  { nombre: "Miniseries para ver de un tirón", tv: { with_type: "2" } },
  { nombre: "Basadas en hechos reales", tv: { with_keywords: "9672" }, movie: { with_keywords: "9672" } },
  { nombre: "Terror", movie: { with_genres: "27" } },
  { nombre: "Animadas", tv: { with_genres: "16" }, movie: { with_genres: "16" } },
  { nombre: "Para ver en familia", tv: { with_genres: "10751" }, movie: { with_genres: "10751" } },
  { nombre: "En español", tv: { with_original_language: "es" }, movie: { with_original_language: "es" } },
  { nombre: "Coreanas", tv: { with_original_language: "ko" }, movie: { with_original_language: "ko" } },
  { nombre: "Romances", movie: { with_genres: "10749" } },
  {
    nombre: "Clásicas de la plataforma",
    tv: { "first_air_date.lte": "2014-12-31", sort_by: "vote_count.desc" },
    movie: { "primary_release_date.lte": "2014-12-31", sort_by: "vote_count.desc" },
    orden: (a, b) => (b.r.vote_count ?? 0) - (a.r.vote_count ?? 0),
  },
  {
    nombre: "Las más vistas de todos los tiempos",
    tv: { sort_by: "vote_count.desc" },
    movie: { sort_by: "vote_count.desc" },
    orden: (a, b) => (b.r.vote_count ?? 0) - (a.r.vote_count ?? 0),
  },
  {
    nombre: "Joyas ocultas",
    // Con menos de 150 votos se colaban rellenos («KPop Demon Hunters Lyric Videos»)
    tv: { "vote_average.gte": "7.5", "vote_count.gte": "150", "vote_count.lte": "800", sort_by: "vote_average.desc" },
    movie: { "vote_average.gte": "7", "vote_count.gte": "150", "vote_count.lte": "800", sort_by: "vote_average.desc" },
    orden: (a, b) => (b.r.vote_average ?? 0) - (a.r.vote_average ?? 0),
  },
];

export const TANDAS_ORIGINALES = Math.ceil(RECETAS_ORIGINALES.length / POR_TANDA);

/**
 * Una página de «Originales de»: la 1 es la pantalla de siempre (con `siguiente: 2`); de la
 * 2 en adelante, `{ filas, siguiente }` con tandas de recetas, sin títulos que ya salieron
 * más arriba. `siguiente` es null cuando no hay más.
 */
export async function paginaOriginales(id, pagina = 1) {
  const numero = Number(pagina);
  if (!Number.isInteger(numero) || numero < 1) throw new ErrorHttp(400, "Página no válida");
  const primera = await pantallaOriginales(id);
  if (numero === 1) return { ...primera, siguiente: TANDAS_ORIGINALES > 0 ? 2 : null };
  if (numero - 1 > TANDAS_ORIGINALES) return { filas: [], siguiente: null };

  const p = PLATAFORMAS.find((x) => x.id === id);
  const usados = primera.filas.flatMap((f) => f.items).map((i) => i.imdbId);
  const { filas } = await tandaOriginales(p, numero - 1, usados);
  const hayMas = numero - 1 < TANDAS_ORIGINALES;
  // La que sigue se prepara ya, sin esperarla: está lista cuando la app la pida al bajar
  if (hayMas) tandaOriginales(p, numero, usados).catch(() => {});
  return { filas, siguiente: hayMas ? numero + 1 : null };
}

/** La tanda [numero] (1 = la primera, página 2). Cada una arranca con los usados de la anterior. */
function tandaOriginales(p, numero, usadosAntes) {
  return cacheTandas.obtenerOCalcular(`${p.id}:${numero}`, async () => {
    const anterior = numero > 1 ? await tandaOriginales(p, numero - 1, usadosAntes) : null;
    const usados = new Set(anterior?.usados ?? usadosAntes);
    const recetas = RECETAS_ORIGINALES.slice((numero - 1) * POR_TANDA, numero * POR_TANDA);
    // Se piden juntas; los repetidos se sacan en orden: la de arriba se queda con el título
    const resultados = await Promise.allSettled(recetas.map((r) => candidatosReceta(p, r)));
    const filas = [];
    resultados.forEach((r, i) => {
      if (r.status === "rejected") {
        console.error(`Originales de ${p.nombre}: falló «${recetas[i].nombre}»:`, r.reason?.message);
        return;
      }
      const elegidos = r.value.filter((x) => !usados.has(x.imdbId)).slice(0, POR_FILA);
      if (elegidos.length < MINIMO_POR_FILA) return;
      elegidos.forEach((x) => usados.add(x.imdbId));
      filas.push({ nombre: recetas[i].nombre, items: elegidos.map(itemOriginal) });
    });
    return { filas, usados: [...usados] };
  });
}

/** Dos páginas de TMDB por tipo (hasta 40): queda margen para sacar los repetidos. */
async function candidatosReceta(p, receta) {
  const pedir = async (tipo, filtros) => {
    if (!filtros) return [];
    const paginas = await Promise.all(
      ["1", "2"].map((page) => descubrir(tipo, p, { sort_by: "popularity.desc", ...filtros, page })),
    );
    const lista = { results: paginas.flatMap((x) => x?.results ?? []) };
    return conImdb(candidatos(lista, 40).map((r) => ({ ...r, media_type: tipo })), tipo);
  };
  const [s, m] = await Promise.all([pedir("tv", receta.tv), pedir("movie", receta.movie)]);
  const orden = receta.orden ?? ((a, b) => (b.r.popularity ?? 0) - (a.r.popularity ?? 0));
  return [...s, ...m].sort(orden);
}

/** Cuántas películas y series tiene una plataforma (con los mismos filtros que las filas). */
function conteosDe(p) {
  return cacheConteos.obtenerOCalcular(p.id, async () => {
    const [series, peliculas] = await Promise.all([
      descubrir("tv", p, { sort_by: "popularity.desc" }),
      descubrir("movie", p, { sort_by: "popularity.desc" }),
    ]);
    return { series: series?.total_results ?? 0, peliculas: peliculas?.total_results ?? 0 };
  });
}

/**
 * Series y películas juntas, ordenadas con [comparar], hasta [POR_FILA]. Solo las que
 * tienen ID de IMDb (sin él la app no puede abrirlas).
 */
async function mezclar(series, peliculas, comparar) {
  const [s, m] = await Promise.all([
    conImdb(candidatos(series).map((r) => ({ ...r, media_type: "tv" })), "tv"),
    conImdb(candidatos(peliculas).map((r) => ({ ...r, media_type: "movie" })), "movie"),
  ]);
  return [...s, ...m].sort(comparar).slice(0, POR_FILA);
}

/**
 * Lo de un póster de Inicio más el fondo (las tarjetas son apaisadas), el puntaje de TMDB y,
 * para lo que la app muestra debajo de la tarjeta grande (2026-10-20), sinopsis y géneros.
 * Salen de `/discover` (ya en español): sin pedidos extra. También lo usan las marcas
 * (`marcas.service.js`).
 */
export function itemOriginal(x) {
  return {
    ...itemDe(x),
    fondo: x.r.backdrop_path ? urlImagen(x.r.backdrop_path, "w780") : null,
    puntaje: x.r.vote_average ? Math.round(x.r.vote_average * 10) / 10 : null,
    descripcion: x.r.overview || null,
    generos: generosEnEspanol(x.r.genre_ids),
  };
}

/** Con póster y sin animé japonés (Netflix distribuye muchos y llenaban las filas). */
function candidatos(lista, cuantos = POR_FILA) {
  return (lista?.results ?? [])
    .filter((r) => r.poster_path && !((r.genre_ids ?? []).includes(ANIMACION) && (r.origin_country ?? []).includes("JP")))
    .slice(0, cuantos);
}

/** `/discover` de TMDB con los filtros de siempre para series (tv) o películas (movie). */
function descubrir(tipo, p, filtros) {
  const base =
    tipo === "tv"
      ? { with_networks: p.redes, with_type: FICCION, without_genres: SIN_GENEROS_SERIES }
      : { with_companies: p.companias, without_genres: SIN_GENEROS_PELICULAS };
  return tmdbGet(`/discover/${tipo}`, {
    include_adult: "false",
    "vote_count.gte": VOTOS_MINIMOS,
    ...base,
    ...filtros,
  });
}
