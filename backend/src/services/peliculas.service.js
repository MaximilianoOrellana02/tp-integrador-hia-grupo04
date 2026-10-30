import { crearCache } from "../utils/cache.js";
import { ErrorHttp } from "../utils/ErrorHttp.js";
import { armarDestacado, armarDestacados, itemDe } from "./inicio.service.js";
import { tmdbGet, urlImagen } from "./tmdb.client.js";
import { peliculasDeTmdb } from "./peliculasTmdb.service.js";
import { conImdb } from "./tmdbIds.service.js";

/**
 * Pantalla «Películas» (app de PC, 2026-10-15): las filas en el mismo formato que Inicio
 * (`{ tipo, nombre, detalle, items | sagas }`), armadas con TMDB.
 *
 * Cambian con el tiempo (pedido del desarrollador):
 * - Del día: destacado y Top 10 (tendencias de TMDB).
 * - Rotan por fecha: 8 sagas, un director, una tanda de «Aclamadas» y de «Joyas ocultas».
 *   Se elige con el número de día (hora de Argentina): todo el día lo mismo, al otro
 *   día otra cosa, sin guardar nada.
 * - Por mes: «Temporada» (terror en octubre, Navidad en diciembre…).
 * - Fija: ganadoras del Óscar a mejor película. Por día: las nominadas de una ceremonia.
 *
 * Las listas fijas (sagas, directores, Óscar) se verificaron contra TMDB el 2026-10-15.
 */

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
// Cada sección se guarda por separado: si una falla, las demás no se vuelven a armar.
// Las tendencias (destacado y Top 10) cambian durante el día: 3 h
const cacheTendencias = crearCache({ duracionMs: 3 * HORA, maximo: 2 });
// Las demás cambian una vez por día (la clave lleva el día; las de ayer vencen solas)
const cacheDelDia = crearCache({ duracionMs: DIA, maximo: 20 });
// Una saga o una ficha cambian poco: un día
const cacheTmdb = crearCache({ duracionMs: DIA, maximo: 300 });

/** Número de día en hora de Argentina (UTC−3): cambia a la medianoche de acá. */
export function diaDeHoy() {
  return Math.floor((Date.now() - 3 * HORA) / DIA);
}

// --- Sagas (colecciones de TMDB) ---------------------------------------------------

const SAGAS = [
  119, 121938, 1241, 10, 263, 10194, 328, 264, 2344, 84, 87359, 230, 8091, 528, 295, 2150,
  8354, 86066, 89137, 86311, 9485, 404609, 1575, 726871, 9888, 77816, 556, 131635, 304,
  31562, 1570, 8945, 87118, 14740, 173710, 90863, 86055, 2980,
];
const SAGAS_POR_DIA = 8;

function yaEstrenada(p) {
  return Boolean(p.release_date) && p.release_date <= new Date().toISOString().slice(0, 10);
}

/** «El Señor de los Anillos - Colección» → «El Señor de los Anillos». */
function nombreDeSaga(nombre) {
  return (nombre ?? "").replace(/\s*[-–(]\s*Colecci[oó]n\)?\s*$/i, "").replace(/\s+/g, " ").trim();
}

async function coleccion(id) {
  return cacheTmdb.obtenerOCalcular(`coleccion:${id}`, () => tmdbGet(`/collection/${id}`));
}

/** Lo que muestra la tarjeta de una saga: nombre, fondo, cantidad de películas y años. */
function resumenDeSaga(c) {
  // Solo lo ya estrenado: una saga con una película anunciada mostraba «2001–2028»
  const partes = (c.parts ?? []).filter(yaEstrenada);
  const anios = partes.map((p) => Number(p.release_date.slice(0, 4))).filter(Boolean);
  return {
    id: c.id,
    nombre: nombreDeSaga(c.name),
    descripcion: c.overview || null,
    fondo: urlImagen(c.backdrop_path, "w780"),
    poster: urlImagen(c.poster_path, "w342"),
    cantidad: partes.length,
    anios: anios.length ? `${Math.min(...anios)}–${Math.max(...anios)}` : null,
  };
}

