/**
 * Lee el texto que cada addon pone en una fuente (nombre, detalle, archivo) y lo ordena según el
 * perfil. Los addons no tienen un formato común: todo es una estimación a partir del texto, y lo que
 * no se puede leer queda en null.
 */
const ALTURA = { "8K": 4320, "4K": 2160, "1080p": 1080, "720p": 720, "480p": 480 };
const TOPE = { automatica: 1080, "4k": 2160, "1080p": 1080, "720p": 720 };
const NIVEL = { compatible: 0, desconocida: 1, dudosa: 2, no: 3 };
const IDIOMAS_POR_DEFECTO = ["latino", "castellano", "original"];

export function analizar(texto) {
  const t = String(texto);
  const calidad = /\b(8k|4320p)\b/i.test(t)
    ? "8K"
    : /\b(2160p|4k|uhd)\b/i.test(t)
      ? "4K"
      : /\b(1080p|fhd)\b/i.test(t)
        ? "1080p"
        : /\b720p\b/i.test(t)
          ? "720p"
          : /\b(480p|576p|dvdrip|dvdscr|sd)\b/i.test(t)
            ? "480p"
            : null;

  const idiomas = [];
  if (/latino|\blat\b|es-?419|dual.?lat|🇲🇽|🇦🇷|🇨🇴|🇨🇱|🇵🇪|🇻🇪|🇺🇾|🇪🇨/i.test(t)) idiomas.push("latino");
  if (/castellano|\bcast\b|\bes-?es\b|🇪🇸/i.test(t)) idiomas.push("castellano");
  if (/\beng(lish)?\b|🇺🇸|🇬🇧|\bmulti\b|\bvo\b|\boriginal\b/i.test(t)) idiomas.push("original");

  // Con TorBox, [TB+] y ⚡ son «ya está listo»; [RD+] aparece en todo y no dice nada
  const cache = /\[(tb|ad|pm|dl|oc)\s?\+\]|⚡/i.test(t) ? true : /\[(tb|ad|pm|dl|oc)\s?download\]|⬇|⏳/i.test(t) ? false : null;
  const codec = /\b(hevc|x\.?265|h\.?265)\b/i.test(t) ? "HEVC" : /\bav1\b/i.test(t) ? "AV1" : /\b(x\.?264|h\.?264|avc)\b/i.test(t) ? "H.264" : null;
  const medida = /(\d+(?:[.,]\d+)?)\s?(GB|MB)\b/i.exec(t);
  return {
    calidad,
    idiomas,
    cache,
    codec,
    hdr: /\bhdr10?\b|dolby.?vision|\bdv\b/i.test(t),
    tamano: medida ? medida[1].replace(".", ",") + " " + medida[2].toUpperCase() : null,
  };
}

/**
 * Ordena de la mejor a la peor para este perfil:
 * 1. Que el navegador la pueda abrir (compatible, sin datos, dudosa, no).
 * 2. El idioma, según el orden del perfil.
 * 3. La calidad: la más alta que no pase el tope; lo que pasa el tope va después.
 * 4. Ya lista en el servicio, y códec H.264 antes que HEVC.
 */
export function ordenar(fuentes, { idiomasAudio = IDIOMAS_POR_DEFECTO, calidadMaxima = "automatica" } = {}) {
  const tope = TOPE[calidadMaxima] ?? 1080;
  const clave = (f, orden) => {
    const idioma = idiomasAudio.findIndex((x) => f.idiomas.includes(x));
    const alto = ALTURA[f.calidad] ?? 0;
    const calidad = alto === 0 ? 30000 : alto <= tope ? tope - alto : 10000 + alto;
    const cache = f.cache === true ? 0 : f.cache === null ? 1 : 2;
    const codec = f.codec === "H.264" ? 0 : f.codec === null ? 1 : 2;
    return [NIVEL[f.nivel], idioma < 0 ? idiomasAudio.length : idioma, calidad, cache, codec, orden];
  };
  const claves = new Map(fuentes.map((f, i) => [f, clave(f, i)]));
  const ordenadas = [...fuentes].sort((a, b) => {
    const ka = claves.get(a);
    const kb = claves.get(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
    return 0;
  });
  return ordenadas.map((f, i) => ({ ...f, recomendada: i === 0 && f.nivel !== "no" }));
}
