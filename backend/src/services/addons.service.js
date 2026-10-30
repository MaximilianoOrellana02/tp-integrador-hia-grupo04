import { randomUUID } from "node:crypto";
import { Addon, Perfil, VideoLibre } from "../models/index.js";
import { ErrorHttp } from "../utils/ErrorHttp.js";
import { cifrar, descifrar, huella } from "../utils/cifrado.js";
import { analizar, ordenar } from "../utils/analizarFuentes.js";
import { aVtt } from "../utils/subtitulos.js";
import { leerUrl, pedirJson, pedirSeguro } from "../utils/redSegura.js";

/**
 * Cliente del protocolo de addons de Stremio. El backend hace los pedidos: el navegador nunca ve
 * la URL de un addon ni la de una fuente, porque pueden llevar una clave. Cada fuente sale con un
 * `id` al azar, que vale un rato y solo para la cuenta que la pidió.
 */
const MAXIMO_ADDONS = 10;
const MAXIMO_FUENTES_POR_ADDON = 80;
const VIGENCIA_FUENTE_MS = 6 * 60 * 60 * 1000;
const ID_VIDEO = /^[\w:.-]{1,60}$/;
const ADDON_LIBRE = "Películas libres";

const fuentesGuardadas = new Map();
const subtitulosGuardados = new Map();

function limpiarVencidas() {
  const ahora = Date.now();
  for (const [id, f] of fuentesGuardadas) if (f.vence < ahora) fuentesGuardadas.delete(id);
  for (const [id, s] of subtitulosGuardados) if (s.vence < ahora) subtitulosGuardados.delete(id);
}

export function listar(cuentaId) {
  return Addon.findAll({ where: { cuentaId }, attributes: ["id", "nombre"], order: [["id", "ASC"]] });
}

const ofrece = (manifest, recurso) => (manifest.resources ?? []).some((r) => (typeof r === "string" ? r : r?.name) === recurso);

// El manifest casi no cambia: se recuerda una hora por addon (sin guardarlo en la base)
const VIGENCIA_MANIFEST_MS = 60 * 60 * 1000;
const manifests = new Map();

async function manifestDe(addon) {
  const guardado = manifests.get(addon.id);
  if (guardado && guardado.vence > Date.now()) return guardado.manifest;
  const manifest = await pedirJson(descifrar(addon.urlCifrada), { soloHttps: true, maxBytes: 1_000_000 });
  manifests.set(addon.id, { manifest, vence: Date.now() + VIGENCIA_MANIFEST_MS });
  return manifest;
}

const baseDe = (addon) => descifrar(addon.urlCifrada).replace(/\/manifest\.json$/, "");

export async function agregar(cuentaId, urlManifest) {
  const texto = String(urlManifest ?? "").trim();
  if (!texto || texto.length > 2000) throw new ErrorHttp(400, "Pegá la dirección del manifest");
  const url = leerUrl(texto, { soloHttps: true });
  if (!url.pathname.endsWith("/manifest.json")) throw new ErrorHttp(400, "La dirección tiene que terminar en /manifest.json");
  if (url.search || url.hash) throw new ErrorHttp(400, "La dirección no puede llevar parámetros");
  if ((await Addon.count({ where: { cuentaId } })) >= MAXIMO_ADDONS) throw new ErrorHttp(409, "Llegaste al máximo de " + MAXIMO_ADDONS + " addons");

  const manifest = await pedirJson(url.href, { soloHttps: true, maxBytes: 1_000_000 });
  if (typeof manifest?.id !== "string" || typeof manifest?.name !== "string") throw new ErrorHttp(400, "Eso no es un manifest de addon");
  if (manifest.behaviorHints?.configurationRequired) throw new ErrorHttp(400, "Este addon necesita configurarse: pegá tu enlace personal");
  if (!ofrece(manifest, "stream") && !ofrece(manifest, "catalog")) throw new ErrorHttp(400, "Este addon no ofrece fuentes ni catálogos");

  const creado = await Addon.create({
    cuentaId,
    nombre: manifest.name.slice(0, 120),
    urlCifrada: cifrar(url.href),
    huella: huella(url.href),
  });
  return { id: creado.id, nombre: creado.nombre };
}

