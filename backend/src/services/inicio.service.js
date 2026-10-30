import { crearCache } from "../utils/cache.js";
import { ErrorHttp } from "../utils/ErrorHttp.js";
import { generosEnEspanol, tmdbGet, urlImagen } from "./tmdb.client.js";
import { filasOriginales } from "./originales.service.js";
import { PAGINAS_DE_RECETAS, paginaDeRecetas } from "./recetas.service.js";
import { conImdb, imdbDe } from "./tmdbIds.service.js";

const HORA = 60 * 60 * 1000;
// Las tendencias no cambian minuto a minuto: Inicio se arma cada 3 horas como mucho
const cacheInicio = crearCache({ duracionMs: 3 * HORA, maximo: 1 });
const cacheExplorar = crearCache({ duracionMs: 12 * HORA, maximo: 50 });

const URL_CINEMETA = "https://v3-cinemeta.strem.io";
const TIPO_APP = { movie: "movie", tv: "series" };
const DIAS = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];
// Programas de entrevistas, noticias y reality: no son "para ver" en familia
const GENEROS_EXCLUIDOS = new Set([10763, 10764, 10767]);

/**
 * Tarjetas de «Explorá por género». Las de Cinemeta usan su filtro `genre`; las que
 * Cinemeta no tiene (ej.: cine argentino) salen de TMDB por país, vía /api/explorar.
 * El color es el de la tarjeta en la app.
 */
const GENEROS = [
  { nombre: "Acción", color: "#E04848", tipo: "movie", genero: "Action" },
  { nombre: "Comedia", color: "#F2A93B", tipo: "movie", genero: "Comedy" },
  { nombre: "Drama", color: "#8B5CF6", tipo: "movie", genero: "Drama" },
  { nombre: "Terror", color: "#3F3F55", tipo: "movie", genero: "Horror" },
  { nombre: "Animación", color: "#2BA5C9", tipo: "movie", genero: "Animation" },
  { nombre: "Ciencia ficción", color: "#3B6FE0", tipo: "movie", genero: "Sci-Fi" },
  { nombre: "Documentales", color: "#2E8B6E", tipo: "movie", genero: "Documentary" },
  { nombre: "Cine argentino", color: "#4AA3DF", tipo: "movie", pais: "AR" },
];

/**
 * Todas las filas de Inicio en orden. Cada sección se arma por separado: si una falla
 * (ej.: TMDB no responde), las demás se muestran igual.
 */
export async function obtenerInicio() {
  const guardado = cacheInicio.obtener("inicio");
  if (guardado) return guardado;

  const [top, populares, nuevaTemporada, maratonear, originales] = await Promise.allSettled([
    topDelDia(),
    catalogoCinemeta("movie", "top", 20).then(completarConTmdb),
    serieConNuevaTemporada(),
    seriesParaMaratonear(),
    filasOriginales(),
  ]);
  const valor = (r) => (r.status === "fulfilled" ? r.value : null);
  for (const r of [top, populares, nuevaTemporada, maratonear, originales]) {
    if (r.status === "rejected") console.error("Inicio: falló una sección:", r.reason?.message);
  }

  const filas = [];
  const top10 = valor(top);
  if (top10?.destacado) filas.push(top10.destacado);
  if (top10?.items.length) filas.push({ tipo: "top10", nombre: "Top 10 hoy", items: top10.items });
  if (valor(populares)?.length) {
    filas.push({ tipo: "posters", nombre: "Películas populares", items: valor(populares) });
  }
  filas.push({ tipo: "generos", nombre: "Explorá por género", generos: GENEROS });
  // Originales de Netflix, Prime Video y HBO (las que se pudieron armar)
  filas.push(...(valor(originales) ?? []));
  if (valor(nuevaTemporada)) filas.push(valor(nuevaTemporada));
  if (valor(maratonear)?.length) {
    filas.push({ tipo: "posters", nombre: "Series para maratonear", items: valor(maratonear) });
  }

  const resultado = { filas };
  // Sin las secciones de TMDB no se guarda: así se reintenta en el próximo pedido
  if (top.status === "fulfilled") cacheInicio.guardar("inicio", resultado);
  return resultado;
}

