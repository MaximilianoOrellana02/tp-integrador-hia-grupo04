import { Op } from "sequelize";
import { Cuenta } from "../models/index.js";

// Cada cuánto, como mucho, se actualiza "último acceso": la app hace muchos pedidos
// seguidos y no hace falta escribir en la base en cada uno.
const INTERVALO_MS = 5 * 60 * 1000;

/**
 * UPDATE condicional (sin leer antes): si el valor es reciente, no modifica
 * ninguna fila. No se espera su resultado: un error acá no debe frenar el
 * pedido del usuario.
 */
function anotarUso(modelo, id, campo) {
  const limite = new Date(Date.now() - INTERVALO_MS);
  modelo.update(
    { [campo]: new Date() },
    {
      where: {
        id,
        [Op.or]: [{ [campo]: null }, { [campo]: { [Op.lt]: limite } }],
      },
      silent: true, // no toca updated_at: eso indica cambios de datos, no uso
    },
  ).catch((error) => console.error("No se pudo registrar la actividad:", error.message));
}

// Anota que la cuenta usó la API
export function registrarActividad(cuentaId) {
  anotarUso(Cuenta, cuentaId, "ultimoAcceso");
}

