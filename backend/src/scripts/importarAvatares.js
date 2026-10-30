/**
 * Vuelve a cargar los avatares de una copia hecha con `exportar-avatares` (por ejemplo,
 * al pasar a otra base). Conserva las claves, así los perfiles siguen con el mismo avatar.
 * Si una clave ya existe, le reemplaza la imagen, el orden y si está retirado.
 *
 *   npm run importar-avatares -- ../disenos/avatares-respaldo
 *
 * El backend que esté corriendo toma los cambios al reiniciarse.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { sequelize } from "../config/db.js";
import { Avatar } from "../models/index.js";
import { validarImagen } from "../services/avatares.service.js";

const carpeta = process.argv[2];

if (!carpeta) {
  console.error("Uso: npm run importar-avatares -- carpeta");
  process.exit(1);
}

try {
  const indice = JSON.parse(await readFile(path.join(carpeta, "avatares.json"), "utf8"));

  await sequelize.transaction(async (transaction) => {
    for (const { clave, archivo, orden, retirado } of indice) {
      if (!/^avatar_\d{2,4}$/.test(clave)) {
        throw new Error(`Clave no válida en avatares.json: ${clave}`);
      }
      const imagen = await readFile(path.join(carpeta, path.basename(archivo)));
      const { tipo, hash } = validarImagen(imagen);
      const datos = { imagen, tipo, hash, orden: Number(orden) || 0, retirado: retirado === true };

      const existente = await Avatar.findOne({ where: { clave }, transaction });
      if (existente) {
        existente.set(datos);
        existente.changed("updatedAt", true);
        await existente.save({ transaction });
      } else {
        await Avatar.create({ clave, ...datos }, { transaction });
      }
      console.log(`${clave} ← ${archivo}`);
    }
  });

  console.log(`${indice.length} avatares cargados`);
} finally {
  await sequelize.close();
}