async function sagasDelDia(dia) {
  const inicio = (dia * SAGAS_POR_DIA) % SAGAS.length;
  const ids = Array.from({ length: SAGAS_POR_DIA }, (_, i) => SAGAS[(inicio + i) % SAGAS.length]);
  const colecciones = await Promise.all(ids.map((id) => coleccion(id).catch(() => null)));
  return colecciones.filter((c) => c && (c.parts ?? []).length >= 2).map(resumenDeSaga);
}

/** Una saga completa: sus datos y sus películas en orden de estreno (para la pantalla Saga). */
export async function saga(id) {
  if (!/^\d{1,8}$/.test(String(id))) throw new ErrorHttp(400, "Saga no válida");
  const c = await coleccion(id);
  if (!c) throw new ErrorHttp(404, "No existe esa saga");
  const partes = (c.parts ?? [])
    .filter((p) => p.poster_path && yaEstrenada(p))
    .sort((a, b) => (a.release_date || "9999").localeCompare(b.release_date || "9999"));
  const peliculas = (await conImdb(partes, "movie")).map(itemDe);
  return { saga: { ...resumenDeSaga(c), fondo: urlImagen(c.backdrop_path, "w1280") }, peliculas };
}

// --- Buscar sagas (Buscar de la app, 2026-10-17) --------------------------------------

const MAXIMO_SAGAS_BUSQUEDA = 3;
// TMDB devuelve colecciones parecidas: se miran las primeras y se descartan las que no coinciden
const CANDIDATAS_BUSQUEDA = 6;
// Votos sumados de sus películas. Deja afuera copias y colecciones desconocidas (medido el
// 2026-10-17: Viernes 13 19 749, Cocoon 2511; la coreana de «Friday the 13th», 5)
const MINIMO_VOTOS_SAGA = 1000;

/** Minúsculas, sin tildes y en palabras: «Señor» y «senor» son lo mismo. */
function palabras(texto) {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9ñ]+/)
    .filter(Boolean);
}

/**
 * Cada palabra buscada está entera en el nombre: «coco» no trae «Cocodrilo Dundee». Solo
 * un número puede seguir con letras («13» coincide con «13th»).
 */
function coincideSaga(consulta, ...nombres) {
  const buscadas = palabras(consulta);
  return nombres.some((nombre) => {
    const delNombre = palabras(nombre);
    return buscadas.every((b) =>
      delNombre.some((p) => p === b || (/^\d+$/.test(b) && new RegExp(`^${b}[a-z]+$`).test(p))),
    );
  });
}

/** Sin películas para adultos (TMDB las devuelve aunque se pida `include_adult=false`). */
function esApta(c) {
  return !(c.parts ?? []).some((p) => p.adult);
}

/** Votos de todas sus películas: con «friday the 13th», la saga real y no una copia coreana. */
function votosDeSaga(c) {
  return (c.parts ?? []).reduce((total, p) => total + (p.vote_count ?? 0), 0);
}

/**
 * Sagas cuyo nombre coincide con lo buscado, con sus películas ya estrenadas en orden.
 * Solo las que tienen 2 películas o más (TMDB tiene «colecciones» de una sola).
 */
export async function buscarSagas(consulta) {
  const q = String(consulta ?? "").trim();
  if (q.length < 2 || q.length > 100) return [];

  const ids = await cacheTmdb.obtenerOCalcular(`busqueda-sagas:${q.toLowerCase()}`, async () => {
    const resultado = await tmdbGet("/search/collection", { query: q, include_adult: "false" });
    return (resultado?.results ?? [])
      .slice(0, CANDIDATAS_BUSQUEDA)
      .filter((c) => coincideSaga(q, c.name, c.original_name))
      .map((c) => c.id);
  });

  const colecciones = (await Promise.all(ids.map((id) => coleccion(id).catch(() => null))))
    .filter((c) => c && esApta(c) && votosDeSaga(c) >= MINIMO_VOTOS_SAGA)
    .filter((c) => (c.parts ?? []).filter((p) => p.poster_path && yaEstrenada(p)).length >= 2)
    .sort((a, b) => votosDeSaga(b) - votosDeSaga(a))
    .slice(0, MAXIMO_SAGAS_BUSQUEDA);

  return Promise.all(colecciones.map((c) => saga(c.id)));
}

// --- Directores ----------------------------------------------------------------------

