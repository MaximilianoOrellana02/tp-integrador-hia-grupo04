import jwt from "jsonwebtoken";
import { registrarActividad } from "../services/actividad.service.js";
import { ErrorHttp } from "../utils/ErrorHttp.js";

export async function autenticar(req, res, next) {
  const [tipo, token] = req.headers.authorization?.split(" ") ?? [];
  if (tipo !== "Bearer" || !token) {
    throw new ErrorHttp(401, "Falta el token de acceso");
  }

  let datos;
  try {
    datos = jwt.verify(token, process.env.JWT_SECRETO, {
      algorithms: ["HS256"],
    });
  } catch {
    throw new ErrorHttp(401, "Token inválido o vencido");
  }

  req.cuentaId = Number(datos.sub);
  registrarActividad(req.cuentaId);
  next();
}
