import express from "express";
import addonsRouter from "./routes/addons.rutas.js";
import adminRouter from "./routes/admin.rutas.js";
import authRouter from "./routes/auth.rutes.js";
import avataresRouter from "./routes/avatares.rutas.js";
import inicioRouter from "./routes/inicio.rutas.js";
import miListaRouter from "./routes/miLista.rutas.js";
import perfilesRouter from "./routes/perfiles.rutas.js";
import personasRouter from "./routes/personas.rutas.js";
import progresoRouter from "./routes/progreso.rutas.js";
import videosRouter from "./routes/videos.rutas.js";
import {
  manejarErrores,
  rutaNoEncontrada,
} from "./middlewares/manejarErrores.js";

export const app = express();

// Cuántos proxies hay entre internet y el backend (el nginx del frontend). Con eso Express toma
// la IP real de X-Forwarded-For y el límite de pedidos cuenta por persona
const PROXIES_CONFIABLES = Number(process.env.PROXIES_CONFIABLES) || 0;
if (PROXIES_CONFIABLES > 0) {
  app.set("trust proxy", PROXIES_CONFIABLES);
}

app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
  });
});

app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/perfiles/:perfilId/progreso", progresoRouter);
app.use("/api/perfiles/:perfilId/lista", miListaRouter);
app.use("/api/perfiles", perfilesRouter);
app.use("/api/videos", videosRouter);
app.use("/api/mis", addonsRouter);
app.use("/api/avatares", avataresRouter);
app.use("/api", personasRouter);
app.use("/api", inicioRouter);

app.use(rutaNoEncontrada);
app.use(manejarErrores);
