import { crearCache } from "../utils/cache.js";
import { ErrorHttp } from "../utils/ErrorHttp.js";
import { itemDe } from "./inicio.service.js";
import { diaDeHoy, obtenerPeliculas } from "./peliculas.service.js";
import { obtenerSeries } from "./series.service.js";
import { tmdbGet } from "./tmdb.client.js";
import { conImdb } from "./tmdbIds.service.js";

/**
 * Recetas de filas para el Inicio (2026-10-17): cada receta es solo un filtro de TMDB
 * (`/discover`), no una lista guardada. Cada día se elige una tanda distinta y el Inicio
 * las entrega de a [POR_PAGINA] a medida que se baja (`/api/inicio?pagina=2`, 3…).
 * Sumar una receta = sumar una línea acá.
 *
 * Géneros y palabras clave verificados contra TMDB el 2026-10-17 (`/genre/movie/list`,
 * `/search/keyword` con coincidencia exacta). Las palabras clave con ruido (ej.: «prison»
 * traía Shrek 2) van con un género al lado o no se usan.
 */

const HORA = 60 * 60 * 1000;
const cacheRecetas = crearCache({ duracionMs: 26 * HORA, maximo: 30 });

/** Filas de recetas por página. */
const POR_PAGINA = 6;
/** Recetas que se usan cada día (las demás descansan): POR_PAGINA × páginas. */
const RECETAS_POR_DIA = 36;
const POR_FILA = 20;
/** Con menos títulos que esto (después de sacar los repetidos), la fila no se muestra. */
const MINIMO_POR_FILA = 8;

const SIN_GENEROS_PELICULAS = "99,10402,10770"; // documentales, recitales, películas de TV
const SIN_GENEROS_SERIES = "10763,10764,10767,10762,10766";

// --- Las recetas ---------------------------------------------------------------------

const GENEROS = [
  [28, "Acción", "de acción"],
  [35, "Comedias", null],
  [27, "Terror", "de terror"],
  [878, "Ciencia ficción", "de ciencia ficción"],
  [53, "Suspenso", "de suspenso"],
  [18, "Dramas", null],
  [12, "Aventuras", null],
  [10749, "Romances", null],
  [80, "Policiales", null],
  [14, "Fantasía", "de fantasía"],
  [16, "Animadas", null],
];

const DECADAS = [
  [1980, "de los 80"],
  [1990, "de los 90"],
  [2000, "de los 2000"],
  [2010, "de los 2010"],
];

// «Acción de los 90», «Comedias de los 2000»… (≥ 300 votos: las conocidas de esa época)
const POR_DECADA = GENEROS.flatMap(([id, nombre, _]) =>
  DECADAS.map(([desde, texto]) => ({
    id: `decada-${id}-${desde}`,
    nombre: `${nombre} ${texto}`,
    tipo: "movie",
    filtros: {
      with_genres: String(id),
      "primary_release_date.gte": `${desde}-01-01`,
      "primary_release_date.lte": `${desde + 9}-12-31`,
      "vote_count.gte": "300",
      sort_by: "vote_count.desc",
    },
  })),
);

const PAISES = [
  ["KR", "Cine coreano"], ["JP", "Cine japonés"], ["ES", "Cine español"], ["FR", "Cine francés"],
  ["IT", "Cine italiano"], ["MX", "Cine mexicano"], ["AR", "Cine argentino"], ["GB", "Cine británico"],
  ["IN", "Cine de la India"], ["DE", "Cine alemán"], ["DK", "Cine nórdico"], ["BR", "Cine brasileño"],
];

const POR_PAIS = PAISES.map(([pais, nombre]) => ({
  id: `pais-${pais}`,
  nombre,
  tipo: "movie",
  filtros: { with_origin_country: pais, "vote_count.gte": "150", sort_by: "popularity.desc" },
}));

