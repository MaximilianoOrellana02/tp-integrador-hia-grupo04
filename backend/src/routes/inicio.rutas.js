import { Router } from "express";
import { autenticar } from "../middlewares/autenticar.js";
import {
  explorar,
  filasGenero,
  paginaInicio,
  postersBienvenida,
  recomendaciones,
} from "../services/inicio.service.js";
import { registroHabilitado } from "../services/auth.service.js";
import { buscarSagas, saga } from "../services/peliculas.service.js";
import { paginaPeliculas, paginaSeries } from "../services/recetas.service.js";
import { paginaOriginales } from "../services/originales.service.js";
import { paginaGenero } from "../services/generos.service.js";
import { pantallaMarca } from "../services/marcas.service.js";
import { temporadaEnEspanol, tituloEnEspanol } from "../services/fichas.service.js";

/**
 * Inicio armado por el backend: la app pide todas las filas en un solo pedido.
 *
 * Todas con sesión (2026-10-12), salvo /bienvenida. `autenticar` va en cada ruta y
 * no con `router.use`, por la misma razón que en personas.rutas.js.
 */
const router = Router();

// ?pagina=2, 3…: más filas (recetas del día) a medida que se baja; sin pagina, la 1
router.get("/inicio", autenticar, async (req, res) => {
  res.json(await paginaInicio(req.query.pagina ?? 1));
});

// Fondo de la bienvenida de la app y si se muestra «Crear cuenta». Pública: se muestra
// antes de iniciar sesión (solo pósters y un sí/no, sin datos de nadie)
router.get("/bienvenida", async (req, res) => {
  res.json({ posters: await postersBienvenida(), registroAbierto: registroHabilitado() });
});

// Tarjetas de género que Cinemeta no tiene (ej.: /api/explorar?tipo=movie&pais=AR)
router.get("/explorar", autenticar, async (req, res) => {
  const titulos = await explorar(req.query.tipo, req.query.pais);
  res.json({ titulos });
});

// Filas «Mejor puntuados» y «Estrenos» de Películas / Series
// (ej.: /api/filas-genero/movie?genero=Drama; sin genero, de todos)
router.get("/filas-genero/:tipo", autenticar, async (req, res) => {
  res.json(await filasGenero(req.params.tipo, req.query.genero));
});

// Para «Porque viste X» (ej.: /api/recomendaciones/movie/tt0109830)
router.get("/recomendaciones/:tipo/:imdbId", autenticar, async (req, res) => {
  const titulos = await recomendaciones(req.params.tipo, req.params.imdbId);
  res.json({ titulos });
});

// Pantalla Películas (app de PC): filas que cambian por día y por mes.
// ?pagina=2, 3…: más filas (recetas del día) a medida que se baja; sin pagina, la 1
router.get("/peliculas", autenticar, async (req, res) => {
  res.json(await paginaPeliculas(req.query.pagina ?? 1));
});

// Pantalla Series (app de PC): filas que cambian por día. También por páginas
router.get("/series", autenticar, async (req, res) => {
  res.json(await paginaSeries(req.query.pagina ?? 1));
});

// Pantalla de un género (TV; ej.: /api/genero/movie/Comedy): destacados, Top 10 de la semana,
// filas y un banner; ?pagina=2, 3…: catálogo extendido (décadas, países…). 404 si no existe
router.get("/genero/:tipo/:genero", autenticar, async (req, res) => {
  res.json(await paginaGenero(req.params.tipo, req.params.genero, req.query.pagina ?? 1));
});

// Pantalla «Originales de» (app de PC; ej.: /api/originales/netflix): pestañas de las
// plataformas, destacados y filas de la elegida. 404 si no existe.
// ?pagina=2, 3…: más filas (por género, época, idioma) a medida que se baja
router.get("/originales/:id", autenticar, async (req, res) => {
  res.json(await paginaOriginales(req.params.id, req.query.pagina ?? 1));
});

// Pantalla de una marca de Disney+ (TV; ej.: /api/marcas/disney): mismo formato que
// Inicio (destacado, Top 10 y filas). 404 si no existe
router.get("/marcas/:id", autenticar, async (req, res) => {
  res.json(await pantallaMarca(req.params.id));
});

// Sagas que coinciden con lo buscado (ej.: /api/sagas?q=viernes 13), con sus películas
router.get("/sagas", autenticar, async (req, res) => {
  res.json({ sagas: await buscarSagas(req.query.q) });
});

// Una saga completa (ej.: /api/sagas/119): sus datos y sus películas en orden
router.get("/sagas/:id", autenticar, async (req, res) => {
  res.json(await saga(req.params.id));
});

// La ficha en español (Cinemeta solo tiene inglés), ej.: /api/titulo/series/tt4574334.
// `titulo` es null si TMDB no lo conoce
router.get("/titulo/:tipo/:imdbId", autenticar, async (req, res) => {
  res.json({ titulo: await tituloEnEspanol(req.params.tipo, req.params.imdbId) });
});

// Los episodios de una temporada en español, ej.: /api/titulo/series/tt4574334/temporada/1
router.get("/titulo/series/:imdbId/temporada/:numero", autenticar, async (req, res) => {
  res.json({ episodios: await temporadaEnEspanol(req.params.imdbId, req.params.numero) });
});

export default router;
