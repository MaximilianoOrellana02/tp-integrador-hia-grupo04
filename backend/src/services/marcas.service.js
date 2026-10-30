import { crearCache } from "../utils/cache.js";
import { ErrorHttp } from "../utils/ErrorHttp.js";
import { armarDestacado, armarDestacados } from "./inicio.service.js";
import { itemOriginal } from "./originales.service.js";
import { tmdbGet } from "./tmdb.client.js";
import { conImdb } from "./tmdbIds.service.js";

/**
 * Pantallas de las marcas de Disney+ (2026-10-21): la tarjeta «Disney» de «Originales de
 * Disney+» en la app abre `/api/marcas/disney`. Mismo formato que Inicio (`{ filas }`, con
 * `destacado`, `top10` y `posters`): la app las dibuja con lo que ya sabe.
 *
 * Cada fila es un filtro de `/discover`. IDs verificados contra TMDB el 2026-10-21:
 * - Compañías: Walt Disney Pictures (2), Walt Disney Animation Studios (6125), Walt Disney
 *   Feature Animation (171656, la de los 90), Walt Disney Productions (3166, la de los
 *   clásicos: Blancanieves figura solo con esa), Disney Television Animation (3475).
 * - Cadenas: Disney Channel (54), Disney Junior (281).
 * - Palabras clave: «princess» (7376) y «live action remake» (245230), con `/search/keyword`.
 *
 * Marvel: Marvel Studios (420), Marvel Entertainment (7505), Marvel Enterprises (19551). Sus
 * filas de fases, Vengadores y orden cronológico son listas fijas de películas ([lista], IDs
 * de TMDB buscados por nombre y año el 2026-10-21; las 39 coincidieron).
 *
 * Una fila es un filtro de `/discover` (`tipo` + `filtros`) o una lista fija (`lista`, en ese
 * orden; las que todavía no se estrenaron no aparecen). Para sumar otra marca (Pixar…): un
 * elemento más en [MARCAS].
 */
const ESTUDIOS_DISNEY = "2|6125";
const MARVEL_STUDIOS = "420";

// Las películas del UCM por ID de TMDB
const UCM = {
  ironMan: 1726, hulk: 1724, ironMan2: 10138, thor: 10195, capitanAmerica: 1771, vengadores: 24428,
  ironMan3: 68721, thor2: 76338, soldadoInvierno: 100402, guardianes: 118340, ultron: 99861, antMan: 102899,
  civilWar: 271110, doctorStrange: 284052, guardianes2: 283995, homecoming: 315635, ragnarok: 284053,
  panteraNegra: 284054, infinityWar: 299536, antMan2: 363088, capitanaMarvel: 299537, endgame: 299534,
  lejosDeCasa: 429617,
  blackWidow: 497698, shangChi: 566525, eternals: 524434, sinCamino: 634649, multiverso: 453395,
  amorYTrueno: 616037, wakandaPorSiempre: 505642,
  quantumania: 640146, guardianes3: 447365, theMarvels: 609681, deadpoolWolverine: 533535,
  nuevoMundo: 822119, thunderbolts: 986056,
  cuatroFantasticos: 617126, nuevoDia: 969681, doomsday: 1003596,
};

const VENGADORES = [UCM.vengadores, UCM.ultron, UCM.infinityWar, UCM.endgame, UCM.doomsday];
const SPIDER_MAN = [UCM.homecoming, UCM.lejosDeCasa, UCM.sinCamino, UCM.nuevoDia];

/**
 * Las películas en el orden de la historia, como la línea de tiempo de Disney+. Las fuentes
 * consultadas (2026-10-21) coinciden en el final (Thunderbolts* → Los 4 Fantásticos) pero
 * ninguna trae la lista completa verificada: el lugar de Deadpool & Wolverine y de
 * Spider-Man: Un nuevo día (2026) es aproximado.
 */