/**
 * Una página del Inicio (2026-10-17): la 1 son las filas de siempre; de la 2 en adelante,
 * tandas de recetas del día (`recetas.service.js`), sin títulos que ya salieron arriba.
 * `siguiente` es la página que sigue, o null si no hay más. Sin `pagina`, la 1: la app,
 * que no la pide, recibe lo mismo que antes (e ignora `siguiente`).
 */
export async function paginaInicio(pagina = 1) {
  const numero = Number(pagina);
  if (!Number.isInteger(numero) || numero < 1) throw new ErrorHttp(400, "Página no válida");
  const primera = await obtenerInicio();
  if (numero === 1) return { ...primera, siguiente: PAGINAS_DE_RECETAS > 0 ? 2 : null };
  if (numero - 1 > PAGINAS_DE_RECETAS) return { filas: [], siguiente: null };

  const usados = primera.filas.flatMap((f) => f.items ?? []).map((i) => i.imdbId);
  const { filas } = await paginaDeRecetas(numero - 1, usados);
  const hayMas = numero - 1 < PAGINAS_DE_RECETAS;
  // Cada tanda nueva tarda unos segundos (TMDB): la que sigue se prepara ya, sin esperarla,
  // así está lista cuando la app la pida al seguir bajando
  if (hayMas) paginaDeRecetas(numero, usados).catch(() => {});
  return { filas, siguiente: hayMas ? numero + 1 : null };
}

/**
 * Pósters para el fondo de la pantalla de bienvenida de la app (antes de iniciar sesión).
 * Salen del Inicio ya armado (está precalentado): no hace pedidos nuevos a TMDB ni a
 * Cinemeta y responde al instante. Sin repetidos, hasta 30.
 */
export async function postersBienvenida() {
  const { filas } = await obtenerInicio();
  const urls = filas
    .flatMap((fila) => fila.items ?? [])
    .map((item) => item.poster)
    .filter(Boolean);
  return [...new Set(urls)].slice(0, 30);
}

/**
 * Top 10 del día (películas y series en tendencia según TMDB) y, como destacado, la
 * primera película del top que tenga fondo y sinopsis, con su puesto («N.º 3 hoy»).
 */
async function topDelDia() {
  const tendencias = await tmdbGet("/trending/all/day");
  const candidatos = (tendencias?.results ?? [])
    .filter((r) => r.media_type === "movie" || r.media_type === "tv")
    .filter((r) => r.poster_path && !(r.genre_ids ?? []).some((g) => GENEROS_EXCLUIDOS.has(g)));
  const items = (await conImdb(candidatos.slice(0, 15))).slice(0, 10);

  const destacado = await armarDestacados(
    items,
    ({ r }) => r.media_type === "movie" && r.backdrop_path && r.overview,
    armarDestacado,
  );
  return { items: items.map(itemDe), destacado };
}

// Destacados que pasan uno tras otro en la app (2026-10-17). La app muestra solo el primero
const CANTIDAD_DESTACADOS = 3;

/**
 * Los primeros [CANTIDAD_DESTACADOS] del top que cumplen [cumple], armados con [armar].
 * Devuelve el primero con los demás en `mas`: la app lee la fila como antes y la app los
 * pasa uno tras otro. null si no hay ninguno.
 */
export async function armarDestacados(items, cumple, armar) {
  const elegidos = items
    .map((item, indice) => ({ item, puesto: indice + 1 }))
    .filter(({ item }) => cumple(item))
    .slice(0, CANTIDAD_DESTACADOS);
  const armados = await Promise.all(elegidos.map(({ item, puesto }) => armar(item, puesto).catch(() => null)));
  const [primero, ...mas] = armados.filter(Boolean);
  return primero ? { ...primero, mas } : null;
}

