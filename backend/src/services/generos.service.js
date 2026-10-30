import { crearCache } from "../utils/cache.js";
import { ErrorHttp } from "../utils/ErrorHttp.js";
import { armarDestacado, armarDestacados, GENEROS_TMDB, itemDe } from "./inicio.service.js";
import { destacadoDeSerie } from "./series.service.js";
import { tmdbGet, urlImagen } from "./tmdb.client.js";
import { conImdb } from "./tmdbIds.service.js";

/**
 * Pantalla de un género (2026-10-26, TV): como Películas y Series, en el formato de Inicio.
 *
 * - Página 1: destacados del género (varios, pasan solos), «Top 10 de la semana», filas
 *   (populares, mejor puntuadas, estrenos, joyas ocultas, clásicos) y un banner grande en el
 *   medio.
 * - Páginas 2 en adelante: catálogo extendido, tandas de [POR_TANDA] recetas del género (por
 *   década, país, duración…), sin títulos que ya salieron más arriba.
 *
 * `GET /api/genero/:tipo/:genero?pagina=N` (tipo «movie» o «series»; género como en Cinemeta,
 * ej. «Comedy»). Cada página se guarda 6 h.
 */

const HORA = 60 * 60 * 1000;
const cacheGenero = crearCache({ duracionMs: 6 * HORA, maximo: 120 });
const POR_FILA = 20;
const MINIMO_POR_FILA = 8;
const POR_TANDA = 5;

const NOMBRES = {
  Action: "Acción", Adventure: "Aventuras", Animation: "Animación", Comedy: "Comedia",
  Crime: "Policiales", Documentary: "Documentales", Drama: "Drama", Family: "Familia",
  Fantasy: "Fantasía", History: "Historia", Horror: "Terror", Mystery: "Misterio",
  Romance: "Romance", "Sci-Fi": "Ciencia ficción", Thriller: "Suspenso", War: "Bélicas",
  Western: "Western",
};

// Cómo se nombran las filas del catálogo extendido («Comedias de los 90», «Series policiales
// coreanas»); los que no están: «Películas de acción…», «Series de misterio…»
const PLURALES_PELICULAS = {
  Comedy: "Comedias", Drama: "Dramas", Crime: "Policiales", Documentary: "Documentales",
  Romance: "Romances", Animation: "Películas animadas", Adventure: "Aventuras", War: "Películas bélicas",
  Western: "Westerns",
};
const PLURALES_SERIES = {
  Crime: "Series policiales", Documentary: "Documentales", Animation: "Series animadas",
  Comedy: "Series de comedia", War: "Series bélicas",
};

// Programas de entrevistas, noticias y reality; en películas, documentales y recitales no
// van mezclados con la ficción (salvo en el género Documentales)
const SIN_GENEROS = { movie: ["10402", "10770"], tv: ["10763", "10764", "10767", "10766"] };

const DECADAS = [
  [1980, "de los 80"], [1990, "de los 90"], [2000, "de los 2000"], [2010, "de los 2010"], [2020, "de los 2020"],
];
const PAISES = [
  ["KR", "coreanas"], ["JP", "japonesas"], ["ES", "españolas"], ["FR", "francesas"],
  ["GB", "británicas"], ["MX", "mexicanas"], ["AR", "argentinas"], ["IN", "de la India"], ["IT", "italianas"],
];

/** Lo que se pide a `/discover` para el tipo y género (sin página). */
function base(tipoTmdb, idGenero) {
  const sin = SIN_GENEROS[tipoTmdb].filter((g) => g !== String(idGenero));
  return {
    with_genres: String(idGenero),
    without_genres: (tipoTmdb === "movie" && idGenero !== 99 ? [...sin, "99"] : sin).join(","),
    include_adult: "false",
    ...(tipoTmdb === "tv" ? { with_type: "4|2" } : {}),
  };
}

