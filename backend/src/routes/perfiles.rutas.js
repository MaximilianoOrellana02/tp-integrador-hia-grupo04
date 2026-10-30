import { Router } from "express";
import { actualizar, crear, eliminar, listar } from "../controllers/perfiles.controller.js";
import { autenticar } from "../middlewares/autenticar.js";

const router = Router();

// Todas exigen sesión iniciada y trabajan solo con los perfiles de esa cuenta
router.use(autenticar);

router.get("/", listar);
router.post("/", crear);
router.patch("/:id", actualizar);
router.delete("/:id", eliminar);

export default router;
