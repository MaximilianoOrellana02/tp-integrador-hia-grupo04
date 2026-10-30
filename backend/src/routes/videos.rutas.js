import { Router } from "express";
import { autenticar } from "../middlewares/autenticar.js";
import { listarVideos, obtenerVideo } from "../services/videos.service.js";

const router = Router();

router.use(autenticar);

router.get("/", async (req, res) => {
  res.json({ videos: await listarVideos() });
});
router.get("/:idVideo", async (req, res) => {
  res.json(await obtenerVideo(req.params.idVideo));
});

export default router;