/** Recetas del catálogo extendido: décadas, países y algunas sueltas, con el género puesto. */
function recetasDe(tipoTmdb, plural) {
  const campo = tipoTmdb === "movie" ? "primary_release_date" : "first_air_date";
  const decadas = DECADAS.map(([desde, texto]) => ({
    nombre: `${plural} ${texto}`,
    filtros: {
      [`${campo}.gte`]: `${desde}-01-01`,
      [`${campo}.lte`]: `${desde + 9}-12-31`,
      "vote_count.gte": tipoTmdb === "movie" ? "200" : "80",
      sort_by: "vote_count.desc",
    },
  }));
  const paises = PAISES.map(([pais, texto]) => ({
    nombre: `${plural} ${texto}`,
    filtros: { with_origin_country: pais, "vote_count.gte": "40", sort_by: "popularity.desc" },
  }));
  const sueltas = tipoTmdb === "movie"
    ? [
        { nombre: "Para ver en menos de 100 minutos", filtros: { "with_runtime.lte": "100", "with_runtime.gte": "60", "vote_count.gte": "300", sort_by: "popularity.desc" } },
        { nombre: "Épicas de más de 2 horas y media", filtros: { "with_runtime.gte": "150", "vote_count.gte": "500", sort_by: "vote_average.desc" } },
        { nombre: "Las más votadas de la historia", filtros: { "vote_count.gte": "5000", sort_by: "vote_count.desc" } },
        { nombre: "Para ver en familia", filtros: { with_genres: undefined, "vote_count.gte": "300", sort_by: "popularity.desc" }, familia: true },
      ]
    : [
        { nombre: "Miniseries", filtros: { with_type: "2", "vote_count.gte": "50", sort_by: "popularity.desc" } },
        { nombre: "Terminadas: para maratonear", filtros: { with_status: "3", "vote_count.gte": "200", sort_by: "vote_average.desc" } },
        { nombre: "Las más votadas de la historia", filtros: { "vote_count.gte": "2000", sort_by: "vote_count.desc" } },
      ];
  // Décadas y países intercalados, así cada tanda mezcla épocas y lugares
  const mezcla = [];
  for (let i = 0; i < Math.max(decadas.length, paises.length); i++) {
    if (decadas[i]) mezcla.push(decadas[i]);
    if (paises[i]) mezcla.push(paises[i]);
    if (sueltas[i]) mezcla.push(sueltas[i]);
  }
  return mezcla;
}

/** Valida y traduce los parámetros; 400 si el tipo no existe, 404 si el género no. */
function datosDe(tipo, genero) {
  const tipoTmdb = { movie: "movie", series: "tv" }[tipo];
  if (!tipoTmdb) throw new ErrorHttp(400, 'El tipo debe ser "movie" o "series"');
  if (!/^[A-Za-z-]{2,20}$/.test(genero ?? "")) throw new ErrorHttp(400, "Género no válido");
  const idGenero = GENEROS_TMDB[tipoTmdb][genero];
  if (!idGenero) throw new ErrorHttp(404, "No hay ese género");
  const nombre = NOMBRES[genero] ?? genero;
  const plural = (tipoTmdb === "movie" ? PLURALES_PELICULAS : PLURALES_SERIES)[genero]
    ?? (tipoTmdb === "movie" ? `Películas de ${nombre.toLowerCase()}` : `Series de ${nombre.toLowerCase()}`);
  return { tipoTmdb, idGenero, nombre, plural };
}

/** Una página de la pantalla del género: `{ filas, siguiente }`. */
export async function paginaGenero(tipo, genero, pagina = 1) {
  const numero = Number(pagina);
  if (!Number.isInteger(numero) || numero < 1) throw new ErrorHttp(400, "Página no válida");
  const datos = datosDe(tipo, genero);
  const tandas = Math.ceil(recetasDe(datos.tipoTmdb, datos.plural).length / POR_TANDA);
  const primera = await cacheGenero.obtenerOCalcular(`${tipo}:${genero}:1`, () => armarPrimera(datos));
  if (numero === 1) return { filas: primera.filas, siguiente: tandas > 0 ? 2 : null };
  if (numero - 1 > tandas) return { filas: [], siguiente: null };

  const { filas } = await tanda(tipo, genero, datos, numero - 1, primera.usados);
  const hayMas = numero - 1 < tandas;
  // La que sigue se prepara sin esperarla (como Inicio)
  if (hayMas) tanda(tipo, genero, datos, numero, primera.usados).catch(() => {});
  return { filas, siguiente: hayMas ? numero + 1 : null };
}

