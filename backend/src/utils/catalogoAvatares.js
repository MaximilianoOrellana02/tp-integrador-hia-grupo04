/**
 * Copia en memoria de qué avatares tienen imagen (sin las imágenes). La llena
 * avatares.service al arrancar y después de cada cambio, y la usa el modelo Perfil para
 * armar `avatarUrl` sin consultar la base en cada perfil.
 *
 * Vale porque el backend corre en un solo proceso (instancia única: una instancia). Con
 * varias, un cambio hecho en una no llegaría a las otras hasta reiniciarlas.
 */
const catalogo = new Map();

/** Los colores de siempre: siguen valiendo aunque no tengan imagen. */
export const AVATARES_BASE = Array.from(
  { length: 12 },
  (_, i) => `avatar_${String(i + 1).padStart(2, '0')}`
);

/** @param {Array<{ clave: string, version: number, retirado: boolean, orden: number }>} avatares */
export function reemplazarCatalogo(avatares) {
  catalogo.clear();
  for (const avatar of avatares) catalogo.set(avatar.clave, avatar);
}

export function datosDeAvatar(clave) {
  return catalogo.get(clave) ?? null;
}

/**
 * Si un perfil puede elegir este avatar: uno cargado y no retirado, o uno de los colores
 * de siempre (salvo que se le haya cargado imagen y después se lo haya retirado).
 */
export function avatarElegible(clave) {
  if (typeof clave !== 'string') return false;
  const avatar = catalogo.get(clave);
  if (avatar) return !avatar.retirado;
  return AVATARES_BASE.includes(clave);
}

/**
 * Dirección de la imagen, relativa al backend (las apps le anteponen su URL), o null si
 * ese avatar no tiene imagen (las apps muestran el color con la inicial). La versión en la
 * URL cambia con cada imagen nueva: así se puede guardar en caché para siempre.
 */
export function urlDeAvatar(clave) {
  const avatar = catalogo.get(clave);
  return avatar ? `/api/avatares/${avatar.clave}?v=${avatar.version}` : null;
}
