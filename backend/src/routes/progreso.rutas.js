import { Router } from "express";
import { borrar, guardar, listar } from "../controllers/progreso.controller.js";
import { autenticar } from "../middlewares/autenticar.js";

// mergeParams: para leer :perfilId, que está en la ruta donde se monta este router
const router = Router({ mergeParams: true });

// Todas exigen sesión iniciada; el perfil tiene que ser de esa cuenta
router.use(autenticar);

router.get("/", listar);
router.put("/:idVideo", guardar);
router.delete("/:idVideo", borrar);

export default router;