const ORDEN_CRONOLOGICO = [
  UCM.capitanAmerica, UCM.capitanaMarvel, UCM.ironMan, UCM.ironMan2, UCM.hulk, UCM.thor, UCM.vengadores,
  UCM.thor2, UCM.ironMan3, UCM.soldadoInvierno, UCM.guardianes, UCM.guardianes2, UCM.ultron, UCM.antMan,
  UCM.civilWar, UCM.blackWidow, UCM.panteraNegra, UCM.homecoming, UCM.doctorStrange, UCM.ragnarok,
  UCM.antMan2, UCM.infinityWar, UCM.endgame, UCM.lejosDeCasa, UCM.shangChi, UCM.eternals, UCM.sinCamino,
  UCM.multiverso, UCM.amorYTrueno, UCM.wakandaPorSiempre, UCM.quantumania, UCM.guardianes3, UCM.theMarvels,
  UCM.deadpoolWolverine, UCM.nuevoMundo, UCM.thunderbolts, UCM.nuevoDia, UCM.cuatroFantasticos, UCM.doomsday,
];

/** Las fases, en orden de estreno (solo películas: las series van en su fila). */
const FASES = [
  {
    nombre: "Fase 1",
    detalle: "Saga del Infinito · 2008-2012",
    lista: [UCM.ironMan, UCM.hulk, UCM.ironMan2, UCM.thor, UCM.capitanAmerica, UCM.vengadores],
  },
  {
    nombre: "Fase 2",
    detalle: "Saga del Infinito · 2013-2015",
    lista: [UCM.ironMan3, UCM.thor2, UCM.soldadoInvierno, UCM.guardianes, UCM.ultron, UCM.antMan],
  },
  {
    nombre: "Fase 3",
    detalle: "Saga del Infinito · 2016-2019",
    lista: [
      UCM.civilWar, UCM.doctorStrange, UCM.guardianes2, UCM.homecoming, UCM.ragnarok, UCM.panteraNegra,
      UCM.infinityWar, UCM.antMan2, UCM.capitanaMarvel, UCM.endgame, UCM.lejosDeCasa,
    ],
  },
  {
    nombre: "Fase 4",
    detalle: "Saga del Multiverso · 2021-2022",
    lista: [
      UCM.blackWidow, UCM.shangChi, UCM.eternals, UCM.sinCamino, UCM.multiverso, UCM.amorYTrueno,
      UCM.wakandaPorSiempre,
    ],
  },
  {
    nombre: "Fase 5",
    detalle: "Saga del Multiverso · 2023-2025",
    lista: [UCM.quantumania, UCM.guardianes3, UCM.theMarvels, UCM.deadpoolWolverine, UCM.nuevoMundo, UCM.thunderbolts],
  },
  {
    nombre: "Fase 6",
    detalle: "Saga del Multiverso · desde 2025",
    lista: [UCM.cuatroFantasticos, UCM.nuevoDia, UCM.doomsday],
  },
];