const DIRECTORES = [
  [525, "Christopher Nolan"], [488, "Steven Spielberg"], [137427, "Denis Villeneuve"],
  [138, "Quentin Tarantino"], [1032, "Martin Scorsese"], [84714, "Juan José Campanella"],
  [10828, "Guillermo del Toro"], [11218, "Alfonso Cuarón"], [223, "Alejandro G. Iñárritu"],
  [591600, "Damián Szifron"], [309, "Pedro Almodóvar"], [7467, "David Fincher"],
  [578, "Ridley Scott"], [2710, "James Cameron"], [108, "Peter Jackson"],
  [608, "Hayao Miyazaki"], [510, "Tim Burton"], [5655, "Wes Anderson"],
  [240, "Stanley Kubrick"], [2636, "Alfred Hitchcock"], [190, "Clint Eastwood"],
  [24, "Robert Zemeckis"], [12890, "Pete Docter"],
];

async function dirigidasPor(dia) {
  const [id, nombre] = DIRECTORES[dia % DIRECTORES.length];
  const creditos = await tmdbGet(`/person/${id}/movie_credits`);
  // Lo que dirigió, de lo más visto a lo menos (sin repetir ni cortos sin póster)
  const vistas = new Set();
  const dirigidas = (creditos?.crew ?? [])
    .filter((c) => c.job === "Director" && c.poster_path && !vistas.has(c.id) && vistas.add(c.id))
    .sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0))
    .slice(0, 20);
  const items = (await conImdb(dirigidas, "movie")).map(itemDe);
  return { nombre: `Dirigidas por ${nombre}`, items };
}

// --- Óscar a mejor película: ganadoras y nominadas -----------------------------------

/**
 * [id de TMDB, año de la ceremonia], de la más nueva a la más vieja. Sumar a mano las nuevas
 * (y su ceremonia en NOMINADAS_OSCAR). Verificadas contra Wikipedia y TMDB el 2026-10-17.
 */
const OSCAR_MEJOR_PELICULA = [
  [1054867, 2026],
  [1064213, 2025], [872585, 2024], [545611, 2023], [776503, 2022], [581734, 2021],
  [496243, 2020], [490132, 2019], [399055, 2018], [376867, 2017], [314365, 2016],
  [194662, 2015], [76203, 2014], [68734, 2013], [74643, 2012], [45269, 2011],
  [12162, 2010], [12405, 2009], [6977, 2008], [1422, 2007], [1640, 2006],
  [70, 2005], [122, 2004], [1574, 2003], [453, 2002], [98, 2001],
];

/**
 * Nominadas a mejor película por ceremonia, la ganadora primero (IDs de TMDB). Lista de
 * Wikipedia («Academy Award for Best Picture»), cada título buscado en TMDB por nombre y año
 * de estreno, 2026-10-17. Las ganadoras coinciden con OSCAR_MEJOR_PELICULA.
 */
const NOMINADAS_OSCAR = {
  2026: [1054867, 701387, 911430, 1062722, 858024, 1317288, 1220564, 1124566, 1233413, 1241983],
  2025: [1064213, 549509, 661539, 974576, 693134, 974950, 1000837, 1028196, 933260, 402431],
  2024: [872585, 1056360, 915935, 346698, 840430, 466420, 523607, 666277, 792307, 467244],
  2023: [545611, 49046, 76600, 674324, 614934, 804095, 817758, 361743, 497828, 777245],
  2022: [776503, 777270, 646380, 758866, 438631, 614917, 718032, 597208, 600583, 511809],
  2021: [581734, 600354, 583406, 614560, 615643, 582014, 502033, 556984],
  2020: [496243, 359724, 398978, 515001, 475557, 331482, 492188, 530915, 466272],
  2019: [490132, 284054, 487558, 424694, 375262, 426426, 332562, 429197],
  2018: [399055, 398818, 399404, 374720, 419430, 391713, 400617, 446354, 359940],
  2017: [376867, 329865, 393457, 324786, 338766, 381284, 313369, 334543, 334541],
  2016: [314365, 318846, 296098, 167073, 76341, 286217, 281957, 264644],
  2015: [194662, 190859, 85350, 120467, 205596, 273895, 266856, 244786],
  2014: [76203, 168672, 109424, 152532, 49047, 152601, 129670, 205220, 106646],
  2013: [68734, 86837, 84175, 68718, 87827, 72976, 82695, 82693, 97630],
  2012: [74643, 65057, 64685, 50014, 44826, 59436, 60308, 8967, 57212],
  2011: [45269, 44214, 45317, 27205, 39781, 44115, 37799, 10193, 44264, 39013],
  2010: [12162, 19995, 22881, 17654, 24684, 16869, 25793, 12573, 14160, 22947],
};
const CEREMONIAS_NOMINADAS = Object.keys(NOMINADAS_OSCAR).map(Number).sort((a, b) => b - a);