export async function quitar(cuentaId, id) {
  const borrados = await Addon.destroy({ where: { id: Number(id) || 0, cuentaId } });
  if (!borrados) throw new ErrorHttp(404, "Addon no encontrado");
  manifests.delete(Number(id));
}

/**
 * Qué tan probable es que el navegador la reproduzca, según el texto de la fuente. Es una estimación:
 * muchos addons no dicen el códec ni el audio.
 */
export function compatibilidad(texto, url) {
  const t = (texto + " " + url.split("?")[0]).toLowerCase();
  if (/\.(mkv|avi|wmv|flv)\b|\b(mkv|avi)\b/.test(t)) return { nivel: "no", motivo: "Formato no compatible con el navegador" };
  if (/\b(hevc|x\.?265|h\.?265)\b|10.?bit|dolby.?vision|\bdv\b|\bhdr/.test(t)) return { nivel: "dudosa", motivo: "Video que no todos los navegadores abren" };
  if (/\b(dts|truehd|e?-?ac-?3|ddp?\+?\s?[257]\.1|atmos)\b/.test(t)) return { nivel: "dudosa", motivo: "Puede verse sin sonido" };
  if (/\.m3u8\b|\.mp4\b|\.m4v\b|\.webm\b|\b(mp4|h\.?264|x\.?264|aac)\b/.test(t)) return { nivel: "compatible", motivo: null };
  return { nivel: "desconocida", motivo: "Sin datos del formato" };
}


function guardarFuente(cuentaId, url, directa) {
  const id = randomUUID();
  fuentesGuardadas.set(id, { cuentaId, url, directa, vence: Date.now() + VIGENCIA_FUENTE_MS });
  return id;
}

async function fuentesLibres(cuentaId, idVideo) {
  const video = await VideoLibre.findByPk(idVideo);
  if (!video) return [];
  return [{
    id: guardarFuente(cuentaId, video.url, true),
    addon: ADDON_LIBRE,
    nombre: video.nombre,
    detalle: video.autor + " · " + video.licencia,
    nivel: "compatible",
    motivo: null,
    ...analizar("720p"),
    idiomas: ["original"],
  }];
}

function convertirStreams(cuentaId, nombreAddon, streams) {
  const fuentes = [];
  let sinEnlace = 0;
  for (const s of streams.slice(0, MAXIMO_FUENTES_POR_ADDON)) {
    if (typeof s?.url !== "string" || !/^https?:\/\//i.test(s.url)) {
      sinEnlace++;
      continue;
    }
    const nombre = String(s.name ?? nombreAddon).slice(0, 200);
    const detalle = String(s.title ?? s.description ?? "").slice(0, 400);
    fuentes.push({
      id: guardarFuente(cuentaId, s.url, false),
      addon: nombreAddon,
      nombre,
      detalle,
      ...compatibilidad(nombre + " " + detalle + " " + (s.behaviorHints?.filename ?? ""), s.url),
      ...analizar(nombre + " " + detalle + " " + (s.behaviorHints?.filename ?? "")),
    });
  }
  return { fuentes, sinEnlace };
}

/** Las preferencias del perfil (si es de esta cuenta); si no, las de siempre. */
async function preferenciasDe(cuentaId, perfilId) {
  const id = Number(perfilId);
  if (!Number.isInteger(id)) return {};
  const perfil = await Perfil.findOne({ where: { id, cuentaId }, attributes: ["idiomasAudio", "calidadMaxima"] });
  return perfil ? { idiomasAudio: perfil.idiomasAudio, calidadMaxima: perfil.calidadMaxima } : {};
}

