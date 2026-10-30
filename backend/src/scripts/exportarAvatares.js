/**
 * Copia de seguridad de los avatares: escribe cada imagen y un `avatares.json` con su
 * clave, orden y si está retirado. Se vuelven a cargar con `importar-avatares`.
 *
 *   npm run exportar-avatares -- ../disenos/avatares-respaldo
 *
 * Para la base de el servidor, desde la app: DATABASE_URL = External Database URL +
 * ?sslmode=verify-full (como crear-cuenta; la variable de la terminal le gana al .env).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { sequelize } from "../config/db.js";
import { Avatar } from "../models/index.js";
import { extensionDe } from "../services/avatares.service.js";

const carpeta = process.argv[2];

if (!carpeta) {
  console.error("Uso: npm run exportar-avatares -- carpeta");
  process.exit(1);
}

try {
  const avatares = await Avatar.findAll({ order: [["orden", "ASC"], ["id", "ASC"]] });
  await mkdir(carpeta, { recursive: true });

  const indice = [];
  for (const avatar of avatares) {
    const archivo = `${avatar.clave}.${extensionDe(avatar.tipo)}`;
    await writeFile(path.join(carpeta, archivo), avatar.imagen);
    indice.push({ clave: avatar.clave, archivo, orden: avatar.orden, retirado: avatar.retirado });
  }
  await writeFile(path.join(carpeta, "avatares.json"), JSON.stringify(indice, null, 2) + "\n");

  console.log(`${avatares.length} avatares guardados en ${path.resolve(carpeta)}`);
} finally {
  await sequelize.close();
}
