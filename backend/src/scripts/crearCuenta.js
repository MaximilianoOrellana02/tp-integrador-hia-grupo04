/**
 * Crea una cuenta (con su primer perfil) a mano. Con el registro cerrado
 * (REGISTRO_HABILITADO=false, como en producción) es la única forma de crear cuentas:
 *
 *   npm run crear-cuenta -- mama@ejemplo.com "Mamá"
 *
 * Pide la contraseña sin mostrarla en pantalla (dos veces, para confirmar). Así no
 * queda escrita en el historial de la terminal.
 */
import readline from "node:readline";
import { UniqueConstraintError, ValidationError } from "sequelize";
import { sequelize } from "../config/db.js";
import { crearCuenta } from "../services/auth.service.js";

const [email, nombre] = process.argv.slice(2);

if (!email || !nombre) {
  console.error('Uso: npm run crear-cuenta -- email@ejemplo.com "Nombre"');
  process.exit(1);
}

/**
 * Lee la contraseña sin mostrarla. Si la entrada no es una terminal (ej.: la clave
 * llega por un pipe en una prueba), lee una línea.
 */
async function pedirContrasenia(texto) {
  if (!process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin });
    for await (const linea of rl) {
      rl.close();
      return linea;
    }
    return "";
  }

  process.stdout.write(texto);
  return new Promise((resolve) => {
    let valor = "";
    process.stdin.setRawMode(true);
    process.stdin.setEncoding("utf8");
    process.stdin.resume();
    const alTeclear = (trozo) => {
      // Al pegar llegan varios caracteres juntos
      for (const c of trozo) {
        if (c === "\r" || c === "\n" || c === "\u0004") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off("data", alTeclear);
          process.stdout.write("\n");
          resolve(valor);
          return;
        }
        if (c === "\u0003") {
          // Ctrl+C
          process.stdout.write("\n");
          process.exit(130);
        }
        if (c === "\u007f" || c === "\b") valor = valor.slice(0, -1);
        else valor += c;
      }
    };
    process.stdin.on("data", alTeclear);
  });
}

try {
  const password = await pedirContrasenia(`Contraseña para ${email}: `);
  if (process.stdin.isTTY) {
    const repetida = await pedirContrasenia("Repetila: ");
    if (password !== repetida) {
      console.error("Las contraseñas no coinciden. No se creó la cuenta.");
      process.exit(1);
    }
  }

  const cuenta = await crearCuenta({ email, password, nombre });
  console.log(`Cuenta creada: ${cuenta.email} (${cuenta.nombre}), con el perfil «${cuenta.nombre.slice(0, 30)}»`);
} catch (error) {
  if (error instanceof UniqueConstraintError) {
    console.error(`Ya existe una cuenta con el email ${email}`);
  } else if (error instanceof ValidationError) {
    console.error(error.errors.map((e) => e.message).join(". "));
  } else {
    console.error(error.message);
  }
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