/**
 * El logo del título (la imagen con el nombre, PNG con fondo transparente): en español si
 * hay; si no, en inglés o sin idioma. Los SVG no: la app no los dibuja.
 */
export function logoDe(imagenes) {
  const logos = (imagenes?.logos ?? []).filter((l) => l.file_path?.endsWith(".png"));
  const orden = ["es", "en", null];
  const elegido = orden.map((idioma) => logos.find((l) => l.iso_639_1 === idioma)).find(Boolean);
  return elegido ? urlImagen(elegido.file_path, "w500") : null;
}

export async function armarDestacado({ r, imdbId }, puesto) {
  const [detalle, puntajeImdb] = await Promise.all([
    tmdbGet(`/movie/${r.id}`, {
      append_to_response: "release_dates,images",
      include_image_language: "es,en,null",
    }),
    puntajeImdbDe("movie", imdbId),
  ]);
  const estreno = detalle?.release_date ? new Date(detalle.release_date) : null;
  const esEstreno = estreno && Date.now() - estreno.getTime() < 60 * 24 * HORA;
  return {
    tipo: "destacado",
    etiqueta: esEstreno ? "Película · Estreno" : "Película · En tendencia",
    puesto,
    titulo: {
      ...itemDe({ r, imdbId }),
      fondo: urlImagen(r.backdrop_path, "w1280"),
      logo: logoDe(detalle?.images),
      descripcion: detalle?.overview || r.overview,
      generos: generosEnEspanol(detalle?.genres),
      duracionMinutos: detalle?.runtime || null,
      clasificacion: clasificacion(detalle?.release_dates?.results ?? []),
      puntajeImdb,
    },
  };
}

/**
 * Puntaje de IMDb («8.2») de la ficha de Cinemeta, para el ★ del destacado de la app
 * (2026-10-19). null si Cinemeta no lo tiene o no responde: el destacado sale igual.
 */
async function puntajeImdbDe(tipo, imdbId) {
  try {
    const respuesta = await fetch(`${URL_CINEMETA}/meta/${tipo}/${imdbId}.json`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!respuesta.ok) return null;
    const { meta } = await respuesta.json();
    return meta?.imdbRating || null;
  } catch {
    return null;
  }
}

/**
 * Clasificación por edad como se usa acá («ATP», «+13»…). Primero la de Argentina; si
 * no hay, la de EE. UU. o México traducida a ese formato.
 */
export function clasificacion(paises) {
  const de = (codigo) =>
    paises.find((p) => p.iso_3166_1 === codigo)?.release_dates
      ?.map((d) => d.certification?.trim())
      .find(Boolean);
  const ar = de("AR");
  if (ar) return /^\d+$/.test(ar) ? `+${ar}` : ar;
  const eeuu = { G: "ATP", PG: "+7", "PG-13": "+13", R: "+16", "NC-17": "+18" }[de("US")];
  if (eeuu) return eeuu;
  return { AA: "ATP", A: "ATP", B: "+12", B15: "+15", C: "+18", D: "+18" }[de("MX")] ?? null;
}

/**
 * Lo mismo para una serie (`content_ratings` de TMDB: `{ iso_3166_1, rating }`, otro
 * formato que el de películas). Argentina; si no, EE. UU. (TV-14…) o México traducidas.
 */
export function clasificacionSerie(paises) {
  const de = (codigo) => paises.find((p) => p.iso_3166_1 === codigo)?.rating?.trim() || null;
  const ar = de("AR");
  if (ar) return /^\d+$/.test(ar) ? `+${ar}` : ar;
  const eeuu = { "TV-Y": "ATP", "TV-Y7": "+7", "TV-G": "ATP", "TV-PG": "+7", "TV-14": "+13", "TV-MA": "+16" }[de("US")];
  if (eeuu) return eeuu;
  return { AA: "ATP", A: "ATP", B: "+12", "B-15": "+15", B15: "+15", C: "+18", D: "+18" }[de("MX")] ?? null;
}

