import * as authService from "../services/auth.service.js";

export async function registro(req, res) {
  const resultado = await authService.registrar(req.body ?? {});
  res.status(201).json(resultado);
}

export async function login(req, res) {
  const resultado = await authService.iniciarSesion(req.body ?? {});
  res.json(resultado);
}

export async function yo(req, res) {
  const cuenta = await authService.obtenerCuenta(req.cuentaId);
  res.json({ cuenta });
}
