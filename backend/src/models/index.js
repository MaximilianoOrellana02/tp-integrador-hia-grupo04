import { Addon } from "./Addon.js";
import { Avatar } from "./Avatar.js";
import { Cuenta } from "./Cuenta.js";
import { IdImdb } from "./IdImdb.js";
import { MiLista } from "./MiLista.js";
import { PeliculaTmdb } from "./PeliculaTmdb.js";
import { Perfil } from "./Perfil.js";
import { Progreso } from "./Progreso.js";
import { VideoLibre } from "./VideoLibre.js";

Cuenta.hasMany(Perfil, {
  foreignKey: "cuentaId",
  as: "perfiles",
  onDelete: "CASCADE",
});
Perfil.belongsTo(Cuenta, { foreignKey: "cuentaId", as: "cuenta" });

Cuenta.hasMany(Addon, {
  foreignKey: "cuentaId",
  as: "addons",
  onDelete: "CASCADE",
});
Addon.belongsTo(Cuenta, { foreignKey: "cuentaId", as: "cuenta" });

Perfil.hasMany(Progreso, {
  foreignKey: "perfilId",
  as: "progreso",
  onDelete: "CASCADE",
});
Progreso.belongsTo(Perfil, { foreignKey: "perfilId", as: "perfil" });

Perfil.hasMany(MiLista, {
  foreignKey: "perfilId",
  as: "miLista",
  onDelete: "CASCADE",
});
MiLista.belongsTo(Perfil, { foreignKey: "perfilId", as: "perfil" });

export { Addon, Avatar, Cuenta, IdImdb, MiLista, PeliculaTmdb, Perfil, Progreso, VideoLibre };