const MARCAS = {
  disney: {
    nombre: "Disney",
    // Lo que va en los destacados de arriba: lo más popular del estudio con fondo y sinopsis
    destacados: { tipo: "movie", filtros: { with_companies: ESTUDIOS_DISNEY } },
    top10: { nombre: "Top 10 de Disney", tipo: "movie", filtros: { with_companies: ESTUDIOS_DISNEY } },
    filas: [
      {
        nombre: "Estrenos de Disney",
        tipo: "movie",
        filtros: { with_companies: ESTUDIOS_DISNEY, "vote_count.gte": "20", sort_by: "primary_release_date.desc", hoy: true },
      },
      {
        nombre: "Clásicos animados",
        detalle: "Desde Blancanieves (1937)",
        tipo: "movie",
        filtros: {
          with_companies: "3166",
          with_genres: "16",
          // Walt Disney Productions también hizo cientos de cortos: solo largometrajes conocidos
          "with_runtime.gte": "60",
          "vote_count.gte": "300",
          "primary_release_date.lte": "1988-12-31",
          sort_by: "vote_count.desc",
        },
      },
      {
        nombre: "Princesas",
        tipo: "movie",
        // Sin el género, «princess» también trae John Carter
        filtros: { with_companies: ESTUDIOS_DISNEY, with_keywords: "7376", with_genres: "16|10751", sort_by: "vote_count.desc" },
      },
      {
        nombre: "El renacimiento de Disney",
        detalle: "De La sirenita a Tarzán",
        tipo: "movie",
        filtros: {
          with_companies: "2|6125|171656",
          with_genres: "16",
          "with_runtime.gte": "60",
          "primary_release_date.gte": "1989-01-01",
          "primary_release_date.lte": "1999-12-31",
          sort_by: "vote_count.desc",
        },
      },
      {
        nombre: "Series animadas",
        tipo: "tv",
        filtros: { with_companies: "3475", "vote_count.gte": "20" },
      },
      {
        nombre: "Animación de Walt Disney Animation Studios",
        detalle: "Del 2000 a hoy",
        tipo: "movie",
        filtros: { with_companies: "6125", "primary_release_date.gte": "2000-01-01" },
      },
      {
        nombre: "Clásicos en acción real",
        detalle: "Las animadas, con actores",
        tipo: "movie",
        filtros: { with_companies: ESTUDIOS_DISNEY, with_keywords: "245230" },
      },
      {
        nombre: "Aventuras en acción real",
        tipo: "movie",
        filtros: { with_companies: "2", without_genres: "16,99" },
      },
      {
        nombre: "Disney Channel",
        tipo: "tv",
        filtros: { with_networks: "54", "vote_count.gte": "20" },
      },
      {
        nombre: "Las más queridas",
        detalle: "Mejor puntuadas por el público",
        tipo: "movie",
        // Con 2000 votos quedaban 6 después de sacar los repetidos
        filtros: { with_companies: ESTUDIOS_DISNEY, "vote_count.gte": "1000", sort_by: "vote_average.desc" },
      },
      {
        nombre: "Para los más chicos",
        detalle: "Disney Junior",
        tipo: "tv",
        filtros: { with_networks: "281", "vote_count.gte": "5" },
      },
    ],
  },

  // Marvel (2026-10-21, pedido del desarrollador: orden cronológico, Vengadores y fases)
  marvel: {
    nombre: "Marvel",
    destacados: { tipo: "movie", filtros: { with_companies: MARVEL_STUDIOS } },
    top10: { nombre: "Top 10 de Marvel", tipo: "movie", filtros: { with_companies: MARVEL_STUDIOS } },
    filas: [
      { nombre: "Los Vengadores", detalle: "Las grandes reuniones", lista: VENGADORES },
      {
        nombre: "En orden cronológico",
        detalle: "Las películas en el orden de la historia",
        lista: ORDEN_CRONOLOGICO,
        numerar: true,
      },
      {
        nombre: "Series del UCM",
        tipo: "tv",
        // Desde WandaVision (2021): Marvel Studios también figura en series viejas (Mutant X)
        // y en documentales («Leyendas de Marvel Studios»)
        filtros: {
          with_companies: MARVEL_STUDIOS,
          without_genres: "16,99",
          "first_air_date.gte": "2021-01-01",
          "vote_count.gte": "20",
        },
      },
      ...FASES,
      { nombre: "Spider-Man en el UCM", lista: SPIDER_MAN },
      {
        nombre: "Animación de Marvel",
        tipo: "tv",
        filtros: { with_companies: MARVEL_STUDIOS, with_genres: "16", "vote_count.gte": "10" },
      },
      {
        nombre: "Más allá del UCM",
        detalle: "X-Men, Deadpool y el Spider-Man de otros estudios",
        tipo: "movie",
        // Marvel Entertainment (7505) y Marvel Enterprises (19551, la de los 2000), sin lo
        // que también es de Marvel Studios (eso ya está arriba)
        filtros: {
          with_companies: "7505|19551",
          without_companies: MARVEL_STUDIOS,
          "vote_count.gte": "500",
          sort_by: "vote_count.desc",
        },
      },
    ],
  },
};

const HORA = 60 * 60 * 1000;
// Como «Originales de»: cambia despacio (popularidad y estrenos)
const cacheMarcas = crearCache({ duracionMs: 6 * HORA, maximo: 10 });
/** Con menos títulos que esto, la fila no se muestra. */
const MINIMO_POR_FILA = 6;
const POR_FILA = 20;

/** La pantalla de una marca (ej.: "disney"). 404 si no existe. */
export async function pantallaMarca(id) {
  const marca = Object.hasOwn(MARCAS, id) ? MARCAS[id] : null;
  if (!marca) throw new ErrorHttp(404, "No existe esa marca");
  return cacheMarcas.obtenerOCalcular(id, () => armarMarca(marca));
}

