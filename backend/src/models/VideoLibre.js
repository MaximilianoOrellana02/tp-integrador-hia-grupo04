import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/db.js';

/** Una película con licencia libre que la app puede reproducir. */
export class VideoLibre extends Model {}

VideoLibre.init(
  {
    idVideo: { type: DataTypes.STRING(60), primaryKey: true },
    nombre: { type: DataTypes.STRING(200), allowNull: false },
    anio: { type: DataTypes.STRING(10), allowNull: true },
    descripcion: { type: DataTypes.TEXT, allowNull: true },
    url: { type: DataTypes.TEXT, allowNull: false },
    autor: { type: DataTypes.STRING(120), allowNull: false },
    licencia: { type: DataTypes.STRING(40), allowNull: false }
  },
  {
    sequelize,
    tableName: 'videos_libres'
  }
);
