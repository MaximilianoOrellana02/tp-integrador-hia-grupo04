import { createHash } from 'node:crypto';
import { col, fn } from 'sequelize';
import { sequelize } from '../config/db.js';
import { Avatar, Perfil } from '../models/index.js';
import {
  AVATARES_BASE,
  datosDeAvatar,
  reemplazarCatalogo,
  urlDeAvatar
} from '../utils/catalogoAvatares.js';
import { ErrorHttp } from '../utils/ErrorHttp.js';

/** Tamaño máximo de una imagen. La app la manda achicada (256 × 256): pesa ~10-30 KB. */
export const TAMANO_MAXIMO_KB = 300;
export const TIPOS_IMAGEN = ['image/webp', 'image/png', 'image/jpeg'];

const EXTENSIONES = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' };

// Imágenes ya leídas de la base: son pocas y chicas, y cada TV las pide una vez
const imagenes = new Map();

/**
 * Tipo de la imagen por sus primeros bytes (no por lo que diga el pedido), o null si no
 * es WebP, PNG ni JPEG.
 */
function tipoPorFirma(buffer) {
  if (buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  return null;
}

/** Revisa la imagen recibida y devuelve su tipo y su hash. */
export function validarImagen(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new ErrorHttp(400, `Mandá la imagen en el cuerpo del pedido (${TIPOS_IMAGEN.join(', ')})`);
  }
  if (buffer.length > TAMANO_MAXIMO_KB * 1024) {
    throw new ErrorHttp(413, `La imagen pesa más de ${TAMANO_MAXIMO_KB} KB: achicala antes de subirla`);
  }
  const tipo = tipoPorFirma(buffer);
  if (!tipo) {
    throw new ErrorHttp(400, 'El archivo no es una imagen WebP, PNG ni JPEG');
  }
  return { tipo, hash: createHash('sha256').update(buffer).digest('hex') };
}

export function extensionDe(tipo) {
  return EXTENSIONES[tipo] ?? 'bin';
}

/** Vuelve a leer de la base qué avatares hay (sin las imágenes). Al arrancar y tras cada cambio. */
export async function cargarCatalogo() {
  const filas = await Avatar.findAll({ attributes: ['clave', 'orden', 'retirado', 'updatedAt'] });
  reemplazarCatalogo(filas.map((a) => ({
    clave: a.clave,
    orden: a.orden,
    retirado: a.retirado,
    version: a.updatedAt.getTime()
  })));
}

async function cambiado(clave) {
  imagenes.delete(clave);
  await cargarCatalogo();
}

// Una misma imagen no se carga dos veces (ni con otra clave)
async function verificarImagenNueva(hash, claveExcluida = null) {
  const repetida = await Avatar.findOne({ where: { hash }, attributes: ['clave'] });
  if (repetida && repetida.clave !== claveExcluida) {
    throw new ErrorHttp(409, `Esa imagen ya está cargada como ${repetida.clave}`);
  }
}

// avatar_13, avatar_14…: nunca por debajo de los 12 colores de siempre
async function siguienteClave() {
  const claves = await Avatar.findAll({ attributes: ['clave'] });
  const numeros = claves.map((a) => Number(a.clave.replace('avatar_', ''))).filter(Number.isInteger);
  const siguiente = Math.max(AVATARES_BASE.length, ...numeros) + 1;
  return `avatar_${String(siguiente).padStart(2, '0')}`;
}

async function buscar(clave) {
  const avatar = await Avatar.findOne({ where: { clave: String(clave) } });
  if (!avatar) {
    throw new ErrorHttp(404, 'Avatar no encontrado');
  }
  return avatar;
}

/**
 * Los que se pueden elegir, en orden: primero los cargados (con imagen) y después los
 * colores de siempre que no tienen imagen (url null: las apps muestran el color).
 */
export async function listarElegibles() {
  const filas = await Avatar.findAll({
    attributes: ['clave', 'retirado'],
    order: [['orden', 'ASC'], ['id', 'ASC']]
  });
  // Un color al que se le cargó imagen ya no va como color (y si se lo retiró, no va)
  const conFila = new Set(filas.map((a) => a.clave));
  const colores = AVATARES_BASE.filter((clave) => !conFila.has(clave));
  return [
    ...filas.filter((a) => !a.retirado).map((a) => ({ clave: a.clave, url: urlDeAvatar(a.clave) })),
    ...colores.map((clave) => ({ clave, url: null }))
  ];
}

/** La imagen de un avatar, también si está retirado (los perfiles que lo tienen la siguen viendo). */
export async function imagen(clave) {
  const datos = datosDeAvatar(String(clave));
  if (!datos) {
    throw new ErrorHttp(404, 'Avatar no encontrado');
  }
  let guardada = imagenes.get(datos.clave);
  if (!guardada || guardada.version !== datos.version) {
    const avatar = await buscar(datos.clave);
    guardada = { buffer: avatar.imagen, tipo: avatar.tipo, version: datos.version };
    imagenes.set(datos.clave, guardada);
  }
  return guardada;
}