/**
 * Banner de una serie popular con temporada en emisión: «Temporada 3 · Episodios nuevos
 * los viernes». Solo series de ficción (TMDB `with_type` 4 = guionadas, 2 = miniseries).
 */
export async function serieConNuevaTemporada() {
  const hoy = new Date();
  const fecha = (dias) => new Date(hoy.getTime() + dias * 24 * HORA).toISOString().slice(0, 10);
  const lista = await tmdbGet("/discover/tv", {
    "air_date.gte": fecha(-10),
    "air_date.lte": fecha(10),
    with_type: "4|2",
    "vote_count.gte": "300",
    sort_by: "popularity.desc",
  });

  for (const r of (lista?.results ?? []).slice(0, 6)) {
    if (!r.backdrop_path || !r.overview) continue;
    const detalle = await tmdbGet(`/tv/${r.id}`);
    const imdbId = await imdbDe("tv", r.id);
    const temporada = detalle?.next_episode_to_air?.season_number ?? detalle?.last_episode_to_air?.season_number;
    if (!imdbId || !temporada) continue;

    const proximo = detalle?.next_episode_to_air?.air_date;
    const dia = proximo ? DIAS[new Date(`${proximo}T12:00:00Z`).getUTCDay()] : null;
    return {
      tipo: "banner",
      etiqueta: temporada > 1 ? "Nueva temporada · Serie" : "Estreno · Serie",
      temporada,
      detalle: dia
        ? `Temporada ${temporada} · Episodios nuevos los ${dia}`
        : `Temporada ${temporada} · Ya disponible`,
      titulo: {
        ...itemDe({ r: { ...r, media_type: "tv" }, imdbId }),
        fondo: urlImagen(r.backdrop_path, "w1280"),
        descripcion: r.overview,
      },
    };
  }
  return null;
}

/** Series terminadas, muy bien puntuadas: para ver de corrido. */
async function seriesParaMaratonear() {
  const lista = await tmdbGet("/discover/tv", {
    with_status: "3", // 3 = finalizada
    "vote_average.gte": "8",
    "vote_count.gte": "800",
    without_genres: [...GENEROS_EXCLUIDOS].join(","),
    sort_by: "popularity.desc",
  });
  const candidatos = (lista?.results ?? []).filter((r) => r.poster_path).slice(0, 15);
  return (await conImdb(candidatos, "tv")).map(itemDe);
}

/** Un catálogo de Cinemeta, con el mismo formato de ítem que el resto. */
async function catalogoCinemeta(tipo, catalogo, maximo) {
  const respuesta = await fetch(`${URL_CINEMETA}/catalog/${tipo}/${catalogo}.json`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!respuesta.ok) throw new Error(`Cinemeta respondió ${respuesta.status}`);
  const { metas = [] } = await respuesta.json();
  return metas
    .filter((m) => m.id?.startsWith("tt") && m.poster)
    .slice(0, maximo)
    .map((m) => ({
      imdbId: m.id,
      tipo: m.type,
      titulo: m.name,
      poster: m.poster,
      anio: m.releaseInfo?.slice(0, 4) ?? null,
      puntajeImdb: m.imdbRating || null,
    }));
}

/**
 * Suma a películas de Cinemeta lo que muestra la app debajo de la tarjeta grande de
 * «Películas populares» (2026-10-19): sinopsis, géneros, duración, clasificación y logo, en
 * español (TMDB: el ID de IMDb se busca con /find y después la película). Dos pedidos por
 * película; con Inicio guardado 3 h y precalentado, se pagan pocas veces. Una que falla
 * queda como venía.
 */