export async function buscarFuentes(cuentaId, tipo, idVideo, perfilId) {
  if (tipo !== "movie" && tipo !== "series") throw new ErrorHttp(400, "Tipo no válido");
  if (!ID_VIDEO.test(idVideo)) throw new ErrorHttp(400, "ID de video no válido");
  limpiarVencidas();

  const addons = await Addon.findAll({ where: { cuentaId } });
  const avisos = [];
  const resultados = await Promise.all(
    addons.map(async (addon) => {
      try {
        if (!ofrece(await manifestDe(addon), "stream")) return [];
        const datos = await pedirJson(baseDe(addon) + "/stream/" + tipo + "/" + idVideo + ".json", { soloHttps: true, maxBytes: 5_000_000 });
        const { fuentes, sinEnlace } = convertirStreams(cuentaId, addon.nombre, Array.isArray(datos?.streams) ? datos.streams : []);
        if (sinEnlace) avisos.push(addon.nombre + ": " + sinEnlace + " fuentes sin enlace directo (torrents)");
        return fuentes;
      } catch {
        avisos.push(addon.nombre + ": no respondió");
        return [];
      }
    }),
  );
  const fuentes = ordenar([...(await fuentesLibres(cuentaId, idVideo)), ...resultados.flat()], await preferenciasDe(cuentaId, perfilId));
  return { fuentes, avisos };
}

/** La dirección final del video, ya sin la del addon (que puede llevar la clave). */
export async function enlaceDeFuente(cuentaId, id) {
  const fuente = fuentesGuardadas.get(id);
  if (!fuente || fuente.cuentaId !== cuentaId || fuente.vence < Date.now()) throw new ErrorHttp(404, "La fuente venció: buscá de nuevo");
  if (fuente.directa) return { url: fuente.url };
  const r = await pedirSeguro(fuente.url, { encabezados: { Range: "bytes=0-0" }, maxBytes: 0, esperaMs: 30000 });
  if (r.estado >= 400) throw new ErrorHttp(502, "La fuente respondió " + r.estado);
  if (/^text\/html/i.test(r.encabezados["content-type"] ?? "")) throw new ErrorHttp(502, "La fuente es una página web, no un video");
  return { url: r.url };
}

// Hasta cuántos catálogos y títulos por addon se muestran en Inicio
const CATALOGOS_POR_ADDON = 4;
const TITULOS_POR_CATALOGO = 30;
const ID_IMDB = /^tt\d+$/;

/** Sin extras obligatorios: los que piden un género o una búsqueda no se pueden listar solos. */
const catalogoListable = (c) =>
  (c?.type === "movie" || c?.type === "series") && typeof c.id === "string" && !(c.extra ?? []).some((e) => e?.isRequired);

/**
 * Las filas de los catálogos de los addons. Solo títulos con ID de IMDb: es lo que entienden la
 * ficha y los demás addons. Un póster que no sea https no se usa.
 */
