import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/db.js';

export class Progreso extends Model {}

Progreso.init(
  {
    perfilId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    idVideo: {
      type: DataTypes.STRING(60),
      allowNull: false
    },
    posicionMs: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    duracionMs: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    titulo: {
      type: DataTypes.JSONB,
      allowNull: false
    },
    episodio: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    siguiente: {
      type: DataTypes.JSONB,
      allowNull: true
    }
  },
  {
    sequelize,
    tableName: 'progreso',
    // El mismo índice único de la migración: lo usa `upsert` (ON CONFLICT)
    indexes: [{ unique: true, fields: ['perfil_id', 'id_video'], name: 'progreso_perfil_video' }]
  }
);