async function completarConTmdb(items) {
  return Promise.all(
    items.map(async (item) => {
      try {
        const encontrado = await tmdbGet(`/find/${item.imdbId}`, { external_source: "imdb_id" });
        const id = encontrado?.movie_results?.[0]?.id;
        if (!id) return item;
        const detalle = await tmdbGet(`/movie/${id}`, {
          append_to_response: "release_dates,images",
          include_image_language: "es,en,null",
        });
        return {
          ...item,
          titulo: detalle?.title || item.titulo,
          logo: logoDe(detalle?.images),
          descripcion: detalle?.overview || null,
          generos: generosEnEspanol(detalle?.genres),
          duracionMinutos: detalle?.runtime || null,
          clasificacion: clasificacion(detalle?.release_dates?.results ?? []),
        };
      } catch {
        return item;
      }
    }),
  );
}

/**
 * Títulos de un país, para las tarjetas de género que Cinemeta no tiene
 * (ej.: «Cine argentino»). Los más populares primero.
 *
 * @param tipo "movie" o "series"
 * @param pais código ISO de dos letras (ej.: "AR")
 */
export async function explorar(tipo, pais) {
  const tipoTmdb = { movie: "movie", series: "tv" }[tipo];
  if (!tipoTmdb) throw new ErrorHttp(400, 'El tipo debe ser "movie" o "series"');
  if (!/^[A-Z]{2}$/.test(pais ?? "")) throw new ErrorHttp(400, "País no válido");

  return cacheExplorar.obtenerOCalcular(`${tipo}:${pais}`, async () => {
    const paginas = await Promise.all(
      [1, 2].map((page) =>
        tmdbGet(`/discover/${tipoTmdb}`, {
          with_origin_country: pais,
          // Uso familiar: sin contenido para adultos y con un mínimo de votos
          include_adult: "false",
          "vote_count.gte": "30",
          sort_by: "popularity.desc",
          page: String(page),
        }),
      ),
    );
    const candidatos = paginas.flatMap((p) => p?.results ?? []).filter((r) => r.poster_path);
    return (await conImdb(candidatos, tipoTmdb)).map(itemDe);
  });
}

/**
 * Géneros de Cinemeta (en inglés, los de las píldoras de la app) → géneros de TMDB.
 * Películas y series usan números distintos; en series TMDB junta algunos
 * («Action & Adventure», «Sci-Fi & Fantasy») y no tiene terror, suspenso ni romance.
 */
export const GENEROS_TMDB = {
  movie: {
    Action: 28, Adventure: 12, Animation: 16, Comedy: 35, Crime: 80, Documentary: 99,
    Drama: 18, Family: 10751, Fantasy: 14, History: 36, Horror: 27, Mystery: 9648,
    Romance: 10749, "Sci-Fi": 878, Thriller: 53, War: 10752, Western: 37,
  },
  tv: {
    Action: 10759, Adventure: 10759, Animation: 16, Comedy: 35, Crime: 80, Documentary: 99,
    Drama: 18, Family: 10751, Fantasy: 10765, Mystery: 9648, "Sci-Fi": 10765, War: 10768,
    Western: 37,
  },
};
const cacheFilasGenero = crearCache({ duracionMs: 12 * HORA, maximo: 60 });

/**
 * Filas de la pantalla Películas / Series para un género (o para todos, sin `genero`):
 * «Mejor puntuados» (puntaje alto con muchos votos) y «Estrenos» (últimos 6 meses).
 * «Más vistos» no está acá: la app lo pide directo a Cinemeta.
 *
 * @param tipo "movie" o "series"
 * @param genero nombre de Cinemeta (ej.: "Drama"); sin él, todos los géneros
 * @returns las dos listas; vacías si TMDB no tiene ese género (ej.: terror en series)
 */
