import { Router } from "express";
import { cuentas } from "../controllers/admin.controller.js";
import {
  cambiar as cambiarAvatar,
  crear as crearAvatar,
  eliminar as eliminarAvatar,
  listarAdmin as listarAvatares,
  ordenar as ordenarAvatares,
  reemplazarImagen as reemplazarImagenAvatar,
} from "../controllers/avatares.controller.js";
import { autenticar } from "../middlewares/autenticar.js";
import { soloAdmin } from "../middlewares/soloAdmin.js";
import { recibirImagen } from "./avatares.rutas.js";

const router = Router();

// Todas las rutas de admin exigen sesión iniciada y rol "admin"
router.use(autenticar, soloAdmin);

router.get("/cuentas", cuentas);

// Avatares de perfil: la imagen va sola en el cuerpo (image/webp, image/png o image/jpeg).
// PATCH { retirado }; orden con todas las claves: PUT /avatares/orden { claves: [...] }
router.get("/avatares", listarAvatares);
router.post("/avatares", recibirImagen, crearAvatar);
router.put("/avatares/orden", ordenarAvatares);
router.put("/avatares/:clave/imagen", recibirImagen, reemplazarImagenAvatar);
router.patch("/avatares/:clave", cambiarAvatar);
router.delete("/avatares/:clave", eliminarAvatar);

export default router;
