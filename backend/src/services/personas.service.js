import { crearCache } from "../utils/cache.js";
import { ErrorHttp } from "../utils/ErrorHttp.js";
import { tmdbGet, urlImagen } from "./tmdb.client.js";
import { imdbDe } from "./tmdbIds.service.js";

const HORA = 60 * 60 * 1000;
const cacheElenco = crearCache({ duracionMs: 24 * HORA, maximo: 500 });
const cachePersonas = crearCache({ duracionMs: 24 * HORA, maximo: 300 });
const cacheBusquedas = crearCache({ duracionMs: 6 * HORA, maximo: 300 });

const MAXIMO_ELENCO = 15;
const MAXIMO_PERSONAS = 10;
const MAXIMO_TITULOS = 24;

// Programas de entrevistas, noticias y reality: la persona aparece "como sí misma"
const GENEROS_SIN_ACTUACION = new Set([10763, 10764, 10767]);
const COMO_SI_MISMO = /\b(self|himself|herself|themselves|él mismo|ella misma)\b/i;

/** La app usa sus propios tipos ("movie" / "series"); TMDB, "movie" / "tv". */
const TIPO_TMDB = { movie: "movie", series: "tv" };
const TIPO_APP = { movie: "movie", tv: "series" };

/**
 * Elenco de un título a partir de su ID de IMDb (el que usa toda la app).
 * En series usa los créditos de todas las temporadas y el personaje con más episodios.
 */
export async function obtenerElenco(tipo, imdbId) {
  validarTipo(tipo);
  if (!/^tt\d{7,10}$/.test(imdbId)) throw new ErrorHttp(400, "ID de IMDb no válido");

  return cacheElenco.obtenerOCalcular(`${tipo}:${imdbId}`, async () => {
    const encontrado = await tmdbGet(`/find/${imdbId}`, { external_source: "imdb_id" });
    const titulo = tipo === "movie" ? encontrado?.movie_results?.[0] : encontrado?.tv_results?.[0];
    if (!titulo) return [];

    if (tipo === "movie") {
      const creditos = await tmdbGet(`/movie/${titulo.id}/credits`);
      return (creditos?.cast ?? []).slice(0, MAXIMO_ELENCO).map((actor) => ({
        id: actor.id,
        nombre: actor.name,
        personaje: actor.character || null,
        foto: urlImagen(actor.profile_path),
      }));
    }

    const creditos = await tmdbGet(`/tv/${titulo.id}/aggregate_credits`);
    return (creditos?.cast ?? []).slice(0, MAXIMO_ELENCO).map((actor) => {
      const principal = [...(actor.roles ?? [])].sort((a, b) => b.episode_count - a.episode_count)[0];
      return {
        id: actor.id,
        nombre: actor.name,
        personaje: principal?.character || null,
        foto: urlImagen(actor.profile_path),
      };
    });
  });
}

/** Personas cuyo nombre coincide con la búsqueda, primero los actores. */
export async function buscarPersonas(texto) {
  const consulta = String(texto ?? "").trim();
  if (consulta.length < 2 || consulta.length > 60) {
    throw new ErrorHttp(400, "La búsqueda debe tener entre 2 y 60 caracteres");
  }

  return cacheBusquedas.obtenerOCalcular(consulta.toLowerCase(), async () => {
    const resultado = await tmdbGet("/search/person", { query: consulta, include_adult: "false" });
    return (resultado?.results ?? [])
      // Primero actores; entre ellos, los de trayectoria más conocida. TMDB ordena por
      // popularidad del momento: con "hanks", Truman Hanks salía antes que Tom Hanks
      .sort(
        (a, b) =>
          Number(b.known_for_department === "Acting") - Number(a.known_for_department === "Acting") ||
          trayectoria(b) - trayectoria(a),
      )
      .slice(0, MAXIMO_PERSONAS)
      .map((persona) => ({
        id: persona.id,
        nombre: persona.name,
        foto: urlImagen(persona.profile_path),
        conocidoPor: (persona.known_for ?? []).map((t) => t.title ?? t.name).filter(Boolean),
      }));
  });
}

/**
 * Datos de una persona y los títulos en los que actuó, de los más conocidos a los
 * menos, con su ID de IMDb para que la app los abra con Cinemeta como siempre.
 */