export async function filasGenero(tipo, genero) {
  const tipoTmdb = { movie: "movie", series: "tv" }[tipo];
  if (!tipoTmdb) throw new ErrorHttp(400, 'El tipo debe ser "movie" o "series"');
  if (genero !== undefined && !/^[A-Za-z-]{2,20}$/.test(genero)) {
    throw new ErrorHttp(400, "Género no válido");
  }
  const idGenero = genero ? GENEROS_TMDB[tipoTmdb][genero] : null;
  if (genero && !idGenero) return { mejorPuntuados: [], estrenos: [] };

  return cacheFilasGenero.obtenerOCalcular(`${tipo}:${genero ?? "todos"}`, async () => {
    const hoy = new Date();
    const fecha = (dias) => new Date(hoy.getTime() + dias * 24 * HORA).toISOString().slice(0, 10);
    const campoFecha = tipoTmdb === "movie" ? "primary_release_date" : "first_air_date";
    const comunes = {
      ...(idGenero ? { with_genres: String(idGenero) } : {}),
      without_genres: [...GENEROS_EXCLUIDOS].join(","),
      include_adult: "false",
    };

    const [puntuados, estrenos] = await Promise.all([
      tmdbGet(`/discover/${tipoTmdb}`, {
        ...comunes,
        // Con pocos votos cualquier título desconocido llega a 9: el mínimo lo evita.
        // Lo del último año tampoco: los primeros votos (de fanáticos) inflan el puntaje
        "vote_count.gte": tipoTmdb === "movie" ? "2000" : "500",
        [`${campoFecha}.lte`]: fecha(-365),
        sort_by: "vote_average.desc",
      }),
      tmdbGet(`/discover/${tipoTmdb}`, {
        ...comunes,
        [`${campoFecha}.gte`]: fecha(-180),
        [`${campoFecha}.lte`]: fecha(0),
        "vote_count.gte": "20",
        sort_by: "popularity.desc",
      }),
    ]);

    const armar = async (lista) => {
      const candidatos = (lista?.results ?? []).filter((r) => r.poster_path).slice(0, 20);
      return (await conImdb(candidatos, tipoTmdb)).map(itemDe);
    };
    return { mejorPuntuados: await armar(puntuados), estrenos: await armar(estrenos) };
  });
}

/** Los géneros de las píldoras de la app (`GenerosGrilla` en GrillaScreen.kt); null = «Todas». */
const GENEROS_PILDORAS = [
  null, "Action", "Comedy", "Drama", "Thriller", "Horror",
  "Documentary", "Animation", "Sci-Fi", "Romance", "Family",
];

/**
 * Calcula de antemano Inicio y las filas de cada género, para que la app nunca espere a
 * TMDB: sin esto, el primer pedido de un género tarda 0,6-2,2 s (dos consultas más
 * hasta 40 IDs de IMDb). Va de a uno para no saturar a TMDB. Lo que sigue en caché se
 * saltea solo (`obtenerOCalcular`), así que repetirlo cada hora solo rehace lo vencido.
 */
export async function precalentar() {
  const inicio = Date.now();
  let fallos = 0;
  const tareas = [
    () => obtenerInicio(),
    // La primera tanda de recetas (la que pide la app al bajar; arma también la siguiente)
    () => paginaInicio(2),
    // Las tandas de Películas y Series NO se precalientan (2026-10-26): con ellas, al arrancar
    // y cada hora un servidor chico (0,1 CPU, 512 MB) dejaba de responder a ratos.
    // Se arman al pedirlas (la primera vez tardan unos segundos)
    ...["movie", "series"].flatMap((tipo) =>
      GENEROS_PILDORAS.map((genero) => () => filasGenero(tipo, genero ?? undefined)),
    ),
  ];
  for (const tarea of tareas) {
    try {
      await tarea();
    } catch (error) {
      fallos++;
      console.warn("⚠️ Precalentamiento:", error.message);
    }
  }
  console.log(`🔥 Caché precalentada en ${Date.now() - inicio} ms (${tareas.length - fallos}/${tareas.length})`);
}

const cacheRecomendaciones = crearCache({ duracionMs: 24 * HORA, maximo: 300 });