/** Los títulos de un `/discover`, con póster, ID de IMDb, fondo y sinopsis. */
async function titulos(tipoTmdb, filtros, paginas = 1) {
  const respuestas = await Promise.all(
    Array.from({ length: paginas }, (_, i) =>
      tmdbGet(`/discover/${tipoTmdb}`, { ...filtros, page: String(i + 1) }),
    ),
  );
  const candidatos = respuestas
    .flatMap((r) => r?.results ?? [])
    .filter((r) => r.poster_path)
    .map((r) => ({ ...r, media_type: tipoTmdb }));
  return conImdb(candidatos, tipoTmdb);
}

/** Formato de una fila de pósters: con fondo y sinopsis (las filas apaisadas de la app los usan). */
function item({ r, imdbId }) {
  return {
    ...itemDe({ r, imdbId }),
    fondo: r.backdrop_path ? urlImagen(r.backdrop_path, "w780") : null,
    descripcion: r.overview || null,
  };
}

async function armarPrimera({ tipoTmdb, idGenero, nombre, plural }) {
  const comun = base(tipoTmdb, idGenero);
  const campo = tipoTmdb === "movie" ? "primary_release_date" : "first_air_date";
  const hoy = new Date();
  const fecha = (dias) => new Date(hoy.getTime() + dias * 24 * HORA).toISOString().slice(0, 10);

  const [populares, semana, mejores, estrenos, joyas, clasicos] = await Promise.allSettled([
    titulos(tipoTmdb, { ...comun, "vote_count.gte": "300", sort_by: "popularity.desc" }, 2),
    // Tendencias de la semana (de todos los géneros): se quedan las de este
    Promise.all(["1", "2", "3"].map((page) => tmdbGet(`/trending/${tipoTmdb}/week`, { page }))).then((rs) =>
      conImdb(
        rs.flatMap((r) => r?.results ?? [])
          .filter((r) => r.poster_path && (r.genre_ids ?? []).includes(idGenero))
          .map((r) => ({ ...r, media_type: tipoTmdb }))
          .slice(0, 12),
        tipoTmdb,
      ),
    ),
    titulos(tipoTmdb, {
      ...comun,
      "vote_count.gte": tipoTmdb === "movie" ? "1500" : "400",
      [`${campo}.lte`]: fecha(-365),
      sort_by: "vote_average.desc",
    }),
    titulos(tipoTmdb, {
      ...comun,
      [`${campo}.gte`]: fecha(-240),
      [`${campo}.lte`]: fecha(0),
      "vote_count.gte": "20",
      sort_by: "popularity.desc",
    }),
    titulos(tipoTmdb, {
      ...comun,
      "vote_average.gte": "7.2",
      "vote_count.gte": tipoTmdb === "movie" ? "200" : "80",
      "vote_count.lte": tipoTmdb === "movie" ? "2500" : "800",
      sort_by: "vote_average.desc",
    }),
    titulos(tipoTmdb, {
      ...comun,
      [`${campo}.lte`]: "1989-12-31",
      "vote_count.gte": tipoTmdb === "movie" ? "500" : "100",
      sort_by: "vote_count.desc",
    }),
  ]);
  const valor = (r, que) => {
    if (r.status === "fulfilled") return r.value;
    console.error(`Género ${nombre}: falló «${que}»:`, r.reason?.message);
    return [];
  };

  const filas = [];
  const usados = new Set();
  const listaPopulares = valor(populares, "populares");

  // Destacados: los más populares con fondo y sinopsis (pasan uno tras otro en la app)
  const destacado = await armarDestacados(
    listaPopulares,
    ({ r }) => r.backdrop_path && r.overview,
    async (x) => {
      const armado = tipoTmdb === "movie" ? await armarDestacado(x, null) : await destacadoDeSerie(x, null);
      return { ...armado, etiqueta: `${tipoTmdb === "movie" ? "Película" : "Serie"} · ${nombre}` };
    },
  );
  if (destacado) {
    filas.push(destacado);
    [destacado, ...(destacado.mas ?? [])].forEach((d) => usados.add(d.titulo?.imdbId));
  }

  // Top 10 de la semana: si no hay 10 en tendencia, se completa con los populares
  const top = [...valor(semana, "top 10")];
  for (const x of listaPopulares) {
    if (top.length >= 10) break;
    if (!top.some((t) => t.imdbId === x.imdbId)) top.push(x);
  }
  if (top.length >= 5) {
    filas.push({ tipo: "top10", nombre: `Top 10 de ${nombre.toLowerCase()} esta semana`, items: top.slice(0, 10).map(item) });
  }

  const agregar = (nombreFila, lista) => {
    const elegidos = lista.filter((x) => !usados.has(x.imdbId)).slice(0, POR_FILA);
    if (elegidos.length < MINIMO_POR_FILA) return;
    elegidos.forEach((x) => usados.add(x.imdbId));
    filas.push({ tipo: "posters", nombre: nombreFila, items: elegidos.map(item) });
  };
  agregar("Populares ahora", listaPopulares);
  agregar("Estrenos", valor(estrenos, "estrenos"));

  // Banner grande en el medio: una muy bien puntuada que todavía no salió, con su fondo
  const listaMejores = valor(mejores, "mejor puntuadas");
  const paraBanner = listaMejores.find((x) => !usados.has(x.imdbId) && x.r.backdrop_path && x.r.overview);
  if (paraBanner) {
    usados.add(paraBanner.imdbId);
    filas.push({
      tipo: "banner",
      etiqueta: `Imperdible · ${nombre}`,
      temporada: null,
      detalle: `★ ${paraBanner.r.vote_average?.toFixed(1).replace(".", ",")} en TMDB · ${(paraBanner.r.release_date || paraBanner.r.first_air_date || "").slice(0, 4)}`,
      titulo: {
        ...itemDe(paraBanner),
        fondo: urlImagen(paraBanner.r.backdrop_path, "w1280"),
        descripcion: paraBanner.r.overview,
      },
    });
  }
  agregar("Las mejor puntuadas", listaMejores);
  agregar("Joyas ocultas", valor(joyas, "joyas ocultas"));
  agregar(tipoTmdb === "movie" ? "Clásicos de antes de los 90" : "Series clásicas", valor(clasicos, "clásicos"));

  return { filas, usados: [...usados] };
}

