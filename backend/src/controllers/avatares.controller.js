import * as avataresService from "../services/avatares.service.js";

// Lo que se puede elegir para un perfil (las apps arman el elegidor con esto)
export async function listar(req, res) {
  const avatares = await avataresService.listarElegibles();
  res.json({ avatares });
}

/**
 * La imagen. Pública: la web la muestra con un <img>, que no puede mandar el
 * token. Con la versión actual en la URL (?v=…) se guarda en caché para siempre: una imagen
 * nueva tiene otra versión y por lo tanto otra URL.
 */
export async function imagen(req, res) {
  const { buffer, tipo, version } = await avataresService.imagen(req.params.clave);
  res.set({
    "Content-Type": tipo,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": req.query.v === String(version)
      ? "public, max-age=31536000, immutable"
      : "public, max-age=300",
  });
  res.send(buffer);
}

// ── Administración ───────────────────────────────────────────────────────────────

export async function listarAdmin(req, res) {
  const avatares = await avataresService.listarAdmin();
  res.json({ avatares });
}

export async function crear(req, res) {
  const avatar = await avataresService.crear(req.body);
  res.status(201).json({ avatar });
}

export async function reemplazarImagen(req, res) {
  const avatar = await avataresService.reemplazarImagen(req.params.clave, req.body);
  res.json({ avatar });
}

export async function cambiar(req, res) {
  const avatar = await avataresService.cambiarRetirado(req.params.clave, req.body?.retirado);
  res.json({ avatar });
}

export async function ordenar(req, res) {
  const avatares = await avataresService.ordenar(req.body?.claves);
  res.json({ avatares });
}

export async function eliminar(req, res) {
  await avataresService.eliminar(req.params.clave);
  res.status(204).end();
}