// [id de palabra clave, nombre, géneros que tiene que tener además (opcional)]
const PALABRAS = [
  [4379, "Viajes en el tiempo"],
  [9672, "Basadas en hechos reales"],
  [10051, "Grandes golpes y robos"],
  [12377, "Zombis", "27|28"],
  [4565, "Futuros distópicos"],
  [9715, "Superhéroes"],
  [10349, "Historias de supervivencia"],
  [10714, "Asesinos seriales", "27|53|80"],
  [3358, "Casas embrujadas"],
  [14909, "Invasiones alienígenas"],
  [4458, "Después del apocalipsis"],
  [470, "Espías", "28|53"],
  [10391, "Mafias"],
  [163053, "Terror en cámara en mano"],
  [779, "Artes marciales", "28"],
  [3133, "Vampiros"],
  [10683, "Crecer: historias de adolescentes"],
  [9748, "Venganzas", "28|53|80"],
  [209476, "Boxeo"],
  // Sin «road trip» (7312): traía Harry Potter y Sonic
  [6270, "En la secundaria"],
  [5565, "Biografías"],
];

const POR_PALABRA = PALABRAS.map(([palabra, nombre, generos]) => ({
  id: `palabra-${palabra}`,
  nombre,
  tipo: "movie",
  filtros: {
    with_keywords: String(palabra),
    ...(generos ? { with_genres: generos } : {}),
    "vote_count.gte": palabra === 209476 ? "100" : "300",
    sort_by: "popularity.desc",
  },
}));

const OTRAS_PELICULAS = [
  {
    id: "cortas",
    nombre: "Para ver en menos de 90 minutos",
    tipo: "movie",
    filtros: { "with_runtime.lte": "90", "with_runtime.gte": "60", "vote_count.gte": "800", sort_by: "popularity.desc" },
  },
  {
    id: "largas",
    nombre: "Épicas de más de 2 horas y media",
    tipo: "movie",
    filtros: { "with_runtime.gte": "150", "vote_count.gte": "2000", sort_by: "vote_average.desc" },
  },
  {
    id: "familia",
    nombre: "Para ver en familia",
    tipo: "movie",
    filtros: { with_genres: "10751", "vote_count.gte": "1000", sort_by: "popularity.desc" },
  },
  {
    id: "obras-maestras",
    nombre: "Obras maestras",
    tipo: "movie",
    filtros: { "vote_count.gte": "8000", sort_by: "vote_average.desc" },
  },
];

// Series: solo ficción (4 = guionadas, 2 = miniseries)
const SERIES = [
  [80, "Series policiales"], [35, "Series de comedia"], [10765, "Series de ciencia ficción y fantasía"],
  [9648, "Series de misterio"], [18, "Series de drama"], [10759, "Series de acción y aventura"],
].map(([genero, nombre]) => ({
  id: `serie-${genero}`,
  nombre,
  tipo: "tv",
  filtros: { with_genres: String(genero), with_type: "4|2", "vote_count.gte": "300", sort_by: "popularity.desc" },
})).concat(
  [["KR", "Series coreanas"], ["ES", "Series españolas"], ["GB", "Series británicas"], ["AR", "Series argentinas"]].map(
    ([pais, nombre]) => ({
      id: `serie-pais-${pais}`,
      nombre,
      tipo: "tv",
      filtros: { with_origin_country: pais, with_type: "4|2", "vote_count.gte": "50", sort_by: "popularity.desc" },
    }),
  ),
);

// Más recetas de series (2026-10-26) para que Series tenga su propio catálogo extendido: sin
// ellas había 10, que alcanzan para dos tandas. Género × década, países y algunas sueltas.
const GENEROS_TV = [
  [10759, "de acción y aventura"], [35, "de comedia"], [18, "de drama"], [80, "policiales"],
  [9648, "de misterio"], [10765, "de ciencia ficción y fantasía"], [16, "animadas"],
];
const DECADAS_TV = [[1990, "de los 90"], [2000, "de los 2000"], [2010, "de los 2010"], [2020, "de los 2020"]];