/**
 * Los pósters de estas películas, en el mismo orden y cada uno con su ID de TMDB (sin las
 * que no tienen póster o ID de IMDb).
 */
async function postersDe(ids) {
  const peliculas = await peliculasDeTmdb(ids);
  return ids.flatMap((id) => {
    const r = peliculas.get(id);
    return r?.imdbId && r.poster_path ? [{ id, item: { ...itemDe({ r, imdbId: r.imdbId }), tipo: "movie" } }] : [];
  });
}

async function ganadorasDelOscar() {
  const ceremonias = new Map(OSCAR_MEJOR_PELICULA);
  const posters = await postersDe(OSCAR_MEJOR_PELICULA.map(([id]) => id));
  return posters.map(({ id, item }) => ({ ...item, etiqueta: `Óscar ${ceremonias.get(id)}` }));
}

/** Una ceremonia por día (vuelve a empezar cuando se terminan), con la ganadora marcada. */
async function nominadasDelDia(dia) {
  const ceremonia = CEREMONIAS_NOMINADAS[dia % CEREMONIAS_NOMINADAS.length];
  const [ganadora] = NOMINADAS_OSCAR[ceremonia];
  const posters = await postersDe(NOMINADAS_OSCAR[ceremonia]);
  return {
    nombre: `Nominadas al Óscar ${ceremonia}`,
    detalle: "Mejor película: la ganadora y las demás candidatas",
    items: posters.map(({ id, item }) => (id === ganadora ? { ...item, etiqueta: "Ganadora" } : item)),
  };
}

// --- Temporada del mes ---------------------------------------------------------------

/** Una por mes (índice 0 = enero). Géneros y palabras clave de TMDB (verificados). */
const TEMPORADAS = [
  { nombre: "Verano de acción", detalle: "Adrenalina para las tardes de calor", filtro: { with_genres: "28" } },
  { nombre: "San Valentín", detalle: "Historias de amor para ver de a dos", filtro: { with_genres: "10749" } },
  { nombre: "Basadas en hechos reales", detalle: "Historias que pasaron de verdad", filtro: { with_keywords: "9672" } },
  { nombre: "Grandes aventuras", detalle: "Viajes, tesoros y mundos por descubrir", filtro: { with_genres: "12" } },
  { nombre: "Misterio y suspenso", detalle: "Para adivinar quién fue", filtro: { with_genres: "9648" } },
  { nombre: "Pasión deportiva", detalle: "Historias de canchas, rings y pistas", filtro: { with_keywords: "6075" } },
  { nombre: "Vacaciones de invierno", detalle: "Para ver en familia", filtro: { with_genres: "16,10751" } },
  { nombre: "Mes de las infancias", detalle: "Animación para todas las edades", filtro: { with_genres: "16" } },
  { nombre: "Primavera de comedias románticas", detalle: "Risas y enamoramientos", filtro: { with_genres: "35,10749" } },
  { nombre: "Noche de brujas", detalle: "Terror para el mes de Halloween", filtro: { with_genres: "27" } },
  { nombre: "Thrillers para no pestañear", detalle: "Tensión de principio a fin", filtro: { with_genres: "53" } },
  { nombre: "Navidad", detalle: "Películas para las fiestas", filtro: { with_keywords: "207317" } },
];

async function temporadaDelMes() {
  const mes = new Date(Date.now() - 3 * HORA).getUTCMonth();
  const { nombre, detalle, filtro } = TEMPORADAS[mes];
  const lista = await tmdbGet("/discover/movie", {
    ...filtro,
    include_adult: "false",
    "vote_count.gte": "300",
    sort_by: "popularity.desc",
  });
  return { nombre, detalle, items: await armar(lista) };
}

// --- Aclamadas y joyas (rotan la tanda cada día) -------------------------------------

// Recitales y documentales no son lo que se busca en estas filas
const SIN_GENEROS = "99,10402";

