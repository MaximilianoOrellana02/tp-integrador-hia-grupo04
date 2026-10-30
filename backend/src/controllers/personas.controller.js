import * as personasService from "../services/personas.service.js";

export async function elenco(req, res) {
  const lista = await personasService.obtenerElenco(req.params.tipo, req.params.imdbId);
  res.json({ elenco: lista });
}

export async function buscar(req, res) {
  const personas = await personasService.buscarPersonas(req.query.q);
  res.json({ personas });
}

export async function persona(req, res) {
  const resultado = await personasService.obtenerPersona(req.params.id);
  res.json(resultado);
}
