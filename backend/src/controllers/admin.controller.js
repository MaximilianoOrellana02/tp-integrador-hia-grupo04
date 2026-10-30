import * as adminService from "../services/admin.service.js";

export async function cuentas(req, res) {
  const lista = await adminService.listarCuentas();
  res.json({ cuentas: lista });
}
