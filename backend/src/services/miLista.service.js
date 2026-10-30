import { MiLista } from '../models/index.js';
import { ErrorHttp } from '../utils/ErrorHttp.js';
import { CAMPOS_TITULO, FORMATO_ID_VIDEO, copiaLimpia, verificarPerfil } from './progreso.service.js';

// Tope por perfil: alcanza de sobra y evita que una lista crezca sin fin
export const MAXIMO_MI_LISTA = 200;

function validarIdTitulo(idTitulo) {
  // Solo títulos (películas y series), nunca episodios ("tt0903747:1:3")
  if (!FORMATO_ID_VIDEO.test(idTitulo ?? '') || idTitulo.includes(':')) {
    throw new ErrorHttp(400, 'ID de título no válido');
  }
}

function aRespuesta(item) {
  return { titulo: item.titulo, agregado: item.createdAt };
}

/** La lista del perfil, de lo último agregado a lo primero. */
export async function listar(cuentaId, perfilId) {
  const id = await verificarPerfil(cuentaId, perfilId);
  const lista = await MiLista.findAll({
    where: { perfilId: id },
    order: [['createdAt', 'DESC']],
    limit: MAXIMO_MI_LISTA
  });
  return lista.map(aRespuesta);
}

/**
 * Agrega un título. Repetirlo no lo duplica ni lo mueve de lugar (conserva cuándo se
 * agregó); solo actualiza la copia de los datos.
 */
export async function agregar(cuentaId, perfilId, idTitulo, body) {
  const id = await verificarPerfil(cuentaId, perfilId);
  validarIdTitulo(idTitulo);

  const titulo = copiaLimpia(body.titulo, CAMPOS_TITULO, 'del título', ['id', 'tipo', 'nombre']);
  if (!titulo) {
    throw new ErrorHttp(400, 'Faltan los datos del título');
  }
  if (titulo.id !== idTitulo) {
    throw new ErrorHttp(400, 'El ID de título no coincide con los datos enviados');
  }
  if (titulo.tipo !== 'movie' && titulo.tipo !== 'series') {
    throw new ErrorHttp(400, 'Solo se pueden guardar películas y series');
  }

  const existente = await MiLista.findOne({ where: { perfilId: id, idTitulo } });
  if (existente) {
    existente.titulo = titulo;
    await existente.save();
    return aRespuesta(existente);
  }

  const cantidad = await MiLista.count({ where: { perfilId: id } });
  if (cantidad >= MAXIMO_MI_LISTA) {
    throw new ErrorHttp(400, `Mi lista llegó al máximo de ${MAXIMO_MI_LISTA} títulos`);
  }
  // Dos pedidos iguales a la vez: el índice único frena al segundo (409 en manejarErrores)
  const nuevo = await MiLista.create({ perfilId: id, idTitulo, titulo });
  return aRespuesta(nuevo);
}

// Quitar algo que no está no es error
export async function quitar(cuentaId, perfilId, idTitulo) {
  const id = await verificarPerfil(cuentaId, perfilId);
  validarIdTitulo(idTitulo);
  await MiLista.destroy({ where: { perfilId: id, idTitulo } });
}
