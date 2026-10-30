import * as perfilesService from "../services/perfiles.service.js";

export async function listar(req, res) {
  const perfiles = await perfilesService.listar(req.cuentaId);
  res.json({ perfiles });
}

export async function crear(req, res) {
  const perfil = await perfilesService.crear(req.cuentaId, req.body ?? {});
  res.status(201).json({ perfil });
}

export async function actualizar(req, res) {
  const perfil = await perfilesService.actualizar(req.cuentaId, req.params.id, req.body ?? {});
  res.json({ perfil });
}

export async function eliminar(req, res) {
  await perfilesService.eliminar(req.cuentaId, req.params.id);
  res.status(204).end();
}
