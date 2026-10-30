import { Cuenta } from "../models/index.js";
import { ErrorHttp } from "../utils/ErrorHttp.js";

/**
 * Deja pasar solo a cuentas con rol "admin". Va después de `autenticar`.
 *
 * El rol se consulta en la base en cada pedido, en vez de guardarlo en el JWT:
 * si se le quita el admin a alguien, deja de valer al instante y no recién
 * cuando vence su token.
 */
export async function soloAdmin(req, res, next) {
  const cuenta = await Cuenta.findByPk(req.cuentaId, { attributes: ["rol"] });
  if (cuenta?.rol !== "admin") {
    throw new ErrorHttp(403, "Solo un administrador puede hacer esto");
  }
  next();
}
