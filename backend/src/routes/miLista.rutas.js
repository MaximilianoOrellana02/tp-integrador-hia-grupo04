import { Router } from "express";
import { agregar, listar, quitar } from "../controllers/miLista.controller.js";
import { autenticar } from "../middlewares/autenticar.js";

// mergeParams: para leer :perfilId, que está en la ruta donde se monta este router
const router = Router({ mergeParams: true });

// Todas exigen sesión iniciada; el perfil tiene que ser de esa cuenta
router.use(autenticar);

router.get("/", listar);
router.put("/:idTitulo", agregar);
router.delete("/:idTitulo", quitar);

export default router;
