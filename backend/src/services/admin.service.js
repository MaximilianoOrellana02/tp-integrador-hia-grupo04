import { sequelize } from "../config/db.js";
import { Cuenta, Perfil } from "../models/index.js";

/**
 * Todas las cuentas para el panel de monitoreo, de la usada más recientemente
 * a la menos. Las que nunca entraron van al final.
 * El passwordHash no sale: el defaultScope de Cuenta lo excluye.
 */
export async function listarCuentas() {
  const cuentas = await Cuenta.findAll({
    attributes: ["id", "email", "nombre", "rol", "ultimoAcceso", "createdAt"],
    include: [
      {
        model: Perfil,
        as: "perfiles",
        attributes: ["id", "nombre", "avatar"],
      },
    ],
    order: [
      [sequelize.literal('"Cuenta"."ultimo_acceso" IS NULL'), "ASC"],
      ["ultimoAcceso", "DESC"],
      [{ model: Perfil, as: "perfiles" }, "orden", "ASC"],
    ],
  });

  return cuentas.map((cuenta) => ({
    id: cuenta.id,
    email: cuenta.email,
    nombre: cuenta.nombre,
    rol: cuenta.rol,
    creada: cuenta.createdAt,
    ultimoAcceso: cuenta.ultimoAcceso,
    perfiles: cuenta.perfiles.map((p) => ({ id: p.id, nombre: p.nombre, avatar: p.avatar, avatarUrl: p.avatarUrl })),
  }));
}