async function aclamadas(dia) {
  const lista = await tmdbGet("/discover/movie", {
    include_adult: "false",
    "vote_count.gte": "3000",
    without_genres: SIN_GENEROS,
    sort_by: "vote_average.desc",
    page: String((dia % 8) + 1),
  });
  return armar(lista);
}

async function joyasOcultas(dia) {
  const lista = await tmdbGet("/discover/movie", {
    include_adult: "false",
    "vote_average.gte": "7.3",
    without_genres: SIN_GENEROS,
    "vote_count.gte": "300",
    "vote_count.lte": "2500",
    sort_by: "popularity.desc",
    page: String((dia % 6) + 1),
  });
  return armar(lista);
}

async function armar(lista) {
  const candidatos = (lista?.results ?? []).filter((r) => r.poster_path).slice(0, 20);
  return (await conImdb(candidatos, "movie")).map((x) => ({ ...itemDe(x), tipo: "movie" }));
}

// --- Destacado y Top 10 de películas -------------------------------------------------

async function topPeliculasDelDia() {
  const tendencias = await tmdbGet("/trending/movie/day");
  const candidatos = (tendencias?.results ?? []).filter((r) => r.poster_path).slice(0, 15);
  const items = (await conImdb(candidatos, "movie")).slice(0, 10);
  const destacado = await armarDestacados(items, ({ r }) => r.backdrop_path && r.overview, armarDestacado);
  return { items: items.map((x) => ({ ...itemDe(x), tipo: "movie" })), destacado };
}

// --- Todas las filas -----------------------------------------------------------------

/**
 * Las filas de Películas, en orden. Cada sección se arma y se guarda por separado: si una
 * falla, las demás se muestran igual y solo esa se vuelve a intentar en el próximo pedido.
 */
export async function obtenerPeliculas() {
  const dia = diaDeHoy();
  // Una sección vacía (TMDB no trajo nada) no se guarda: quedaría vacía todo el día
  const delDia = (nombre, armar) =>
    cacheDelDia.obtenerOCalcular(`${nombre}:${dia}`, async () => {
      const seccion = await armar();
      if ((Array.isArray(seccion) ? seccion : seccion?.items)?.length === 0) throw new Error(`${nombre} vacía`);
      return seccion;
    });

  const secciones = await Promise.allSettled([
    cacheTendencias.obtenerOCalcular(`top:${dia}`, topPeliculasDelDia),
    delDia("temporada", temporadaDelMes),
    delDia("sagas", () => sagasDelDia(dia)),
    delDia("aclamadas", () => aclamadas(dia)),
    delDia("director", () => dirigidasPor(dia)),
    delDia("oscar", ganadorasDelOscar),
    delDia("nominadas", () => nominadasDelDia(dia)),
    delDia("joyas", () => joyasOcultas(dia)),
  ]);
  const [top, temporada, sagas, criticas, director, oscar, nominadas, joyas] = secciones.map((s) =>
    s.status === "fulfilled" ? s.value : null,
  );
  secciones.forEach((s) => {
    if (s.status === "rejected") console.error("Películas: falló una sección:", s.reason?.message);
  });

  const filas = [];
  if (top?.destacado) filas.push(top.destacado);
  if (top?.items.length) filas.push({ tipo: "top10", nombre: "Top 10 películas hoy", items: top.items });
  if (temporada?.items.length) filas.push({ tipo: "posters", ...temporada });
  if (sagas?.length) {
    filas.push({ tipo: "sagas", nombre: "Sagas completas", detalle: "Maratones de principio a fin", sagas });
  }
  if (criticas?.length) {
    filas.push({ tipo: "posters", nombre: "Aclamadas por la crítica", detalle: "Puntaje alto con miles de votos", items: criticas });
  }
  if (director?.items.length) filas.push({ tipo: "posters", nombre: director.nombre, items: director.items });
  if (oscar?.length) {
    filas.push({ tipo: "posters", nombre: "Ganadoras del Óscar", detalle: "Mejor película, de la más nueva a la más vieja", items: oscar });
  }
  if (nominadas?.items.length) filas.push({ tipo: "posters", ...nominadas });
  if (joyas?.length) {
    filas.push({ tipo: "posters", nombre: "Joyas ocultas", detalle: "Muy bien puntuadas y poco conocidas", items: joyas });
  }

  return { filas };
}
