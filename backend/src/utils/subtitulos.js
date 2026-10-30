/**
 * Convierte un subtítulo SRT a WebVTT, que es lo que entienden los navegadores. Si ya viene en
 * WebVTT se deja como está. Las marcas de posición de los SRT (`{\an8}`) se sacan: el
 * navegador no las usa y se verían como texto.
 */
export function aVtt(texto) {
  const limpio = String(texto).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (/^WEBVTT/.test(limpio)) return limpio;
  const cuerpo = limpio
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")
    .replace(/\{\\an?\d\}/g, "");
  return "WEBVTT\n\n" + cuerpo;
}