/**
 * Títulos parecidos a uno visto: para la fila «Porque viste X» de Inicio y para la
 * pantalla que aparece al terminar una película.
 *
 * Cada título trae además `fondo` (imagen apaisada, para las tarjetas de «Más para ver»)
 * y `descripcion`. El primero es el que se ofrece «A continuación»: se elige uno con fondo
 * y sinopsis, y se completa con géneros, duración y clasificación (una consulta más a
 * TMDB, solo para ese).
 *
 * @param tipo "movie" o "series"
 * @param imdbId el título visto
 */
export async function recomendaciones(tipo, imdbId) {
  const tipoTmdb = { movie: "movie", series: "tv" }[tipo];
  if (!tipoTmdb) throw new ErrorHttp(400, 'El tipo debe ser "movie" o "series"');
  if (!/^tt\d{7,10}$/.test(imdbId ?? "")) throw new ErrorHttp(400, "ID de IMDb no válido");

  return cacheRecomendaciones.obtenerOCalcular(`${tipo}:${imdbId}`, async () => {
    const encontrado = await tmdbGet(`/find/${imdbId}`, { external_source: "imdb_id" });
    const titulo = (tipoTmdb === "movie" ? encontrado?.movie_results : encontrado?.tv_results)?.[0];
    if (!titulo) return [];
    const lista = await tmdbGet(`/${tipoTmdb}/${titulo.id}/recommendations`);
    const candidatos = (lista?.results ?? [])
      .filter((r) => r.poster_path && !(r.genre_ids ?? []).some((g) => GENEROS_EXCLUIDOS.has(g)))
      .slice(0, 15);
    const conId = await conImdb(candidatos, tipoTmdb);

    // «A continuación»: el primero que tenga fondo y sinopsis pasa adelante
    const indice = conId.findIndex(({ r }) => r.backdrop_path && r.overview);
    if (indice > 0) conId.unshift(...conId.splice(indice, 1));

    const items = conId.map(({ r, imdbId }) => ({
      ...itemDe({ r, imdbId }),
      // w780: las tarjetas miden ~230 dp, unos 460 px en una TV de 1080p
      fondo: urlImagen(r.backdrop_path, "w780"),
      descripcion: r.overview || null,
    }));
    if (indice >= 0) {
      try {
        items[0] = { ...items[0], ...(await detalleContinuacion(tipoTmdb, conId[0].r)) };
      } catch (error) {
        // Sin el detalle se ofrece igual, con lo que ya trae la lista
        console.warn("⚠️ Recomendaciones: sin detalle de la primera:", error.message);
      }
    }
    return items;
  });
}

/** Géneros, duración y clasificación del título que se ofrece «A continuación». */
async function detalleContinuacion(tipoTmdb, r) {
  const esPelicula = tipoTmdb === "movie";
  const detalle = await tmdbGet(`/${tipoTmdb}/${r.id}`, {
    append_to_response: esPelicula ? "release_dates" : "content_ratings",
  });
  return {
    // Grande: ocupa la mitad derecha de la pantalla
    fondo: urlImagen(r.backdrop_path, "w1280"),
    generos: generosEnEspanol(detalle?.genres, 2),
    duracionMinutos: (esPelicula ? detalle?.runtime : detalle?.episode_run_time?.[0]) || null,
    clasificacion: esPelicula ? clasificacion(detalle?.release_dates?.results ?? []) : null,
  };
}

/** Formato común de un título en las filas: lo mínimo para dibujar el póster y abrirlo. */
export function itemDe({ r, imdbId }) {
  return {
    imdbId,
    tipo: TIPO_APP[r.media_type] ?? (r.title ? "movie" : "series"),
    titulo: r.title ?? r.name,
    poster: urlImagen(r.poster_path, "w342"),
    anio: (r.release_date || r.first_air_date || "").slice(0, 4) || null,
  };
}