/**
 * Tanda [numero] (1 = la primera, que va en la página 2) del catálogo extendido, sin títulos
 * repetidos con lo de arriba ni con las tandas anteriores.
 */
async function tanda(tipo, genero, datos, numero, usadosAntes) {
  return cacheGenero.obtenerOCalcular(`${tipo}:${genero}:tanda:${numero}`, async () => {
    const anterior = numero > 1 ? await tanda(tipo, genero, datos, numero - 1, usadosAntes) : null;
    const usados = new Set(anterior?.usados ?? usadosAntes);
    const { tipoTmdb, idGenero, nombre } = datos;
    const recetas = recetasDe(tipoTmdb, datos.plural).slice((numero - 1) * POR_TANDA, numero * POR_TANDA);
    const comun = base(tipoTmdb, idGenero);
    const resultados = await Promise.allSettled(
      recetas.map((receta) => {
        const filtros = { ...comun, ...receta.filtros };
        // «Para ver en familia»: el género y además familia
        filtros.with_genres = receta.familia ? `${idGenero},10751` : (receta.filtros.with_genres ?? comun.with_genres);
        return titulos(tipoTmdb, filtros, 2);
      }),
    );
    const filas = [];
    resultados.forEach((r, i) => {
      if (r.status === "rejected") {
        console.error(`Género ${nombre}: falló «${recetas[i].nombre}»:`, r.reason?.message);
        return;
      }
      const elegidos = r.value.filter((x) => !usados.has(x.imdbId)).slice(0, POR_FILA);
      if (elegidos.length < MINIMO_POR_FILA) return;
      elegidos.forEach((x) => usados.add(x.imdbId));
      filas.push({ tipo: "posters", nombre: recetas[i].nombre, items: elegidos.map(item) });
    });
    return { filas, usados: [...usados] };
  });
}
