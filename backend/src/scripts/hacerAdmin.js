/**
 * Da o quita el rol de administrador. Se ejecuta a mano, nunca desde la API:
 *
 *   npm run hacer-admin -- tu@email.com
 *   npm run hacer-admin -- tu@email.com --quitar
 */
import { sequelize } from "../config/db.js";
import { Cuenta } from "../models/index.js";

const email = process.argv[2]?.trim().toLowerCase();
const rol = process.argv.includes("--quitar") ? "usuario" : "admin";

if (!email || email.startsWith("--")) {
  console.error("Uso: npm run hacer-admin -- email@ejemplo.com [--quitar]");
  process.exit(1);
}

try {
  const [filas] = await Cuenta.update({ rol }, { where: { email } });
  if (filas === 0) {
    console.error(`No existe una cuenta con el email ${email}`);
    process.exitCode = 1;
  } else {
    console.log(`La cuenta ${email} ahora tiene el rol "${rol}"`);
  }
} finally {
  await sequelize.close();
}
