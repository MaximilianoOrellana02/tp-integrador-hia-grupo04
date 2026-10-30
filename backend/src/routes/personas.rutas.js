import { Router } from "express";
import { buscar, elenco, persona } from "../controllers/personas.controller.js";
import { autenticar } from "../middlewares/autenticar.js";

/**
 * Datos de TMDB para la app: elenco, búsqueda de personas y filmografías.
 *
 * Con sesión (2026-10-12): así nadie de afuera usa el token de TMDB del servidor.
 * `autenticar` va en cada ruta y no con `router.use`: este router se monta en
 * "/api" junto con otros, y con `router.use` también exigiría sesión a rutas que
 * tienen que ser públicas (ej.: /api/bienvenida).
 */
const router = Router();

router.get("/elenco/:tipo/:imdbId", autenticar, elenco);
router.get("/personas", autenticar, buscar);
router.get("/personas/:id", autenticar, persona);

export default router;
