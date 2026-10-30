import { Op, col, fn, where } from 'sequelize';
import { sequelize } from '../config/db.js';
import { Cuenta, Perfil } from '../models/index.js';
import { avatarElegible } from '../utils/catalogoAvatares.js';
import { ErrorHttp } from '../utils/ErrorHttp.js';

export const MAXIMO_PERFILES = 5;

// Lo único que se toma del body: así nadie puede cambiar `cuentaId`, `id` u `orden`
const CAMPOS_EDITABLES = ['nombre', 'avatar', 'idiomasAudio', 'idiomaSubtitulos', 'calidadMaxima'];

function camposPermitidos(body) {
  const datos = {};
  for (const campo of CAMPOS_EDITABLES) {
    if (body[campo] !== undefined) datos[campo] = body[campo];
  }
  if (datos.nombre !== undefined) {
    if (typeof datos.nombre !== 'string') {
      throw new ErrorHttp(400, 'El nombre del perfil es obligatorio');
    }
    datos.nombre = datos.nombre.trim();
  }
  return datos;
}

/**
 * Bloquea la fila de la cuenta hasta que termine la transacción. Si llegan dos
 * pedidos juntos (ej.: doble OK en la app), el segundo espera al primero: así no
 * se cuela un sexto perfil ni se borran los dos últimos a la vez.
 */
async function bloquearCuenta(cuentaId, transaction) {
  const cuenta = await Cuenta.findByPk(cuentaId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!cuenta) {
    throw new ErrorHttp(401, 'La cuenta ya no existe');
  }
}

/**
 * El avatar tiene que poder elegirse (cargado y no retirado, o uno de los colores). Si el
 * perfil ya lo tiene, vale aunque se haya retirado: así editar el nombre no obliga a
 * cambiarlo.
 */
function verificarAvatar(avatar, actual = null) {
  if (avatar === undefined || avatar === actual) return;
  if (!avatarElegible(avatar)) {
    throw new ErrorHttp(400, 'Ese avatar no existe o ya no se puede elegir');
  }
}

// La base impide «Mamá» dos veces, pero no «Mamá» y «mamá»
async function verificarNombreLibre(cuentaId, nombre, transaction, idExcluido = null) {
  const condiciones = [
    { cuentaId },
    where(fn('lower', col('nombre')), nombre.toLowerCase())
  ];
  if (idExcluido) condiciones.push({ id: { [Op.ne]: idExcluido } });

  const repetido = await Perfil.findOne({ where: { [Op.and]: condiciones }, transaction });
  if (repetido) {
    throw new ErrorHttp(409, 'Ya hay un perfil con ese nombre');
  }
}

// Un perfil de otra cuenta responde igual que uno inexistente (404): no revela qué IDs existen
async function buscarPerfil(cuentaId, perfilId, transaction) {
  const id = Number(perfilId);
  const perfil = Number.isInteger(id)
    ? await Perfil.findOne({ where: { id, cuentaId }, transaction })
    : null;
  if (!perfil) {
    throw new ErrorHttp(404, 'Perfil no encontrado');
  }
  return perfil;
}

export async function listar(cuentaId) {
  return Perfil.findAll({
    where: { cuentaId },
    order: [['orden', 'ASC'], ['id', 'ASC']]
  });
}

export async function crear(cuentaId, body) {
  const datos = camposPermitidos(body);
  if (!datos.nombre) {
    throw new ErrorHttp(400, 'El nombre del perfil es obligatorio');
  }
  verificarAvatar(datos.avatar);

  return sequelize.transaction(async (transaction) => {
    await bloquearCuenta(cuentaId, transaction);

    const cantidad = await Perfil.count({ where: { cuentaId }, transaction });
    if (cantidad >= MAXIMO_PERFILES) {
      throw new ErrorHttp(400, `Llegaste al máximo de ${MAXIMO_PERFILES} perfiles`);
    }
    await verificarNombreLibre(cuentaId, datos.nombre, transaction);

    // El nuevo va al final
    const ultimoOrden = await Perfil.max('orden', { where: { cuentaId }, transaction });
    return Perfil.create(
      { ...datos, cuentaId, orden: (ultimoOrden ?? -1) + 1 },
      { transaction }
    );
  });
}

export async function actualizar(cuentaId, perfilId, body) {
  const datos = camposPermitidos(body);
  if (Object.keys(datos).length === 0) {
    throw new ErrorHttp(400, 'No hay datos para actualizar');
  }

  return sequelize.transaction(async (transaction) => {
    await bloquearCuenta(cuentaId, transaction);
    const perfil = await buscarPerfil(cuentaId, perfilId, transaction);
    verificarAvatar(datos.avatar, perfil.avatar);

    if (datos.nombre !== undefined) {
      if (!datos.nombre) {
        throw new ErrorHttp(400, 'El nombre del perfil es obligatorio');
      }
      await verificarNombreLibre(cuentaId, datos.nombre, transaction, perfil.id);
    }

    return perfil.update(datos, { transaction });
  });
}

export async function eliminar(cuentaId, perfilId) {
  await sequelize.transaction(async (transaction) => {
    await bloquearCuenta(cuentaId, transaction);
    const perfil = await buscarPerfil(cuentaId, perfilId, transaction);

    // La app siempre necesita un perfil para entrar
    const cantidad = await Perfil.count({ where: { cuentaId }, transaction });
    if (cantidad <= 1) {
      throw new ErrorHttp(400, 'No se puede borrar el único perfil de la cuenta');
    }

    await perfil.destroy({ transaction });
  });
}
