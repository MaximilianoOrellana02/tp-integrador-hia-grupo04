import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { sequelize } from '../config/db.js';
import { Cuenta, Perfil } from '../models/index.js';
import { registrarActividad } from './actividad.service.js';
import { ErrorHttp } from '../utils/ErrorHttp.js';

const COSTO_HASH = 12;

function validarPassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new ErrorHttp(400, 'La contraseña debe tener al menos 8 caracteres');
  }
  if (Buffer.byteLength(password, 'utf8') > 72) {
    throw new ErrorHttp(400, 'La contraseña es demasiado larga');
  }
}

function generarToken(cuenta) {
  return jwt.sign({}, process.env.JWT_SECRETO, {
    subject: String(cuenta.id),
    expiresIn: process.env.JWT_EXPIRACION ?? '1d',
    algorithm: 'HS256'
  });
}

function datosPublicos(cuenta) {
  // El rol es solo para la interfaz: cada ruta de admin lo vuelve a verificar en la base.
  return { id: cuenta.id, email: cuenta.email, nombre: cuenta.nombre, rol: cuenta.rol };
}

/** Si cualquiera puede crearse una cuenta (REGISTRO_HABILITADO). */
export function registroHabilitado() {
  return process.env.REGISTRO_HABILITADO === 'true';
}

/**
 * Crea la cuenta con su primer perfil (mismo nombre), en una sola transacción: si
 * falla uno, no se guarda ninguno. La usan el registro y el script `crear-cuenta`.
 */
export async function crearCuenta({ email, password, nombre }) {
  if (typeof nombre !== 'string' || !nombre.trim()) {
    throw new ErrorHttp(400, 'El nombre es obligatorio');
  }
  validarPassword(password);

  const passwordHash = await bcrypt.hash(password, COSTO_HASH);

  return sequelize.transaction(async (transaction) => {
    const nueva = await Cuenta.create({ email, passwordHash, nombre: nombre.trim() }, { transaction });
    await Perfil.create(
      { cuentaId: nueva.id, nombre: nombre.trim().slice(0, 30) },
      { transaction }
    );
    return nueva;
  });
}

export async function registrar({ email, password, nombre }) {
  if (!registroHabilitado()) {
    throw new ErrorHttp(403, 'El registro está cerrado. Pedile una cuenta a quien administra MaxFlix');
  }
  const cuenta = await crearCuenta({ email, password, nombre });
  return { cuenta: datosPublicos(cuenta), token: generarToken(cuenta) };
}

/** Inicia sesión con email y contraseña. El token vence (JWT_EXPIRACION, 1 día). */
export async function iniciarSesion({ email, password }) {
  if (!email || !password) {
    throw new ErrorHttp(400, 'Email y contraseña son obligatorios');
  }

  const cuenta = await Cuenta.scope('conPassword').findOne({
    where: { email: String(email).trim().toLowerCase() }
  });

  const valida = cuenta && (await bcrypt.compare(String(password), cuenta.passwordHash));
  if (!valida) {
    throw new ErrorHttp(401, 'Email o contraseña incorrectos');
  }

  registrarActividad(cuenta.id);
  return { cuenta: datosPublicos(cuenta), token: generarToken(cuenta) };
}

export async function obtenerCuenta(cuentaId) {
  const cuenta = await Cuenta.findByPk(cuentaId, {
    include: [{ model: Perfil, as: 'perfiles' }],
    order: [[{ model: Perfil, as: 'perfiles' }, 'orden', 'ASC']]
  });
  if (!cuenta) {
    throw new ErrorHttp(401, 'La cuenta ya no existe');
  }
  return cuenta;
}