export async function filasDeAddons(cuentaId) {
  const addons = await Addon.findAll({ where: { cuentaId }, order: [["id", "ASC"]] });
  const porAddon = await Promise.all(
    addons.map(async (addon) => {
      let manifest;
      try {
        manifest = await manifestDe(addon);
      } catch {
        return [];
      }
      const catalogos = (ofrece(manifest, "catalog") ? manifest.catalogs ?? [] : []).filter(catalogoListable).slice(0, CATALOGOS_POR_ADDON);
      return Promise.all(
        catalogos.map(async (c) => {
          try {
            const datos = await pedirJson(baseDe(addon) + "/catalog/" + c.type + "/" + encodeURIComponent(c.id) + ".json", { soloHttps: true, maxBytes: 5_000_000 });
            const items = (Array.isArray(datos?.metas) ? datos.metas : [])
              .filter((m) => ID_IMDB.test(m?.id ?? "") && typeof m?.name === "string")
              .slice(0, TITULOS_POR_CATALOGO)
              .map((m) => ({ imdbId: m.id, tipo: c.type, titulo: m.name, poster: /^https:\/\//.test(m.poster ?? "") ? m.poster : null }));
            return { tipo: "posters", nombre: addon.nombre + " · " + String(c.name ?? c.id).slice(0, 80), items };
          } catch {
            return null;
          }
        }),
      );
    }),
  );
  return porAddon.flat().filter((f) => f?.items.length);
}

// --- Subtítulos
// OpenSubtitles es público y no pide clave: viene incluido, como las películas libres
const OPENSUBTITLES = "https://opensubtitles-v3.strem.io";
const SUBTITULOS_POR_IDIOMA = 4;
const IDIOMAS = {
  spa: "Español", eng: "Inglés", pob: "Portugués (Brasil)", por: "Portugués", fre: "Francés", ger: "Alemán",
  ita: "Italiano", cat: "Catalán", baq: "Vasco", glg: "Gallego", rus: "Ruso", pol: "Polaco", ell: "Griego",
  tur: "Turco", ara: "Árabe", heb: "Hebreo", jpn: "Japonés", kor: "Coreano", zho: "Chino", chi: "Chino",
  hin: "Hindi", nld: "Neerlandés", swe: "Sueco", dan: "Danés", nor: "Noruego", fin: "Finés", ron: "Rumano",
  hun: "Húngaro", cze: "Checo", slo: "Eslovaco", bul: "Búlgaro", ukr: "Ucraniano", hrv: "Croata", srp: "Serbio",
  per: "Persa", tha: "Tailandés", ind: "Indonesio",
};
const PRIMEROS = ["spa", "eng", "pob"];

const nombreIdioma = (codigo) => IDIOMAS[codigo] ?? codigo.toUpperCase();

/** Los subtítulos de OpenSubtitles y de los addons de la cuenta que los ofrezcan. */
export async function buscarSubtitulos(cuentaId, tipo, idVideo) {
  if (tipo !== "movie" && tipo !== "series") throw new ErrorHttp(400, "Tipo no válido");
  if (!ID_VIDEO.test(idVideo)) throw new ErrorHttp(400, "ID de video no válido");
  limpiarVencidas();

  const addons = await Addon.findAll({ where: { cuentaId } });
  const propios = await Promise.all(
    addons.map(async (addon) => {
      try {
        return ofrece(await manifestDe(addon), "subtitles") ? { nombre: addon.nombre, base: baseDe(addon) } : null;
      } catch {
        return null;
      }
    }),
  );
  const origenes = [{ nombre: "OpenSubtitles", base: OPENSUBTITLES }, ...propios.filter(Boolean)];

  const todos = (
    await Promise.all(
      origenes.map(async (origen) => {
        try {
          const datos = await pedirJson(origen.base + "/subtitles/" + tipo + "/" + idVideo + ".json", { soloHttps: true, maxBytes: 5_000_000 });
          return (Array.isArray(datos?.subtitles) ? datos.subtitles : [])
            .filter((s) => typeof s?.url === "string" && /^https?:\/\//i.test(s.url) && /^[a-z]{2,3}$/i.test(s.lang ?? ""))
            .map((s) => ({ origen: origen.nombre, url: s.url, lang: s.lang.toLowerCase(), archivo: String(s.subtitleFileName ?? "").slice(0, 90) }));
        } catch {
          return [];
        }
      }),
    )
  ).flat();

  const porIdioma = new Map();
  for (const s of todos) {
    const lista = porIdioma.get(s.lang) ?? [];
    if (lista.length < SUBTITULOS_POR_IDIOMA) lista.push(s);
    porIdioma.set(s.lang, lista);
  }
  const orden = (lang) => (PRIMEROS.includes(lang) ? PRIMEROS.indexOf(lang) : PRIMEROS.length);
  const idiomas = [...porIdioma.keys()].sort((a, b) => orden(a) - orden(b) || nombreIdioma(a).localeCompare(nombreIdioma(b), "es"));

  const subtitulos = idiomas.flatMap((lang) =>
    porIdioma.get(lang).map((s) => {
      const id = randomUUID();
      subtitulosGuardados.set(id, { cuentaId, url: s.url, vence: Date.now() + VIGENCIA_FUENTE_MS });
      return { id, lang, idioma: nombreIdioma(lang), addon: s.origen, detalle: s.archivo };
    }),
  );
  return { subtitulos };
}

/** El archivo, en WebVTT. El navegador nunca ve la dirección original. */
export async function archivoSubtitulo(cuentaId, id) {
  const s = subtitulosGuardados.get(id);
  if (!s || s.cuentaId !== cuentaId || s.vence < Date.now()) throw new ErrorHttp(404, "El subtítulo venció: buscá de nuevo");
  const r = await pedirSeguro(s.url, { maxBytes: 1_500_000, esperaMs: 20000 });
  if (r.estado !== 200 || !r.cuerpo) throw new ErrorHttp(502, "No se pudo bajar el subtítulo");
  return aVtt(r.cuerpo);
}
