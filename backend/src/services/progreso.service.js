import { Perfil, Progreso } from '../models/index.js';
import { ErrorHttp } from '../utils/ErrorHttp.js';

// Los que muestra «Seguir viendo» (la app guarda hasta 60 también)
const MAXIMO_LISTA = 60;
// "tt0111161", "tt0903747:1:3": letras, números, ":", "." y "-"
export const FORMATO_ID_VIDEO = /^[\w:.-]{1,60}$/;
// Ninguna copia de datos razonable pesa más que esto (evita guardar basura)
const MAXIMO_CARACTERES_COPIA = 8000;

// Lo único que se guarda de cada copia: así nadie llena la base con campos inventados
export const CAMPOS_TITULO = ['id', 'tipo', 'nombre', 'poster', 'fondo', 'puntajeImdb', 'anio', 'duracion', 'generos', 'descripcion'];
export const CAMPOS_EPISODIO = ['id', 'temporada', 'numero', 'nombre', 'miniatura', 'sinopsis', 'estreno'];

export function copiaLimpia(objeto, campos, nombre, obligatorios) {
  if (objeto === null || objeto === undefined) return null;
  if (typeof objeto !== 'object' || Array.isArray(objeto)) {
    throw new ErrorHttp(400, `Datos ${nombre} no válidos`);
  }
  const copia = {};
  for (const campo of campos) {
    if (objeto[campo] !== undefined && objeto[campo] !== null) copia[campo] = objeto[campo];
  }
  for (const campo of obligatorios) {
    if (copia[campo] === undefined || copia[campo] === '') {
      throw new ErrorHttp(400, `Falta «${campo}» en los datos ${nombre}`);
    }
  }
  if (JSON.stringify(copia).length > MAXIMO_CARACTERES_COPIA) {
    throw new ErrorHttp(400, `Los datos ${nombre} son demasiado grandes`);
  }
  return copia;
}

function milisegundos(valor, nombre) {
  if (!Number.isInteger(valor) || valor < 0 || valor > 2_147_483_647) {
    throw new ErrorHttp(400, `«${nombre}» no es válido`);
  }
  return valor;
}

// Un perfil de otra cuenta responde igual que uno inexistente (404)
export async function verificarPerfil(cuentaId, perfilId) {
  const id = Number(perfilId);
  const perfil = Number.isInteger(id)
    ? await Perfil.findOne({ where: { id, cuentaId }, attributes: ['id'] })
    : null;
  if (!perfil) {
    throw new ErrorHttp(404, 'Perfil no encontrado');
  }
  return perfil.id;
}

export function validarIdVideo(idVideo) {
  if (!FORMATO_ID_VIDEO.test(idVideo ?? '')) {
    throw new ErrorHttp(400, 'ID de video no válido');
  }
}

function aRespuesta(p) {
  return {
    idVideo: p.idVideo,
    posicionMs: p.posicionMs,
    duracionMs: p.duracionMs,
    titulo: p.titulo,
    episodio: p.episodio,
    siguiente: p.siguiente,
    actualizado: p.updatedAt
  };
}

export async function listar(cuentaId, perfilId) {
  const id = await verificarPerfil(cuentaId, perfilId);
  const lista = await Progreso.findAll({
    where: { perfilId: id },
    order: [['updatedAt', 'DESC']],
    limit: MAXIMO_LISTA
  });
  return lista.map(aRespuesta);
}

/**
 * Guarda por dónde va un video (crea o actualiza). Repetirlo da el mismo
 * resultado: si la app reintenta tras un corte, no se duplica nada.
 */
export async function guardar(cuentaId, perfilId, idVideo, body) {
  const id = await verificarPerfil(cuentaId, perfilId);
  validarIdVideo(idVideo);

  const titulo = copiaLimpia(body.titulo, CAMPOS_TITULO, 'del título', ['id', 'tipo', 'nombre']);
  if (!titulo) {
    throw new ErrorHttp(400, 'Faltan los datos del título');
  }
  const episodio = copiaLimpia(body.episodio, CAMPOS_EPISODIO, 'del episodio', ['id']);
  const siguiente = copiaLimpia(body.siguiente, CAMPOS_EPISODIO, 'del episodio siguiente', ['id']);

  // El ID de la ruta tiene que ser el del episodio (series) o el del título (películas)
  if (idVideo !== (episodio?.id ?? titulo.id)) {
    throw new ErrorHttp(400, 'El ID de video no coincide con los datos enviados');
  }

  const [progreso] = await Progreso.upsert(
    {
      perfilId: id,
      idVideo,
      posicionMs: milisegundos(body.posicionMs, 'posicionMs'),
      duracionMs: milisegundos(body.duracionMs, 'duracionMs'),
      titulo,
      episodio,
      siguiente
    },
    { returning: true }
  );
  return aRespuesta(progreso);
}

// «Quitar de Seguir viendo» o «Empezar de nuevo». Borrar algo que no está no es error
export async function borrar(cuentaId, perfilId, idVideo) {
  const id = await verificarPerfil(cuentaId, perfilId);
  validarIdVideo(idVideo);
  await Progreso.destroy({ where: { perfilId: id, idVideo } });
}
