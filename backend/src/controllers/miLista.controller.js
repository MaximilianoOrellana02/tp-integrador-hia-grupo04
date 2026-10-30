import * as miListaService from "../services/miLista.service.js";

export async function listar(req, res) {
  const lista = await miListaService.listar(req.cuentaId, req.params.perfilId);
  res.json({ lista });
}

export async function agregar(req, res) {
  const item = await miListaService.agregar(
    req.cuentaId,
    req.params.perfilId,
    req.params.idTitulo,
    req.body ?? {},
  );
  res.json({ item });
}

export async function quitar(req, res) {
  await miListaService.quitar(req.cuentaId, req.params.perfilId, req.params.idTitulo);
  res.status(204).end();
}
