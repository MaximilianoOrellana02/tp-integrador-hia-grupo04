import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/db.js';

/** Un título guardado en «Mi lista» de un perfil (ver la migración crear-mi-lista). */
export class MiLista extends Model {}

MiLista.init(
  {
    perfilId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    idTitulo: {
      type: DataTypes.STRING(60),
      allowNull: false
    },
    titulo: {
      type: DataTypes.JSONB,
      allowNull: false
    }
  },
  {
    sequelize,
    tableName: 'mi_lista'
  }
);
