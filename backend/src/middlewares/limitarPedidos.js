import { rateLimit } from "express-rate-limit";

/**
 * Límites de pedidos por IP para las rutas públicas que se pueden abusar.
 *
 * Se cuentan en memoria: alcanza con una sola instancia del backend. Detrás de un proxy, la IP
 * real sale de `trust proxy` (ver PROXIES_CONFIABLES en app.js).
 */
const QUINCE_MINUTOS = 15 * 60 * 1000;

function limitar({ limite, mensaje, soloFallidos = false }) {
  return rateLimit({
    windowMs: QUINCE_MINUTOS,
    limit: limite,
    // Encabezado estándar `RateLimit` (cuántos quedan y cuándo se renueva)
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skipSuccessfulRequests: soloFallidos,
    // Mismo formato que el resto de los errores de la API
    message: { error: mensaje },
  });
}

// Iniciar sesión y crear cuenta: solo cuentan los intentos fallidos. 10 cada 15 min
export const limitarSesion = limitar({
  limite: 10,
  soloFallidos: true,
  mensaje: "Demasiados intentos. Probá de nuevo en 15 minutos.",
});

