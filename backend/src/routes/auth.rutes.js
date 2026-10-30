import { Router } from "express";
import { login, registro, yo } from "../controllers/auth.controller.js";
import { autenticar } from "../middlewares/autenticar.js";
import { limitarSesion } from "../middlewares/limitarPedidos.js";
import { registroHabilitado } from "../services/auth.service.js";

const router = Router();

// Si el registro está abierto (la pantalla de entrada esconde «Crear cuenta» si no)
router.get("/registro", (req, res) => {
  res.json({ habilitado: registroHabilitado() });
});
router.post("/registro", limitarSesion, registro);
router.post("/login", limitarSesion, login);
router.get("/me", autenticar, yo);

export default router;