const SERIES_POR_DECADA = GENEROS_TV.flatMap(([id, nombre]) =>
  DECADAS_TV.map(([desde, texto]) => ({
    id: `tvdecada-${id}-${desde}`,
    nombre: `Series ${nombre} ${texto}`,
    tipo: "tv",
    filtros: {
      with_genres: String(id),
      with_type: "4|2",
      "first_air_date.gte": `${desde}-01-01`,
      "first_air_date.lte": `${desde + 9}-12-31`,
      "vote_count.gte": "150",
      sort_by: "vote_count.desc",
    },
  })),
);

const SERIES_POR_PAIS = [
  ["JP", "Series japonesas"], ["FR", "Series francesas"], ["IT", "Series italianas"],
  ["DE", "Series alemanas"], ["MX", "Series mexicanas"], ["BR", "Series brasileñas"],
  ["IN", "Series de la India"], ["DK", "Series danesas"],
].map(([pais, nombre]) => ({
  id: `tvpais-${pais}`,
  nombre,
  tipo: "tv",
  filtros: { with_origin_country: pais, with_type: "4|2", "vote_count.gte": "50", sort_by: "popularity.desc" },
}));

const OTRAS_SERIES = [
  {
    id: "tvotras-media-hora",
    nombre: "Comedias de media hora",
    tipo: "tv",
    filtros: { with_genres: "35", with_type: "4", "with_runtime.lte": "30", "vote_count.gte": "300", sort_by: "popularity.desc" },
  },
  {
    id: "tvotras-culto",
    nombre: "Series de culto",
    tipo: "tv",
    filtros: { with_type: "4|2", "vote_count.gte": "4000", sort_by: "vote_average.desc" },
  },
  {
    id: "tvotras-miniseries",
    nombre: "Miniseries imperdibles",
    tipo: "tv",
    filtros: { with_type: "2", "vote_count.gte": "300", sort_by: "popularity.desc" },
  },
];

export const RECETAS = [
  ...POR_DECADA, ...POR_PAIS, ...POR_PALABRA, ...OTRAS_PELICULAS,
  ...SERIES, ...SERIES_POR_DECADA, ...SERIES_POR_PAIS, ...OTRAS_SERIES,
];

/**
 * Las recetas de un tipo: «movie» (Películas), «tv» (Series) o «todas» (Inicio, que las mezcla).
 */
function recetasDe(tipo) {
  return tipo === "todas" ? RECETAS : RECETAS.filter((r) => r.tipo === tipo);
}

// --- Elegir y armar ------------------------------------------------------------------

/**
 * Las recetas de hoy, en orden: mezcladas con el número de día como semilla (siempre el
 * mismo orden durante el día, otro mañana) y sin dos de la misma familia seguidas.
 */
function recetasDeHoy(dia, tipo = "todas") {
  const mezcladas = mezclar(recetasDe(tipo), dia);
  const familia = (r) => r.id.split("-")[0];
  const elegidas = [];
  const pendientes = [...mezcladas];
  while (elegidas.length < RECETAS_POR_DIA && pendientes.length) {
    const ultima = elegidas.at(-1);
    const i = pendientes.findIndex((r) => !ultima || familia(r) !== familia(ultima));
    elegidas.push(...pendientes.splice(i === -1 ? 0 : i, 1));
  }
  return elegidas;
}

/** Cuántas páginas de recetas hay (la 1 del Inicio no cuenta). */
export const PAGINAS_DE_RECETAS = Math.ceil(RECETAS_POR_DIA / POR_PAGINA);

/** Lo mismo para Películas o Series: si el tipo tiene menos recetas que las de un día, menos páginas. */
function paginasDe(tipo) {
  return Math.ceil(Math.min(RECETAS_POR_DIA, recetasDe(tipo).length) / POR_PAGINA);
}