export async function obtenerPersona(id) {
  const personaId = Number(id);
  if (!Number.isInteger(personaId) || personaId <= 0) {
    throw new ErrorHttp(400, "ID de persona no válido");
  }

  return cachePersonas.obtenerOCalcular(personaId, async () => {
    const persona = await tmdbGet(`/person/${personaId}`, { append_to_response: "combined_credits" });
    if (!persona) throw new ErrorHttp(404, "No se encontró la persona");

    const candidatos = elegirTitulos(persona.combined_credits?.cast ?? []);
    const conImdb = await Promise.all(
      candidatos.map(async (credito) => ({ credito, imdbId: await imdbDe(credito.media_type, credito.id) })),
    );

    return {
      persona: {
        id: persona.id,
        nombre: persona.name,
        foto: urlImagen(persona.profile_path, "w342"),
        oficio: oficio(persona),
        edad: calcularEdad(persona.birthday, persona.deathday),
        lugarNacimiento: persona.place_of_birth || null,
        biografia: persona.biography || (await biografiaDeRespaldo(personaId)),
      },
      titulos: conImdb
        // Sin ID de IMDb la app no puede abrir el título: no se muestra
        .filter(({ imdbId }) => imdbId)
        .map(({ credito, imdbId }) => ({
          imdbId,
          tipo: TIPO_APP[credito.media_type],
          titulo: credito.title ?? credito.name,
          anio: (credito.release_date || credito.first_air_date || "").slice(0, 4) || null,
          poster: urlImagen(credito.poster_path, "w342"),
          personaje: credito.character || null,
        })),
    };
  });
}

/**
 * Saca apariciones "como sí mismo", repetidos y sin póster. Ordena primero los papeles
 * principales y después los cameos, cada grupo de más a menos votado: si no, una serie
 * muy famosa con un solo episodio de la persona taparía sus trabajos más importantes.
 */
function elegirTitulos(creditos) {
  const vistos = new Set();
  return creditos
    .filter((c) => c.media_type === "movie" || c.media_type === "tv")
    .filter((c) => c.poster_path)
    .filter((c) => !COMO_SI_MISMO.test(c.character ?? ""))
    .filter((c) => !(c.genre_ids ?? []).some((g) => GENEROS_SIN_ACTUACION.has(g)))
    .sort(
      (a, b) =>
        Number(esPapelPrincipal(b)) - Number(esPapelPrincipal(a)) ||
        (b.vote_count ?? 0) - (a.vote_count ?? 0),
    )
    .filter((c) => {
      // Una serie aparece una vez por cada personaje: se deja solo la primera
      const clave = `${c.media_type}:${c.id}`;
      if (vistos.has(clave)) return false;
      vistos.add(clave);
      return true;
    })
    .slice(0, MAXIMO_TITULOS);
}

/** Cuán conocida es la carrera de alguien: votos sumados de sus títulos más conocidos. */
function trayectoria(persona) {
  return (persona.known_for ?? []).reduce((total, t) => total + (t.vote_count ?? 0), 0);
}

/** "Actriz", "Actor", "Dirección"... según a qué se dedica más (o null si no se sabe). */
function oficio(persona) {
  switch (persona.known_for_department) {
    case "Acting":
      // TMDB: 1 = mujer, 2 = hombre. Sin dato (o no binario), una palabra neutra
      return persona.gender === 1 ? "Actriz" : persona.gender === 2 ? "Actor" : "Actuación";
    case "Directing":
      return "Dirección";
    case "Writing":
      return "Guion";
    default:
      return null;
  }
}

/** Años cumplidos a hoy. null si no hay fecha de nacimiento o si falleció. */
export function calcularEdad(nacimiento, fallecimiento, hoy = new Date()) {
  if (!nacimiento || fallecimiento) return null;
  const [anio, mes, dia] = nacimiento.split("-").map(Number);
  if (!anio || !mes || !dia) return null;
  const yaCumplio =
    hoy.getMonth() + 1 > mes || (hoy.getMonth() + 1 === mes && hoy.getDate() >= dia);
  return hoy.getFullYear() - anio - (yaCumplio ? 0 : 1);
}

/**
 * En español latino muchas biografías están vacías, pero sí existen en español de
 * España. Nunca se usa el inglés: la gente tiene que poder leerla.
 */
async function biografiaDeRespaldo(personaId) {
  const persona = await tmdbGet(`/person/${personaId}`, { language: "es-ES" }).catch(() => null);
  return persona?.biography || null;
}

/**
 * En películas, estar entre los primeros del reparto (`order` empieza en 0).
 * En series, aparecer en varios episodios. Sin el dato, se lo trata como principal.
 */
function esPapelPrincipal(credito) {
  if (credito.media_type === "movie") return (credito.order ?? 0) < 10;
  return (credito.episode_count ?? 3) >= 3;
}

function validarTipo(tipo) {
  if (!TIPO_TMDB[tipo]) throw new ErrorHttp(400, 'El tipo debe ser "movie" o "series"');
}
