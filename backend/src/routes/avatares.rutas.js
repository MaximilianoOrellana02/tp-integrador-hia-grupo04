import express, { Router } from "express";
import { imagen, listar } from "../controllers/avatares.controller.js";
import { autenticar } from "../middlewares/autenticar.js";
import { TAMANO_MAXIMO_KB, TIPOS_IMAGEN } from "../services/avatares.service.js";
import { ErrorHttp } from "../utils/ErrorHttp.js";

const router = Router();

// La lista, con sesión (se usa al elegir avatar)
router.get("/", autenticar, listar);
// La imagen, pública (ver el controlador)
router.get("/:clave", imagen);

export default router;

const leerImagen = express.raw({ type: TIPOS_IMAGEN, limit: `${TAMANO_MAXIMO_KB}kb` });

/**
 * Lee el cuerpo del pedido como imagen (lo usan las rutas de admin). Sin esto, una imagen
 * demasiado grande respondería «request entity too large», en inglés.
 */
export function recibirImagen(req, res, next) {
  leerImagen(req, res, (error) => {
    if (error?.type === "entity.too.large") {
      return next(new ErrorHttp(413, `La imagen pesa más de ${TAMANO_MAXIMO_KB} KB: achicala antes de subirla`));
    }
    next(error);
  });
}