async function armarMarca(marca) {
  // Todas juntas; una que falla no tira abajo la pantalla (queda sin esa fila)
  const [destacados, top, ...filas] = await Promise.allSettled([
    titulosDe(marca.destacados),
    titulosDe(marca.top10),
    ...marca.filas.map(titulosDe),
  ]);

  const resultado = [];
  if (destacados.status === "fulfilled") {
    const destacado = await armarDestacados(
      destacados.value,
      ({ r }) => r.backdrop_path && r.overview,
      // Sin «N.º X hoy»: no es el ranking del día
      async (x) => ({ ...(await armarDestacado(x, null)), etiqueta: marca.nombre }),
    );
    if (destacado) resultado.push(destacado);
  }
  if (top.status === "fulfilled" && top.value.length >= MINIMO_POR_FILA) {
    resultado.push({ tipo: "top10", nombre: marca.top10.nombre, items: top.value.slice(0, 10).map(itemOriginal) });
  }
  // Sin repetidos entre filas de `/discover` (el Top 10 aparte): la de arriba se queda con el
  // título. Sin esto, Moana salía en Estrenos, Acción real, Clásicos en acción real y
  // Aventuras. Las listas fijas sí repiten (una película está en su fase y en el orden
  // cronológico) y no cuentan como usadas
  const usados = new Set();
  filas.forEach((r, i) => {
    const receta = marca.filas[i];
    if (r.status === "rejected") {
      console.error(`Marca ${marca.nombre}: falló «${receta.nombre}»:`, r.reason?.message);
      return;
    }
    const esLista = Boolean(receta.lista);
    const elegidos = esLista ? r.value : r.value.filter((x) => !usados.has(x.imdbId));
    // Una lista fija puede ser corta (Fase 6 tiene 2 estrenadas): alcanza con 2
    if (elegidos.length < (esLista ? 2 : MINIMO_POR_FILA)) return;
    if (!esLista) elegidos.forEach((x) => usados.add(x.imdbId));
    const items = elegidos.map((x, n) => ({
      ...itemOriginal(x),
      // «N.º 1», «N.º 2»… en el póster (orden cronológico)
      ...(receta.numerar ? { etiqueta: `N.º ${n + 1}` } : {}),
    }));
    resultado.push({ tipo: "posters", nombre: receta.nombre, detalle: receta.detalle ?? null, items });
  });
  return { filas: resultado };
}

// Las fichas de las listas fijas: cambian poco (póster, sinopsis), una semana alcanza
const cacheFichas = crearCache({ duracionMs: 7 * 24 * HORA, maximo: 300 });

/**
 * Las películas de una lista fija, en ese orden y con la forma de un resultado de
 * `/discover` (así sirven igual a [itemOriginal] y al destacado). Sin las que todavía no se
 * estrenaron (Avengers: Doomsday aparece sola el día del estreno) ni las que fallan.
 */
async function titulosDeLista(ids) {
  const hoy = new Date().toISOString().slice(0, 10);
  const fichas = await Promise.all(
    ids.map((id) =>
      cacheFichas
        .obtenerOCalcular(id, () => tmdbGet(`/movie/${id}`, { append_to_response: "external_ids" }))
        .catch(() => null),
    ),
  );
  return fichas
    .filter((m) => m?.poster_path && m.external_ids?.imdb_id && m.release_date && m.release_date <= hoy)
    .map((m) => ({
      r: { ...m, media_type: "movie", genre_ids: (m.genres ?? []).map((g) => g.id) },
      imdbId: m.external_ids.imdb_id,
    }));
}

/** Los títulos de una receta, con póster e ID de IMDb (sin él la app no puede abrirlos). */
async function titulosDe({ tipo, filtros, lista: ids }) {
  if (ids) return titulosDeLista(ids);
  const { hoy, ...resto } = filtros;
  const fechaHoy = new Date().toISOString().slice(0, 10);
  const lista = await tmdbGet(`/discover/${tipo}`, {
    include_adult: "false",
    sort_by: "popularity.desc",
    "vote_count.gte": "50",
    // «Estrenos»: solo lo ya estrenado (si no, aparecen las anunciadas para 2028)
    ...(hoy ? { [tipo === "tv" ? "first_air_date.lte" : "primary_release_date.lte"]: fechaHoy } : {}),
    ...resto,
  });
  const candidatos = (lista?.results ?? [])
    .filter((r) => r.poster_path)
    .slice(0, POR_FILA)
    .map((r) => ({ ...r, media_type: tipo }));
  return conImdb(candidatos, tipo);
}
