import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/db.js';

/** Un addon cargado por una cuenta. La URL se guarda cifrada (ver `utils/cifrado.js`). */
export class Addon extends Model {}

Addon.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    cuentaId: { type: DataTypes.INTEGER, allowNull: false },
    nombre: { type: DataTypes.STRING(120), allowNull: false },
    urlCifrada: { type: DataTypes.TEXT, allowNull: false },
    huella: { type: DataTypes.STRING(64), allowNull: false }
  },
  {
    sequelize,
    tableName: 'addons'
  }
);