// ── Administración ───────────────────────────────────────────────────────────────

/** Todos, con los retirados, cuánto pesa cada uno y cuántos perfiles lo usan. */
export async function listarAdmin() {
  const [avatares, usos] = await Promise.all([
    Avatar.findAll({
      attributes: [
        'clave', 'tipo', 'orden', 'retirado', 'createdAt', 'updatedAt',
        [fn('octet_length', col('imagen')), 'bytes']
      ],
      order: [['orden', 'ASC'], ['id', 'ASC']]
    }),
    Perfil.findAll({
      attributes: ['avatar', [fn('count', col('id')), 'cantidad']],
      group: ['avatar'],
      raw: true
    })
  ]);
  const uso = new Map(usos.map((u) => [u.avatar, Number(u.cantidad)]));
  return avatares.map((a) => ({
    clave: a.clave,
    url: urlDeAvatar(a.clave),
    tipo: a.tipo,
    bytes: Number(a.get('bytes')),
    orden: a.orden,
    retirado: a.retirado,
    uso: uso.get(a.clave) ?? 0,
    creado: a.createdAt,
    actualizado: a.updatedAt
  }));
}

/** Carga un avatar nuevo con la clave siguiente, al final de la lista. */
export async function crear(buffer) {
  const { tipo, hash } = validarImagen(buffer);
  await verificarImagenNueva(hash);

  const ultimoOrden = await Avatar.max('orden');
  const avatar = await Avatar.create({
    clave: await siguienteClave(),
    imagen: buffer,
    tipo,
    hash,
    orden: (ultimoOrden ?? -1) + 1
  });
  await cambiado(avatar.clave);
  return (await listarAdmin()).find((a) => a.clave === avatar.clave);
}

/**
 * Cambia la imagen de un avatar (los perfiles que lo usan ven la nueva). Con uno de los
 * 12 colores de siempre que todavía no tiene imagen, se la pone (reemplaza al color).
 */
export async function reemplazarImagen(clave, buffer) {
  const { tipo, hash } = validarImagen(buffer);
  const existente = await Avatar.findOne({ where: { clave: String(clave) } });

  if (existente) {
    await verificarImagenNueva(hash, existente.clave);
    // changed('updatedAt') obliga a renovar la fecha aunque solo cambie la imagen
    existente.set({ imagen: buffer, tipo, hash });
    existente.changed('updatedAt', true);
    await existente.save();
  } else if (AVATARES_BASE.includes(clave)) {
    await verificarImagenNueva(hash);
    const ultimoOrden = await Avatar.max('orden');
    await Avatar.create({ clave, imagen: buffer, tipo, hash, orden: (ultimoOrden ?? -1) + 1 });
  } else {
    throw new ErrorHttp(404, 'Avatar no encontrado');
  }

  await cambiado(clave);
  return (await listarAdmin()).find((a) => a.clave === clave);
}

/** Retira un avatar (deja de aparecer para elegir) o lo vuelve a poner. */
export async function cambiarRetirado(clave, retirado) {
  if (typeof retirado !== 'boolean') {
    throw new ErrorHttp(400, 'Mandá { "retirado": true } o { "retirado": false }');
  }
  const avatar = await buscar(clave);
  // silent: la imagen no cambia, así que la versión de la URL tampoco (las apps la tienen guardada)
  await avatar.update({ retirado }, { silent: true });
  await cambiado(avatar.clave);
  return (await listarAdmin()).find((a) => a.clave === avatar.clave);
}

/** Nuevo orden: la lista completa de claves cargadas, en el orden en que tienen que aparecer. */
export async function ordenar(claves) {
  const todas = (await Avatar.findAll({ attributes: ['clave'] })).map((a) => a.clave);
  const valida =
    Array.isArray(claves) &&
    claves.length === todas.length &&
    new Set(claves).size === claves.length &&
    claves.every((clave) => todas.includes(clave));
  if (!valida) {
    throw new ErrorHttp(400, 'Mandá todas las claves de los avatares cargados, una vez cada una');
  }

  await sequelize.transaction(async (transaction) => {
    for (const [orden, clave] of claves.entries()) {
      // silent: el orden no cambia la imagen, así que no tiene que cambiar su versión
      await Avatar.update({ orden }, { where: { clave }, transaction, silent: true });
    }
  });
  await cargarCatalogo();
  return listarAdmin();
}

/** Borra un avatar que no usa nadie (ej.: uno subido por error). Si lo usan, hay que retirarlo. */
export async function eliminar(clave) {
  const avatar = await buscar(clave);
  const uso = await Perfil.count({ where: { avatar: avatar.clave } });
  if (uso > 0) {
    throw new ErrorHttp(409, `Lo usa${uso === 1 ? '' : 'n'} ${uso} perfil${uso === 1 ? '' : 'es'}: retiralo en vez de borrarlo`);
  }
  await avatar.destroy();
  await cambiado(avatar.clave);
}
