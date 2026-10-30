import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/db.js';

/** Un avatar de perfil cargado por el administrador (ver la migración crear-avatares). */
export class Avatar extends Model {}

Avatar.init(
  {
    clave: {
      type: DataTypes.STRING(20),
      allowNull: false
    },
    imagen: {
      type: DataTypes.BLOB,
      allowNull: false
    },
    tipo: {
      type: DataTypes.STRING(20),
      allowNull: false
    },
    hash: {
      type: DataTypes.CHAR(64),
      allowNull: false
    },
    orden: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    retirado: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    }
  },
  {
    sequelize,
    tableName: 'avatares'
  }
);
