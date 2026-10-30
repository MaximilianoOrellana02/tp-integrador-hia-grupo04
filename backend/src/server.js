import { app } from "./app.js";
import { sequelize } from "./config/db.js";
import { cargarCatalogo } from "./services/avatares.service.js";
import { precalentar } from "./services/inicio.service.js";
import { obtenerPeliculas } from "./services/peliculas.service.js";
import { obtenerSeries } from "./services/series.service.js";

const PORT = process.env.PORT ?? 3000;
const VARIABLES_OBLIGATORIAS = ["DATABASE_URL", "JWT_SECRETO", "TMDB_TOKEN", "ADDONS_CLAVE"];

function verificarVariables() {
  const faltantes = VARIABLES_OBLIGATORIAS.filter(
    (nombre) => !process.env[nombre],
  );
  if (faltantes.length > 0) {
    console.error(`❌ Faltan variables de entorno: ${faltantes.join(", ")}`);
    process.exit(1);
  }
}

async function conectarBaseDeDatos() {
  try {
    await sequelize.authenticate();
    console.log("✅ Conectado a PostgreSQL");
  } catch (error) {
    console.error("❌ No se pudo conectar a la base de datos:", error.message);
    process.exit(1);
  }
}

verificarVariables();
await conectarBaseDeDatos();
// Qué avatares tienen imagen: lo necesitan los perfiles (avatarUrl) desde el primer pedido
await cargarCatalogo();

app.listen(PORT, () => {
  console.log(`🚀 Servidor en http://localhost:${PORT}`);
  // Inicio, las filas por género, Películas y Series quedan listos antes de que los pidan las
  // apps. Cada hora se rehace lo que venció; unref() no impide que el proceso termine
  const calentarTodo = async () => {
    await precalentar();
    await obtenerPeliculas().catch((error) => console.warn("⚠️ Precalentamiento de Películas:", error.message));
    await obtenerSeries().catch((error) => console.warn("⚠️ Precalentamiento de Series:", error.message));
  };
  calentarTodo();
  setInterval(calentarTodo, 60 * 60 * 1000).unref();
});
