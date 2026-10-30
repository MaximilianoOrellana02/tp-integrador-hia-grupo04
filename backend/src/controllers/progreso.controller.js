import * as progresoService from "../services/progreso.service.js";

export async function listar(req, res) {
  const progreso = await progresoService.listar(req.cuentaId, req.params.perfilId);
  res.json({ progreso });
}

export async function guardar(req, res) {
  const progreso = await progresoService.guardar(
    req.cuentaId,
    req.params.perfilId,
    req.params.idVideo,
    req.body ?? {},
  );
  res.json({ progreso });
}

export async function borrar(req, res) {
  await progresoService.borrar(req.cuentaId, req.params.perfilId, req.params.idVideo);
  res.status(204).end();
}
