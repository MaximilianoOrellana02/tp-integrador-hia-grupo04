import { Router } from "express";
import { autenticar } from "../middlewares/autenticar.js";
import { agregar, buscarFuentes, enlaceDeFuente, filasDeAddons, listar, quitar } from "../services/addons.service.js";

const router = Router();

router.use(autenticar);

router.get("/addons", async (req, res) => {
  res.json({ addons: await listar(req.cuentaId) });
});
router.post("/addons", async (req, res) => {
  res.status(201).json({ addon: await agregar(req.cuentaId, req.body?.url) });
});
router.delete("/addons/:id", async (req, res) => {
  await quitar(req.cuentaId, req.params.id);
  res.status(204).end();
});
router.get("/filas", async (req, res) => {
  res.json({ filas: await filasDeAddons(req.cuentaId) });
});
router.get("/fuentes/:tipo/:idVideo", async (req, res) => {
  res.json(await buscarFuentes(req.cuentaId, req.params.tipo, req.params.idVideo));
});
router.post("/fuentes/:id/enlace", async (req, res) => {
  res.json(await enlaceDeFuente(req.cuentaId, req.params.id));
});

export default router;