/**
 * Las filas de la página [numero] de recetas (1 = la primera tanda, que va en la página 2
 * del Inicio). Sin títulos repetidos: lo que ya salió en [usadosAntes] (la página 1 del
 * Inicio) o en una tanda anterior no se repite. Cada tanda se guarda por día.
 */
export async function paginaDeRecetas(numero, usadosAntes, tipo = "todas") {
  const dia = diaDeHoy();
  return cacheRecetas.obtenerOCalcular(`${dia}:${tipo}:${numero}`, async () => {
    const anterior = numero > 1 ? await paginaDeRecetas(numero - 1, usadosAntes, tipo) : null;
    const usados = new Set(anterior?.usados ?? usadosAntes);
    const tanda = recetasDeHoy(dia, tipo).slice((numero - 1) * POR_PAGINA, numero * POR_PAGINA);
    // Se piden juntas, pero los repetidos se sacan en orden: la de arriba se queda con el título
    const resultados = await Promise.allSettled(tanda.map(candidatosDe));
    const filas = [];
    resultados.forEach((r, i) => {
      if (r.status === "rejected") {
        console.error(`Inicio: falló la receta «${tanda[i].nombre}»:`, r.reason?.message);
        return;
      }
      const items = r.value.filter((item) => !usados.has(item.imdbId)).slice(0, POR_FILA);
      if (items.length < MINIMO_POR_FILA) return;
      items.forEach((item) => usados.add(item.imdbId));
      filas.push({ tipo: "posters", nombre: tanda[i].nombre, receta: tanda[i].id, items });
    });
    return { filas, usados: [...usados] };
  });
}

/**
 * Una página de Películas o Series (2026-10-26): la 1 son las filas de siempre (`primera`); de
 * la 2 en adelante, tandas de recetas del tipo, sin títulos que ya salieron arriba. Igual que
 * `paginaInicio`: `siguiente` es la página que sigue, o null si no hay más, y la tanda que sigue
 * se prepara sin esperarla.
 */
async function paginaDeSeccion(tipo, primeraPagina, pagina) {
  const numero = Number(pagina);
  if (!Number.isInteger(numero) || numero < 1) throw new ErrorHttp(400, "Página no válida");
  const primera = await primeraPagina();
  const total = paginasDe(tipo);
  if (numero === 1) return { ...primera, siguiente: total > 0 ? 2 : null };
  if (numero - 1 > total) return { filas: [], siguiente: null };

  const usados = primera.filas.flatMap((f) => f.items ?? []).map((i) => i.imdbId);
  const { filas } = await paginaDeRecetas(numero - 1, usados, tipo);
  const hayMas = numero - 1 < total;
  if (hayMas) paginaDeRecetas(numero, usados, tipo).catch(() => {});
  return { filas, siguiente: hayMas ? numero + 1 : null };
}

export const paginaPeliculas = (pagina = 1) => paginaDeSeccion("movie", obtenerPeliculas, pagina);
export const paginaSeries = (pagina = 1) => paginaDeSeccion("tv", obtenerSeries, pagina);

/** Dos páginas de TMDB (40): hay margen para sacar los repetidos y que queden 20. */
async function candidatosDe(receta) {
  const base =
    receta.tipo === "tv"
      ? { without_genres: SIN_GENEROS_SERIES }
      : { without_genres: SIN_GENEROS_PELICULAS };
  const paginas = await Promise.all(
    ["1", "2"].map((page) =>
      tmdbGet(`/discover/${receta.tipo}`, { include_adult: "false", ...base, ...receta.filtros, page }),
    ),
  );
  const resultados = paginas.flatMap((p) => p?.results ?? []).filter((r) => r.poster_path);
  return (await conImdb(resultados, receta.tipo)).map((x) => ({
    ...itemDe(x),
    tipo: receta.tipo === "tv" ? "series" : "movie",
  }));
}

/** Mezcla de Fisher-Yates con una semilla (mulberry32): el mismo día da el mismo orden. */
function mezclar(lista, semilla) {
  let estado = semilla >>> 0;
  const azar = () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}
