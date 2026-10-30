import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/db.js';

/** ID de IMDb de un título de TMDB (lo usa `tmdbIds.service`). */
export class IdImdb extends Model {}

IdImdb.init(
  {
    tipoTmdb: {
      type: DataTypes.STRING(5),
      primaryKey: true
    },
    tmdbId: {
      type: DataTypes.INTEGER,
      primaryKey: true
    },
    imdbId: {
      type: DataTypes.STRING(15),
      allowNull: false
    }
  },
  {
    sequelize,
    tableName: 'ids_imdb',
    // Solo created_at: un ID de IMDb no se actualiza
    updatedAt: false
  }
);
